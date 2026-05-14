export const sql = `
-- ============================================
-- MIGRATION 21: Savings and credit account metadata
-- - Account types are system child tags.
-- - Optional account metadata lives in account_data.
-- ============================================

INSERT OR IGNORE INTO tag (name) VALUES ('savings');
INSERT OR IGNORE INTO tag (name) VALUES ('credits');

INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id)
SELECT id, 1 FROM tag WHERE name IN ('savings', 'credits');

CREATE TABLE IF NOT EXISTS account_data (
  account_id INTEGER PRIMARY KEY REFERENCES account(id) ON DELETE CASCADE,
  note TEXT,
  due_date TEXT,
  rate REAL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
) STRICT;

CREATE TRIGGER IF NOT EXISTS trg_account_data_insert
AFTER INSERT ON account_data
FOR EACH ROW
BEGIN
  UPDATE account_data SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account_id = NEW.account_id;
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = NEW.account_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_account_data_update
AFTER UPDATE OF note, due_date, rate ON account_data
FOR EACH ROW
BEGIN
  UPDATE account_data SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account_id = NEW.account_id;
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = NEW.account_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_account_data_delete
AFTER DELETE ON account_data
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = OLD.account_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_account_type_single_insert
BEFORE INSERT ON account_to_tags
FOR EACH ROW
WHEN NEW.tag_id IN (SELECT id FROM tag WHERE name IN ('savings', 'credits'))
BEGIN
  DELETE FROM account_to_tags
  WHERE account_id = NEW.account_id
    AND tag_id IN (SELECT id FROM tag WHERE name IN ('savings', 'credits'))
    AND tag_id != NEW.tag_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_wallet_type_single_insert
BEFORE INSERT ON wallet_to_tags
FOR EACH ROW
WHEN NEW.tag_id IN (SELECT id FROM tag WHERE name IN ('savings', 'credits'))
BEGIN
  DELETE FROM wallet_to_tags
  WHERE wallet_id = NEW.wallet_id
    AND tag_id IN (SELECT id FROM tag WHERE name IN ('savings', 'credits'))
    AND tag_id != NEW.tag_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_wallet_type_propagate_insert
AFTER INSERT ON wallet_to_tags
FOR EACH ROW
WHEN NEW.tag_id IN (SELECT id FROM tag WHERE name IN ('savings', 'credits'))
BEGIN
  DELETE FROM account_to_tags
  WHERE account_id IN (SELECT id FROM account WHERE wallet_id = NEW.wallet_id)
    AND tag_id IN (SELECT id FROM tag WHERE name IN ('savings', 'credits'));

  INSERT OR IGNORE INTO account_to_tags (account_id, tag_id)
  SELECT id, NEW.tag_id FROM account WHERE wallet_id = NEW.wallet_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_account_inherit_wallet_type
AFTER INSERT ON account
FOR EACH ROW
BEGIN
  INSERT OR IGNORE INTO account_to_tags (account_id, tag_id)
  SELECT NEW.id, wt.tag_id
  FROM wallet_to_tags wt
  JOIN tag t ON t.id = wt.tag_id
  WHERE wt.wallet_id = NEW.wallet_id
    AND t.name IN ('savings', 'credits');
END;

DROP VIEW IF EXISTS accounts;
CREATE VIEW accounts AS
SELECT
  a.id as id,
  w.name as wallet,
  w.color as wallet_color,
  c.code as currency, c.symbol as symbol, c.decimal_places as decimal_places,
  group_concat(t.name, ', ') as tags,
  CASE
    WHEN SUM(CASE WHEN t.name = 'savings' THEN 1 ELSE 0 END) > 0 THEN 'savings'
    WHEN SUM(CASE WHEN t.name = 'credits' THEN 1 ELSE 0 END) > 0 THEN 'credits'
    ELSE 'plain'
  END as account_type,
  ad.note as note,
  ad.due_date as due_date,
  ad.rate as rate,
  a.balance_int as balance_int,
  a.balance_frac as balance_frac,
  a.updated_at as updated_at
FROM account a
JOIN wallet w ON a.wallet_id = w.id
JOIN currency c ON a.currency_id = c.id
LEFT JOIN account_to_tags a2t ON a2t.account_id = a.id
LEFT JOIN tag t ON a2t.tag_id = t.id
LEFT JOIN account_data ad ON ad.account_id = a.id
GROUP BY a.id
ORDER BY wallet_id;
`
