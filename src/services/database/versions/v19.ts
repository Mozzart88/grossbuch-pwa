export const sql = `
-- ============================================
-- MIGRATION 19: Transaction line tag context
-- - Keep trx_base.tag_id as the selected category tag
-- - Store optional top-level parent context separately
-- ============================================

CREATE TABLE IF NOT EXISTS trx_base_tag_context (
  trx_base_id BLOB NOT NULL REFERENCES trx_base(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tag(id) ON DELETE RESTRICT,
  UNIQUE(trx_base_id, tag_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_trx_base_tag_context_line
ON trx_base_tag_context(trx_base_id);

CREATE INDEX IF NOT EXISTS idx_trx_base_tag_context_tag
ON trx_base_tag_context(tag_id);

CREATE TRIGGER IF NOT EXISTS trg_trx_base_tag_context_insert
AFTER INSERT ON trx_base_tag_context
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = (SELECT trx_id FROM trx_base WHERE id = NEW.trx_base_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_trx_base_tag_context_delete
AFTER DELETE ON trx_base_tag_context
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = (SELECT trx_id FROM trx_base WHERE id = OLD.trx_base_id);
END;
`
