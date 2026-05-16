export const sql = `
-- ============================================
-- MIGRATION 20: Budget tag context
-- - Keep budget.tag_id as the selected category tag
-- - Store optional top-level parent context separately
-- ============================================

CREATE TABLE IF NOT EXISTS budget_tag_context (
  budget_id BLOB NOT NULL REFERENCES budget(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tag(id) ON DELETE RESTRICT,
  UNIQUE(budget_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_budget_tag_context_budget
ON budget_tag_context(budget_id);

CREATE INDEX IF NOT EXISTS idx_budget_tag_context_tag
ON budget_tag_context(tag_id);

CREATE TRIGGER IF NOT EXISTS trg_budget_tag_context_insert
AFTER INSERT ON budget_tag_context
FOR EACH ROW
BEGIN
  UPDATE budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = NEW.budget_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_budget_tag_context_delete
AFTER DELETE ON budget_tag_context
FOR EACH ROW
BEGIN
  UPDATE budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = OLD.budget_id;
END;
`
