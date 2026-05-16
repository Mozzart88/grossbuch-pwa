export const sql = `
-- ============================================
-- MIGRATION 23: Recurring transaction plans
-- ============================================

INSERT OR IGNORE INTO tag (name) VALUES ('recurent');

INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id)
SELECT id, 1 FROM tag WHERE name = 'recurent';

CREATE TABLE IF NOT EXISTS recurring_plan (
  id BLOB PRIMARY KEY,
  schedule TEXT NOT NULL,
  transaction_draft TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('expense', 'income', 'transfer', 'exchange')),
  start_date TEXT NOT NULL,
  next_due_date TEXT,
  until_policy TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_recurring_plan_due
ON recurring_plan(status, next_due_date);

CREATE TRIGGER IF NOT EXISTS trg_recurring_plan_update
AFTER UPDATE OF schedule, transaction_draft, mode, start_date, next_due_date, until_policy, occurrence_count, status
ON recurring_plan
FOR EACH ROW
BEGIN
  UPDATE recurring_plan SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_del_recurring_plan
AFTER DELETE ON recurring_plan
FOR EACH ROW
BEGIN
  INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
  VALUES ('recurring_plan', hex(OLD.id), unixepoch(CURRENT_TIMESTAMP));
END;

CREATE TABLE IF NOT EXISTS recurring_occurrence (
  id BLOB PRIMARY KEY,
  plan_id BLOB NOT NULL REFERENCES recurring_plan(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL,
  notification_id BLOB REFERENCES notification(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
  UNIQUE(plan_id, due_date)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_recurring_occurrence_plan
ON recurring_occurrence(plan_id, due_date);

CREATE TRIGGER IF NOT EXISTS trg_recurring_occurrence_update
AFTER UPDATE OF plan_id, due_date, notification_id ON recurring_occurrence
FOR EACH ROW
BEGIN
  UPDATE recurring_occurrence SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_del_recurring_occurrence
AFTER DELETE ON recurring_occurrence
FOR EACH ROW
BEGIN
  INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
  VALUES ('recurring_occurrence', hex(OLD.id), unixepoch(CURRENT_TIMESTAMP));
END;

CREATE TABLE IF NOT EXISTS recurring_budget (
  budget_id BLOB PRIMARY KEY REFERENCES budget(id) ON DELETE CASCADE,
  plan_id BLOB NOT NULL REFERENCES recurring_plan(id) ON DELETE CASCADE,
  due_month TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_recurring_budget_plan
ON recurring_budget(plan_id, due_month);

CREATE TRIGGER IF NOT EXISTS trg_recurring_budget_update
AFTER UPDATE OF budget_id, plan_id, due_month ON recurring_budget
FOR EACH ROW
BEGIN
  UPDATE recurring_budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE budget_id = NEW.budget_id;
END;
`
