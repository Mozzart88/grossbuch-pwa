import initSqlJs, { type Database } from 'sql.js'
import { vi } from 'vitest'

let db: Database | null = null

// SQL schema matching the production migrations
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS currencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    decimal_places INTEGER DEFAULT 2,
    is_preset INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    currency_id INTEGER NOT NULL,
    initial_balance REAL DEFAULT 0,
    icon TEXT,
    color TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (currency_id) REFERENCES currencies(id)
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'both')),
    icon TEXT,
    color TEXT,
    parent_id INTEGER,
    is_preset INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS counterparties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS counterparty_categories (
    counterparty_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (counterparty_id, category_id),
    FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer', 'exchange')),
    amount REAL NOT NULL,
    currency_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    category_id INTEGER,
    counterparty_id INTEGER,
    to_account_id INTEGER,
    to_amount REAL,
    to_currency_id INTEGER,
    exchange_rate REAL,
    date_time TEXT NOT NULL DEFAULT (datetime('now')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (currency_id) REFERENCES currencies(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (counterparty_id) REFERENCES counterparties(id),
    FOREIGN KEY (to_account_id) REFERENCES accounts(id),
    FOREIGN KEY (to_currency_id) REFERENCES currencies(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Default settings
  INSERT OR IGNORE INTO settings (key, value) VALUES ('db_version', '1');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('default_currency_id', '1');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'system');
`

// Seed data
const SEED_DATA = `
  INSERT INTO currencies (code, name, symbol, decimal_places, is_preset)
  VALUES
    ('USD', 'US Dollar', '$', 2, 1),
    ('EUR', 'Euro', '€', 2, 1),
    ('GBP', 'British Pound', '£', 2, 1);
`

export async function setupTestDatabase(): Promise<Database> {
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  db.run(SCHEMA)
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
    // Clear all tables
    db.run('DELETE FROM transactions')
    db.run('DELETE FROM counterparty_categories')
    db.run('DELETE FROM counterparties')
    db.run('DELETE FROM accounts')
    db.run('DELETE FROM categories')
    // Keep currencies and settings
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

    initDatabase: vi.fn(async () => {}),
    closeDatabase: vi.fn(async () => {}),
  }
}

// Helper to insert test data
export function insertCurrency(data: {
  code: string
  name: string
  symbol: string
  decimal_places?: number
}): number {
  const db = getTestDatabase()
  db.run(
    'INSERT INTO currencies (code, name, symbol, decimal_places) VALUES (?, ?, ?, ?)',
    [data.code, data.name, data.symbol, data.decimal_places ?? 2]
  )
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

export function insertAccount(data: {
  name: string
  currency_id: number
  initial_balance?: number
}): number {
  const db = getTestDatabase()
  db.run(
    'INSERT INTO accounts (name, currency_id, initial_balance) VALUES (?, ?, ?)',
    [data.name, data.currency_id, data.initial_balance ?? 0]
  )
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

export function insertCategory(data: {
  name: string
  type: 'income' | 'expense' | 'both'
}): number {
  const db = getTestDatabase()
  db.run(
    'INSERT INTO categories (name, type) VALUES (?, ?)',
    [data.name, data.type]
  )
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}

export function insertTransaction(data: {
  type: 'income' | 'expense' | 'transfer' | 'exchange'
  amount: number
  currency_id: number
  account_id: number
  category_id?: number
  to_account_id?: number
  to_amount?: number
  to_currency_id?: number
  date_time?: string
}): number {
  const db = getTestDatabase()
  db.run(
    `INSERT INTO transactions
      (type, amount, currency_id, account_id, category_id, to_account_id, to_amount, to_currency_id, date_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.type,
      data.amount,
      data.currency_id,
      data.account_id,
      data.category_id ?? null,
      data.to_account_id ?? null,
      data.to_amount ?? null,
      data.to_currency_id ?? null,
      data.date_time ?? '2025-01-09 14:30:00',
    ]
  )
  return Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])
}
