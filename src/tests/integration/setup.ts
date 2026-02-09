import initSqlJs, { type Database } from 'sql.js'
import { vi } from 'vitest'
import { SYSTEM_TAGS } from '../../types'
import { migrations, CURRENT_VERSION } from '../../services/database/migrations'

let db: Database | null = null

// Seed data for tests (basic currencies)
const SEED_DATA = `
  INSERT OR IGNORE INTO currency (code, name, symbol, decimal_places) VALUES
    ('USD', 'US Dollar', '$', 2),
    ('EUR', 'Euro', '€', 2),
    ('GBP', 'British Pound', '£', 2);

  -- Tag first currency as default and fiat
  INSERT OR IGNORE INTO currency_to_tags (currency_id, tag_id) VALUES
    (1, ${SYSTEM_TAGS.DEFAULT}),
    (1, ${SYSTEM_TAGS.FIAT}),
    (2, ${SYSTEM_TAGS.FIAT}),
    (3, ${SYSTEM_TAGS.FIAT});
`

export async function setupTestDatabase(): Promise<Database> {
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')

  // Run all migrations in order (starting from v1)
  for (let version = 1; version <= CURRENT_VERSION; version++) {
    const statements = migrations[version]
    if (statements) {
      // Join all statements and execute
      // sql.js can handle multiple statements in one run() call
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
    db.run('DELETE FROM trx_note')
    db.run('DELETE FROM trx_base')
    db.run('DELETE FROM trx_to_counterparty')
    db.run('DELETE FROM trx')
    // Clear budget data
    db.run('DELETE FROM budget')
    // Clear counterparty data
    db.run('DELETE FROM counterparty_to_tags')
    db.run('DELETE FROM counterparty_note')
    db.run('DELETE FROM counterparty')
    // Clear account/wallet data
    db.run('DELETE FROM account_to_tags')
    db.run('DELETE FROM account')
    db.run('DELETE FROM wallet_to_tags')
    db.run('DELETE FROM wallet')
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
    'INSERT INTO currency (code, name, symbol, decimal_places) VALUES (?, ?, ?, ?)',
    [data.code, data.name, data.symbol, data.decimal_places ?? 2]
  )
  const id = Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0])

  if (data.is_fiat) {
    database.run('INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.FIAT])
  } else if (data.is_crypto) {
    database.run('INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.CRYPTO])
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
    'INSERT INTO wallet (name, color) VALUES (?, ?)',
    [data.name, data.color ?? null]
  )
  const id = Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0])

  if (data.is_default) {
    database.run('INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.DEFAULT])
  }

  return id
}

export function insertAccount(data: {
  wallet_id: number
  currency_id: number
  balance?: number
}): number {
  const database = getTestDatabase()
  database.run(
    'INSERT INTO account (wallet_id, currency_id, balance) VALUES (?, ?, ?)',
    [data.wallet_id, data.currency_id, data.balance ?? 0]
  )
  return Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

export function insertTag(data: {
  name: string
  parent_ids?: number[]
}): number {
  const database = getTestDatabase()
  database.run('INSERT INTO tag (name) VALUES (?)', [data.name])
  const id = Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0])

  if (data.parent_ids) {
    for (const parentId of data.parent_ids) {
      database.run('INSERT INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)', [id, parentId])
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
  database.run('INSERT INTO counterparty (name) VALUES (?)', [data.name])
  const id = Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0])

  if (data.note) {
    database.run('INSERT INTO counterparty_note (counterparty_id, note) VALUES (?, ?)', [id, data.note])
  }

  if (data.tag_ids) {
    for (const tagId of data.tag_ids) {
      database.run('INSERT INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)', [id, tagId])
    }
  }

  return id
}

export function insertTransaction(data: {
  account_id: number
  tag_id: number
  sign: '+' | '-'
  amount: number
  rate?: number
  counterparty_id?: number
  note?: string
  timestamp?: number
}): Uint8Array {
  const database = getTestDatabase()
  const trxId = new Uint8Array(8)
  crypto.getRandomValues(trxId)

  const timestamp = data.timestamp ?? Math.floor(Date.now() / 1000)

  database.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId, timestamp])

  const trxBaseId = new Uint8Array(8)
  crypto.getRandomValues(trxBaseId)

  database.run(
    'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [trxBaseId, trxId, data.account_id, data.tag_id, data.sign, data.amount, data.rate ?? 0]
  )

  if (data.counterparty_id) {
    database.run('INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)', [
      trxId,
      data.counterparty_id,
    ])
  }

  if (data.note) {
    database.run('INSERT INTO trx_note (trx_id, note) VALUES (?, ?)', [trxId, data.note])
  }

  return trxId
}

export function insertBudget(data: {
  tag_id: number
  amount: number
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
    'INSERT INTO budget (id, start, end, tag_id, amount) VALUES (?, ?, ?, ?, ?)',
    [budgetId, start, end, data.tag_id, data.amount]
  )

  return budgetId
}

export function insertExchangeRate(data: {
  currency_id: number
  rate: number
}): void {
  const database = getTestDatabase()
  const timestamp = Math.floor(Date.now() / 1000)

  database.run(
    'INSERT INTO exchange_rate (currency_id, rate, updated_at) VALUES (?, ?, ?)',
    [data.currency_id, data.rate, timestamp]
  )
}

export function insertIcon(data: {
  value: string
}): number {
  const database = getTestDatabase()
  database.run('INSERT INTO icon (value) VALUES (?)', [data.value])
  return Number(database.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

export function insertTagIcon(data: {
  tag_id: number
  icon_id: number
}): void {
  const database = getTestDatabase()
  database.run('INSERT INTO tag_icon (tag_id, icon_id) VALUES (?, ?)', [data.tag_id, data.icon_id])
}

export function getCurrencyIdByCode(code: string): number {
  const database = getTestDatabase()
  const result = database.exec('SELECT id FROM currency WHERE code = ?', [code])
  if (!result[0]?.values[0]?.[0]) {
    throw new Error(`Currency not found: ${code}`)
  }
  return Number(result[0].values[0][0])
}
