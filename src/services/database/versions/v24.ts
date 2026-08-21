export const sql = `
-- ============================================
-- MIGRATION 24: Consolidate settings/auth_settings into app_settings;
-- add linked_device (replacing the linked_installations JSON blob) and a
-- workspace-scope column on sync_state
-- ============================================

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch(CURRENT_TIMESTAMP))
);

INSERT OR IGNORE INTO app_settings (key, value, updated_at)
SELECT key, value, CAST(strftime('%s', updated_at) AS INTEGER) FROM settings;

INSERT OR IGNORE INTO app_settings (key, value, updated_at)
SELECT key, value, updated_at FROM auth_settings;

CREATE TABLE IF NOT EXISTS linked_device (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Unnamed device',
  public_key TEXT NOT NULL,
  linked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  workspace_scope TEXT
);

ALTER TABLE sync_state ADD COLUMN workspace_scope TEXT;

DROP TABLE settings;
DROP TABLE auth_settings;
`
