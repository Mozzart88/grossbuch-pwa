export const sql = `
-- ============================================
-- MIGRATION 16: Multi-tag transactions support
-- - is_common flag on tag (identifies add-on tags like Tips, Fee, VAT, Discount)
-- - pct_value on trx_base (NULL = absolute amount, 0.15 = 15% of base)
-- - Pre-seed Tips and VAT as common expense tags
-- - Mark FEE (13) and DISCOUNT (18) as common
-- - Update tags and trx_log views to expose new columns
-- ============================================

-- Add is_common column to tag table (0 = regular, 1 = common add-on tag)
ALTER TABLE tag ADD COLUMN is_common INTEGER NOT NULL DEFAULT 0;

-- Add pct_value column to trx_base (NULL = absolute amount, >0 = percentage as decimal e.g. 0.15 = 15%)
ALTER TABLE trx_base ADD COLUMN pct_value REAL;

-- Mark existing tags as common add-ons
UPDATE tag SET is_common = 1 WHERE id IN (13, 18); -- FEE=13, DISCOUNT=18

-- Insert Tips as a common expense tag
INSERT INTO tag (name, is_common) VALUES ('Tips', 1);
INSERT INTO tag_to_tag (child_id, parent_id) SELECT id, 2 FROM tag WHERE name = 'Tips'; -- DEFAULT
INSERT INTO tag_to_tag (child_id, parent_id) SELECT id, 10 FROM tag WHERE name = 'Tips'; -- EXPENSE
INSERT OR IGNORE INTO tag_sort_order (tag_id) SELECT id FROM tag WHERE name = 'Tips';

-- Insert VAT as a common expense tag
INSERT INTO tag (name, is_common) VALUES ('VAT', 1);
INSERT INTO tag_to_tag (child_id, parent_id) SELECT id, 2 FROM tag WHERE name = 'VAT'; -- DEFAULT
INSERT INTO tag_to_tag (child_id, parent_id) SELECT id, 10 FROM tag WHERE name = 'VAT'; -- EXPENSE
INSERT OR IGNORE INTO tag_sort_order (tag_id) SELECT id FROM tag WHERE name = 'VAT';

-- Protect Tips and VAT from deletion (mark as system children)
INSERT INTO tag_to_tag (child_id, parent_id) SELECT id, 1 FROM tag WHERE name = 'Tips'; -- SYSTEM
INSERT INTO tag_to_tag (child_id, parent_id) SELECT id, 1 FROM tag WHERE name = 'VAT'; -- SYSTEM

-- ======= RECREATE tags VIEW (expose is_common) =======
DROP VIEW IF EXISTS tags;
CREATE VIEW tags AS
SELECT
  t.id AS id,
  t.name AS name,
  t.is_common AS is_common,
  tso.count AS sort_order
FROM tag t
LEFT JOIN tag_sort_order tso ON t.id = tso.tag_id
ORDER BY sort_order DESC, name ASC;

-- ======= RECREATE trx_log VIEW (expose tag_is_common and pct_value) =======
DROP VIEW IF EXISTS trx_log;
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
  tag.is_common as tag_is_common,
  tb.pct_value as pct_value,
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
`
