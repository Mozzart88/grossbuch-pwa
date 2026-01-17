import initSqlJs, { type Database } from 'sql.js'
import { vi } from 'vitest'
import { SYSTEM_TAGS } from '../../types'

let db: Database | null = null

// SQL schema matching the production migrations v2
const SCHEMA = `
  -- Icon table
  CREATE TABLE IF NOT EXISTS icon (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT NOT NULL UNIQUE
  );

  -- Tag table (replaces categories) - no timestamps
  CREATE TABLE IF NOT EXISTS tag (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  -- Tag hierarchy
  CREATE TABLE IF NOT EXISTS tag_to_tag (
    child_id INTEGER REFERENCES tag(id),
    parent_id INTEGER REFERENCES tag(id)
  );

  -- Tag icon relationship
  CREATE TABLE IF NOT EXISTS tag_icon (
    tag_id INTEGER REFERENCES tag(id),
    icon_id INTEGER REFERENCES icon(id)
  );

  -- Currency table - no timestamps
  CREATE TABLE IF NOT EXISTS currency (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    decimal_places INTEGER DEFAULT 2
  );

  CREATE TABLE IF NOT EXISTS currency_to_tags (
    currency_id INTEGER REFERENCES currency(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE
  );

  -- Exchange rate table
  CREATE TABLE IF NOT EXISTS exchange_rate (
    currency_id INTEGER REFERENCES currency(id) ON DELETE CASCADE,
    rate INTEGER NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  -- Wallet table - no icon or timestamps
  CREATE TABLE IF NOT EXISTS wallet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT
  );

  CREATE TABLE IF NOT EXISTS wallet_to_tags (
    wallet_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    FOREIGN KEY (wallet_id) REFERENCES wallet(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
  );

  -- Account table (wallet + currency combination) - single balance, no created_at
  CREATE TABLE IF NOT EXISTS account (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id INTEGER NOT NULL,
    currency_id INTEGER NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (wallet_id) REFERENCES wallet(id) ON DELETE CASCADE,
    FOREIGN KEY (currency_id) REFERENCES currency(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS account_to_tags (
    account_id INTEGER REFERENCES account(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE
  );

  -- Counterparty table - no timestamps
  CREATE TABLE IF NOT EXISTS counterparty (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  -- Counterparty note in separate table
  CREATE TABLE IF NOT EXISTS counterparty_note (
    counterparty_id INTEGER REFERENCES counterparty(id) ON DELETE CASCADE,
    note TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS counterparty_to_tags (
    counterparty_id INTEGER REFERENCES counterparty(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE
  );

  -- Transaction header - 8-byte blob, single timestamp
  CREATE TABLE IF NOT EXISTS trx (
    id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(8)),
    timestamp INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS trx_to_counterparty (
    trx_id BLOB NOT NULL REFERENCES trx(id) ON DELETE CASCADE,
    counterparty_id INTEGER NOT NULL REFERENCES counterparty(id) ON DELETE CASCADE
  );

  -- Transaction line items - amount and rate
  CREATE TABLE IF NOT EXISTS trx_base (
    id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(8)),
    trx_id BLOB NOT NULL REFERENCES trx(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    tag_id INTEGER NOT NULL REFERENCES tag(id) ON DELETE RESTRICT,
    sign TEXT NOT NULL DEFAULT '-',
    amount INTEGER CHECK(amount >= 0) NOT NULL DEFAULT 0,
    rate INTEGER CHECK(rate >= 0) NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS trx_note (
    trx_base_id BLOB NOT NULL REFERENCES trx_base(id) ON DELETE CASCADE,
    note TEXT NOT NULL
  );

  -- Settings table
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  -- Accounts view
  CREATE VIEW IF NOT EXISTS accounts AS
  SELECT
    a.id as id,
    w.name as wallet,
    c.code as currency,
    c.symbol as symbol,
    c.decimal_places as decimal_places,
    group_concat(t.name, ', ') as tags,
    a.balance as balance,
    a.updated_at as updated_at
  FROM account a
  JOIN wallet w ON a.wallet_id = w.id
  JOIN currency c ON a.currency_id = c.id
  LEFT JOIN account_to_tags a2t ON a2t.account_id = a.id
  LEFT JOIN tag t ON a2t.tag_id = t.id
  GROUP BY a.id
  ORDER BY wallet_id;

  -- Transactions view
  CREATE VIEW IF NOT EXISTS transactions AS
  SELECT
    t.id as id,
    datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
    c.name as counterparty,
    GROUP_CONCAT(DISTINCT a.wallet) as wallet,
    GROUP_CONCAT(DISTINCT a.currency) as currency,
    GROUP_CONCAT(tag.name) as tags,
    sum((
      CASE WHEN tb.sign = '-' THEN -tb.amount ELSE tb.amount END
    )) as amount
  FROM trx t
  JOIN trx_base tb ON tb.trx_id = t.id
  JOIN accounts a ON tb.account_id = a.id
  JOIN tag ON tb.tag_id = tag.id
  LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
  LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
  WHERE tb.tag_id NOT IN (3, 6, 7)
  GROUP BY t.id
  ORDER BY t.timestamp;

  -- trx_log view
  CREATE VIEW IF NOT EXISTS trx_log AS
  SELECT
    t.id as id,
    datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
    c.name as counterparty,
    a.wallet as wallet,
    a.currency as currency,
    a.symbol as symbol,
    a.decimal_places as decimal_places,
    tag.name as tags,
    (CASE WHEN tb.sign = '-' THEN -tb.amount ELSE tb.amount END) as amount,
    tb.rate as rate
  FROM trx t
  JOIN trx_base tb ON tb.trx_id = t.id
  JOIN accounts a ON tb.account_id = a.id
  JOIN tag ON tb.tag_id = tag.id
  LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
  LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
  ORDER BY t.timestamp;

  -- Budget table - 8-byte id, amount is INTEGER
  CREATE TABLE IF NOT EXISTS budget (
    id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(8)),
    start INTEGER NOT NULL DEFAULT (strftime('%s', date('now', 'start of month'))),
    end INTEGER NOT NULL DEFAULT (strftime('%s', date('now', 'start of month', '+1 month'))),
    tag_id INTEGER NOT NULL REFERENCES tag(id),
    amount INTEGER NOT NULL
  );

  -- Tags hierarchy view
  CREATE VIEW IF NOT EXISTS tags_hierarchy AS
  SELECT
    p.id as parent_id,
    p.name as parent,
    c.id as child_id,
    c.name as child
  FROM tag_to_tag ttt
  JOIN tag p ON p.id = ttt.parent_id
  JOIN tag c ON c.id = ttt.child_id;

  -- Tags graph view
  CREATE VIEW IF NOT EXISTS tags_graph AS
  WITH parent AS (SELECT id, name FROM tag),
  child AS (SELECT id, name FROM tag)
  SELECT
    parent.name as parent,
    group_concat(child.name, ',') as children
  FROM parent, child
  JOIN tag_to_tag ON tag_to_tag.parent_id = parent.id AND tag_to_tag.child_id = child.id
  WHERE parent.id NOT IN (1, 2)
  GROUP BY parent;

  -- Budget subtags view
  CREATE VIEW IF NOT EXISTS budget_subtags AS
  SELECT
    budget.id as budget_id,
    th.child_id as child_id
  FROM budget
  LEFT JOIN tags_hierarchy th ON th.parent_id = budget.tag_id OR budget.tag_id = th.child_id;

  -- Summary view - uses amount * rate
  CREATE VIEW IF NOT EXISTS summary AS
  SELECT
    tag.name as tag,
    budget.amount as amount,
    abs(total(iif(tb.sign = '-', -tb.amount, tb.amount) * tb.rate)) as actual
  FROM budget
  JOIN tag ON budget.tag_id = tag.id
  JOIN trx ON trx.timestamp >= budget.start AND trx.timestamp < budget.end
  JOIN trx_base tb ON tb.trx_id = trx.id
    AND (tb.tag_id = budget.tag_id OR tb.tag_id IN (SELECT child_id FROM budget_subtags WHERE budget_id = budget.id))
  GROUP BY budget.tag_id, budget.end - budget.start;

  -- Counterparties summary view - uses amount * rate
  CREATE VIEW IF NOT EXISTS counterparties_summary AS
  SELECT
    c.name as counterparty,
    sum(iif(tb.sign = '-', -tb.amount, tb.amount) * tb.rate) as amount
  FROM counterparty c
  JOIN trx_to_counterparty tc ON tc.counterparty_id = c.id
  LEFT JOIN trx_base tb ON tc.trx_id = tb.trx_id
  GROUP BY c.id
  ORDER BY amount;

  -- Tags summary view - uses amount * rate
  CREATE VIEW IF NOT EXISTS tags_summary AS
  SELECT
    tag.name as tag,
    total(iif(tb.sign = '-', -tb.amount, tb.amount) * tb.rate) as amount
  FROM trx_base tb
  JOIN tag ON tb.tag_id = tag.id
  GROUP BY tb.tag_id
  ORDER BY amount;

  -- Exchanges view
  CREATE VIEW IF NOT EXISTS exchanges AS
  SELECT
    t.id as id,
    datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
    c.name as counterparty,
    a.wallet as wallet,
    a.currency as currency,
    tag.name as tag,
    (iif(tb.sign = '-', -tb.amount, tb.amount)) as amount
  FROM trx t
  JOIN trx_base tb ON tb.trx_id = t.id
  JOIN accounts a ON tb.account_id = a.id
  JOIN tag ON tb.tag_id = tag.id
  LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
  LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
  WHERE tb.tag_id IN (7, 13);

  -- Transfers view
  CREATE VIEW IF NOT EXISTS transfers AS
  SELECT
    t.id as id,
    datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
    c.name as counterparty,
    a.wallet as wallet,
    a.currency as currency,
    tag.name as tag,
    (iif(tb.sign = '-', -tb.amount, tb.amount)) as amount
  FROM trx t
  JOIN trx_base tb ON tb.trx_id = t.id
  JOIN accounts a ON tb.account_id = a.id
  JOIN tag ON tb.tag_id = tag.id
  LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
  LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
  WHERE tb.tag_id IN (6, 13);

  -- Default settings
  INSERT OR IGNORE INTO settings (key, value) VALUES ('db_version', '2');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'system');
`

// System tags seed
const SYSTEM_TAGS_SEED = `
  INSERT INTO tag (name) VALUES
    ('system'),
    ('default'),
    ('initial'),
    ('fiat'),
    ('crypto'),
    ('transfer'),
    ('exchange'),
    ('purchase'),
    ('income'),
    ('expense'),
    ('sale'),
    ('food'),
    ('fee'),
    ('transport'),
    ('house'),
    ('tax'),
    ('utilities'),
    ('discount'),
    ('fine'),
    ('households'),
    ('auto'),
    ('archived');

  -- System tags hierarchy (1-10, 22 are children of system)
  INSERT INTO tag_to_tag (child_id, parent_id) VALUES
    (1, 1), (2, 1), (3, 1), (4, 1), (5, 1),
    (6, 1), (7, 1), (8, 1), (9, 1), (10, 1),
    (22, 1);

  -- Default category tags (11-21 are children of default and income/expense)
  INSERT INTO tag_to_tag (child_id, parent_id) VALUES
    (11, 2), (12, 2), (13, 2), (14, 2), (15, 2),
    (16, 2), (17, 2), (18, 2), (19, 2), (20, 2), (21, 2);

  -- Income tags
  INSERT INTO tag_to_tag (child_id, parent_id) VALUES (11, 9);
  -- Expense tags
  INSERT INTO tag_to_tag (child_id, parent_id) VALUES
    (12, 10), (13, 10), (14, 10), (15, 10), (16, 10),
    (17, 10), (18, 10), (19, 10), (20, 10), (21, 10);
`

// Seed data
const SEED_DATA = `
  INSERT INTO currency (code, name, symbol, decimal_places) VALUES
    ('USD', 'US Dollar', '$', 2),
    ('EUR', 'Euro', '€', 2),
    ('GBP', 'British Pound', '£', 2);

  -- Tag first currency as default and fiat
  INSERT INTO currency_to_tags (currency_id, tag_id) VALUES
    (1, ${SYSTEM_TAGS.DEFAULT}),
    (1, ${SYSTEM_TAGS.FIAT}),
    (2, ${SYSTEM_TAGS.FIAT}),
    (3, ${SYSTEM_TAGS.FIAT});
`

export async function setupTestDatabase(): Promise<Database> {
  const SQL = await initSqlJs()
  db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  db.run(SCHEMA)
  db.run(SYSTEM_TAGS_SEED)
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
    database.run('INSERT INTO trx_note (trx_base_id, note) VALUES (?, ?)', [trxBaseId, data.note])
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
