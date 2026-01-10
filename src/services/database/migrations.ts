import { execSQL, queryOne } from './connection'

const CURRENT_VERSION = 1

const migrations: Record<number, string[]> = {
  1: [
    // Currencies table
    `CREATE TABLE IF NOT EXISTS currencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      decimal_places INTEGER DEFAULT 2,
      is_preset INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,

    // Accounts table
    `CREATE TABLE IF NOT EXISTS accounts (
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
    )`,
    `CREATE INDEX IF NOT EXISTS idx_accounts_currency ON accounts(currency_id)`,
    `CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active)`,

    // Categories table
    `CREATE TABLE IF NOT EXISTS categories (
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
    )`,
    `CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type)`,
    `CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id)`,

    // Counterparties table
    `CREATE TABLE IF NOT EXISTS counterparties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,

    // Counterparty-Categories junction table
    `CREATE TABLE IF NOT EXISTS counterparty_categories (
      counterparty_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (counterparty_id, category_id),
      FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_cc_counterparty ON counterparty_categories(counterparty_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cc_category ON counterparty_categories(category_id)`,

    // Transactions table
    `CREATE TABLE IF NOT EXISTS transactions (
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
    )`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date_time)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_to_account ON transactions(to_account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_counterparty ON transactions(counterparty_id)`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(substr(date_time, 1, 7))`,

    // Settings table
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )`,

    // Default settings
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('db_version', '1')`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('default_currency_id', '1')`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'system')`,
  ],
}

export async function runMigrations(): Promise<void> {
  // Check current version
  let currentVersion = 0

  try {
    const result = await queryOne<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'db_version'`
    )
    currentVersion = result ? parseInt(result.value, 10) : 0
  } catch {
    // Table doesn't exist yet, version is 0
    currentVersion = 0
  }

  // Run migrations
  for (let version = currentVersion + 1; version <= CURRENT_VERSION; version++) {
    const statements = migrations[version]
    if (statements) {
      for (const sql of statements) {
        await execSQL(sql)
      }
      // Update version
      if (version > 1) {
        await execSQL(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'db_version'`, [
          version.toString(),
        ])
      }
    }
  }
}
