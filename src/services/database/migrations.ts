import { execSQL, queryOne } from './connection'

const CURRENT_VERSION = 2

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

  2: [
    // ============================================
    // MIGRATION 2: New schema with tags, wallets, double-entry transactions
    // ============================================
    // dates sctored in UTC TZ as timestamps, and should be aligne to localdatetime on fetch

    // --- NEW TABLES ---

    // Tag table (replaces categories)
    `CREATE TABLE IF NOT EXISTS tag (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER DEFAULT (strftime('%s', strftime('%s', datetime('now')))),
      updated_at INTEGER DEFAULT (strftime('%s', strftime('%s', datetime('now'))))
    ) STRICT`,

    // Tag hierarchy
    `CREATE TABLE IF NOT EXISTS tag_to_tag (
      child_id INTEGER REFERENCES tag(id),
      parent_id INTEGER REFERENCES tag(id)
    ) STRICT`,

    // Prevent deletion of system tags
    `CREATE TRIGGER IF NOT EXISTS trg_delete_system_tag
    BEFORE DELETE ON tag
    FOR EACH ROW
    WHEN OLD.id = 1 OR EXISTS (SELECT 1 FROM tag_to_tag WHERE OLD.id = child_id AND parent_id = 1)
    BEGIN
      SELECT RAISE(IGNORE);
    END`,

    // Currency table (new version)
    `CREATE TABLE IF NOT EXISTS currency (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      decimal_places INTEGER DEFAULT 2,
      created_at INTEGER DEFAULT (strftime('%s', datetime('now'))),
      updated_at INTEGER DEFAULT (strftime('%s', datetime('now')))
    )`,

    `CREATE TABLE IF NOT EXISTS currency_to_tags (
      currency_id INTEGER REFERENCES currency(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE
    )`,

    // Exchange rate table
    `CREATE TABLE IF NOT EXISTS exchange_rate (
      currency_id INTEGER REFERENCES currency(id) ON DELETE CASCADE,
      rate INTEGER NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', datetime('now')))
    ) STRICT`,

    // Default currency trigger
    `CREATE TRIGGER IF NOT EXISTS trg_default_currency
    BEFORE INSERT ON currency_to_tags
    WHEN NEW.tag_id = 2
    BEGIN
      DELETE FROM currency_to_tags
      WHERE tag_id = 2 AND currency_id != NEW.currency_id;
    END`,

    // Wallet table
    `CREATE TABLE IF NOT EXISTS wallet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      color TEXT,
      created_at INTEGER DEFAULT (strftime('%s', datetime('now'))),
      updated_at INTEGER DEFAULT (strftime('%s', datetime('now')))
    )`,

    `CREATE TABLE IF NOT EXISTS wallet_to_tags (
      wallet_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      FOREIGN KEY (wallet_id) REFERENCES wallet(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
    )`,

    // Default wallet triggers
    `CREATE TRIGGER IF NOT EXISTS trg_default_wallet
    BEFORE INSERT ON wallet_to_tags
    WHEN NEW.tag_id = 2
    BEGIN
      DELETE FROM wallet_to_tags
      WHERE tag_id = 2 AND wallet_id != NEW.wallet_id;
    END`,

    `CREATE TRIGGER IF NOT EXISTS trg_default_wallet_on_delete
    BEFORE DELETE ON wallet
    WHEN 2 IN (SELECT tag_id FROM wallet_to_tags WHERE wallet_id = OLD.id)
      AND (SELECT count(id) FROM wallet WHERE id != old.id) > 0
    BEGIN
      INSERT INTO wallet_to_tags VALUES ((SELECT id FROM wallet WHERE id != OLD.id LIMIT 1), 2);
    END`,

    // Account table (wallet + currency)
    `CREATE TABLE IF NOT EXISTS account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER NOT NULL,
      currency_id INTEGER NOT NULL,
      real_balance INTEGER NOT NULL DEFAULT 0,
      actual_balance INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', datetime('now'))),
      updated_at INTEGER DEFAULT (strftime('%s', datetime('now'))),
      FOREIGN KEY (wallet_id) REFERENCES wallet(id) ON DELETE CASCADE,
      FOREIGN KEY (currency_id) REFERENCES currency(id) ON DELETE CASCADE
    )`,

    `CREATE TABLE IF NOT EXISTS account_to_tags (
      account_id INTEGER REFERENCES account(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE
    )`,

    // Account triggers
    `CREATE TRIGGER IF NOT EXISTS trg_add_first_account
    AFTER INSERT ON account
    WHEN 1 = (SELECT count(id) FROM account WHERE wallet_id = NEW.wallet_id)
    BEGIN
      INSERT INTO account_to_tags VALUES (NEW.id, 2);
    END`,

    `CREATE TRIGGER IF NOT EXISTS trg_set_default_account
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
    END`,

    `CREATE TRIGGER IF NOT EXISTS trg_del_default_account
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
    END`,

    `CREATE TRIGGER IF NOT EXISTS trg_del_last_in_wallet_account
    BEFORE DELETE ON account
    WHEN 1 = (SELECT count(id) FROM account WHERE wallet_id = OLD.wallet_id)
    BEGIN
      DELETE FROM wallet WHERE id = OLD.wallet_id;
    END`,

    // Counterparty table (new version)
    `CREATE TABLE IF NOT EXISTS counterparty (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      note TEXT,
      created_at INTEGER DEFAULT (strftime('%s', datetime('now'))),
      updated_at INTEGER DEFAULT (strftime('%s', datetime('now')))
    )`,

    `CREATE TABLE IF NOT EXISTS counterparty_to_tags (
      counterparty_id INTEGER REFERENCES counterparty(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE
    )`,

    // Transaction header
    `CREATE TABLE IF NOT EXISTS trx (
      id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(16)),
      created_at INTEGER DEFAULT (strftime('%s', datetime('now'))),
      updated_at INTEGER DEFAULT (strftime('%s', datetime('now')))
    )`,

    `CREATE TABLE IF NOT EXISTS trx_to_counterparty (
      trx_id BLOB NOT NULL REFERENCES trx(id) ON DELETE CASCADE,
      counterparty_id INTEGER NOT NULL REFERENCES counterparty(id) ON DELETE CASCADE
    )`,

    // Transaction line items
    `CREATE TABLE IF NOT EXISTS trx_base (
      id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(16)),
      trx_id BLOB NOT NULL REFERENCES trx(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
      tag_id INTEGER NOT NULL REFERENCES tag(id) ON DELETE RESTRICT,
      sign TEXT NOT NULL DEFAULT '-',
      real_amount INTEGER CHECK(real_amount >= 0) NOT NULL DEFAULT 0,
      actual_amount INTEGER CHECK(actual_amount >= 0) NOT NULL DEFAULT 0
    )`,

    `CREATE TABLE IF NOT EXISTS trx_note (
      trx_base_id BLOB NOT NULL REFERENCES trx_base(id) ON DELETE CASCADE,
      note TEXT NOT NULL
    )`,

    // Budget table
    `CREATE TABLE IF NOT EXISTS budget (
      id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(16)),
      start INTEGER NOT NULL DEFAULT (strftime('%s', date('now', 'start of month'))),
      end INTEGER NOT NULL DEFAULT (strftime('%s', date('now', 'start of month', '+1 month'))),
      tag_id INTEGER NOT NULL REFERENCES tag(id),
      amount REAL NOT NULL
    )`,

    // --- BALANCE UPDATE TRIGGERS ---

    `CREATE TRIGGER IF NOT EXISTS trg_add_trx_base
    AFTER INSERT ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE account
      SET real_balance = (
        CASE
          WHEN NEW.sign = '-' THEN real_balance - NEW.real_amount
          ELSE real_balance + NEW.real_amount
        END
      ),
      actual_balance = (
        CASE
          WHEN NEW.sign = '-' THEN actual_balance - NEW.actual_amount
          ELSE actual_balance + NEW.actual_amount
        END
      )
      WHERE id = NEW.account_id;
    END`,

    `CREATE TRIGGER IF NOT EXISTS trg_del_trx_base
    AFTER DELETE ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE account
      SET real_balance = (
        CASE
          WHEN OLD.sign = '+' THEN real_balance - OLD.real_amount
          ELSE real_balance + OLD.real_amount
        END
      ),
      actual_balance = (
        CASE
          WHEN OLD.sign = '+' THEN actual_balance - OLD.actual_amount
          ELSE actual_balance + OLD.actual_amount
        END
      )
      WHERE id = OLD.account_id;
    END`,

    `CREATE TRIGGER IF NOT EXISTS trg_update_trx_base
    AFTER UPDATE OF sign, real_amount, actual_amount ON trx_base
    WHEN 0 != NEW.real_amount AND 0 != NEW.actual_amount
    BEGIN
      UPDATE account
      SET real_balance = (
        CASE
        WHEN OLD.sign != NEW.sign
        THEN (
          CASE
          WHEN NEW.sign = '+' THEN real_balance + OLD.real_amount + NEW.real_amount
          ELSE real_balance - OLD.real_amount - NEW.real_amount
          END
        )
        ELSE (
          CASE
          WHEN NEW.sign = '+' THEN real_balance - OLD.real_amount + NEW.real_amount
          ELSE real_balance + OLD.real_amount - NEW.real_amount
          END
        )
        END
      ),
      actual_balance = (
        CASE
        WHEN OLD.sign != NEW.sign
        THEN (
          CASE
          WHEN NEW.sign = '+' THEN actual_balance + OLD.actual_amount + NEW.actual_amount
          ELSE actual_balance - OLD.actual_amount - NEW.actual_amount
          END
        )
        ELSE (
          CASE
          WHEN NEW.sign = '+' THEN actual_balance - OLD.actual_amount + NEW.actual_amount
          ELSE actual_balance + OLD.actual_amount - NEW.actual_amount
          END
        )
        END
      )
      WHERE id = NEW.account_id;
    END`,

    // --- SEED SYSTEM TAGS (moved up before data migration) ---

    `INSERT INTO tag (name) VALUES
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
      ('archived')`,

    // System tags hierarchy (1-10, 22 are children of system)
    `INSERT INTO tag_to_tag (child_id, parent_id) VALUES
      (1, 1), (2, 1), (3, 1), (4, 1), (5, 1),
      (6, 1), (7, 1), (8, 1), (9, 1), (10, 1),
      (22, 1)`,

    // Default category tags (11-21 are children of default)
    `INSERT INTO tag_to_tag (child_id, parent_id) VALUES
      (11, 2), (12, 2), (13, 2), (14, 2), (15, 2),
      (16, 2), (17, 2), (18, 2), (19, 2), (20, 2), (21, 2)`,

    // --- DATA MIGRATION ---

    // Migrate currencies
    `INSERT INTO currency (id, code, name, symbol, decimal_places, created_at, updated_at)
    SELECT
      id, code, name, symbol, decimal_places,
      strftime('%s', datetime(created_at, 'localtime')),
      strftime('%s', datetime(updated_at, 'localtime'))
    FROM currencies`,

    // Tag currencies as fiat (tag 4) - assuming all existing are fiat
    `INSERT INTO currency_to_tags (currency_id, tag_id)
    SELECT id, 4 FROM currency`,

    // Set first currency as default
    `INSERT INTO currency_to_tags (currency_id, tag_id)
    SELECT id, 2 FROM currency WHERE code = 'USD' ORDER BY id LIMIT 1`,

    // Migrate categories to tags (income categories -> child of tag 9)
    `INSERT INTO tag (name, created_at, updated_at)
    SELECT
      name,
      strftime('%s', datetime(created_at, 'localtime')),
      strftime('%s', datetime(updated_at, 'localtime'))
    FROM categories
    WHERE type IN ('income', 'both')
    AND name NOT IN (SELECT name FROM tag)`,

    `INSERT INTO tag_to_tag (child_id, parent_id)
    SELECT t.id, 9
    FROM tag t
    JOIN categories c ON c.name = t.name
    WHERE c.type IN ('income', 'both')
    AND t.id > 22`,

    // Migrate categories to tags (expense categories -> child of tag 10)
    `INSERT INTO tag (name, created_at, updated_at)
    SELECT
      name,
      strftime('%s', datetime(created_at, 'localtime')),
      strftime('%s', datetime(updated_at, 'localtime'))
    FROM categories
    WHERE type = 'expense'
    AND name NOT IN (SELECT name FROM tag)`,

    `INSERT INTO tag_to_tag (child_id, parent_id)
    SELECT t.id, 10
    FROM tag t
    JOIN categories c ON c.name = t.name
    WHERE c.type IN ('expense', 'both')
    AND t.id > 22`,

    // Migrate accounts -> wallets
    `INSERT INTO wallet (id, name, icon, color, created_at, updated_at)
    SELECT
      id, name, icon, color,
      strftime('%s', datetime(created_at, 'localtime')),
      strftime('%s', datetime(updated_at, 'localtime'))
    FROM accounts`,

    // Tag first wallet as default
    `INSERT INTO wallet_to_tags (wallet_id, tag_id)
    SELECT id, 2 FROM wallet ORDER BY id LIMIT 1`,

    // Tag inactive wallets as archived
    `INSERT INTO wallet_to_tags (wallet_id, tag_id)
    SELECT id, 22 FROM accounts WHERE is_active = 0`,

    // Create account for each wallet (wallet + currency)
    // Disable balance triggers temporarily for migration
    `DROP TRIGGER IF EXISTS trg_add_trx_base`,

    `INSERT INTO account (wallet_id, currency_id, real_balance, actual_balance, created_at, updated_at)
    SELECT
      id as wallet_id,
      currency_id,
      0 as real_balance,
      0 as actual_balance,
      strftime('%s', datetime(created_at, 'localtime')),
      strftime('%s', datetime(updated_at, 'localtime'))
    FROM accounts`,

    // Migrate counterparties
    `INSERT INTO counterparty (id, name, note, created_at, updated_at)
    SELECT
      id, name, notes,
      strftime('%s', datetime(created_at, 'localtime')),
      strftime('%s', datetime(updated_at, 'localtime'))
    FROM counterparties`,

    // Migrate counterparty-category relationships to tags
    `INSERT INTO counterparty_to_tags (counterparty_id, tag_id)
    SELECT cc.counterparty_id, t.id
    FROM counterparty_categories cc
    JOIN categories c ON cc.category_id = c.id
    JOIN tag t ON t.name = c.name`,

    // --- TRANSACTION MIGRATION ---

    // Create initial balance transactions (for accounts with non-zero initial_balance)
    `INSERT INTO trx (id, created_at, updated_at)
    SELECT
      randomblob(16),
      strftime('%s', datetime(created_at, 'localtime')),
      strftime('%s', datetime(created_at, 'localtime'))
    FROM accounts
    WHERE initial_balance != 0`,

    // Create trx_base for initial balances
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, real_amount, actual_amount)
    SELECT
      t.id,
      a.id,
      3,
      iif(old_acc.initial_balance >= 0, '+', '-'),
      CAST(abs(old_acc.initial_balance) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER),
      CAST(abs(old_acc.initial_balance) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM accounts old_acc
    JOIN account a ON a.wallet_id = old_acc.id
    JOIN currency cur ON a.currency_id = cur.id
    JOIN trx t ON t.created_at = strftime('%s', datetime(old_acc.created_at, 'localtime'))
    WHERE old_acc.initial_balance != 0`,

    // Migrate income/expense transactions
    `INSERT INTO trx (id, created_at, updated_at)
    SELECT
      randomblob(16),
      strftime('%s', datetime(date_time, 'localtime')),
      strftime('%s', datetime(updated_at, 'localtime'))
    FROM transactions
    WHERE type IN ('income', 'expense')`,

    // Create trx_base for income/expense
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, real_amount, actual_amount)
    SELECT
      t.id,
      a.id,
      COALESCE(tag.id, iif(old_trx.type = 'income', 9, 10)),
      iif(old_trx.type = 'income', '+', '-'),
      CAST(abs(old_trx.amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER),
      CAST(abs(old_trx.amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM transactions old_trx
    JOIN account a ON a.wallet_id = old_trx.account_id
    JOIN currency cur ON a.currency_id = cur.id
    JOIN trx t ON t.created_at = strftime('%s', datetime(old_trx.date_time, 'localtime'))
    LEFT JOIN categories c ON old_trx.category_id = c.id
    LEFT JOIN tag ON tag.name = c.name
    WHERE old_trx.type IN ('income', 'expense')`,

    // Link transactions to counterparties
    `INSERT INTO trx_to_counterparty (trx_id, counterparty_id)
    SELECT t.id, old_trx.counterparty_id
    FROM transactions old_trx
    JOIN trx t ON t.created_at = strftime('%s', datetime(old_trx.date_time, 'localtime'))
    WHERE old_trx.counterparty_id IS NOT NULL
    AND old_trx.type IN ('income', 'expense')`,

    // Migrate notes
    `INSERT INTO trx_note (trx_base_id, note)
    SELECT tb.id, old_trx.notes
    FROM transactions old_trx
    JOIN trx t ON t.created_at = strftime('%s', datetime(old_trx.date_time, 'localtime'))
    JOIN trx_base tb ON tb.trx_id = t.id
    WHERE old_trx.notes IS NOT NULL AND old_trx.notes != ''
    AND old_trx.type IN ('income', 'expense')`,

    // Migrate transfer transactions
    `INSERT INTO trx (id, created_at, updated_at)
    SELECT
      randomblob(16),
      strftime('%s', datetime(date_time, 'localtime')),
      strftime('%s', datetime(updated_at, 'localtime'))
    FROM transactions
    WHERE type = 'transfer'`,

    // Transfer: Source account (debit) - sends to_amount (or amount if no fee)
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, real_amount, actual_amount)
    SELECT
      t.id,
      a.id,
      6,
      '-',
      CAST(abs(COALESCE(old_trx.to_amount, old_trx.amount)) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER),
      CAST(abs(COALESCE(old_trx.to_amount, old_trx.amount)) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM transactions old_trx
    JOIN account a ON a.wallet_id = old_trx.account_id
    JOIN currency cur ON a.currency_id = cur.id
    JOIN trx t ON t.created_at = strftime('%s', datetime(old_trx.date_time, 'localtime'))
    WHERE old_trx.type = 'transfer'`,

    // Transfer: Destination account (credit)
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, real_amount, actual_amount)
    SELECT
      t.id,
      a.id,
      6,
      '+',
      CAST(abs(COALESCE(old_trx.to_amount, old_trx.amount)) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER),
      CAST(abs(COALESCE(old_trx.to_amount, old_trx.amount)) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM transactions old_trx
    JOIN account a ON a.wallet_id = old_trx.to_account_id
    JOIN currency cur ON a.currency_id = cur.id
    JOIN trx t ON t.created_at = strftime('%s', datetime(old_trx.date_time, 'localtime'))
    WHERE old_trx.type = 'transfer'`,

    // Transfer: Fee entry (when amount > to_amount)
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, real_amount, actual_amount)
    SELECT
      t.id,
      a.id,
      COALESCE(
        (SELECT tag.id FROM tag JOIN categories c ON c.name = tag.name WHERE c.id = old_trx.category_id),
        13
      ),
      '-',
      CAST(abs(old_trx.amount - old_trx.to_amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER),
      CAST(abs(old_trx.amount - old_trx.to_amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM transactions old_trx
    JOIN account a ON a.wallet_id = old_trx.account_id
    JOIN currency cur ON a.currency_id = cur.id
    JOIN trx t ON t.created_at = strftime('%s', datetime(old_trx.date_time, 'localtime'))
    WHERE old_trx.type = 'transfer'
    AND old_trx.to_amount IS NOT NULL
    AND old_trx.amount > old_trx.to_amount`,

    // Migrate exchange transactions
    `INSERT INTO trx (id, created_at, updated_at)
    SELECT
      randomblob(16),
      strftime('%s', datetime(date_time, 'localtime')),
      strftime('%s', datetime(updated_at, 'localtime'))
    FROM transactions
    WHERE type = 'exchange'`,

    // Exchange: Source account (debit)
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, real_amount, actual_amount)
    SELECT
      t.id,
      a.id,
      7,
      '-',
      CAST(abs(old_trx.amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER),
      CAST(abs(old_trx.amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM transactions old_trx
    JOIN account a ON a.wallet_id = old_trx.account_id
    JOIN currency cur ON a.currency_id = cur.id
    JOIN trx t ON t.created_at = strftime('%s', datetime(old_trx.date_time, 'localtime'))
    WHERE old_trx.type = 'exchange'`,

    // Exchange: Destination account (credit)
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, real_amount, actual_amount)
    SELECT
      t.id,
      a.id,
      7,
      '+',
      CAST(abs(old_trx.to_amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER),
      CAST(abs(old_trx.to_amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM transactions old_trx
    JOIN account a ON a.wallet_id = old_trx.to_account_id
    JOIN currency cur ON a.currency_id = cur.id
    JOIN trx t ON t.created_at = strftime('%s', datetime(old_trx.date_time, 'localtime'))
    WHERE old_trx.type = 'exchange'`,

    // Migrate exchange rates from transactions (latest rate per currency pair)
    `INSERT INTO exchange_rate (currency_id, rate, updated_at)
    SELECT
      old_trx.currency_id,
      CAST(old_trx.exchange_rate * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER),
      strftime('%s', datetime(old_trx.date_time, 'localtime'))
    FROM transactions old_trx
    JOIN currency cur ON old_trx.currency_id = cur.id
    WHERE old_trx.type = 'exchange'
    AND old_trx.exchange_rate IS NOT NULL
    AND old_trx.id = (
      SELECT t2.id FROM transactions t2
      WHERE t2.currency_id = old_trx.currency_id
      AND t2.type = 'exchange'
      AND t2.exchange_rate IS NOT NULL
      ORDER BY t2.date_time DESC
      LIMIT 1
    )`,

    // --- DROP OLD TABLES AND VIEWS (ensure clean state) ---

    `DROP TABLE IF EXISTS counterparty_categories`,
    `DROP TABLE IF EXISTS transactions`,
    `DROP TABLE IF EXISTS counterparties`,
    `DROP TABLE IF EXISTS categories`,
    `DROP TABLE IF EXISTS accounts`,
    `DROP TABLE IF EXISTS currencies`,

    // Drop views in case of partial migration re-run
    `DROP VIEW IF EXISTS accounts`,
    `DROP VIEW IF EXISTS transaction_view`,
    `DROP VIEW IF EXISTS transactions`,
    `DROP VIEW IF EXISTS exchanges`,
    `DROP VIEW IF EXISTS transfers`,
    `DROP VIEW IF EXISTS tags_graph`,
    `DROP VIEW IF EXISTS tags_hierarchy`,
    `DROP VIEW IF EXISTS budget_subtags`,
    `DROP VIEW IF EXISTS summary`,
    `DROP VIEW IF EXISTS counterparties_summary`,
    `DROP VIEW IF EXISTS tags_summary`,
    `DROP VIEW IF EXISTS trx_log`,

    // --- VIEWS (created after old tables dropped) ---

    `CREATE VIEW IF NOT EXISTS accounts AS
    SELECT
      a.id as id,
      w.name as wallet,
      c.code as currency,
      group_concat(t.name, ', ') as tags,
      a.real_balance as real_balance,
      a.actual_balance as actual_balance,
      a.created_at as created_at,
      a.updated_at as updated_at
    FROM account a
    JOIN wallet w ON a.wallet_id = w.id
    JOIN currency c ON a.currency_id = c.id
    LEFT JOIN account_to_tags a2t ON a2t.account_id = a.id
    LEFT JOIN tag t ON a2t.tag_id = t.id
    GROUP BY a.id
    ORDER BY wallet_id`,

    `CREATE VIEW IF NOT EXISTS transaction_view AS
    SELECT
      t.id as id,
      t.created_at as created_at,
      c.name as counterparty
    FROM trx t
    LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
    LEFT JOIN counterparty c ON t2c.counterparty_id = c.id`,

    `CREATE TRIGGER IF NOT EXISTS trg_trx_add_counterparty
    INSTEAD OF UPDATE OF counterparty ON transaction_view
    BEGIN
      INSERT INTO counterparty (name)
      SELECT NEW.counterparty
      WHERE NOT EXISTS (
        SELECT 1 FROM counterparty WHERE name = NEW.counterparty
      );
      INSERT INTO trx_to_counterparty (trx_id, counterparty_id)
      VALUES (
        NEW.id,
        (SELECT id FROM counterparty WHERE name = NEW.counterparty)
      );
    END`,

    `CREATE VIEW IF NOT EXISTS transactions AS
    SELECT
      t.id as id,
      datetime(t.created_at, 'unixepoch', 'localtime') as created_at,
      c.name as counterparty,
      GROUP_CONCAT(DISTINCT a.wallet) as wallet,
      GROUP_CONCAT(DISTINCT a.currency) as currency,
      GROUP_CONCAT(tag.name) as tags,
      sum((
        CASE WHEN tb.sign = '-' THEN -tb.real_amount ELSE tb.real_amount END
      )) as real_amount,
      sum((
        CASE WHEN tb.sign = '-' THEN -tb.actual_amount ELSE tb.actual_amount END
      )) as actual_amount
    FROM trx t
    JOIN trx_base tb ON tb.trx_id = t.id
    JOIN accounts a ON tb.account_id = a.id
    JOIN tag ON tb.tag_id = tag.id
    LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
    LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
    WHERE tb.tag_id NOT IN (3, 6, 7)
    GROUP BY t.id
    ORDER BY t.created_at`,

    `CREATE VIEW IF NOT EXISTS exchanges AS
    SELECT
      t.id as id,
      datetime(t.created_at, 'unixepoch', 'localtime') as created_at,
      c.name as counterparty,
      a.wallet as wallet,
      a.currency as currency,
      tag.name as tag,
      (iif(tb.sign = '-', -tb.real_amount, tb.real_amount)) as real_amount,
      (iif(tb.sign = '-', -tb.actual_amount, tb.actual_amount)) as actual_amount
    FROM trx t
    JOIN trx_base tb ON tb.trx_id = t.id
    JOIN accounts a ON tb.account_id = a.id
    JOIN tag ON tb.tag_id = tag.id
    LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
    LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
    WHERE tb.tag_id IN (7, 13)`,

    `CREATE VIEW IF NOT EXISTS transfers AS
    SELECT
      t.id as id,
      datetime(t.created_at, 'unixepoch', 'localtime') as created_at,
      c.name as counterparty,
      a.wallet as wallet,
      a.currency as currency,
      tag.name as tag,
      (iif(tb.sign = '-', -tb.real_amount, tb.real_amount)) as real_amount,
      (iif(tb.sign = '-', -tb.actual_amount, tb.actual_amount)) as actual_amount
    FROM trx t
    JOIN trx_base tb ON tb.trx_id = t.id
    JOIN accounts a ON tb.account_id = a.id
    JOIN tag ON tb.tag_id = tag.id
    LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
    LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
    WHERE tb.tag_id IN (6, 13)`,

    // Note: trg_add_transaction trigger removed - application uses repositories
    // that insert directly into trx and trx_base tables

    `CREATE VIEW IF NOT EXISTS tags_graph AS
    WITH parent AS (SELECT id, name FROM tag),
    child AS (SELECT id, name FROM tag)
    SELECT
      parent.name as parent,
      group_concat(child.name, ',') as children
    FROM parent, child
    JOIN tag_to_tag ON tag_to_tag.parent_id = parent.id AND tag_to_tag.child_id = child.id
    WHERE parent.id NOT IN (1, 2)
    GROUP BY parent`,

    `CREATE VIEW IF NOT EXISTS tags_hierarchy AS
    SELECT
      p.id as parent_id,
      p.name as parent,
      c.id as child_id,
      c.name as child
    FROM tag_to_tag ttt
    JOIN tag p ON p.id = ttt.parent_id
    JOIN tag c ON c.id = ttt.child_id`,

    `CREATE VIEW IF NOT EXISTS budget_subtags AS
    SELECT
      budget.id as budget_id,
      th.child_id as child_id
    FROM budget
    LEFT JOIN tags_hierarchy th ON th.parent_id = budget.tag_id OR budget.tag_id = th.child_id`,

    `CREATE VIEW IF NOT EXISTS summary AS
    SELECT
      tag.name as tag,
      budget.amount as amount,
      abs(total(iif(tb.sign = '-', -tb.actual_amount, tb.actual_amount))) as actual
    FROM budget
    JOIN tag ON budget.tag_id = tag.id
    JOIN trx ON trx.created_at >= budget.start AND trx.created_at < budget.end
    JOIN trx_base tb ON tb.trx_id = trx.id
      AND (tb.tag_id = budget.tag_id OR tb.tag_id IN (SELECT child_id FROM budget_subtags WHERE budget_id = budget.id))
    GROUP BY budget.tag_id, budget.end - budget.start`,

    `CREATE VIEW IF NOT EXISTS counterparties_summary AS
    SELECT
      c.name as counterparty,
      total(iif(tb.sign = '-', -tb.actual_amount, tb.actual_amount)) as amount
    FROM counterparty c
    JOIN trx_to_counterparty tc ON tc.counterparty_id = c.id
    LEFT JOIN trx_base tb ON tc.trx_id = tb.trx_id
    GROUP BY c.id
    ORDER BY amount`,

    `CREATE VIEW IF NOT EXISTS tags_summary AS
    SELECT
      tag.name as tag,
      total(iif(tb.sign = '-', -tb.actual_amount, tb.actual_amount)) as amount
    FROM trx_base tb
    JOIN tag ON tb.tag_id = tag.id
    GROUP BY tb.tag_id
    ORDER BY amount`,

    `CREATE VIEW IF NOT EXISTS trx_log AS
    SELECT
      t.id as id,
      datetime(t.created_at, 'unixepoch', 'localtime') as created_at,
      c.name as counterparty,
      a.wallet as wallet,
      a.currency as currency,
      tag.name as tags,
      (CASE WHEN tb.sign = '-' THEN -tb.real_amount ELSE tb.real_amount END) as real_amount,
      (CASE WHEN tb.sign = '-' THEN -tb.actual_amount ELSE tb.actual_amount END) as actual_amount
    FROM trx t
    JOIN trx_base tb ON tb.trx_id = t.id
    JOIN accounts a ON tb.account_id = a.id
    JOIN tag ON tb.tag_id = tag.id
    LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
    LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
    ORDER BY t.created_at`,

    // --- RECALCULATE BALANCES ---

    // Recalculate account balances from trx_base
    `UPDATE account SET
      real_balance = (
        SELECT COALESCE(SUM(
          CASE WHEN sign = '+' THEN real_amount ELSE -real_amount END
        ), 0) FROM trx_base WHERE account_id = account.id
      ),
      actual_balance = (
        SELECT COALESCE(SUM(
          CASE WHEN sign = '+' THEN actual_amount ELSE -actual_amount END
        ), 0) FROM trx_base WHERE account_id = account.id
      )`,

    // Re-enable balance trigger
    `CREATE TRIGGER trg_add_trx_base
    AFTER INSERT ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE account
      SET real_balance = (
        CASE
          WHEN NEW.sign = '-' THEN real_balance - NEW.real_amount
          ELSE real_balance + NEW.real_amount
        END
      ),
      actual_balance = (
        CASE
          WHEN NEW.sign = '-' THEN actual_balance - NEW.actual_amount
          ELSE actual_balance + NEW.actual_amount
        END
      )
      WHERE id = NEW.account_id;
    END`,
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
