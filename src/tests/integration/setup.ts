import initSqlJs, { type Database } from 'sql.js'
import { vi } from 'vitest'
import { SYSTEM_TAGS } from '../../types'
import { migrations, CURRENT_VERSION } from '../../services/database/migrations'
import { sharedMigrations, CURRENT_SHARED_VERSION } from '../../services/database/sharedMigrations'
import { workspaceMigrations, CURRENT_WORKSPACE_VERSION, WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS } from '../../services/database/workspaceMigrations'
import { SHARED_ENTITY_COPY_SQL, SORT_ORDER_COPY_SQL, WORKSPACE_ENTITY_COPY_SQL, DROP_MAIN_LEGACY_SQL } from '../../services/database/legacyMigration'
import { TEMP_VIEW_STATEMENTS } from '../../services/database/tempViews'

let db: Database | null = null

// Seed data for tests (basic currencies). Targets `shared` directly since by
// the time this runs, main's legacy currency/currency_to_tags tables have
// already been migrated out and dropped (mirrors production's end state).
const SEED_DATA = `
  INSERT OR IGNORE INTO shared.currency (code, name, symbol, decimal_places) VALUES
    ('USD', 'US Dollar', '$', 2),
    ('EUR', 'Euro', '€', 2),
    ('GBP', 'British Pound', '£', 2);

  -- Tag first currency as default and fiat
  INSERT OR IGNORE INTO shared.currency_to_tags (currency_id, tag_id) VALUES
    (1, ${SYSTEM_TAGS.DEFAULT}),
    (1, ${SYSTEM_TAGS.FIAT}),
    (2, ${SYSTEM_TAGS.FIAT}),
    (3, ${SYSTEM_TAGS.FIAT});
`

export async function setupTestDatabase(): Promise<Database> {
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')

  // Run all migrations in order (starting from v1). This replays the full
  // legacy single-file history into `main`, same as a real installation
  // would — including the shared/workspace-scoped tables that get migrated
  // out and dropped below, mirroring legacyMigration.ts's end state.
  for (let version = 1; version <= CURRENT_VERSION; version++) {
    const statements = migrations[version]
    if (statements) {
      // Join all statements and execute
      // sql.js can handle multiple statements in one run() call
      statements.unshift('BEGIN TRANSACTION')
      statements.push('COMMIT')
      for (const sql of statements) {
        try {
          db.run(sql)
        } catch (error) {
          // Some migrations may fail in test environment (e.g., referencing old tables)
          // This is expected for migrations that migrate data from old schema
          const errorMessage = error instanceof Error ? error.message : String(error)
          // Only suppress errors related to missing tables/columns from migration data transfer
          if (!errorMessage.includes('no such table') &&
            !errorMessage.includes('no such column') &&
            !errorMessage.includes('UNIQUE constraint failed')) {
            throw error
          }
        }
      }
    }
  }

  // Attach in-memory Shared + Workspace DBs, mirroring production's
  // main+shared+workspace topology.
  db.run(`ATTACH DATABASE ':memory:' AS shared`)
  for (let version = 1; version <= CURRENT_SHARED_VERSION; version++) {
    const statements = sharedMigrations[version]
    if (statements) {
      for (const sql of statements) {
        db.run(sql)
      }
    }
  }

  db.run(`ATTACH DATABASE ':memory:' AS workspace`)
  for (let version = 1; version <= CURRENT_WORKSPACE_VERSION; version++) {
    const statements = workspaceMigrations[version]
    if (statements) {
      for (const sql of statements) {
        db.run(sql)
      }
    }
  }

  // Default workspace, matching workspace.ts's getOrCreateDefaultWorkspace()
  db.run(`INSERT INTO shared.workspace (name) VALUES ('Personal')`)
  const workspaceId = Number(db.exec(`SELECT id FROM shared.workspace WHERE name = 'Personal'`)[0].values[0][0])

  // Move the legacy data replayed into `main` above out into shared/workspace,
  // then drop it from `main` — the same bulk-copy-then-cleanup legacyMigration.ts
  // performs for real installations upgrading from the pre-split topology.
  db.run(SHARED_ENTITY_COPY_SQL)
  db.run(SORT_ORDER_COPY_SQL)
  for (const trigger of WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS) {
    db.run(`DROP TRIGGER workspace.${trigger.name};`)
  }
  db.run(WORKSPACE_ENTITY_COPY_SQL)
  for (const trigger of WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS) {
    db.run(trigger.sql)
  }
  db.run(`
    INSERT INTO shared.notification (id, workspace_id, type, status, timestamp, readed_at, updated_at, payload)
    SELECT id, ${workspaceId}, type, status, timestamp, readed_at, updated_at, payload FROM main.notification;
  `)
  db.run(DROP_MAIN_LEGACY_SQL)

  // TEMP views (accounts, trx_log, summary, ...) join workspace-scoped and
  // shared-scoped tables and can't exist as regular views — see tempViews.ts.
  for (const statement of TEMP_VIEW_STATEMENTS) {
    db.run(statement)
  }

  // Add test seed data
  db.run(SEED_DATA)

  return db
}

export function getTestDatabase(): Database {
  if (!db) {
    throw new Error('Test database not initialized. Call setupTestDatabase first.')
  }
  return db
}

export function closeTestDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function resetTestDatabase(): void {
  if (db) {
    // Clear transaction data
    db.run('DELETE FROM workspace.trx_note')
    db.run('DELETE FROM workspace.trx_base')
    db.run('DELETE FROM workspace.trx_to_counterparty')
    db.run('DELETE FROM workspace.trx')
    // Clear budget data
    db.run('DELETE FROM workspace.budget')
    // Clear counterparty data
    db.run('DELETE FROM shared.counterparty_to_tags')
    db.run('DELETE FROM shared.counterparty_note')
    db.run('DELETE FROM shared.counterparty')
    // Clear account/wallet data (accounts before wallets so triggers can resolve names)
    db.run('DELETE FROM workspace.account_to_tags')
    db.run('DELETE FROM workspace.wallet_to_tags')
    db.run('DELETE FROM workspace.account')
    db.run('DELETE FROM workspace.wallet')
    // Clear sync data (all three sync_deletions tables — main/shared/workspace)
    db.run('DELETE FROM main.sync_deletions')
    db.run('DELETE FROM shared.sync_deletions')
    db.run('DELETE FROM workspace.sync_deletions')
    db.run('DELETE FROM main.sync_state')
    // Clear shared-DB reference counts (application-maintained, not trigger-maintained)
    db.run('DELETE FROM shared.tag_references')
    db.run('DELETE FROM shared.notification')
    // Keep currencies, tags, and settings
  }
}

// Mock database connection for integration tests
export function createDatabaseMock() {
  const database = getTestDatabase()

  return {
    execSQL: vi.fn(async (sql: string, bind?: unknown[]) => {
      database.run(sql, bind as (string | number | null | Uint8Array)[])
    }),

    // No-ops: `shared`/`workspace` are already permanently attached to their
    // real in-memory data by setupTestDatabase(), so there's no separate file
    // to switch to in this environment. Sufficient for testing call sequencing
    // and data-level correctness (e.g. workspace.ts's switchWorkspace/
    // attachActiveWorkspace orchestration and workspaceTransfer's import/export
    // logic) — not genuine multi-file isolation between workspaces.
    attachDatabase: vi.fn().mockResolvedValue(undefined),
    detachDatabase: vi.fn().mockResolvedValue(undefined),
    validateReferenceExists: vi.fn(async (qualifiedTable: string, idColumn: string, id: unknown) => {
      const stmt = database.prepare(`SELECT 1 FROM ${qualifiedTable} WHERE ${idColumn} = ?`)
      stmt.bind([id as string | number])
      const found = stmt.step()
      stmt.free()
      return found
    }),

    querySQL: vi.fn(async <T>(sql: string, bind?: unknown[]): Promise<T[]> => {
      const stmt = database.prepare(sql)
      if (bind) {
        stmt.bind(bind as (string | number | null | Uint8Array)[])
      }
      const results: T[] = []
      while (stmt.step()) {
        results.push(stmt.getAsObject() as T)
      }
      stmt.free()
      return results
    }),

    queryOne: vi.fn(async <T>(sql: string, bind?: unknown[]): Promise<T | null> => {
      const stmt = database.prepare(sql)
      if (bind) {
        stmt.bind(bind as (string | number | null | Uint8Array)[])
      }
      const result = stmt.step() ? (stmt.getAsObject() as T) : null
      stmt.free()
      return result
    }),

    runSQL: vi.fn(async (sql: string, bind?: unknown[]) => {
      database.run(sql, bind as (string | number | null | Uint8Array)[])
      return {
        changes: database.getRowsModified(),
        lastInsertId: Number(database.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0),
      }
    }),

    getLastInsertId: vi.fn(async () => {
      const result = database.exec('SELECT last_insert_rowid()')
      return Number(result[0]?.values[0]?.[0] ?? 0)
    }),

    initDatabase: vi.fn(async () => { }),
    closeDatabase: vi.fn(async () => { }),
  }
}

// Helper to insert test data

export function insertCurrency(data: {
  code: string
  name: string
  symbol: string
  decimal_places?: number
  is_fiat?: boolean
  is_crypto?: boolean
}): number {
  const database = getTestDatabase()
  database.run(
    'INSERT INTO shared.currency (code, name, symbol, decimal_places) VALUES (?, ?, ?, ?)',
    [data.code, data.name, data.symbol, data.decimal_places ?? 2]
  )
  const id = Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0])

  if (data.is_fiat) {
    database.run('INSERT INTO shared.currency_to_tags (currency_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.FIAT])
  } else if (data.is_crypto) {
    database.run('INSERT INTO shared.currency_to_tags (currency_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.CRYPTO])
  }

  return id
}

export function insertWallet(data: {
  name: string
  color?: string
  is_default?: boolean
}): number {
  const database = getTestDatabase()
  database.run(
    'INSERT INTO workspace.wallet (name, color) VALUES (?, ?)',
    [data.name, data.color ?? null]
  )
  const id = Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0])

  if (data.is_default) {
    database.run('INSERT INTO workspace.wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.DEFAULT])
  }

  return id
}

export function insertAccount(data: {
  wallet_id: number
  currency_id: number
  balance_int?: number
  balance_frac?: number
}): number {
  const database = getTestDatabase()
  database.run(
    'INSERT INTO workspace.account (wallet_id, currency_id, balance_int, balance_frac) VALUES (?, ?, ?, ?)',
    [data.wallet_id, data.currency_id, data.balance_int ?? 0, data.balance_frac ?? 0]
  )
  return Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

export function insertTag(data: {
  name: string
  parent_ids?: number[]
}): number {
  const database = getTestDatabase()
  database.run('INSERT INTO shared.tag (name) VALUES (?)', [data.name])
  const id = Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0])

  if (data.parent_ids) {
    for (const parentId of data.parent_ids) {
      database.run('INSERT INTO shared.tag_to_tag (child_id, parent_id) VALUES (?, ?)', [id, parentId])
    }
  }

  return id
}

export function insertCounterparty(data: {
  name: string
  note?: string
  tag_ids?: number[]
}): number {
  const database = getTestDatabase()
  database.run('INSERT INTO shared.counterparty (name) VALUES (?)', [data.name])
  const id = Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0])

  if (data.note) {
    database.run('INSERT INTO shared.counterparty_note (counterparty_id, note) VALUES (?, ?)', [id, data.note])
  }

  if (data.tag_ids) {
    for (const tagId of data.tag_ids) {
      database.run('INSERT INTO shared.counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)', [id, tagId])
    }
  }

  return id
}

export function insertTransaction(data: {
  account_id: number
  tag_id: number
  sign: '+' | '-'
  amount_int: number
  amount_frac?: number
  rate_int?: number
  rate_frac?: number
  counterparty_id?: number
  tag_context_id?: number | null
  note?: string
  timestamp?: number
}): Uint8Array {
  const database = getTestDatabase()
  const trxId = new Uint8Array(8)
  crypto.getRandomValues(trxId)

  const timestamp = data.timestamp ?? Math.floor(Date.now() / 1000)

  database.run('INSERT INTO workspace.trx (id, timestamp) VALUES (?, ?)', [trxId, timestamp])

  const trxBaseId = new Uint8Array(8)
  crypto.getRandomValues(trxBaseId)

  database.run(
    'INSERT INTO workspace.trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [trxBaseId, trxId, data.account_id, data.tag_id, data.sign, data.amount_int, data.amount_frac ?? 0, data.rate_int ?? 0, data.rate_frac ?? 0]
  )
  if (data.tag_context_id !== null && data.tag_context_id !== undefined) {
    database.run(
      'INSERT INTO workspace.trx_base_tag_context (trx_base_id, tag_id) VALUES (?, ?)',
      [trxBaseId, data.tag_context_id]
    )
  }

  if (data.counterparty_id) {
    database.run('INSERT INTO workspace.trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)', [
      trxId,
      data.counterparty_id,
    ])
  }

  if (data.note) {
    database.run('INSERT INTO workspace.trx_note (trx_id, note) VALUES (?, ?)', [trxId, data.note])
  }

  return trxId
}

export function insertBudget(data: {
  tag_id: number
  amount_int: number
  amount_frac?: number
  type?: 'income' | 'expense'
  tag_context_id?: number | null
  start?: number
  end?: number
}): Uint8Array {
  const database = getTestDatabase()
  const budgetId = new Uint8Array(8)
  crypto.getRandomValues(budgetId)

  const now = Math.floor(Date.now() / 1000)
  const startOfMonth = now - (now % (30 * 24 * 60 * 60)) // Approximate start of month
  const start = data.start ?? startOfMonth
  const end = data.end ?? (startOfMonth + 30 * 24 * 60 * 60) // End of month

  database.run(
    'INSERT INTO workspace.budget (id, start, end, tag_id, type, amount_int, amount_frac) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [budgetId, start, end, data.tag_id, data.type ?? 'expense', data.amount_int, data.amount_frac ?? 0]
  )
  if (data.tag_context_id !== null && data.tag_context_id !== undefined) {
    database.run(
      'INSERT INTO workspace.budget_tag_context (budget_id, tag_id) VALUES (?, ?)',
      [budgetId, data.tag_context_id]
    )
  }

  return budgetId
}

export function insertExchangeRate(data: {
  currency_id: number
  rate_int: number
  rate_frac?: number
}): void {
  const database = getTestDatabase()
  const timestamp = Math.floor(Date.now() / 1000)

  database.run(
    'INSERT INTO shared.exchange_rate (currency_id, rate_int, rate_frac, updated_at) VALUES (?, ?, ?, ?)',
    [data.currency_id, data.rate_int, data.rate_frac ?? 0, timestamp]
  )
}

export function insertIcon(data: {
  value: string
}): number {
  const database = getTestDatabase()
  database.run('INSERT INTO shared.icon (value) VALUES (?)', [data.value])
  return Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

export function insertTagIcon(data: {
  tag_id: number
  icon_id: number
}): void {
  const database = getTestDatabase()
  database.run('INSERT INTO shared.tag_icon (tag_id, icon_id) VALUES (?, ?)', [data.tag_id, data.icon_id])
}

export function getCurrencyIdByCode(code: string): number {
  const database = getTestDatabase()
  const result = database.exec('SELECT id FROM shared.currency WHERE code = ?', [code])
  if (!result[0]?.values[0]?.[0]) {
    throw new Error(`Currency not found: ${code}`)
  }
  return Number(result[0].values[0][0])
}
