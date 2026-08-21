import { execSQL, queryOne } from './connection'

export const CURRENT_SHARED_VERSION = 3

export const sharedMigrations: Record<number, string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS shared.shared_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    );`,

    `CREATE TABLE IF NOT EXISTS shared.workspace (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );`,

    `CREATE TABLE IF NOT EXISTS shared.tag_references (
      tag_id INTEGER PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    );`,

    `CREATE TABLE IF NOT EXISTS shared.notification (
      id BLOB PRIMARY KEY,
      workspace_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      readed_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
      payload TEXT NOT NULL
    ) STRICT;`,

    `CREATE INDEX IF NOT EXISTS shared.idx_shared_notification_unread
    ON notification(status, timestamp DESC)
    WHERE status = 'new';`,

    `CREATE INDEX IF NOT EXISTS shared.idx_shared_notification_list
    ON notification(timestamp DESC, updated_at DESC);`,

    `CREATE INDEX IF NOT EXISTS shared.idx_shared_notification_workspace
    ON notification(workspace_id);`,

    `CREATE INDEX IF NOT EXISTS shared.idx_shared_notification_cleanup_readed
    ON notification(type, readed_at)
    WHERE type = 'plain' AND readed_at IS NOT NULL;`,

    `CREATE INDEX IF NOT EXISTS shared.idx_shared_notification_cleanup_unread
    ON notification(type, timestamp)
    WHERE type = 'plain' AND readed_at IS NULL;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_shared_notification_update
    AFTER UPDATE OF type, status, timestamp, readed_at, payload ON notification
    FOR EACH ROW
    BEGIN
      UPDATE notification SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE id = NEW.id;
    END;`,

    `CREATE TABLE IF NOT EXISTS shared.sync_deletions (
      table_name TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      deleted_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
      UNIQUE(table_name, entity_id)
    );`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_sync_del_shared_notification
    AFTER DELETE ON notification
    FOR EACH ROW
    BEGIN
      INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
      VALUES ('notification', hex(OLD.id), unixepoch(CURRENT_TIMESTAMP));
    END;`,
  ],

  // Core shared entities (tag, currency, counterparty, icon, and their support
  // tables/views), current-state schema sourced from log/schema.sql. Every
  // table/trigger/view here is self-contained within `shared` — none of these
  // reference workspace-scoped tables, so (unlike tag_references / sort-order
  // counters) they don't need the application-maintained workaround.
  2: [
    `CREATE TABLE IF NOT EXISTS shared.tag (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    ) STRICT;`,

    `CREATE TABLE IF NOT EXISTS shared.tag_to_tag (
      child_id INTEGER REFERENCES tag(id),
      parent_id INTEGER REFERENCES tag(id)
    ) STRICT;`,

    `CREATE TABLE IF NOT EXISTS shared.icon (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT NOT NULL UNIQUE,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    ) STRICT;`,

    `CREATE TABLE IF NOT EXISTS shared.tag_icon (
      tag_id INTEGER REFERENCES tag(id),
      icon_id INTEGER REFERENCES icon(id)
    ) STRICT;`,

    `CREATE TABLE IF NOT EXISTS shared.tag_sort_order (
      tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE,
      count INTEGER DEFAULT 0,
      UNIQUE(tag_id)
    );`,

    `CREATE TABLE IF NOT EXISTS shared.currency (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      decimal_places INTEGER DEFAULT 2,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    );`,

    `CREATE TABLE IF NOT EXISTS shared.currency_to_tags (
      currency_id INTEGER REFERENCES currency(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE,
      UNIQUE(currency_id, tag_id)
    );`,

    `CREATE TABLE IF NOT EXISTS shared.exchange_rate (
      currency_id INTEGER REFERENCES currency(id) ON DELETE CASCADE,
      updated_at INTEGER DEFAULT (strftime('%s', datetime('now'))),
      rate_int INTEGER NOT NULL DEFAULT 0,
      rate_frac INTEGER NOT NULL DEFAULT 0
    ) STRICT;`,

    `CREATE TABLE IF NOT EXISTS shared.counterparty (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    );`,

    `CREATE TABLE IF NOT EXISTS shared.counterparty_note (
      counterparty_id INTEGER REFERENCES counterparty(id) ON DELETE CASCADE,
      note TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS shared.counterparty_to_tags (
      counterparty_id INTEGER REFERENCES counterparty(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE,
      UNIQUE(counterparty_id, tag_id)
    );`,

    `CREATE TABLE IF NOT EXISTS shared.counterparty_sort_order (
      counterparty_id INTEGER REFERENCES counterparty(id) ON DELETE CASCADE,
      count INTEGER DEFAULT 0,
      UNIQUE(counterparty_id)
    );`,

    // --- same-schema updated_at maintenance & lifecycle triggers ---

    `CREATE TRIGGER IF NOT EXISTS shared.trg_delete_system_tag
    BEFORE DELETE ON tag
    FOR EACH ROW
    WHEN OLD.id = 1 OR EXISTS (SELECT 1 FROM tag_to_tag WHERE OLD.id = child_id AND parent_id = 1)
    BEGIN
      SELECT RAISE(IGNORE);
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_tag_update
    AFTER UPDATE ON tag
    FOR EACH ROW
    WHEN NEW.id > 1
    BEGIN
      UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE tag.id = NEW.id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_tag_to_tag_insert
    AFTER INSERT ON tag_to_tag
    FOR EACH ROW
    WHEN NEW.parent_id > 1
    BEGIN
      UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE tag.id IN (NEW.parent_id, NEW.child_id);
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_tag_to_tag_update
    AFTER UPDATE ON tag_to_tag
    FOR EACH ROW
    WHEN NEW.parent_id > 1
    BEGIN
      UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE tag.id IN (NEW.parent_id, NEW.child_id);
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_tag_to_tag_delete
    AFTER DELETE ON tag_to_tag
    FOR EACH ROW
    WHEN OLD.parent_id > 1
    BEGIN
      UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE tag.id IN (OLD.parent_id, OLD.child_id);
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_tag_icon_insert
    AFTER INSERT ON tag_icon
    FOR EACH ROW
    WHEN NEW.tag_id > 1 AND EXISTS (SELECT 1 FROM tag_to_tag WHERE child_id = NEW.tag_id AND parent_id > 1)
    BEGIN
      UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE tag.id = NEW.tag_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_tag_icon_update
    AFTER UPDATE ON tag_icon
    FOR EACH ROW
    WHEN NEW.tag_id > 1 AND EXISTS (SELECT 1 FROM tag_to_tag WHERE child_id = NEW.tag_id AND parent_id > 1)
    BEGIN
      UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE tag.id = NEW.tag_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_tag_icon_delete
    AFTER DELETE ON tag_icon
    FOR EACH ROW
    WHEN OLD.tag_id > 1 AND EXISTS (SELECT 1 FROM tag_to_tag WHERE child_id = OLD.tag_id AND parent_id > 1)
    BEGIN
      UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE tag.id = OLD.tag_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_icon_update
    AFTER UPDATE ON icon
    FOR EACH ROW
    BEGIN
      UPDATE icon SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE icon.id = NEW.id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_tag_sort_order_new_tag
    AFTER INSERT ON tag
    FOR EACH ROW
    BEGIN
      INSERT INTO tag_sort_order (tag_id) VALUES (new.id);
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_system_currency
    BEFORE INSERT ON currency_to_tags
    WHEN NEW.tag_id = 1
    BEGIN
      DELETE FROM currency_to_tags
      WHERE tag_id = 1 AND currency_id != NEW.currency_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_currency_to_tags_insert
    AFTER INSERT ON currency_to_tags
    FOR EACH ROW
    WHEN NEW.tag_id = 2
    BEGIN
      UPDATE currency SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE currency.id = NEW.currency_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_currency_to_tags_update
    AFTER UPDATE ON currency_to_tags
    FOR EACH ROW
    WHEN NEW.tag_id = 2 OR OLD.tag_id = 2
    BEGIN
      UPDATE currency SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE currency.id = NEW.currency_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_currency_to_tags_delete
    AFTER DELETE ON currency_to_tags
    FOR EACH ROW
    WHEN OLD.tag_id = 2
    BEGIN
      UPDATE currency SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE currency.id = OLD.currency_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_counterparty_update
    AFTER UPDATE ON counterparty
    FOR EACH ROW
    BEGIN
      UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE counterparty.id = NEW.id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_counterparty_to_tags_insert
    AFTER INSERT ON counterparty_to_tags
    FOR EACH ROW
    BEGIN
      UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE counterparty.id = NEW.counterparty_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_counterparty_to_tags_update
    AFTER UPDATE ON counterparty_to_tags
    FOR EACH ROW
    BEGIN
      UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE counterparty.id = NEW.counterparty_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_counterparty_to_tags_delete
    AFTER DELETE ON counterparty_to_tags
    FOR EACH ROW
    BEGIN
      UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE counterparty.id = OLD.counterparty_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_counterparty_note_insert
    AFTER INSERT ON counterparty_note
    FOR EACH ROW
    BEGIN
      UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE counterparty.id = NEW.counterparty_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_counterparty_note_update
    AFTER UPDATE ON counterparty_note
    FOR EACH ROW
    BEGIN
      UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE counterparty.id = NEW.counterparty_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_counterparty_note_delete
    AFTER DELETE ON counterparty_note
    FOR EACH ROW
    BEGIN
      UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE counterparty.id = OLD.counterparty_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_counterparty_sort_order_new_counterparty
    AFTER INSERT ON counterparty
    FOR EACH ROW
    BEGIN
      INSERT INTO counterparty_sort_order (counterparty_id) VALUES (new.id);
    END;`,

    // --- sync deletion tombstones (into shared.sync_deletions, same-schema) ---

    `CREATE TRIGGER IF NOT EXISTS shared.trg_sync_del_tag
    AFTER DELETE ON tag
    FOR EACH ROW
    WHEN OLD.id > 10 AND OLD.id NOT IN (22, 23)
    BEGIN
      INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
      VALUES ('tag', CAST(OLD.id AS TEXT), unixepoch(CURRENT_TIMESTAMP));
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_sync_del_counterparty
    AFTER DELETE ON counterparty
    FOR EACH ROW
    BEGIN
      INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
      VALUES ('counterparty', CAST(OLD.id AS TEXT), unixepoch(CURRENT_TIMESTAMP));
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_sync_del_currency
    AFTER DELETE ON currency
    FOR EACH ROW
    BEGIN
      INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
      VALUES ('currency', CAST(OLD.id AS TEXT), unixepoch(CURRENT_TIMESTAMP));
    END;`,

    `CREATE TRIGGER IF NOT EXISTS shared.trg_sync_del_icon
    AFTER DELETE ON icon
    FOR EACH ROW
    BEGIN
      INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
      VALUES ('icon', CAST(OLD.id AS TEXT), unixepoch(CURRENT_TIMESTAMP));
    END;`,

    // --- shared-only views (no workspace references, regular views are fine) ---

    `CREATE VIEW IF NOT EXISTS shared.tags AS
    SELECT
      t.id AS id,
      t.name AS name,
      tso.count AS sort_order
    FROM tag t
    LEFT JOIN tag_sort_order tso ON t.id = tso.tag_id
    ORDER BY sort_order DESC, name ASC;`,

    `CREATE VIEW IF NOT EXISTS shared.counterparties AS
    SELECT
      t.id AS id,
      t.name AS name,
      cso.count AS sort_order
    FROM counterparty t
    LEFT JOIN counterparty_sort_order cso ON t.id = cso.counterparty_id
    ORDER BY sort_order DESC, name ASC;`,

    `CREATE VIEW IF NOT EXISTS shared.currencies AS
    SELECT
      c.id,
      c.code,
      c.name,
      c.symbol,
      c.decimal_places,
      iif(sys.tag_id = 1, 1, 0) AS is_system,
      iif(def.tag_id = 2, 1, 0) AS is_payment_default,
      iif(fiat.tag_id = 4, 1, 0) AS is_fiat,
      iif(crypto.tag_id = 5, 1, 0) AS is_crypto
    FROM currency c
    LEFT JOIN currency_to_tags sys ON sys.currency_id = c.id AND sys.tag_id = 1
    LEFT JOIN currency_to_tags def ON def.currency_id = c.id AND def.tag_id = 2
    LEFT JOIN currency_to_tags fiat ON fiat.currency_id = c.id AND fiat.tag_id = 4
    LEFT JOIN currency_to_tags crypto ON crypto.currency_id = c.id AND crypto.tag_id = 5
    ORDER BY c.id;`,

    `CREATE VIEW IF NOT EXISTS shared.tags_graph AS
    WITH parent AS (SELECT id, name FROM tag),
    child AS (SELECT id, name FROM tag)
    SELECT
      parent.name as parent,
      group_concat(child.name, ',') as children
    FROM parent, child
    JOIN tag_to_tag ON tag_to_tag.parent_id = parent.id AND tag_to_tag.child_id = child.id
    WHERE parent.id NOT IN (1, 2)
    GROUP BY parent;`,

    `CREATE VIEW IF NOT EXISTS shared.tags_hierarchy AS
    SELECT
      p.id as parent_id,
      p.name as parent,
      c.id as child_id,
      c.name as child
    FROM tag_to_tag t2t
    JOIN tag p ON p.id = t2t.parent_id
    JOIN tag c ON c.id = t2t.child_id;`,
  ],

  3: [
    // Supports the ancestor/descendant recursive walks over tag_to_tag used by
    // budgetRepository's actual-spend computation and the Summaries page
    // rollups, which previously scanned the whole table per step.
    `CREATE INDEX IF NOT EXISTS shared.idx_tag_to_tag_parent ON tag_to_tag(parent_id);`,
    `CREATE INDEX IF NOT EXISTS shared.idx_tag_to_tag_child ON tag_to_tag(child_id);`,
  ],
}

export async function runSharedMigrations(): Promise<void> {
  let currentVersion: number

  try {
    const result = await queryOne<{ value: string }>(
      `SELECT value FROM shared.shared_meta WHERE key = 'schema_version'`
    )
    currentVersion = result ? parseInt(result.value, 10) : 0
  } catch {
    currentVersion = 0
  }

  for (let version = currentVersion + 1; version <= CURRENT_SHARED_VERSION; version++) {
    const statements = sharedMigrations[version]
    if (statements) {
      const wrapped = [...statements]
      wrapped.unshift('BEGIN TRANSACTION;')
      wrapped.push('COMMIT;')
      await execSQL(wrapped.join(' '))
      await execSQL(
        `INSERT OR REPLACE INTO shared.shared_meta (key, value, updated_at) VALUES ('schema_version', ?, unixepoch())`,
        [version.toString()]
      )
    }
  }
}
