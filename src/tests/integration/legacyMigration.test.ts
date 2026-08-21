import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import initSqlJs, { type Database } from 'sql.js'
import { migrations, CURRENT_VERSION } from '../../services/database/migrations'
import { sharedMigrations, CURRENT_SHARED_VERSION } from '../../services/database/sharedMigrations'
import { workspaceMigrations, CURRENT_WORKSPACE_VERSION } from '../../services/database/workspaceMigrations'
import { TEMP_VIEW_STATEMENTS } from '../../services/database/tempViews'

// Builds a genuine pre-split installation: the full v1..v24 legacy migration
// chain replayed into `main` (so it ends up with real financial data still
// sitting there, exactly like an existing user's database before this
// change), plus `shared`/`workspace` attached with their schema already
// created (mirroring attachActiveWorkspace()'s ordering) but no data copied
// into them yet — the state migrateLegacyInstallation() expects to run against.
async function buildPreMigrationDatabase(): Promise<Database> {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')

  for (let version = 1; version <= CURRENT_VERSION; version++) {
    const statements = migrations[version]
    if (!statements) continue
    const wrapped = ['BEGIN TRANSACTION', ...statements, 'COMMIT']
    for (const sql of wrapped) {
      try {
        db.run(sql)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!msg.includes('no such table') && !msg.includes('no such column') && !msg.includes('UNIQUE constraint failed')) {
          throw error
        }
      }
    }
  }

  db.run(`ATTACH DATABASE ':memory:' AS shared`)
  for (let version = 1; version <= CURRENT_SHARED_VERSION; version++) {
    for (const sql of sharedMigrations[version] ?? []) db.run(sql)
  }

  db.run(`ATTACH DATABASE ':memory:' AS workspace`)
  for (let version = 1; version <= CURRENT_WORKSPACE_VERSION; version++) {
    for (const sql of workspaceMigrations[version] ?? []) db.run(sql)
  }
  // Record the schema version the real runWorkspaceMigrations() (invoked below via
  // migrateLegacyInstallation() -> attachActiveWorkspace()) would leave behind, so it
  // doesn't try to re-run non-idempotent statements (like an ALTER TABLE ADD COLUMN)
  // from version 1 again against a workspace already built at the current version.
  db.run(
    `INSERT OR REPLACE INTO workspace.workspace_meta (key, value, updated_at) VALUES ('schema_version', ?, unixepoch())`,
    [CURRENT_WORKSPACE_VERSION.toString()]
  )

  // Mirrors production ordering: attachActiveWorkspace() creates the TEMP
  // views *before* needsLegacyMigration()/migrateLegacyInstallation() runs.
  // Needed to reproduce the real bug this file regression-tests below: nine
  // TEMP_VIEW_NAMES collide with names DROP_MAIN_LEGACY_SQL also drops, and
  // SQLite resolves an unqualified DROP VIEW against `temp` first — so an
  // unqualified drop there deletes the TEMP view just created here instead
  // of the intended stale `main` one.
  db.run(TEMP_VIEW_STATEMENTS.join(' '))

  return db
}

function lastId(db: Database): number {
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

function scalar<T>(db: Database, sql: string, bind: (string | number | null)[] = []): T | null {
  const stmt = db.prepare(sql)
  stmt.bind(bind)
  const value = stmt.step() ? (stmt.getAsObject() as Record<string, unknown>) : null
  stmt.free()
  return value as T | null
}

function rows<T>(db: Database, sql: string, bind: (string | number | null)[] = []): T[] {
  const stmt = db.prepare(sql)
  stmt.bind(bind)
  const out: T[] = []
  while (stmt.step()) out.push(stmt.getAsObject() as T)
  stmt.free()
  return out
}

describe('Legacy Migration Integration (real migrateLegacyInstallation against sql.js)', () => {
  let db: Database

  beforeEach(async () => {
    db = await buildPreMigrationDatabase()

    // migrateLegacyInstallation() now transitively imports sharedMigrations.ts
    // and workspace.ts (for the post-swap re-attach), both of which import
    // real functions from `./connection` at module-load time. Without this,
    // their module instances stay cached from this file's top-level static
    // imports (evaluated before any mock existed) and keep calling the real
    // (Worker-backed) connection.ts instead of the mock below.
    vi.resetModules()

    vi.doMock('../../services/database/connection', () => ({
      execSQL: vi.fn(async (sql: string, bind?: unknown[]) => {
        db.run(sql, bind as (string | number | null | Uint8Array)[])
      }),
      queryOne: vi.fn(async <T>(sql: string, bind?: unknown[]): Promise<T | null> => {
        const stmt = db.prepare(sql)
        if (bind) stmt.bind(bind as (string | number | null | Uint8Array)[])
        const result = stmt.step() ? (stmt.getAsObject() as T) : null
        stmt.free()
        return result
      }),
      validateReferenceExists: vi.fn(async (qualifiedTable: string, idColumn: string, id: unknown) => {
        const stmt = db.prepare(`SELECT 1 FROM ${qualifiedTable} WHERE ${idColumn} = ?`)
        stmt.bind([id as string | number])
        const found = stmt.step()
        stmt.free()
        return found
      }),
      // `new_main` is genuinely new here (unlike shared/workspace, which
      // buildPreMigrationDatabase() already attached permanently) — attach it
      // for real so NEW_MAIN_SCHEMA_SQL's schema-qualified statements resolve.
      // Never actually detached (even though production does), so the test
      // can inspect `new_main.*` after migrateLegacyInstallation() returns.
      // shared/workspace attach calls are no-ops, same convention
      // tests/integration/setup.ts's createDatabaseMock() already uses.
      // finalizeMainRebuild's OPFS file swap and deleteFile have no in-memory
      // sql.js equivalent — also no-ops.
      attachDatabase: vi.fn(async (schema: string) => {
        if (schema === 'new_main') {
          db.run(`ATTACH DATABASE ':memory:' AS new_main`)
        }
      }),
      detachDatabase: vi.fn().mockResolvedValue(undefined),
      finalizeMainRebuild: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    }))
  })

  afterEach(() => {
    db.close()
    vi.resetModules()
  })

  it('migrates a populated legacy installation with no data loss, exactly one workspace, correct tag_references, and preserved linked devices', async () => {
    // ── Seed pre-split `main` with sample financial + linked-device data ──
    db.run(`INSERT INTO tag (name) VALUES ('Groceries')`)
    const groceriesTagId = lastId(db)

    db.run(`INSERT INTO wallet (name) VALUES ('Cash')`)
    const walletId = lastId(db)

    const usd = scalar<{ id: number }>(db, `SELECT id FROM currency WHERE code = 'USD'`)!
    db.run(
      `INSERT INTO account (wallet_id, currency_id, balance_int, balance_frac) VALUES (?, ?, ?, ?)`,
      [walletId, usd.id, 100, 0]
    )
    const accountId = lastId(db)
    // trg_add_trx_base (still live in `main` at seed time) applies the transaction's
    // balance delta below (100 - 25) immediately — capture the resulting pre-migration
    // value so the "no mutation from migration" assertion compares against the real
    // pre-migration state rather than a stale literal.

    db.run(`INSERT INTO counterparty (name) VALUES ('Corner Shop')`)
    const counterpartyId = lastId(db)

    db.run(`INSERT INTO trx (id, timestamp) VALUES (randomblob(8), unixepoch())`)
    const trx = scalar<{ id: Uint8Array }>(db, `SELECT id FROM trx ORDER BY rowid DESC LIMIT 1`)!
    db.run(
      `INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac) VALUES (randomblob(8), ?, ?, ?, '-', ?, ?)`,
      [trx.id, accountId, groceriesTagId, 25, 0]
    )
    db.run(`INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)`, [trx.id, counterpartyId])

    db.run(
      `INSERT INTO budget (id, start, end, tag_id, type, amount_int, amount_frac) VALUES (randomblob(8), 0, 2592000, ?, 'expense', ?, ?)`,
      [groceriesTagId, 200, 0]
    )

    db.run(
      `INSERT INTO notification (id, type, status, timestamp, payload) VALUES (randomblob(8), 'plain', 'new', unixepoch(), '{}')`
    )

    db.run(
      `INSERT INTO app_settings (key, value) VALUES ('linked_installations', ?)`,
      [JSON.stringify({ 'device-abc': 'pubkey-abc' })]
    )

    // 8.3: auth material already lives in `app_settings` (main-only, set up by
    // setupPin()/changePin() before this migration would ever run) — the
    // migration must never touch it, since it only drops the legacy
    // shared/workspace-scoped tables listed in DROP_MAIN_LEGACY_SQL.
    db.run(
      `INSERT INTO app_settings (key, value) VALUES ('pin_hash', 'hash-abc'), ('pbkdf2_salt', 'salt-abc'), ('jwt_salt', 'jwtsalt-abc')`
    )

    const preMigrationAccount = scalar<{ balance_int: number }>(
      db, `SELECT balance_int FROM account WHERE id = ?`, [accountId]
    )!

    // ── Preconditions the production caller (authService.ts) already guarantees ──
    db.run(`INSERT INTO shared.workspace (name) VALUES ('Personal')`)
    const workspaceId = lastId(db)
    expect(rows(db, `SELECT id FROM shared.workspace`)).toHaveLength(1) // 8.1: exactly one workspace

    const { migrateLegacyInstallation } = await import('../../services/database/legacyMigration')
    await migrateLegacyInstallation(workspaceId, 'dek-app', 'dek-shared')

    // ── 8.1: exactly one workspace still exists, and existing data belongs to it ──
    expect(rows(db, `SELECT id FROM shared.workspace`)).toHaveLength(1)

    // ── 8.2: no data loss — every row survives with its original values ──
    const tag = scalar<{ id: number; name: string }>(db, `SELECT id, name FROM shared.tag WHERE id = ?`, [groceriesTagId])
    expect(tag).toEqual({ id: groceriesTagId, name: 'Groceries' })

    const wallet = scalar<{ id: number; name: string }>(db, `SELECT id, name FROM workspace.wallet WHERE id = ?`, [walletId])
    expect(wallet).toEqual({ id: walletId, name: 'Cash' })

    const account = scalar<{ balance_int: number; currency_id: number }>(
      db, `SELECT balance_int, currency_id FROM workspace.account WHERE id = ?`, [accountId]
    )
    expect(account).toEqual({ balance_int: preMigrationAccount.balance_int, currency_id: usd.id })

    const counterparty = scalar<{ name: string }>(db, `SELECT name FROM shared.counterparty WHERE id = ?`, [counterpartyId])
    expect(counterparty).toEqual({ name: 'Corner Shop' })

    expect(rows(db, `SELECT 1 FROM workspace.trx`)).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.trx_base`)).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.budget`)).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM shared.notification WHERE workspace_id = ?`, [workspaceId])).toHaveLength(1)

    // ── 8.6: tag_references correct after migration (Groceries used by 1 trx_base + 1 budget) ──
    const tagRef = scalar<{ count: number }>(db, `SELECT count FROM shared.tag_references WHERE tag_id = ?`, [groceriesTagId])
    expect(tagRef).toEqual({ count: 2 })

    // ── 8.15: linked_device migration preserves relationships and public keys ──
    const linkedDevice = scalar<{ id: string; public_key: string }>(
      db, `SELECT id, public_key FROM linked_device WHERE id = ?`, ['device-abc']
    )
    expect(linkedDevice).toEqual({ id: 'device-abc', public_key: 'pubkey-abc' })

    // ── 8.3: migration preserves login with the existing PIN — the bulk-copy
    // phase is pure SQL against main/shared/workspace and never touches
    // app_settings' auth keys (pin_hash/pbkdf2_salt/jwt_salt); the replacement
    // main built below carries them forward verbatim. Biometric unlock is
    // preserved trivially: its credential lives entirely in localStorage
    // (src/services/auth/webauthn.ts), which this migration never touches at all.
    expect(scalar<{ value: string }>(db, `SELECT value FROM app_settings WHERE key = 'pin_hash'`)).toEqual({ value: 'hash-abc' })
    expect(scalar<{ value: string }>(db, `SELECT value FROM app_settings WHERE key = 'pbkdf2_salt'`)).toEqual({ value: 'salt-abc' })
    expect(scalar<{ value: string }>(db, `SELECT value FROM app_settings WHERE key = 'jwt_salt'`)).toEqual({ value: 'jwtsalt-abc' })

    // ── 9.2: the replacement App DB (new_main — swapped into place as
    // MAIN_DB_FILENAME in production; finalizeMainRebuild is mocked out here
    // since sql.js has no real multi-file OPFS story) carries the keep-data
    // forward and has topology_version recorded, WITHOUT ever dropping
    // anything from the original `main` in place (the old physical file is
    // discarded wholesale instead — see design.md's disk-bloat fix). The
    // original `main.tag` etc. are therefore still reachable here (this test
    // never simulates the real file discard), which is expected.
    expect(scalar<{ value: string }>(db, `SELECT value FROM new_main.app_settings WHERE key = 'pin_hash'`)).toEqual({ value: 'hash-abc' })
    expect(scalar(db, `SELECT value FROM new_main.app_settings WHERE key = 'linked_installations'`)).toBeNull()
    const topologyVersion = scalar<{ value: string }>(db, `SELECT value FROM new_main.app_settings WHERE key = 'topology_version'`)
    expect(topologyVersion?.value).toBe('2')
    const newMainLinkedDevice = scalar<{ id: string; public_key: string }>(
      db, `SELECT id, public_key FROM new_main.linked_device WHERE id = ?`, ['device-abc']
    )
    expect(newMainLinkedDevice).toEqual({ id: 'device-abc', public_key: 'pubkey-abc' })

    // The original `main.app_settings` (never touched by the bulk-copy phase)
    // is untouched — `linked_installations` was deleted from it as part of
    // the linked_device conversion (unaffected by this fix), but no drops:
    expect(scalar(db, `SELECT value FROM main.app_settings WHERE key = 'linked_installations'`)).toBeNull()
  })

  it('skips an orphaned tag_sort_order row (tag_id no longer in tag) without failing the migration', async () => {
    db.run(`INSERT INTO tag (name) VALUES ('Groceries')`)
    const groceriesTagId = lastId(db)

    // Simulates a legacy delete path that removed the tag without cleaning up
    // its sort-order row (real-world repro: tag_id = 12 in an exported main.db).
    // FK enforcement must be dropped to construct this already-invalid state —
    // main.tag_sort_order.tag_id REFERENCES tag(id) would otherwise reject it.
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO tag_sort_order (tag_id, count) VALUES (999999, 7)`)
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO shared.workspace (name) VALUES ('Personal')`)
    const workspaceId = lastId(db)

    const { migrateLegacyInstallation } = await import('../../services/database/legacyMigration')
    await expect(migrateLegacyInstallation(workspaceId, 'dek-app', 'dek-shared')).resolves.toBeUndefined()

    expect(rows(db, `SELECT 1 FROM shared.tag_sort_order WHERE tag_id = 999999`)).toHaveLength(0)
    expect(rows(db, `SELECT 1 FROM shared.tag_sort_order WHERE tag_id = ?`, [groceriesTagId])).toHaveLength(1)
  })

  it('skips an orphaned counterparty_sort_order row (counterparty_id no longer in counterparty) without failing the migration', async () => {
    db.run(`INSERT INTO counterparty (name) VALUES ('Corner Shop')`)
    const counterpartyId = lastId(db)

    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO counterparty_sort_order (counterparty_id, count) VALUES (999999, 4)`)
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO shared.workspace (name) VALUES ('Personal')`)
    const workspaceId = lastId(db)

    const { migrateLegacyInstallation } = await import('../../services/database/legacyMigration')
    await expect(migrateLegacyInstallation(workspaceId, 'dek-app', 'dek-shared')).resolves.toBeUndefined()

    expect(rows(db, `SELECT 1 FROM shared.counterparty_sort_order WHERE counterparty_id = 999999`)).toHaveLength(0)
    expect(rows(db, `SELECT 1 FROM shared.counterparty_sort_order WHERE counterparty_id = ?`, [counterpartyId])).toHaveLength(1)
  })

  it('skips orphaned rows across every guarded same-database FK table in SHARED_ENTITY_COPY_SQL/WORKSPACE_ENTITY_COPY_SQL without failing the migration', async () => {
    // Sentinel "missing parent" ids: 999999 for INTEGER FK columns, an all-zero
    // 8-byte blob for BLOB FK columns — neither can collide with real
    // AUTOINCREMENT ids or randomblob(8) output.
    const ORPHAN_INT = 999999
    const ORPHAN_BLOB = `X'0000000000000000'`

    // ── shared-scope fixtures: one valid row + one orphan row per guarded table ──
    db.run(`INSERT INTO tag (name) VALUES ('Root')`)
    const rootTagId = lastId(db)
    db.run(`INSERT INTO tag (name) VALUES ('Child')`)
    const childTagId = lastId(db)

    db.run(`INSERT INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)`, [childTagId, rootTagId])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO tag_to_tag (child_id, parent_id) VALUES (${ORPHAN_INT}, ?)`, [rootTagId])
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO icon (value) VALUES ('icon1')`)
    const iconId = lastId(db)
    db.run(`INSERT INTO tag_icon (tag_id, icon_id) VALUES (?, ?)`, [rootTagId, iconId])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO tag_icon (tag_id, icon_id) VALUES (${ORPHAN_INT}, ?)`, [iconId])
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO currency (code, name, symbol, decimal_places) VALUES ('TST', 'Test', 'T', 2)`)
    const testCurrencyId = lastId(db)
    db.run(`INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)`, [testCurrencyId, rootTagId])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (${ORPHAN_INT}, ?)`, [rootTagId])
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO exchange_rate (currency_id, updated_at, rate_int, rate_frac) VALUES (?, unixepoch(), 1, 0)`, [testCurrencyId])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO exchange_rate (currency_id, updated_at, rate_int, rate_frac) VALUES (${ORPHAN_INT}, unixepoch(), 1, 0)`)
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO counterparty (name) VALUES ('Shop1')`)
    const counterpartyId = lastId(db)
    db.run(`INSERT INTO counterparty_note (counterparty_id, note) VALUES (?, 'note1')`, [counterpartyId])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO counterparty_note (counterparty_id, note) VALUES (${ORPHAN_INT}, 'orphan-note')`)
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)`, [counterpartyId, rootTagId])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (${ORPHAN_INT}, ?)`, [rootTagId])
    db.run('PRAGMA foreign_keys = ON')

    // ── workspace-scope fixtures ──
    db.run(`INSERT INTO wallet (name) VALUES ('Cash')`)
    const walletId = lastId(db)
    db.run(`INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)`, [walletId, rootTagId])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (${ORPHAN_INT}, ?)`, [rootTagId])
    db.run('PRAGMA foreign_keys = ON')

    db.run(
      `INSERT INTO account (wallet_id, currency_id, balance_int, balance_frac) VALUES (?, ?, ?, ?)`,
      [walletId, testCurrencyId, 100, 0]
    )
    const accountId = lastId(db)
    db.run('PRAGMA foreign_keys = OFF')
    db.run(
      `INSERT INTO account (wallet_id, currency_id, balance_int, balance_frac) VALUES (${ORPHAN_INT}, ?, 0, 0)`,
      [testCurrencyId]
    )
    const orphanAccountId = lastId(db)
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO account_to_tags (account_id, tag_id) VALUES (?, ?)`, [accountId, rootTagId])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO account_to_tags (account_id, tag_id) VALUES (${ORPHAN_INT}, ?)`, [rootTagId])
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO account_data (account_id, note) VALUES (?, 'meta')`, [accountId])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO account_data (account_id, note) VALUES (${ORPHAN_INT}, 'orphan-meta')`)
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO trx (id, timestamp) VALUES (randomblob(8), unixepoch())`)
    const trx = scalar<{ id: Uint8Array }>(db, `SELECT id FROM trx ORDER BY rowid DESC LIMIT 1`)!

    db.run(`INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)`, [trx.id, counterpartyId])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (${ORPHAN_BLOB}, ?)`, [counterpartyId])
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO trx_note (trx_id, note) VALUES (?, 'note')`, [trx.id])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO trx_note (trx_id, note) VALUES (${ORPHAN_BLOB}, 'orphan-note')`)
    db.run('PRAGMA foreign_keys = ON')

    db.run(
      `INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac) VALUES (randomblob(8), ?, ?, ?, '-', 10, 0)`,
      [trx.id, accountId, rootTagId]
    )
    const trxBase = scalar<{ id: Uint8Array }>(db, `SELECT id FROM trx_base ORDER BY rowid DESC LIMIT 1`)!
    db.run('PRAGMA foreign_keys = OFF')
    db.run(
      `INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac) VALUES (randomblob(8), ${ORPHAN_BLOB}, ?, ?, '-', 5, 0)`,
      [accountId, rootTagId]
    )
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO trx_base_tag_context (trx_base_id, tag_id) VALUES (?, ?)`, [trxBase.id, rootTagId])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO trx_base_tag_context (trx_base_id, tag_id) VALUES (${ORPHAN_BLOB}, ?)`, [rootTagId])
    db.run('PRAGMA foreign_keys = ON')

    db.run(
      `INSERT INTO budget (id, start, end, tag_id, type, amount_int, amount_frac) VALUES (randomblob(8), 0, 2592000, ?, 'expense', 20, 0)`,
      [rootTagId]
    )
    const budget = scalar<{ id: Uint8Array }>(db, `SELECT id FROM budget ORDER BY rowid DESC LIMIT 1`)!

    db.run(`INSERT INTO budget_tag_context (budget_id, tag_id) VALUES (?, ?)`, [budget.id, rootTagId])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO budget_tag_context (budget_id, tag_id) VALUES (${ORPHAN_BLOB}, ?)`, [rootTagId])
    db.run('PRAGMA foreign_keys = ON')

    db.run(
      `INSERT INTO recurring_plan (id, schedule, transaction_draft, mode, start_date, until_policy) VALUES (randomblob(8), '{}', '{}', 'expense', '2024-01-01', '{}')`
    )
    const plan = scalar<{ id: Uint8Array }>(db, `SELECT id FROM recurring_plan ORDER BY rowid DESC LIMIT 1`)!

    db.run(`INSERT INTO recurring_occurrence (id, plan_id, due_date) VALUES (randomblob(8), ?, '2024-02-01')`, [plan.id])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO recurring_occurrence (id, plan_id, due_date) VALUES (randomblob(8), ${ORPHAN_BLOB}, '2024-03-01')`)
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO recurring_budget (budget_id, plan_id, due_month) VALUES (?, ?, '2024-02')`, [budget.id, plan.id])
    db.run('PRAGMA foreign_keys = OFF')
    db.run(`INSERT INTO recurring_budget (budget_id, plan_id, due_month) VALUES (${ORPHAN_BLOB}, ?, '2024-03')`, [plan.id])
    db.run('PRAGMA foreign_keys = ON')

    db.run(`INSERT INTO shared.workspace (name) VALUES ('Personal')`)
    const workspaceId = lastId(db)

    const { migrateLegacyInstallation } = await import('../../services/database/legacyMigration')
    await expect(migrateLegacyInstallation(workspaceId, 'dek-app', 'dek-shared')).resolves.toBeUndefined()

    // Every valid row survives, every orphan row is gone.
    expect(rows(db, `SELECT 1 FROM shared.tag_to_tag WHERE child_id = ? AND parent_id = ?`, [childTagId, rootTagId])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM shared.tag_to_tag WHERE child_id = ${ORPHAN_INT}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM shared.tag_icon WHERE tag_id = ? AND icon_id = ?`, [rootTagId, iconId])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM shared.tag_icon WHERE tag_id = ${ORPHAN_INT}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM shared.currency_to_tags WHERE currency_id = ? AND tag_id = ?`, [testCurrencyId, rootTagId])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM shared.currency_to_tags WHERE currency_id = ${ORPHAN_INT}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM shared.exchange_rate WHERE currency_id = ?`, [testCurrencyId])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM shared.exchange_rate WHERE currency_id = ${ORPHAN_INT}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM shared.counterparty_note WHERE counterparty_id = ?`, [counterpartyId])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM shared.counterparty_note WHERE counterparty_id = ${ORPHAN_INT}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM shared.counterparty_to_tags WHERE counterparty_id = ? AND tag_id = ?`, [counterpartyId, rootTagId])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM shared.counterparty_to_tags WHERE counterparty_id = ${ORPHAN_INT}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM workspace.wallet_to_tags WHERE wallet_id = ? AND tag_id = ?`, [walletId, rootTagId])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.wallet_to_tags WHERE wallet_id = ${ORPHAN_INT}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM workspace.account WHERE id = ?`, [accountId])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.account WHERE id = ?`, [orphanAccountId])).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM workspace.account_to_tags WHERE account_id = ? AND tag_id = ?`, [accountId, rootTagId])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.account_to_tags WHERE account_id = ${ORPHAN_INT}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM workspace.account_data WHERE account_id = ?`, [accountId])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.account_data WHERE account_id = ${ORPHAN_INT}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM workspace.trx_to_counterparty WHERE trx_id = ?`, [trx.id])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.trx_to_counterparty WHERE trx_id = ${ORPHAN_BLOB}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM workspace.trx_note WHERE trx_id = ?`, [trx.id])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.trx_note WHERE trx_id = ${ORPHAN_BLOB}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM workspace.trx_base WHERE id = ?`, [trxBase.id])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.trx_base WHERE trx_id = ${ORPHAN_BLOB}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM workspace.trx_base_tag_context WHERE trx_base_id = ?`, [trxBase.id])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.trx_base_tag_context WHERE trx_base_id = ${ORPHAN_BLOB}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM workspace.budget_tag_context WHERE budget_id = ?`, [budget.id])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.budget_tag_context WHERE budget_id = ${ORPHAN_BLOB}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM workspace.recurring_occurrence WHERE plan_id = ?`, [plan.id])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.recurring_occurrence WHERE plan_id = ${ORPHAN_BLOB}`)).toHaveLength(0)

    expect(rows(db, `SELECT 1 FROM workspace.recurring_budget WHERE budget_id = ?`, [budget.id])).toHaveLength(1)
    expect(rows(db, `SELECT 1 FROM workspace.recurring_budget WHERE budget_id = ${ORPHAN_BLOB}`)).toHaveLength(0)
  })
})
