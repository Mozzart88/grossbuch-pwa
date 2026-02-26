export const sql = `
-- ============================================
-- MIGRATION 16: Multi-tag transactions support
-- - Pre-seed Tips and VAT as common expense tags
-- - Mark FEE (13) and DISCOUNT (18) as common
-- - Update tags and trx_log views to expose new columns
-- ============================================

-- Insert Tips as a common expense tag
INSERT OR IGNORE INTO tag (name) VALUES ('Tips'),('add-on'),('VAT');
INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) SELECT id, 1 FROM tag WHERE name = 'add-on'; -- SYSTEM
INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) SELECT id, 2 FROM tag WHERE name IN ( 'Tips', 'VAT' ); -- DEFAULT
INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) SELECT id, 10 FROM tag WHERE name IN ( 'Tips', 'VAT' ); -- EXPENSE
INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) SELECT id, (SELECT id FROM tag WHERE name = 'add-on') FROM tag WHERE name IN ( 'Tips', 'VAT', 'Fees', 'Discounts' ); -- EXPENSE
INSERT OR IGNORE INTO tag_sort_order (tag_id) SELECT id FROM tag WHERE name IN ( 'Tips', 'VAT' );
`
