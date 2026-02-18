export const sql = `
-- ============================================
-- MIGRATION 15: Split amount/balance/rate into (int, frac) pairs
-- frac stored as frac * 10^18 (FRAC_SCALE)
-- ============================================

COMMIT;
PRAGMA foreign_keys = OFF;

-- ======= ADD NEW COLUMNS =======

ALTER TABLE trx_base ADD COLUMN amount_int INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trx_base ADD COLUMN amount_frac INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trx_base ADD COLUMN rate_int INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trx_base ADD COLUMN rate_frac INTEGER NOT NULL DEFAULT 0;

ALTER TABLE account ADD COLUMN balance_int INTEGER NOT NULL DEFAULT 0;
ALTER TABLE account ADD COLUMN balance_frac INTEGER NOT NULL DEFAULT 0;

ALTER TABLE exchange_rate ADD COLUMN rate_int INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exchange_rate ADD COLUMN rate_frac INTEGER NOT NULL DEFAULT 0;

ALTER TABLE budget ADD COLUMN amount_int INTEGER NOT NULL DEFAULT 0;
ALTER TABLE budget ADD COLUMN amount_frac INTEGER NOT NULL DEFAULT 0;

-- ======= MIGRATE DATA: trx_base =======
-- amount is always >= 0, dp from joined currency
-- amount_int = amount / 10^dp
-- amount_frac = (amount % 10^dp) * 10^(18-dp)

UPDATE trx_base SET
  amount_int = amount / CAST(power(10, (
    SELECT c.decimal_places FROM currency c
    JOIN account a ON a.currency_id = c.id
    WHERE a.id = trx_base.account_id
  )) AS INTEGER),
  amount_frac = (amount % CAST(power(10, (
    SELECT c.decimal_places FROM currency c
    JOIN account a ON a.currency_id = c.id
    WHERE a.id = trx_base.account_id
  )) AS INTEGER))
  * CAST(power(10, 18 - (
    SELECT c.decimal_places FROM currency c
    JOIN account a ON a.currency_id = c.id
    WHERE a.id = trx_base.account_id
  )) AS INTEGER);

-- rate uses same dp as the account's currency
UPDATE trx_base SET
  rate_int = rate / CAST(power(10, (
    SELECT c.decimal_places FROM currency c
    JOIN account a ON a.currency_id = c.id
    WHERE a.id = trx_base.account_id
  )) AS INTEGER),
  rate_frac = (rate % CAST(power(10, (
    SELECT c.decimal_places FROM currency c
    JOIN account a ON a.currency_id = c.id
    WHERE a.id = trx_base.account_id
  )) AS INTEGER))
  * CAST(power(10, 18 - (
    SELECT c.decimal_places FROM currency c
    JOIN account a ON a.currency_id = c.id
    WHERE a.id = trx_base.account_id
  )) AS INTEGER)
WHERE rate > 0;

-- ======= MIGRATE DATA: account.balance =======
-- balance can be negative, use floor division

UPDATE account SET
  balance_int = CASE
    WHEN balance >= 0 THEN balance / CAST(power(10, (
      SELECT c.decimal_places FROM currency c WHERE c.id = account.currency_id
    )) AS INTEGER)
    ELSE (balance - CAST(power(10, (
      SELECT c.decimal_places FROM currency c WHERE c.id = account.currency_id
    )) AS INTEGER) + 1) / CAST(power(10, (
      SELECT c.decimal_places FROM currency c WHERE c.id = account.currency_id
    )) AS INTEGER)
  END;

UPDATE account SET
  balance_frac = (balance - balance_int * CAST(power(10, (
    SELECT c.decimal_places FROM currency c WHERE c.id = account.currency_id
  )) AS INTEGER))
  * CAST(power(10, 18 - (
    SELECT c.decimal_places FROM currency c WHERE c.id = account.currency_id
  )) AS INTEGER);

-- ======= MIGRATE DATA: exchange_rate =======

UPDATE exchange_rate SET
  rate_int = rate / CAST(power(10, (
    SELECT c.decimal_places FROM currency c WHERE c.id = exchange_rate.currency_id
  )) AS INTEGER),
  rate_frac = (rate % CAST(power(10, (
    SELECT c.decimal_places FROM currency c WHERE c.id = exchange_rate.currency_id
  )) AS INTEGER))
  * CAST(power(10, 18 - (
    SELECT c.decimal_places FROM currency c WHERE c.id = exchange_rate.currency_id
  )) AS INTEGER);

-- ======= MIGRATE DATA: budget =======
-- budget.amount uses the system currency's dp

UPDATE budget SET
  amount_int = amount / CAST(power(10, (
    SELECT c.decimal_places FROM currency c
    JOIN currency_to_tags c2t ON c2t.currency_id = c.id
    WHERE c2t.tag_id = 2 LIMIT 1
  )) AS INTEGER),
  amount_frac = (amount % CAST(power(10, (
    SELECT c.decimal_places FROM currency c
    JOIN currency_to_tags c2t ON c2t.currency_id = c.id
    WHERE c2t.tag_id = 2 LIMIT 1
  )) AS INTEGER))
  * CAST(power(10, 18 - (
    SELECT c.decimal_places FROM currency c
    JOIN currency_to_tags c2t ON c2t.currency_id = c.id
    WHERE c2t.tag_id = 2 LIMIT 1
  )) AS INTEGER);

-- ======= DROP TRIGGERS THAT REFERENCE OLD COLUMNS =======

DROP TRIGGER IF EXISTS trg_add_trx_base;
DROP TRIGGER IF EXISTS trg_del_trx_base;
DROP TRIGGER IF EXISTS trg_update_trx_base;
DROP TRIGGER IF EXISTS trg_account_update;

-- ======= DROP VIEWS THAT REFERENCE OLD COLUMNS =======

DROP VIEW IF EXISTS accounts;
DROP VIEW IF EXISTS trx_log;
DROP VIEW IF EXISTS transactions;
DROP VIEW IF EXISTS exchanges;
DROP VIEW IF EXISTS transfers;
DROP VIEW IF EXISTS summary;
DROP VIEW IF EXISTS counterparties_summary;
DROP VIEW IF EXISTS tags_summary;

-- ======= DROP OLD COLUMNS =======

ALTER TABLE trx_base DROP COLUMN amount;
ALTER TABLE trx_base DROP COLUMN rate;
ALTER TABLE account DROP COLUMN balance;
ALTER TABLE exchange_rate DROP COLUMN rate;
ALTER TABLE budget DROP COLUMN amount;

-- ======= RECREATE BALANCE TRIGGERS =======

-- INSERT trigger: balance += or -= amount
CREATE TRIGGER trg_add_trx_base
AFTER INSERT ON trx_base
FOR EACH ROW
BEGIN
  UPDATE account SET
    balance_int = CASE
      WHEN NEW.sign = '+'
      THEN balance_int + NEW.amount_int + (balance_frac + NEW.amount_frac) / 1000000000000000000
      ELSE balance_int - NEW.amount_int - IIF(balance_frac < NEW.amount_frac, 1, 0)
    END,
    balance_frac = CASE
      WHEN NEW.sign = '+'
      THEN (balance_frac + NEW.amount_frac) % 1000000000000000000
      ELSE IIF(balance_frac < NEW.amount_frac,
           balance_frac - NEW.amount_frac + 1000000000000000000,
           balance_frac - NEW.amount_frac)
    END
  WHERE id = NEW.account_id;
END;

-- DELETE trigger: reverse of insert
CREATE TRIGGER trg_del_trx_base
AFTER DELETE ON trx_base
FOR EACH ROW
BEGIN
  UPDATE account SET
    balance_int = CASE
      WHEN OLD.sign = '+'
      THEN balance_int - OLD.amount_int - IIF(balance_frac < OLD.amount_frac, 1, 0)
      ELSE balance_int + OLD.amount_int + (balance_frac + OLD.amount_frac) / 1000000000000000000
    END,
    balance_frac = CASE
      WHEN OLD.sign = '+'
      THEN IIF(balance_frac < OLD.amount_frac,
           balance_frac - OLD.amount_frac + 1000000000000000000,
           balance_frac - OLD.amount_frac)
      ELSE (balance_frac + OLD.amount_frac) % 1000000000000000000
    END
  WHERE id = OLD.account_id;
END;

-- UPDATE trigger: reverse old, apply new
CREATE TRIGGER trg_update_trx_base
AFTER UPDATE OF sign, amount_int, amount_frac ON trx_base
WHEN NEW.amount_int != 0 OR NEW.amount_frac != 0
BEGIN
  -- Reverse old effect
  UPDATE account SET
    balance_int = CASE
      WHEN OLD.sign = '+'
      THEN balance_int - OLD.amount_int - IIF(balance_frac < OLD.amount_frac, 1, 0)
      ELSE balance_int + OLD.amount_int + (balance_frac + OLD.amount_frac) / 1000000000000000000
    END,
    balance_frac = CASE
      WHEN OLD.sign = '+'
      THEN IIF(balance_frac < OLD.amount_frac,
           balance_frac - OLD.amount_frac + 1000000000000000000,
           balance_frac - OLD.amount_frac)
      ELSE (balance_frac + OLD.amount_frac) % 1000000000000000000
    END
  WHERE id = OLD.account_id;

  -- Apply new effect
  UPDATE account SET
    balance_int = CASE
      WHEN NEW.sign = '+'
      THEN balance_int + NEW.amount_int + (balance_frac + NEW.amount_frac) / 1000000000000000000
      ELSE balance_int - NEW.amount_int - IIF(balance_frac < NEW.amount_frac, 1, 0)
    END,
    balance_frac = CASE
      WHEN NEW.sign = '+'
      THEN (balance_frac + NEW.amount_frac) % 1000000000000000000
      ELSE IIF(balance_frac < NEW.amount_frac,
           balance_frac - NEW.amount_frac + 1000000000000000000,
           balance_frac - NEW.amount_frac)
    END
  WHERE id = NEW.account_id;
END;

-- Account updated_at trigger (now watches balance_int)
CREATE TRIGGER trg_account_update
AFTER UPDATE OF balance_int, balance_frac ON account
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.id;
END;

-- ======= RECREATE VIEWS =======

CREATE VIEW accounts AS
SELECT
  a.id as id,
  w.name as wallet,
  w.color as wallet_color,
  c.code as currency, c.symbol as symbol, c.decimal_places as decimal_places,
  group_concat(t.name, ', ') as tags,
  a.balance_int as balance_int,
  a.balance_frac as balance_frac,
  a.updated_at as updated_at
FROM account a
JOIN wallet w ON a.wallet_id = w.id
JOIN currency c ON a.currency_id = c.id
LEFT JOIN account_to_tags a2t ON a2t.account_id = a.id
LEFT JOIN tag t ON a2t.tag_id = t.id
GROUP BY a.id
ORDER BY wallet_id;

CREATE VIEW trx_log AS
SELECT
  t.id as id,
  datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
  c.name as counterparty,
  a.wallet as wallet,
  a.wallet_color as wallet_color,
  a.currency as currency,
  a.symbol as symbol,
  a.decimal_places as decimal_places,
  tag.name as tags,
  tb.amount_int as amount_int,
  tb.amount_frac as amount_frac,
  tb.sign as sign,
  tb.rate_int as rate_int,
  tb.rate_frac as rate_frac
FROM trx t
JOIN trx_base tb ON tb.trx_id = t.id
JOIN accounts a ON tb.account_id = a.id
JOIN tag ON tb.tag_id = tag.id
LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
ORDER BY t.timestamp;

CREATE VIEW transactions AS
SELECT
  t.id as id,
  datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
  c.name as counterparty,
  GROUP_CONCAT(DISTINCT a.wallet) as wallet,
  GROUP_CONCAT(DISTINCT a.currency) as currency,
  GROUP_CONCAT(tag.name) as tags,
  sum((
    CASE WHEN tb.sign = '-'
    THEN -(tb.amount_int + tb.amount_frac * 1e-18)
    ELSE (tb.amount_int + tb.amount_frac * 1e-18)
    END
  )) as amount
FROM trx t
JOIN trx_base tb ON tb.trx_id = t.id
JOIN accounts a ON tb.account_id = a.id
JOIN tag ON tb.tag_id = tag.id
LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
WHERE tb.tag_id NOT IN (3, 6, 7)
GROUP BY t.id
ORDER BY t.timestamp;

CREATE VIEW exchanges AS
SELECT
  t.id as id,
  datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
  c.name as counterparty,
  a.wallet as wallet,
  a.currency as currency,
  tag.name as tag,
  (iif(tb.sign = '-', -1, 1) * (tb.amount_int + tb.amount_frac * 1e-18)) as amount
FROM trx t
JOIN trx_base tb ON tb.trx_id = t.id
JOIN accounts a ON tb.account_id = a.id
JOIN tag ON tb.tag_id = tag.id
LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
WHERE tb.tag_id IN (7, 13);

CREATE VIEW transfers AS
SELECT
  t.id as id,
  datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
  c.name as counterparty,
  a.wallet as wallet,
  a.currency as currency,
  tag.name as tag,
  (iif(tb.sign = '-', -1, 1) * (tb.amount_int + tb.amount_frac * 1e-18)) as amount
FROM trx t
JOIN trx_base tb ON tb.trx_id = t.id
JOIN accounts a ON tb.account_id = a.id
JOIN tag ON tb.tag_id = tag.id
LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
WHERE tb.tag_id IN (6, 13);

CREATE VIEW summary AS
SELECT
  tag.name as tag,
  (budget.amount_int + budget.amount_frac * 1e-18) as amount,
  abs(total(
    iif(tb.sign = '-', -1, 1)
    * (tb.amount_int + tb.amount_frac * 1e-18)
    / (tb.rate_int + tb.rate_frac * 1e-18)
  )) as actual
FROM budget
JOIN tag ON budget.tag_id = tag.id
JOIN trx ON trx.timestamp >= budget.start AND trx.timestamp < budget.end
JOIN trx_base tb ON tb.trx_id = trx.id
  AND (tb.tag_id = budget.tag_id OR tb.tag_id IN (SELECT child_id FROM budget_subtags WHERE budget_id = budget.id))
WHERE (tb.rate_int > 0 OR tb.rate_frac > 0)
GROUP BY budget.tag_id, budget.end - budget.start;

CREATE VIEW counterparties_summary AS
SELECT
  c.name as counterparty,
  sum(
    iif(tb.sign = '-', -1, 1)
    * (tb.amount_int + tb.amount_frac * 1e-18)
    * (tb.rate_int + tb.rate_frac * 1e-18)
  ) as amount
FROM counterparty c
JOIN trx_to_counterparty t2c ON t2c.counterparty_id = c.id
LEFT JOIN trx_base tb ON t2c.trx_id = tb.trx_id
GROUP BY c.id
ORDER BY amount;

CREATE VIEW tags_summary AS
SELECT
  tag.name as tag,
  total(
    iif(tb.sign = '-', -1, 1)
    * (tb.amount_int + tb.amount_frac * 1e-18)
    * (tb.rate_int + tb.rate_frac * 1e-18)
  ) as amount
FROM trx_base tb
JOIN tag ON tb.tag_id = tag.id
GROUP BY tb.tag_id
ORDER BY amount;

-- ======= RECREATE OTHER TRIGGERS THAT V13 CREATED =======

-- trg_trx_base_insert and trg_trx_base_update/delete still reference trx_base
-- but only for updating trx.updated_at, they don't reference amount/rate columns
-- so they survive the DROP COLUMN. But let's verify by recreating them just in case.

-- The tag sort order triggers reference tag_id only, so they survive.
-- The counterparty sort order triggers reference trx_to_counterparty, so they survive.

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;
`
