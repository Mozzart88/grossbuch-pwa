import { execSQL, queryOne } from './connection'

// Current-state schema for a single workspace-{n}.db file, sourced from
// log/schema.sql (the real, current v23 dump — not replayed from migration
// history). Columns that pointed at tables now living in `shared` (tag,
// currency, counterparty, notification) keep the column but drop the FK
// clause: cross-database FK enforcement doesn't work, so these are soft
// references, validated at the application level (see design.md).
export const CURRENT_WORKSPACE_VERSION = 2

// Triggers that auto-write to a table this migration also bulk-copies directly
// (account_to_tags/wallet_to_tags default-tag assignment, account balance from
// trx_base). Firing them during a bulk INSERT...SELECT copy would double-apply
// or override already-correct historical data, so the legacy migration drops
// these by name before copying and recreates them (using this exact SQL, the
// same text used to create them originally) once the copy is done. Named here
// so there's one source of truth instead of a second hand-copied version.
export const WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS: { name: string; sql: string }[] = [
  {
    name: 'trg_default_wallet',
    sql: `CREATE TRIGGER IF NOT EXISTS workspace.trg_default_wallet
    BEFORE INSERT ON wallet_to_tags
    WHEN NEW.tag_id = 2
    BEGIN
      DELETE FROM wallet_to_tags
      WHERE tag_id = 2 AND wallet_id != NEW.wallet_id;
    END;`,
  },
  {
    name: 'trg_add_first_account',
    sql: `CREATE TRIGGER IF NOT EXISTS workspace.trg_add_first_account
    AFTER INSERT ON account
    WHEN 1 = (SELECT count(id) FROM account WHERE wallet_id = NEW.wallet_id)
    BEGIN
      INSERT INTO account_to_tags VALUES (NEW.id, 2);
    END;`,
  },
  {
    name: 'trg_set_default_account',
    sql: `CREATE TRIGGER IF NOT EXISTS workspace.trg_set_default_account
    BEFORE INSERT ON account_to_tags
    WHEN NEW.tag_id = 2
    AND NOT EXISTS (SELECT 1 FROM account_to_tags WHERE account_id = NEW.account_id AND tag_id = 2)
    AND 1 < (
      SELECT count(id)
      FROM account
      WHERE wallet_id IN (
        SELECT wallet_id FROM account WHERE id = NEW.account_id
      )
    )
    BEGIN
      DELETE FROM account_to_tags
      WHERE tag_id = 2 AND account_id IN (
        SELECT id FROM account
        WHERE wallet_id = (SELECT wallet_id FROM account WHERE id = NEW.account_id)
      );
    END;`,
  },
  {
    name: 'trg_add_trx_base',
    sql: `CREATE TRIGGER IF NOT EXISTS workspace.trg_add_trx_base
    AFTER INSERT ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE account SET
        balance_int = CASE
          WHEN NEW.sign = '+'
          THEN balance_int + NEW.amount_int + (balance_frac + NEW.amount_frac) / 1000000000000000000
          ELSE balance_int - NEW.amount_int - IIF(balance_frac < NEW.amount_frac, 1, 0)
        END,
        balance_frac = CASE
          WHEN NEW.sign = '+'
          THEN (balance_frac + NEW.amount_frac) % 1000000000000000000
          ELSE IIF(balance_frac < NEW.amount_frac,
               balance_frac - NEW.amount_frac + 1000000000000000000,
               balance_frac - NEW.amount_frac)
        END
      WHERE id = NEW.account_id;
    END;`,
  },
]

export const workspaceMigrations: Record<number, string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS workspace.workspace_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    );`,

    `CREATE TABLE IF NOT EXISTS workspace.wallet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    );`,

    `CREATE TABLE IF NOT EXISTS workspace.wallet_to_tags (
      wallet_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL, -- soft reference -> shared.tag
      FOREIGN KEY (wallet_id) REFERENCES wallet(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS workspace.account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER NOT NULL,
      currency_id INTEGER NOT NULL, -- soft reference -> shared.currency
      updated_at INTEGER DEFAULT (strftime('%s', datetime('now'))),
      balance_int INTEGER NOT NULL DEFAULT 0,
      balance_frac INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (wallet_id) REFERENCES wallet(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS workspace.account_to_tags (
      account_id INTEGER REFERENCES account(id) ON DELETE CASCADE,
      tag_id INTEGER -- soft reference -> shared.tag
    );`,

    `CREATE TABLE IF NOT EXISTS workspace.account_data (
      account_id INTEGER PRIMARY KEY REFERENCES account(id) ON DELETE CASCADE,
      note TEXT,
      due_date TEXT,
      rate REAL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    ) STRICT;`,

    `CREATE TABLE IF NOT EXISTS workspace.trx (
      id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(8)),
      timestamp INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    );`,

    `CREATE TABLE IF NOT EXISTS workspace.trx_to_counterparty (
      trx_id BLOB NOT NULL REFERENCES trx(id) ON DELETE CASCADE,
      counterparty_id INTEGER NOT NULL -- soft reference -> shared.counterparty
    );`,

    `CREATE TABLE IF NOT EXISTS workspace.trx_note (
      trx_id BLOB NOT NULL REFERENCES trx(id) ON DELETE CASCADE,
      note TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS workspace.trx_base (
      id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(8)),
      trx_id BLOB NOT NULL REFERENCES trx(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
      tag_id INTEGER NOT NULL, -- soft reference -> shared.tag
      sign TEXT NOT NULL DEFAULT '-',
      amount_int INTEGER NOT NULL DEFAULT 0,
      amount_frac INTEGER NOT NULL DEFAULT 0,
      rate_int INTEGER NOT NULL DEFAULT 0,
      rate_frac INTEGER NOT NULL DEFAULT 0
    );`,

    `CREATE TABLE IF NOT EXISTS workspace.trx_base_tag_context (
      trx_base_id BLOB NOT NULL REFERENCES trx_base(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL, -- soft reference -> shared.tag
      UNIQUE(trx_base_id, tag_id)
    ) STRICT;`,

    `CREATE INDEX IF NOT EXISTS workspace.idx_trx_base_tag_context_line ON trx_base_tag_context(trx_base_id);`,
    `CREATE INDEX IF NOT EXISTS workspace.idx_trx_base_tag_context_tag ON trx_base_tag_context(tag_id);`,

    `CREATE TABLE IF NOT EXISTS workspace.budget (
      id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(8)),
      start INTEGER NOT NULL DEFAULT (strftime('%s', date('now', 'start of month'))),
      end INTEGER NOT NULL DEFAULT (strftime('%s', date('now', 'start of month', '+1 month'))),
      tag_id INTEGER NOT NULL, -- soft reference -> shared.tag
      updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
      amount_int INTEGER NOT NULL DEFAULT 0,
      amount_frac INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('income', 'expense'))
    );`,

    `CREATE TABLE IF NOT EXISTS workspace.budget_tag_context (
      budget_id BLOB NOT NULL REFERENCES budget(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL, -- soft reference -> shared.tag
      UNIQUE(budget_id)
    ) STRICT;`,

    `CREATE INDEX IF NOT EXISTS workspace.idx_budget_tag_context_budget ON budget_tag_context(budget_id);`,
    `CREATE INDEX IF NOT EXISTS workspace.idx_budget_tag_context_tag ON budget_tag_context(tag_id);`,

    `CREATE TABLE IF NOT EXISTS workspace.recurring_plan (
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
    ) STRICT;`,

    `CREATE INDEX IF NOT EXISTS workspace.idx_recurring_plan_due ON recurring_plan(status, next_due_date);`,

    `CREATE TABLE IF NOT EXISTS workspace.recurring_occurrence (
      id BLOB PRIMARY KEY,
      plan_id BLOB NOT NULL REFERENCES recurring_plan(id) ON DELETE CASCADE,
      due_date TEXT NOT NULL,
      notification_id BLOB, -- soft reference -> shared.notification, tolerated dangling (no eager null-out)
      created_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
      UNIQUE(plan_id, due_date)
    ) STRICT;`,

    `CREATE INDEX IF NOT EXISTS workspace.idx_recurring_occurrence_plan ON recurring_occurrence(plan_id, due_date);`,

    `CREATE TABLE IF NOT EXISTS workspace.recurring_budget (
      budget_id BLOB PRIMARY KEY REFERENCES budget(id) ON DELETE CASCADE,
      plan_id BLOB NOT NULL REFERENCES recurring_plan(id) ON DELETE CASCADE,
      due_month TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP))
    ) STRICT;`,

    `CREATE INDEX IF NOT EXISTS workspace.idx_recurring_budget_plan ON recurring_budget(plan_id, due_month);`,

    `CREATE TABLE IF NOT EXISTS workspace.sync_deletions (
      table_name TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      deleted_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
      UNIQUE(table_name, entity_id)
    );`,

    // --- updated_at maintenance triggers (same-file only) ---

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_wallet_update
    AFTER UPDATE ON wallet
    FOR EACH ROW
    BEGIN
      UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE wallet.id = NEW.id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_wallet_to_tags_insert
    AFTER INSERT ON wallet_to_tags
    FOR EACH ROW
    BEGIN
      UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE wallet.id = NEW.wallet_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_wallet_to_tags_update
    AFTER UPDATE ON wallet_to_tags
    FOR EACH ROW
    BEGIN
      UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE wallet.id = NEW.wallet_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_wallet_to_tags_delete
    AFTER DELETE ON wallet_to_tags
    FOR EACH ROW
    BEGIN
      UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE wallet.id = OLD.wallet_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_account_to_tags_insert
    AFTER INSERT ON account_to_tags
    FOR EACH ROW
    BEGIN
      UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE account.id = NEW.account_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_account_to_tags_update
    AFTER UPDATE ON account_to_tags
    FOR EACH ROW
    BEGIN
      UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE account.id = NEW.account_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_account_to_tags_delete
    AFTER DELETE ON account_to_tags
    FOR EACH ROW
    BEGIN
      UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE account.id = OLD.account_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_account_update
    AFTER UPDATE OF balance_int, balance_frac ON account
    FOR EACH ROW
    BEGIN
      UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE account.id = NEW.id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_account_data_insert
    AFTER INSERT ON account_data
    FOR EACH ROW
    BEGIN
      UPDATE account_data SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE account_id = NEW.account_id;
      UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE id = NEW.account_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_account_data_update
    AFTER UPDATE OF note, due_date, rate ON account_data
    FOR EACH ROW
    BEGIN
      UPDATE account_data SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE account_id = NEW.account_id;
      UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE id = NEW.account_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_account_data_delete
    AFTER DELETE ON account_data
    FOR EACH ROW
    BEGIN
      UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE id = OLD.account_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_trx_update
    AFTER UPDATE ON trx
    FOR EACH ROW
    BEGIN
      UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE trx.id = NEW.id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_trx_to_counterparty_insert
    AFTER INSERT ON trx_to_counterparty
    FOR EACH ROW
    BEGIN
      UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE trx.id = NEW.trx_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_trx_to_counterparty_update
    AFTER UPDATE ON trx_to_counterparty
    FOR EACH ROW
    BEGIN
      UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE trx.id = NEW.trx_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_trx_to_counterparty_delete
    AFTER DELETE ON trx_to_counterparty
    FOR EACH ROW
    BEGIN
      UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE trx.id = OLD.trx_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_trx_note_insert
    AFTER INSERT ON trx_note
    FOR EACH ROW
    BEGIN
      UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE trx.id = NEW.trx_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_trx_note_update
    AFTER UPDATE ON trx_note
    FOR EACH ROW
    BEGIN
      UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE trx.id = NEW.trx_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_trx_note_delete
    AFTER DELETE ON trx_note
    FOR EACH ROW
    BEGIN
      UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE trx.id = OLD.trx_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_trx_base_insert
    AFTER INSERT ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE trx.id = NEW.trx_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_trx_base_update
    AFTER UPDATE ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE trx.id = NEW.trx_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_trx_base_delete
    AFTER DELETE ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE trx.id = OLD.trx_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_trx_base_tag_context_insert
    AFTER INSERT ON trx_base_tag_context
    FOR EACH ROW
    BEGIN
      UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE id = (SELECT trx_id FROM trx_base WHERE id = NEW.trx_base_id);
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_trx_base_tag_context_delete
    AFTER DELETE ON trx_base_tag_context
    FOR EACH ROW
    BEGIN
      UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE id = (SELECT trx_id FROM trx_base WHERE id = OLD.trx_base_id);
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_budget_update
    AFTER UPDATE ON budget
    FOR EACH ROW
    BEGIN
      UPDATE budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE budget.id = NEW.id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_budget_tag_context_insert
    AFTER INSERT ON budget_tag_context
    FOR EACH ROW
    BEGIN
      UPDATE budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE id = NEW.budget_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_budget_tag_context_delete
    AFTER DELETE ON budget_tag_context
    FOR EACH ROW
    BEGIN
      UPDATE budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE id = OLD.budget_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_recurring_plan_update
    AFTER UPDATE OF schedule, transaction_draft, mode, start_date, next_due_date, until_policy, occurrence_count, status
    ON recurring_plan
    FOR EACH ROW
    BEGIN
      UPDATE recurring_plan SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE id = NEW.id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_recurring_occurrence_update
    AFTER UPDATE OF plan_id, due_date, notification_id ON recurring_occurrence
    FOR EACH ROW
    BEGIN
      UPDATE recurring_occurrence SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE id = NEW.id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_recurring_budget_update
    AFTER UPDATE OF budget_id, plan_id, due_month ON recurring_budget
    FOR EACH ROW
    BEGIN
      UPDATE recurring_budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
      WHERE budget_id = NEW.budget_id;
    END;`,

    // --- default/single-account/wallet-lifecycle triggers (literal tag ids, same-file only) ---
    // trg_default_wallet / trg_add_first_account / trg_set_default_account are defined
    // above as WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS entries and referenced here so
    // there's one source of truth (the legacy migration drops+recreates them by name).

    WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS[0].sql, // trg_default_wallet

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_default_wallet_on_delete
    BEFORE DELETE ON wallet
    WHEN 2 IN (SELECT tag_id FROM wallet_to_tags WHERE wallet_id = OLD.id)
      AND (SELECT count(id) FROM wallet WHERE id != old.id) > 0
    BEGIN
      INSERT INTO wallet_to_tags VALUES ((SELECT id FROM wallet WHERE id != OLD.id LIMIT 1), 2);
    END;`,

    WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS[1].sql, // trg_add_first_account

    WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS[2].sql, // trg_set_default_account

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_del_default_account
    AFTER DELETE ON account
    WHEN EXISTS (
      SELECT 1 FROM account_to_tags WHERE account_id = OLD.id AND tag_id = 2
    )
    AND EXISTS (
      SELECT 1 FROM account WHERE wallet_id = OLD.wallet_id
    )
    BEGIN
      UPDATE account_to_tags SET
      account_id = (SELECT id FROM account WHERE wallet_id = OLD.wallet_id LIMIT 1)
      WHERE account_id = OLD.id;
      DELETE FROM account_to_tags WHERE account_id = OLD.id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_del_last_in_wallet_account
    BEFORE DELETE ON account
    WHEN 1 = (SELECT count(id) FROM account WHERE wallet_id = OLD.wallet_id)
    BEGIN
      DELETE FROM wallet WHERE id = OLD.wallet_id;
    END;`,

    // --- balance-maintenance triggers on trx_base (same-file: trx_base + account) ---
    // trg_add_trx_base is defined above as a WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS entry.

    WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS[3].sql, // trg_add_trx_base

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_del_trx_base
    AFTER DELETE ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE account SET
        balance_int = CASE
          WHEN OLD.sign = '+'
          THEN balance_int - OLD.amount_int - IIF(balance_frac < OLD.amount_frac, 1, 0)
          ELSE balance_int + OLD.amount_int + (balance_frac + OLD.amount_frac) / 1000000000000000000
        END,
        balance_frac = CASE
          WHEN OLD.sign = '+'
          THEN IIF(balance_frac < OLD.amount_frac,
               balance_frac - OLD.amount_frac + 1000000000000000000,
               balance_frac - OLD.amount_frac)
          ELSE (balance_frac + OLD.amount_frac) % 1000000000000000000
        END
      WHERE id = OLD.account_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_update_trx_base
    AFTER UPDATE OF sign, amount_int, amount_frac ON trx_base
    WHEN NEW.amount_int != 0 OR NEW.amount_frac != 0
    BEGIN
      -- Reverse old effect
      UPDATE account SET
        balance_int = CASE
          WHEN OLD.sign = '+'
          THEN balance_int - OLD.amount_int - IIF(balance_frac < OLD.amount_frac, 1, 0)
          ELSE balance_int + OLD.amount_int + (balance_frac + OLD.amount_frac) / 1000000000000000000
        END,
        balance_frac = CASE
          WHEN OLD.sign = '+'
          THEN IIF(balance_frac < OLD.amount_frac,
               balance_frac - OLD.amount_frac + 1000000000000000000,
               balance_frac - OLD.amount_frac)
          ELSE (balance_frac + OLD.amount_frac) % 1000000000000000000
        END
      WHERE id = OLD.account_id;

      -- Apply new effect
      UPDATE account SET
        balance_int = CASE
          WHEN NEW.sign = '+'
          THEN balance_int + NEW.amount_int + (balance_frac + NEW.amount_frac) / 1000000000000000000
          ELSE balance_int - NEW.amount_int - IIF(balance_frac < NEW.amount_frac, 1, 0)
        END,
        balance_frac = CASE
          WHEN NEW.sign = '+'
          THEN (balance_frac + NEW.amount_frac) % 1000000000000000000
          ELSE IIF(balance_frac < NEW.amount_frac,
               balance_frac - NEW.amount_frac + 1000000000000000000,
               balance_frac - NEW.amount_frac)
        END
      WHERE id = NEW.account_id;
    END;`,

    // --- sync deletion tombstones (workspace-local sync_deletions, same-file) ---

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_sync_del_wallet
    AFTER DELETE ON wallet
    FOR EACH ROW
    BEGIN
      INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
      VALUES ('wallet', CAST(OLD.id AS TEXT), unixepoch(CURRENT_TIMESTAMP));
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_sync_del_account
    AFTER DELETE ON account
    FOR EACH ROW
    BEGIN
      INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
      VALUES ('account', CAST(OLD.id AS TEXT), unixepoch(CURRENT_TIMESTAMP));
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_sync_del_trx
    AFTER DELETE ON trx
    FOR EACH ROW
    BEGIN
      INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
      VALUES ('trx', hex(OLD.id), unixepoch(CURRENT_TIMESTAMP));
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_sync_del_budget
    AFTER DELETE ON budget
    FOR EACH ROW
    BEGIN
      INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
      VALUES ('budget', hex(OLD.id), unixepoch(CURRENT_TIMESTAMP));
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_sync_del_recurring_plan
    AFTER DELETE ON recurring_plan
    FOR EACH ROW
    BEGIN
      INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
      VALUES ('recurring_plan', hex(OLD.id), unixepoch(CURRENT_TIMESTAMP));
    END;`,

    `CREATE TRIGGER IF NOT EXISTS workspace.trg_sync_del_recurring_occurrence
    AFTER DELETE ON recurring_occurrence
    FOR EACH ROW
    BEGIN
      INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at)
      VALUES ('recurring_occurrence', hex(OLD.id), unixepoch(CURRENT_TIMESTAMP));
    END;`,
  ],

  2: [
    // Supports budgetRepository's actual-spend computation: tag_id lookups
    // when matching trx_base rows to a budget's tag/descendants, and the
    // trx.timestamp range filter (budget start/end) used on every query.
    `CREATE INDEX IF NOT EXISTS workspace.idx_trx_base_tag ON trx_base(tag_id);`,
    `CREATE INDEX IF NOT EXISTS workspace.idx_trx_timestamp ON trx(timestamp);`,
  ],
}

export async function runWorkspaceMigrations(): Promise<void> {
  let currentVersion: number

  try {
    const result = await queryOne<{ value: string }>(
      `SELECT value FROM workspace.workspace_meta WHERE key = 'schema_version'`
    )
    currentVersion = result ? parseInt(result.value, 10) : 0
  } catch {
    currentVersion = 0
  }

  for (let version = currentVersion + 1; version <= CURRENT_WORKSPACE_VERSION; version++) {
    const statements = workspaceMigrations[version]
    if (statements) {
      const wrapped = [...statements]
      wrapped.unshift('BEGIN TRANSACTION;')
      wrapped.push('COMMIT;')
      await execSQL(wrapped.join(' '))
      await execSQL(
        `INSERT OR REPLACE INTO workspace.workspace_meta (key, value, updated_at) VALUES ('schema_version', ?, unixepoch())`,
        [version.toString()]
      )
    }
  }
}
