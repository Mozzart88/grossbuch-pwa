export const sql = `
-- ============================================
-- MIGRATION 17: Repair orphan transaction child rows
-- - Fix account updated_at trigger restored by sync import
-- - Remove trx child rows whose parent transaction is gone
-- - Recalculate all account balances once from current trx_base rows
-- ============================================

DROP TRIGGER IF EXISTS trg_account_update;

CREATE TRIGGER trg_account_update
AFTER UPDATE OF balance_int, balance_frac ON account
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.id;
END;

DELETE FROM trx_base
WHERE NOT EXISTS (
  SELECT 1 FROM trx WHERE trx.id = trx_base.trx_id
);

DELETE FROM trx_to_counterparty
WHERE NOT EXISTS (
  SELECT 1 FROM trx WHERE trx.id = trx_to_counterparty.trx_id
);

DELETE FROM trx_note
WHERE NOT EXISTS (
  SELECT 1 FROM trx WHERE trx.id = trx_note.trx_id
);

DROP TABLE IF EXISTS _account_balance_recalc;
DROP TABLE IF EXISTS _account_balance_recalc_line;

CREATE TEMP TABLE _account_balance_recalc (
  account_id INTEGER PRIMARY KEY,
  balance_int INTEGER NOT NULL,
  balance_frac INTEGER NOT NULL
);

CREATE TEMP TABLE _account_balance_recalc_line (
  account_id INTEGER NOT NULL,
  sign TEXT NOT NULL,
  amount_int INTEGER NOT NULL,
  amount_frac INTEGER NOT NULL
);

INSERT INTO _account_balance_recalc (account_id, balance_int, balance_frac)
SELECT id, 0, 0 FROM account;

CREATE TEMP TRIGGER _account_balance_recalc_line_insert
AFTER INSERT ON _account_balance_recalc_line
FOR EACH ROW
BEGIN
  UPDATE _account_balance_recalc SET
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
  WHERE account_id = NEW.account_id;
END;

INSERT INTO _account_balance_recalc_line (account_id, sign, amount_int, amount_frac)
SELECT account_id, sign, amount_int, amount_frac FROM trx_base;

DROP TRIGGER _account_balance_recalc_line_insert;
DROP TABLE _account_balance_recalc_line;

UPDATE account
SET
  balance_int = COALESCE((SELECT balance_int FROM _account_balance_recalc WHERE account_id = account.id), 0),
  balance_frac = COALESCE((SELECT balance_frac FROM _account_balance_recalc WHERE account_id = account.id), 0);

DROP TABLE _account_balance_recalc;
`
