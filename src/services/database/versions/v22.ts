export const sql = `
-- ============================================
-- MIGRATION 22: Notification center
-- ============================================

CREATE TABLE IF NOT EXISTS notification (
  id BLOB PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  readed_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
  payload TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_notification_unread
ON notification(status, timestamp DESC)
WHERE status = 'new';

CREATE INDEX IF NOT EXISTS idx_notification_list
ON notification(timestamp DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_cleanup_readed
ON notification(type, readed_at)
WHERE type = 'plain' AND readed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_cleanup_unread
ON notification(type, timestamp)
WHERE type = 'plain' AND readed_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_notification_update
AFTER UPDATE OF type, status, timestamp, readed_at, payload ON notification
FOR EACH ROW
BEGIN
  UPDATE notification SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_sync_del_notification
AFTER DELETE ON notification
FOR EACH ROW
BEGIN
  INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
  VALUES ('notification', hex(OLD.id), unixepoch(CURRENT_TIMESTAMP));
END;
`
