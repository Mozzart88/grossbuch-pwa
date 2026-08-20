import { execSQL, queryOne, attachDatabase, detachDatabase, finalizeMainRebuild, deleteFile } from './connection'
import { SHARED_DB_FILENAME } from './paths'
import { runSharedMigrations } from './sharedMigrations'
import { attachActiveWorkspace } from './workspace'
import { WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS } from './workspaceMigrations'

// Bumped whenever the on-disk topology changes shape (single-file -> main +
// shared + workspace). `main.app_settings.topology_version` tracks which
// shape the currently-open installation is in; anything below this value
// still has its financial/shared data sitting in `main` and needs migrating.
export const TOPOLOGY_VERSION = 2

async function getTopologyVersion(): Promise<number> {
  const row = await queryOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'topology_version'`
  )
  return row ? parseInt(row.value, 10) : 1
}

export async function needsLegacyMigration(): Promise<boolean> {
  return (await getTopologyVersion()) < TOPOLOGY_VERSION
}

// Shared entities: main.X -> shared.X, explicit column lists (never SELECT *,
// since `main` still has same-named legacy tables — schema-qualification is
// what disambiguates the two, and only works with explicit target columns).
// FK order: icon/tag before their join tables, currency before its tags/rates,
// counterparty before its notes/tags. shared's own same-schema triggers
// (trg_tag_sort_order_new_tag, trg_system_currency, updated_at maintenance,
// etc.) are all safe to leave live during this copy — none of them mutate a
// second table the way the workspace "sensitive" triggers do.
export const SHARED_ENTITY_COPY_SQL = `
  INSERT INTO shared.icon (id, value, updated_at)
  SELECT id, value, updated_at FROM main.icon;

  INSERT INTO shared.tag (id, name, updated_at)
  SELECT id, name, updated_at FROM main.tag;

  INSERT INTO shared.tag_to_tag (child_id, parent_id)
  SELECT child_id, parent_id FROM main.tag_to_tag;

  INSERT INTO shared.tag_icon (tag_id, icon_id)
  SELECT tag_id, icon_id FROM main.tag_icon;

  INSERT INTO shared.currency (id, code, name, symbol, decimal_places, updated_at)
  SELECT id, code, name, symbol, decimal_places, updated_at FROM main.currency;

  INSERT INTO shared.currency_to_tags (currency_id, tag_id)
  SELECT currency_id, tag_id FROM main.currency_to_tags;

  INSERT INTO shared.exchange_rate (currency_id, updated_at, rate_int, rate_frac)
  SELECT currency_id, updated_at, rate_int, rate_frac FROM main.exchange_rate;

  INSERT INTO shared.counterparty (id, name, updated_at)
  SELECT id, name, updated_at FROM main.counterparty;

  INSERT INTO shared.counterparty_note (counterparty_id, note)
  SELECT counterparty_id, note FROM main.counterparty_note;

  INSERT INTO shared.counterparty_to_tags (counterparty_id, tag_id)
  SELECT counterparty_id, tag_id FROM main.counterparty_to_tags;
`

// tag_sort_order/counterparty_sort_order already hold correct historical
// counts in `main` (trigger-maintained there for the life of the install) —
// copied verbatim rather than recomputed. shared's trg_tag_sort_order_new_tag/
// trg_counterparty_sort_order_new_counterparty already auto-inserted a
// count=0 row per tag/counterparty as they were copied above, so this is an
// upsert (INSERT OR REPLACE), not a plain insert.
export const SORT_ORDER_COPY_SQL = `
  INSERT OR REPLACE INTO shared.tag_sort_order (tag_id, count)
  SELECT tag_id, count FROM main.tag_sort_order;

  INSERT OR REPLACE INTO shared.counterparty_sort_order (counterparty_id, count)
  SELECT counterparty_id, count FROM main.counterparty_sort_order;
`

// Workspace entities: main.X -> workspace.X, explicit column lists, FK order.
// Must run with all 4 WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS dropped (see
// workspaceMigrations.ts) — otherwise trg_add_first_account/trg_set_default_account
// re-derive default-tag assignments (already correct in the copied data) and
// trg_add_trx_base double-applies balance deltas on top of the already-correct
// balance_int/balance_frac columns being copied verbatim.
export const WORKSPACE_ENTITY_COPY_SQL = `
  INSERT INTO workspace.wallet (id, name, color, updated_at)
  SELECT id, name, color, updated_at FROM main.wallet;

  INSERT INTO workspace.wallet_to_tags (wallet_id, tag_id)
  SELECT wallet_id, tag_id FROM main.wallet_to_tags;

  INSERT INTO workspace.account (id, wallet_id, currency_id, updated_at, balance_int, balance_frac)
  SELECT id, wallet_id, currency_id, updated_at, balance_int, balance_frac FROM main.account;

  INSERT INTO workspace.account_to_tags (account_id, tag_id)
  SELECT account_id, tag_id FROM main.account_to_tags;

  INSERT INTO workspace.account_data (account_id, note, due_date, rate, updated_at)
  SELECT account_id, note, due_date, rate, updated_at FROM main.account_data;

  INSERT INTO workspace.trx (id, timestamp, updated_at)
  SELECT id, timestamp, updated_at FROM main.trx;

  INSERT INTO workspace.trx_to_counterparty (trx_id, counterparty_id)
  SELECT trx_id, counterparty_id FROM main.trx_to_counterparty;

  INSERT INTO workspace.trx_note (trx_id, note)
  SELECT trx_id, note FROM main.trx_note;

  INSERT INTO workspace.trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac)
  SELECT id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac FROM main.trx_base;

  INSERT INTO workspace.trx_base_tag_context (trx_base_id, tag_id)
  SELECT trx_base_id, tag_id FROM main.trx_base_tag_context;

  INSERT INTO workspace.budget (id, start, end, tag_id, updated_at, amount_int, amount_frac, type)
  SELECT id, start, end, tag_id, updated_at, amount_int, amount_frac, type FROM main.budget;

  INSERT INTO workspace.budget_tag_context (budget_id, tag_id)
  SELECT budget_id, tag_id FROM main.budget_tag_context;

  INSERT INTO workspace.recurring_plan (id, schedule, transaction_draft, mode, start_date, next_due_date, until_policy, occurrence_count, status, created_at, updated_at)
  SELECT id, schedule, transaction_draft, mode, start_date, next_due_date, until_policy, occurrence_count, status, created_at, updated_at FROM main.recurring_plan;

  INSERT INTO workspace.recurring_occurrence (id, plan_id, due_date, notification_id, created_at, updated_at)
  SELECT id, plan_id, due_date, notification_id, created_at, updated_at FROM main.recurring_occurrence;

  INSERT INTO workspace.recurring_budget (budget_id, plan_id, due_month, updated_at)
  SELECT budget_id, plan_id, due_month, updated_at FROM main.recurring_budget;
`

// Mirrors tagReferences.ts's increment/decrement call sites: every place a
// tag_id is attached to a workspace-scoped row. Run after the workspace copy
// (and after the sensitive triggers are back in place) so this reads the
// final, fully-populated workspace tables.
const TAG_REFERENCES_BACKFILL_SQL = `
  INSERT INTO shared.tag_references (tag_id, count)
  SELECT tag_id, COUNT(*) FROM (
    SELECT tag_id FROM workspace.trx_base
    UNION ALL SELECT tag_id FROM workspace.budget
    UNION ALL SELECT tag_id FROM workspace.wallet_to_tags
    UNION ALL SELECT tag_id FROM workspace.account_to_tags
    UNION ALL SELECT tag_id FROM workspace.budget_tag_context
    UNION ALL SELECT tag_id FROM workspace.trx_base_tag_context
  )
  GROUP BY tag_id
  ON CONFLICT(tag_id) DO UPDATE SET count = excluded.count;
`

// Reverse dependency order. DROP TABLE also drops any trigger/index defined
// `ON` that table, so main's legacy triggers don't need separate cleanup.
// Views are separate objects and must be dropped explicitly. `transaction_view`
// has no TEMP/shared replacement (dead code, unreferenced by the app) — just
// dropped, not recreated.
//
// Schema-qualified as `main.` (not just `DROP VIEW IF EXISTS accounts`, etc.):
// nine of these names (accounts, trx_log, transactions, exchanges, transfers,
// budget_subtags, summary, counterparties_summary, tags_summary) collide with
// tempViews.ts's TEMP_VIEW_NAMES. Unqualified DROP VIEW resolves against
// `temp` before `main` — same priority SQLite gives `temp` for unqualified
// reads — so an unqualified drop here deletes the just-created TEMP view
// instead of the stale legacy `main` one, permanently breaking every
// workspace-scoped view for the rest of the session (confirmed against the
// real SQLCipher build; every fresh install hits this, since legacy
// migration runs on every install per needsLegacyMigration()).
//
// No longer used by migrateLegacyInstallation() itself (see
// NEW_MAIN_SCHEMA_SQL below, task 9.2: dropping these tables in place frees
// pages into the file's own internal freelist without ever shrinking it,
// leaving every migrated installation's App DB file at its full pre-split
// size in OPFS forever). Kept exported and in use by the sql.js integration
// test fixture (tests/integration/setup.ts) — it produces the exact same
// logical end-state schema (same tables, same data) as the real temp-build-
// and-swap path, which is only observable at the physical-file level that
// in-memory sql.js can't represent anyway.
export const DROP_MAIN_LEGACY_SQL = `
  DROP VIEW IF EXISTS main.accounts;
  DROP VIEW IF EXISTS main.trx_log;
  DROP VIEW IF EXISTS main.transactions;
  DROP VIEW IF EXISTS main.exchanges;
  DROP VIEW IF EXISTS main.transfers;
  DROP VIEW IF EXISTS main.budget_subtags;
  DROP VIEW IF EXISTS main.summary;
  DROP VIEW IF EXISTS main.counterparties_summary;
  DROP VIEW IF EXISTS main.tags_summary;
  DROP VIEW IF EXISTS main.tags;
  DROP VIEW IF EXISTS main.counterparties;
  DROP VIEW IF EXISTS main.currencies;
  DROP VIEW IF EXISTS main.tags_graph;
  DROP VIEW IF EXISTS main.tags_hierarchy;
  DROP VIEW IF EXISTS main.transaction_view;

  DROP TABLE recurring_budget;
  DROP TABLE recurring_occurrence;
  DROP TABLE recurring_plan;
  DROP TABLE budget_tag_context;
  DROP TABLE budget;
  DROP TABLE trx_base_tag_context;
  DROP TABLE trx_base;
  DROP TABLE trx_note;
  DROP TABLE trx_to_counterparty;
  DROP TABLE trx;
  DROP TABLE account_data;
  DROP TABLE account_to_tags;
  DROP TABLE account;
  DROP TABLE wallet_to_tags;
  DROP TABLE wallet;
  DROP TABLE counterparty_to_tags;
  DROP TABLE counterparty_note;
  DROP TABLE counterparty;
  DROP TABLE exchange_rate;
  DROP TABLE currency_to_tags;
  DROP TABLE currency;
  DROP TABLE tag_icon;
  DROP TABLE tag_to_tag;
  DROP TABLE tag_sort_order;
  DROP TABLE counterparty_sort_order;
  DROP TABLE tag;
  DROP TABLE icon;
  DROP TABLE notification;
`

// Scratch file for the App DB's temp-build-and-swap (see finalizeMainRebuild()
// in worker.ts). Deleted unconditionally before every attempt, so a retried
// migration never resumes into a partially-built leftover from an earlier
// crashed attempt — always builds from a genuinely clean slate.
export const NEW_MAIN_TEMP_FILENAME = '/main-rebuild-temp.db'
const NEW_MAIN_ALIAS = 'new_main'

// The App DB's replacement schema: only the tables that actually belong to
// `main` going forward (settings, linked-device registry, sync bookkeeping —
// see proposal.md's app-local list). Schema-qualified to the `new_main` alias
// attached to the *current* `main` connection, since unqualified DDL always
// targets `main` itself, never an attached schema (same rule established for
// syncTriggers.ts — see design.md). Definitions mirror versions/v24.ts
// (app_settings, linked_device) and versions/v14.ts + v24.ts's ALTER TABLE
// (sync_state, sync_deletions) exactly.
const NEW_MAIN_SCHEMA_SQL = `
  CREATE TABLE new_main.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch(CURRENT_TIMESTAMP))
  );

  CREATE TABLE new_main.linked_device (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Unnamed device',
    public_key TEXT NOT NULL,
    linked_at INTEGER NOT NULL DEFAULT (unixepoch()),
    workspace_scope TEXT
  );

  CREATE TABLE new_main.sync_state (
    installation_id TEXT NOT NULL UNIQUE,
    last_sync_at INTEGER NOT NULL DEFAULT 0,
    last_push_at INTEGER NOT NULL DEFAULT 0,
    workspace_scope TEXT
  );

  CREATE TABLE new_main.sync_deletions (
    table_name TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    deleted_at INTEGER NOT NULL DEFAULT (unixepoch(CURRENT_TIMESTAMP)),
    UNIQUE(table_name, entity_id)
  );
`

// Copies the four "keep" tables verbatim out of the still-open legacy `main`
// (already migrated in-place by this point: shared/workspace entities copied
// out, linked_installations converted to linked_device rows) into the freshly
// schema'd new_main. Explicit column lists throughout — `main` and `new_main`
// have same-named tables during this window, same convention as
// SHARED_ENTITY_COPY_SQL above.
const NEW_MAIN_KEEP_DATA_COPY_SQL = `
  INSERT INTO new_main.app_settings (key, value, updated_at)
  SELECT key, value, updated_at FROM main.app_settings;

  INSERT INTO new_main.linked_device (id, name, public_key, linked_at, workspace_scope)
  SELECT id, name, public_key, linked_at, workspace_scope FROM main.linked_device;

  INSERT INTO new_main.sync_state (installation_id, last_sync_at, last_push_at, workspace_scope)
  SELECT installation_id, last_sync_at, last_push_at, workspace_scope FROM main.sync_state;

  INSERT INTO new_main.sync_deletions (table_name, entity_id, deleted_at)
  SELECT table_name, entity_id, deleted_at FROM main.sync_deletions;
`

interface ParsedInstallation {
  id: string
  publicKey: string
}

// Tolerates both historical shapes the JSON blob was ever stored in: a plain
// array of ids (old format, no key material) and the current
// Record<id, publicKey> shape — same tolerance installationStore.ts used to
// have before it moved to linked_device rows.
function parseLinkedInstallations(raw: string): ParsedInstallation[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  if (Array.isArray(parsed)) {
    return parsed.filter((id): id is string => typeof id === 'string').map((id) => ({ id, publicKey: '' }))
  }

  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([id, publicKey]) => ({ id, publicKey }))
  }

  return []
}

/**
 * One-time migration for installations still on the pre-split single-file
 * topology: bulk-copies shared entities and workspace-scoped data out of
 * `main` into the attached `shared`/`workspace` databases (both must already
 * be attached — call after attachActiveWorkspace()), converts the legacy
 * `linked_installations` JSON blob into `linked_device` rows, builds the App
 * DB's replacement under a temp filename (rather than dropping the
 * now-migrated tables from the current physical file in place — see
 * NEW_MAIN_SCHEMA_SQL above, task 9.2), and swaps it into place as
 * MAIN_DB_FILENAME.
 *
 * The bulk copies + linked_device conversion + new_main population all run as
 * a single transaction (manual BEGIN/COMMIT via sequential execSQL calls on
 * the same persistent worker connection, rather than one joined SQL string)
 * so the linked_device conversion can use bind parameters instead of
 * string-interpolating arbitrary device names/keys, while everything still
 * rolls back together on failure (task 5.10). The final OPFS-level file swap
 * can't participate in that transaction (see design.md's atomicity risk
 * note) and runs after COMMIT — it closes and reopens the worker's database
 * connection, so `shared`/`workspace` are re-attached afterward before this
 * returns, preserving the "main + shared + active workspace are always
 * attached together" invariant callers rely on.
 *
 * `dekApp` keys the App DB (used both to attach the temp new_main file and to
 * reopen the connection after the swap); `dekShared` re-attaches `shared`/the
 * active workspace afterward.
 */
export async function migrateLegacyInstallation(
  defaultWorkspaceId: number,
  dekApp: string,
  dekShared: string,
): Promise<void> {
  const linkedInstallationsRow = await queryOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'linked_installations'`
  )
  const linkedInstallations = linkedInstallationsRow ? parseLinkedInstallations(linkedInstallationsRow.value) : []

  await deleteFile(NEW_MAIN_TEMP_FILENAME)
  // Attached *before* BEGIN TRANSACTION, same as `shared`/`workspace` already
  // are by this point (attached in unwrapAndAttachSharedDatabase()/
  // attachActiveWorkspace() before this function is ever called) — SQLite's
  // multi-database atomic-commit bookkeeping is set up at transaction start,
  // so a database ATTACHed mid-transaction can't join it: writing to it
  // fails with "database new_main is locked" even though nothing else holds
  // a real lock on it.
  await attachDatabase(NEW_MAIN_ALIAS, NEW_MAIN_TEMP_FILENAME, dekApp)

  // Outer try/finally guarantees new_main is detached whether the
  // transaction commits or rolls back — otherwise a failed attempt leaves it
  // attached on this (still-live) connection, and a retry's own attachDatabase()
  // call would fail outright ("database new_main is already in use").
  try {
    await execSQL('BEGIN TRANSACTION')
    try {
      await execSQL(SHARED_ENTITY_COPY_SQL)
      await execSQL(SORT_ORDER_COPY_SQL)

      for (const trigger of WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS) {
        await execSQL(`DROP TRIGGER workspace.${trigger.name};`)
      }

      await execSQL(WORKSPACE_ENTITY_COPY_SQL)

      for (const trigger of WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS) {
        await execSQL(trigger.sql)
      }

      await execSQL(`
        INSERT INTO shared.notification (id, workspace_id, type, status, timestamp, readed_at, updated_at, payload)
        SELECT id, ${defaultWorkspaceId}, type, status, timestamp, readed_at, updated_at, payload FROM main.notification;
      `)

      await execSQL(TAG_REFERENCES_BACKFILL_SQL)

      for (const installation of linkedInstallations) {
        await execSQL(
          `INSERT INTO linked_device (id, public_key) VALUES (?, ?)
           ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key`,
          [installation.id, installation.publicKey]
        )
      }
      if (linkedInstallationsRow) {
        await execSQL(`DELETE FROM app_settings WHERE key = 'linked_installations'`)
      }

      await execSQL(NEW_MAIN_SCHEMA_SQL)
      await execSQL(NEW_MAIN_KEEP_DATA_COPY_SQL)
      await execSQL(
        `INSERT OR REPLACE INTO new_main.app_settings (key, value, updated_at) VALUES ('topology_version', ?, unixepoch())`,
        [TOPOLOGY_VERSION.toString()]
      )

      await execSQL('COMMIT')
    } catch (error) {
      await execSQL('ROLLBACK')
      throw error
    }
  } finally {
    await detachDatabase(NEW_MAIN_ALIAS)
  }

  await finalizeMainRebuild(NEW_MAIN_TEMP_FILENAME, dekApp)

  await attachDatabase('shared', SHARED_DB_FILENAME, dekShared)
  await runSharedMigrations()
  await attachActiveWorkspace(dekShared)
}
