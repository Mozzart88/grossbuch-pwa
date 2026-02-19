export const sql = `
-- ======= SYNC TABLES =======

-- Tombstone table for tracking deleted entities
CREATE TABLE IF NOT EXISTS sync_deletions (
  table_name TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
  UNIQUE(table_name, entity_id)
);

-- Per-installation sync state
CREATE TABLE IF NOT EXISTS sync_state (
  installation_id TEXT NOT NULL UNIQUE,
  last_sync_at INTEGER NOT NULL DEFAULT 0,
  last_push_at INTEGER NOT NULL DEFAULT 0
);

-- ======= DELETION TRIGGERS =======

-- Tag deletion trigger (exclude system tags 1-10, ARCHIVED=22, ADJUSTMENT=23)
CREATE TRIGGER trg_sync_del_tag
AFTER DELETE ON tag
FOR EACH ROW
WHEN OLD.id > 10 AND OLD.id NOT IN (22, 23)
BEGIN
  INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
  VALUES ('tag', CAST(OLD.id AS TEXT), unixepoch(CURRENT_TIMESTAMP));
END;

-- Wallet deletion trigger
CREATE TRIGGER trg_sync_del_wallet
AFTER DELETE ON wallet
FOR EACH ROW
BEGIN
  INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
  VALUES ('wallet', CAST(OLD.id AS TEXT), unixepoch(CURRENT_TIMESTAMP));
END;

-- Counterparty deletion trigger
CREATE TRIGGER trg_sync_del_counterparty
AFTER DELETE ON counterparty
FOR EACH ROW
BEGIN
  INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
  VALUES ('counterparty', CAST(OLD.id AS TEXT), unixepoch(CURRENT_TIMESTAMP));
END;

-- Currency deletion trigger
CREATE TRIGGER trg_sync_del_currency
AFTER DELETE ON currency
FOR EACH ROW
BEGIN
  INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
  VALUES ('currency', CAST(OLD.id AS TEXT), unixepoch(CURRENT_TIMESTAMP));
END;

-- Icon deletion trigger
CREATE TRIGGER trg_sync_del_icon
AFTER DELETE ON icon
FOR EACH ROW
BEGIN
  INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
  VALUES ('icon', CAST(OLD.id AS TEXT), unixepoch(CURRENT_TIMESTAMP));
END;

-- Transaction deletion trigger (hex-encode BLOB id)
CREATE TRIGGER trg_sync_del_trx
AFTER DELETE ON trx
FOR EACH ROW
BEGIN
  INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
  VALUES ('trx', hex(OLD.id), unixepoch(CURRENT_TIMESTAMP));
END;

-- Budget deletion trigger (hex-encode BLOB id)
CREATE TRIGGER trg_sync_del_budget
AFTER DELETE ON budget
FOR EACH ROW
BEGIN
  INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
  VALUES ('budget', hex(OLD.id), unixepoch(CURRENT_TIMESTAMP));
END;

-- Account deletion trigger
CREATE TRIGGER trg_sync_del_account
AFTER DELETE ON account
FOR EACH ROW
BEGIN
  INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
  VALUES ('account', CAST(OLD.id AS TEXT), unixepoch(CURRENT_TIMESTAMP));
END;

-- ======= SYNC TABLES =======
`
