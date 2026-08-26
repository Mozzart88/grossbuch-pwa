import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import initSqlJs from 'sql.js'
import { sharedMigrations, CURRENT_SHARED_VERSION } from '../../services/database/sharedMigrations'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  createDatabaseMock,
  insertWallet,
  insertAccount,
  insertTag,
  insertCounterparty,
  insertTransaction,
  getCurrencyIdByCode,
  getTestDatabase,
} from './setup'

let dbMock: ReturnType<typeof createDatabaseMock>

describe('workspaceMigrations v5 (self-heal + trx_to_counterparty index)', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  beforeEach(() => {
    resetTestDatabase()
    dbMock = createDatabaseMock()
    vi.resetModules()
    vi.doMock('../../services/database/connection', () => dbMock)
  })

  it('brings a genuinely fresh install (workspace version 0) to CURRENT_WORKSPACE_VERSION with the new index present', async () => {
    // A separate, never-migrated database — the shared `getTestDatabase()` fixture is
    // already fully migrated by setupTestDatabase(), so replaying all versions against it
    // would re-run non-idempotent statements (e.g. v3's ALTER TABLE ADD COLUMN) a second
    // time. `shared` is attached and migrated first, mirroring production's invariant that
    // `runWorkspaceMigrations()` only ever runs once `shared` is the real, fully-migrated
    // database (see workspaceMigrations.ts's goal-tag seeding comment).
    const SQL = await initSqlJs()
    const freshDb = new SQL.Database()
    freshDb.run(`ATTACH DATABASE ':memory:' AS shared`)
    freshDb.run(`ATTACH DATABASE ':memory:' AS workspace`)
    for (let version = 1; version <= CURRENT_SHARED_VERSION; version++) {
      const statements = sharedMigrations[version]
      if (statements) {
        for (const sql of statements) freshDb.run(sql)
      }
    }

    vi.doMock('../../services/database/connection', () => ({
      execSQL: vi.fn(async (sql: string, bind?: unknown[]) => {
        freshDb.run(sql, bind as (string | number | null | Uint8Array)[])
      }),
      queryOne: vi.fn(async <T>(sql: string, bind?: unknown[]): Promise<T | null> => {
        const stmt = freshDb.prepare(sql)
        if (bind) stmt.bind(bind as (string | number | null | Uint8Array)[])
        const result = stmt.step() ? (stmt.getAsObject() as T) : null
        stmt.free()
        return result
      }),
    }))

    const { runWorkspaceMigrations, CURRENT_WORKSPACE_VERSION } = await import('../../services/database/workspaceMigrations')
    await runWorkspaceMigrations()

    const version = freshDb.exec(`SELECT value FROM workspace.workspace_meta WHERE key = 'schema_version'`)
    expect(version[0]?.values[0]?.[0]).toBe(CURRENT_WORKSPACE_VERSION.toString())

    const indexRow = freshDb.exec(
      `SELECT name FROM workspace.sqlite_master WHERE type = 'index' AND name = 'idx_trx_to_counterparty_counterparty'`
    )
    expect(indexRow[0]?.values).toHaveLength(1)

    freshDb.close()
  })

  it('self-heals an installation at workspace version 4 with stale/zeroed counters (pre-fix bug state)', async () => {
    const db = getTestDatabase()

    const walletId = insertWallet({ name: 'SelfHealWallet' })
    const usdId = getCurrencyIdByCode('USD')
    const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
    const tagId = insertTag({ name: 'SelfHealTag' })
    const cpId = insertCounterparty({ name: 'SelfHealCounterparty' })
    insertTransaction({ account_id: accountId, tag_id: tagId, sign: '-', amount_int: 10, counterparty_id: cpId })
    insertTransaction({ account_id: accountId, tag_id: tagId, sign: '-', amount_int: 20, counterparty_id: cpId })

    // Reproduce the pre-fix state: this device is still on workspace schema v4 (no v5
    // index yet), and its counters were left at 0 by a sync import that predates this fix.
    db.run('DROP INDEX IF EXISTS workspace.idx_trx_to_counterparty_counterparty')
    db.run(`UPDATE workspace.workspace_meta SET value = '4' WHERE key = 'schema_version'`)
    db.run('UPDATE shared.tag_sort_order SET count = 0 WHERE tag_id = ?', [tagId])
    db.run('UPDATE shared.counterparty_sort_order SET count = 0 WHERE counterparty_id = ?', [cpId])
    db.run('DELETE FROM shared.tag_references WHERE tag_id = ?', [tagId])

    const { runWorkspaceMigrations, CURRENT_WORKSPACE_VERSION } = await import('../../services/database/workspaceMigrations')
    await runWorkspaceMigrations()

    const version = db.exec(`SELECT value FROM workspace.workspace_meta WHERE key = 'schema_version'`)
    expect(version[0]?.values[0]?.[0]).toBe(CURRENT_WORKSPACE_VERSION.toString())

    const indexRow = db.exec(
      `SELECT name FROM workspace.sqlite_master WHERE type = 'index' AND name = 'idx_trx_to_counterparty_counterparty'`
    )
    expect(indexRow[0]?.values).toHaveLength(1)

    const tagCount = Number(db.exec('SELECT count FROM shared.tag_sort_order WHERE tag_id = ?', [tagId])[0].values[0][0])
    const cpCount = Number(db.exec('SELECT count FROM shared.counterparty_sort_order WHERE counterparty_id = ?', [cpId])[0].values[0][0])
    const tagRefCount = Number(db.exec('SELECT count FROM shared.tag_references WHERE tag_id = ?', [tagId])[0].values[0][0])

    expect(tagCount).toBe(2)
    expect(cpCount).toBe(2)
    expect(tagRefCount).toBe(2)
  })

  it('leaves an installation whose counters were never affected by the bug unchanged', async () => {
    const db = getTestDatabase()

    const walletId = insertWallet({ name: 'UnaffectedWallet' })
    const usdId = getCurrencyIdByCode('USD')
    const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
    const tagId = insertTag({ name: 'UnaffectedTag' })
    insertTransaction({ account_id: accountId, tag_id: tagId, sign: '-', amount_int: 10 })
    insertTransaction({ account_id: accountId, tag_id: tagId, sign: '-', amount_int: 20 })
    insertTransaction({ account_id: accountId, tag_id: tagId, sign: '-', amount_int: 30 })

    // This device was never affected by the bug: its counters already correctly reflect
    // its (entirely local) usage before the v5 migration runs.
    db.run('UPDATE shared.tag_sort_order SET count = 3 WHERE tag_id = ?', [tagId])
    db.run(`UPDATE workspace.workspace_meta SET value = '4' WHERE key = 'schema_version'`)

    const { runWorkspaceMigrations } = await import('../../services/database/workspaceMigrations')
    await runWorkspaceMigrations()

    const tagCount = Number(db.exec('SELECT count FROM shared.tag_sort_order WHERE tag_id = ?', [tagId])[0].values[0][0])
    expect(tagCount).toBe(3)
  })
})
