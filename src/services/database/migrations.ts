import { execSQL, queryOne } from './connection'
import { CURRENCIES } from './currencyData'

export const CURRENT_VERSION = 6

// Generate currency INSERT statements for migration v4
function generateCurrencyInsertSQL(): string {
  const values = CURRENCIES.map(
    (c) =>
      `('${c.code}', '${c.name.replace(/'/g, "''")}', '${c.symbol.replace(/'/g, "''")}', ${c.decimal_places})`
  ).join(',\n  ')
  return `INSERT OR IGNORE INTO currency (code, name, symbol, decimal_places) VALUES\n  ${values};`
}

// Generate fiat currency tag assignments
function generateFiatTagSQL(): string {
  const fiatCodes = CURRENCIES.filter((c) => !c.is_crypto)
    .map((c) => `'${c.code}'`)
    .join(', ')
  return `INSERT OR IGNORE INTO currency_to_tags (currency_id, tag_id)
SELECT id, 4 FROM currency WHERE code IN (${fiatCodes});`
}

// Generate crypto currency tag assignments
function generateCryptoTagSQL(): string {
  const cryptoCodes = CURRENCIES.filter((c) => c.is_crypto)
    .map((c) => `'${c.code}'`)
    .join(', ')
  return `INSERT OR IGNORE INTO currency_to_tags (currency_id, tag_id)
SELECT id, 5 FROM currency WHERE code IN (${cryptoCodes});`
}

export const migrations: Record<number, string[]> = {
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
    );`,

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
    );`,
    `CREATE INDEX IF NOT EXISTS idx_accounts_currency ON accounts(currency_id);`,
    `CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active);`,

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
    );`,
    `CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);`,
    `CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);`,

    // Counterparties table
    `CREATE TABLE IF NOT EXISTS counterparties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );`,

    // Counterparty-Categories junction table
    `CREATE TABLE IF NOT EXISTS counterparty_categories (
      counterparty_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (counterparty_id, category_id),
      FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_cc_counterparty ON counterparty_categories(counterparty_id);`,
    `CREATE INDEX IF NOT EXISTS idx_cc_category ON counterparty_categories(category_id);`,

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
    );`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date_time);`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_to_account ON transactions(to_account_id);`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_counterparty ON transactions(counterparty_id);`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(substr(date_time, 1, 7));`,

    // Settings table
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );`,

    // Default settings
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('db_version', '1');`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('default_currency_id', '1');`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'system');`,
  ],

  2: [
    // ============================================
    // MIGRATION 2: New schema with tags, wallets, double-entry transactions
    // ============================================
    // dates stored in UTC TZ as timestamps, and should be aligned to localdatetime on fetch

    // --- NEW TABLES ---

    // Icon table for storing icon values
    `CREATE TABLE IF NOT EXISTS icon (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      value TEXT NOT NULL UNIQUE
    ) STRICT;`,

    // Tag table (replaces categories) - no timestamps
    `CREATE TABLE IF NOT EXISTS tag (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    ) STRICT;`,

    // Tag hierarchy
    `CREATE TABLE IF NOT EXISTS tag_to_tag (
      child_id INTEGER REFERENCES tag(id),
      parent_id INTEGER REFERENCES tag(id)
    ) STRICT;`,

    // Tag icon relationship
    `CREATE TABLE IF NOT EXISTS tag_icon (
      tag_id INTEGER REFERENCES tag(id),
      icon_id INTEGER REFERENCES icon(id)
    ) STRICT;`,

    // Prevent deletion of system tags
    `CREATE TRIGGER IF NOT EXISTS trg_delete_system_tag
    BEFORE DELETE ON tag
    FOR EACH ROW
    WHEN OLD.id = 1 OR EXISTS (SELECT 1 FROM tag_to_tag WHERE OLD.id = child_id AND parent_id = 1)
    BEGIN
      SELECT RAISE(IGNORE);
    END;`,

    // Currency table (new version) - no timestamps
    `CREATE TABLE IF NOT EXISTS currency (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      decimal_places INTEGER DEFAULT 2
    );`,

    `CREATE TABLE IF NOT EXISTS currency_to_tags (
      currency_id INTEGER REFERENCES currency(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE
    );`,

    // Exchange rate table
    `CREATE TABLE IF NOT EXISTS exchange_rate (
      currency_id INTEGER REFERENCES currency(id) ON DELETE CASCADE,
      rate INTEGER NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', datetime('now')))
    ) STRICT;`,

    // Default currency trigger
    `CREATE TRIGGER IF NOT EXISTS trg_default_currency
    BEFORE INSERT ON currency_to_tags
    WHEN NEW.tag_id = 2
    BEGIN
      DELETE FROM currency_to_tags
      WHERE tag_id = 2 AND currency_id != NEW.currency_id;
    END;`,

    // Wallet table - no icon or timestamps, just name and color
    `CREATE TABLE IF NOT EXISTS wallet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT
    );`,

    `CREATE TABLE IF NOT EXISTS wallet_to_tags (
      wallet_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      FOREIGN KEY (wallet_id) REFERENCES wallet(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
    );`,

    // Default wallet triggers
    `CREATE TRIGGER IF NOT EXISTS trg_default_wallet
    BEFORE INSERT ON wallet_to_tags
    WHEN NEW.tag_id = 2
    BEGIN
      DELETE FROM wallet_to_tags
      WHERE tag_id = 2 AND wallet_id != NEW.wallet_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS trg_default_wallet_on_delete
    BEFORE DELETE ON wallet
    WHEN 2 IN (SELECT tag_id FROM wallet_to_tags WHERE wallet_id = OLD.id)
      AND (SELECT count(id) FROM wallet WHERE id != old.id) > 0
    BEGIN
      INSERT INTO wallet_to_tags VALUES ((SELECT id FROM wallet WHERE id != OLD.id LIMIT 1), 2);
    END;`,

    // Account table (wallet + currency) - single balance field, no created_at
    `CREATE TABLE IF NOT EXISTS account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER NOT NULL,
      currency_id INTEGER NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER DEFAULT (strftime('%s', datetime('now'))),
      FOREIGN KEY (wallet_id) REFERENCES wallet(id) ON DELETE CASCADE,
      FOREIGN KEY (currency_id) REFERENCES currency(id) ON DELETE CASCADE
    );`,

    `CREATE TABLE IF NOT EXISTS account_to_tags (
      account_id INTEGER REFERENCES account(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE
    );`,

    // Account triggers
    `CREATE TRIGGER IF NOT EXISTS trg_add_first_account
    AFTER INSERT ON account
    WHEN 1 = (SELECT count(id) FROM account WHERE wallet_id = NEW.wallet_id)
    BEGIN
      INSERT INTO account_to_tags VALUES (NEW.id, 2);
    END;`,

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
    END;`,

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
    END;`,

    `CREATE TRIGGER IF NOT EXISTS trg_del_last_in_wallet_account
    BEFORE DELETE ON account
    WHEN 1 = (SELECT count(id) FROM account WHERE wallet_id = OLD.wallet_id)
    BEGIN
      DELETE FROM wallet WHERE id = OLD.wallet_id;
    END;`,

    // Counterparty table (new version) - no note field or timestamps
    `CREATE TABLE IF NOT EXISTS counterparty (
      id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );`,

    // Counterparty note in separate table
    `CREATE TABLE IF NOT EXISTS counterparty_note (
      counterparty_id INTEGER REFERENCES counterparty(id) ON DELETE CASCADE,
      note TEXT NOT NULL
    );`,

    `CREATE TABLE IF NOT EXISTS counterparty_to_tags (
      counterparty_id INTEGER REFERENCES counterparty(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE
    );`,

    // Transaction header - 8-byte blob id, single timestamp
    `CREATE TABLE IF NOT EXISTS trx (
      id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(8)),
      timestamp INTEGER DEFAULT (strftime('%s', datetime('now')))
    );`,

    `CREATE TABLE IF NOT EXISTS trx_to_counterparty (
      trx_id BLOB NOT NULL REFERENCES trx(id) ON DELETE CASCADE,
      counterparty_id INTEGER NOT NULL REFERENCES counterparty(id) ON DELETE CASCADE
    );`,

    // Transaction line items - amount and rate instead of real_amount/actual_amount
    `CREATE TABLE IF NOT EXISTS trx_base (
      id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(8)),
      trx_id BLOB NOT NULL REFERENCES trx(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
      tag_id INTEGER NOT NULL REFERENCES tag(id) ON DELETE RESTRICT,
      sign TEXT NOT NULL DEFAULT '-',
      amount INTEGER CHECK(amount >= 0) NOT NULL DEFAULT 0,
      rate INTEGER CHECK(rate >= 0) NOT NULL DEFAULT 0
    );`,

    `CREATE TABLE IF NOT EXISTS trx_note (
      trx_base_id BLOB NOT NULL REFERENCES trx_base(id) ON DELETE CASCADE,
      note TEXT NOT NULL
    );`,

    // Budget table - amount is INTEGER
    `CREATE TABLE IF NOT EXISTS budget (
      id BLOB NOT NULL PRIMARY KEY DEFAULT (randomblob(8)),
      start INTEGER NOT NULL DEFAULT (strftime('%s', date('now', 'start of month'))),
      end INTEGER NOT NULL DEFAULT (strftime('%s', date('now', 'start of month', '+1 month'))),
      tag_id INTEGER NOT NULL REFERENCES tag(id),
      amount INTEGER NOT NULL
    );`,

    // --- BALANCE UPDATE TRIGGERS ---

    `CREATE TRIGGER IF NOT EXISTS trg_add_trx_base
    AFTER INSERT ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE account
      SET balance = (
        CASE
          WHEN NEW.sign = '-' THEN balance - NEW.amount
          ELSE balance + NEW.amount
        END
      )
      WHERE id = NEW.account_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS trg_del_trx_base
    AFTER DELETE ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE account
      SET balance = (
        CASE
          WHEN OLD.sign = '+' THEN balance - OLD.amount
          ELSE balance + OLD.amount
        END
      )
      WHERE id = OLD.account_id;
    END;`,

    `CREATE TRIGGER IF NOT EXISTS trg_update_trx_base
    AFTER UPDATE OF sign, amount ON trx_base
    WHEN 0 != NEW.amount
    BEGIN
      UPDATE account
      SET balance = (
        CASE
        WHEN OLD.sign != NEW.sign
        THEN (
          CASE
          WHEN NEW.sign = '+' THEN balance + OLD.amount + NEW.amount
          ELSE balance - OLD.amount - NEW.amount
          END
        )
        ELSE (
          CASE
          WHEN NEW.sign = '+' THEN balance - OLD.amount + NEW.amount
          ELSE balance + OLD.amount - NEW.amount
          END
        )
        END
      )
      WHERE id = NEW.account_id;
    END;`,

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
      ('archived');`,

    // System tags hierarchy (1-10, 22 are children of system)
    `INSERT INTO tag_to_tag (child_id, parent_id) VALUES
      (1, 1), (2, 1), (3, 1), (4, 1), (5, 1),
      (6, 1), (7, 1), (8, 1), (9, 1), (10, 1),
      (22, 1);`,

    // Default category tags (11-21 are children of default)
    `INSERT INTO tag_to_tag (child_id, parent_id) VALUES
      (11, 2), (12, 2), (13, 2), (14, 2), (15, 2),
      (16, 2), (17, 2), (18, 2), (19, 2), (20, 2), (21, 2);`,

    // --- DATA MIGRATION ---

    // Migrate icons from categories
    `INSERT INTO icon (value)
    SELECT DISTINCT icon
    FROM categories
    WHERE icon IS NOT NULL;`,

    // Migrate currencies (no timestamps)
    `INSERT INTO currency (id, code, name, symbol, decimal_places)
    SELECT
      id, code, name, symbol, decimal_places
    FROM currencies;`,

    // Tag currencies as fiat (tag 4) - assuming all existing are fiat
    `INSERT INTO currency_to_tags (currency_id, tag_id)
    SELECT id, 4 FROM currency;`,

    // Set USD as default
    `INSERT INTO currency_to_tags (currency_id, tag_id)
    SELECT id, 2 FROM currency WHERE code = 'USD' ORDER BY id LIMIT 1;`,

    // Migrate categories to tags (income categories -> child of tag 9)
    `INSERT INTO tag (name)
    SELECT
      name as n
    FROM categories
    WHERE lower(n) NOT IN (SELECT name FROM tag);`,

    `INSERT INTO tag_to_tag (child_id, parent_id)
    SELECT t.id, 9
    FROM tag t
    JOIN categories c ON c.name = t.name
    WHERE c.type IN ('income', 'both')
    AND t.id > 22;`,

    // Migrate categories to tags (expense categories -> child of tag 10)
    `INSERT INTO tag_to_tag (child_id, parent_id)
    SELECT t.id, 10
    FROM tag t
    JOIN categories c ON c.name = t.name
    WHERE c.type IN ('expense')
    AND t.id > 22;`,

    // Link tags to icons via tag_icon
    `INSERT INTO tag_icon (tag_id, icon_id)
    SELECT t.id, i.id
    FROM tag t
    JOIN categories c ON lower(c.name) = t.name OR c.name = t.name
    JOIN icon i ON i.value = c.icon
    WHERE c.icon IS NOT NULL;`,

    // Migrate accounts -> wallets (no icon or timestamps)
    `INSERT INTO wallet (name)
    SELECT
      name
    FROM accounts
    GROUP BY name;`,

    // Tag first wallet as default
    `INSERT INTO wallet_to_tags (wallet_id, tag_id)
    SELECT id, 2 FROM wallet ORDER BY id LIMIT 1;`,

    // Tag inactive wallets as archived
    `INSERT INTO wallet_to_tags (wallet_id, tag_id)
    SELECT id, 22 FROM accounts WHERE is_active = 0;`,

    // Create account for each wallet (wallet + currency)
    // Disable balance triggers temporarily for migration
    `DROP TRIGGER IF EXISTS trg_add_trx_base;`,

    `INSERT INTO account (wallet_id, currency_id)
    SELECT
      w.id as wallet_id,
      currency_id
    FROM accounts
    JOIN wallet w ON w.name = accounts.name;`,

    // Migrate counterparties (no timestamps)
    `INSERT INTO counterparty (id, name)
    SELECT
      id, name
    FROM counterparties;`,

    // Migrate counterparty notes to separate table
    `INSERT INTO counterparty_note (counterparty_id, note)
    SELECT
      id, notes
    FROM counterparties
    WHERE notes IS NOT NULL AND notes != '';`,

    // Migrate counterparty-category relationships to tags
    `INSERT INTO counterparty_to_tags (counterparty_id, tag_id)
    SELECT cc.counterparty_id, t.id
    FROM counterparty_categories cc
    JOIN categories c ON cc.category_id = c.id
    JOIN tag t ON t.name = c.name;`,

    // --- TRANSACTION MIGRATION ---
    // Use temporary mapping table to track old transaction IDs to new trx IDs
    // This prevents timestamp collision issues when multiple transactions share the same timestamp

    `CREATE TEMP TABLE trx_map (
      old_id INTEGER PRIMARY KEY,
      new_id BLOB NOT NULL,
      source TEXT NOT NULL
    );`,

    // --- INITIAL BALANCE TRANSACTIONS ---

    // Create mapping for initial balances (use negative IDs to avoid collision with transaction IDs)
    `INSERT INTO trx_map (old_id, new_id, source)
    SELECT -id, randomblob(8), 'initial' FROM accounts;`,

    // Insert trx records using mapping
    `INSERT INTO trx (id, timestamp)
    SELECT m.new_id, strftime('%s', old_acc.created_at)
    FROM accounts old_acc
    JOIN trx_map m ON m.old_id = -old_acc.id AND m.source = 'initial';`,

    // Create trx_base for initial balances using mapping
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, amount)
    SELECT
      m.new_id,
      a.id,
      3,
      iif(old_acc.initial_balance >= 0, '+', '-'),
      CAST(abs(old_acc.initial_balance) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM accounts old_acc
    JOIN trx_map m ON m.old_id = -old_acc.id AND m.source = 'initial'
    JOIN account a ON a.id = old_acc.id
    JOIN currency cur ON a.currency_id = cur.id
    WHERE old_acc.initial_balance != 0;`,

    // --- INCOME/EXPENSE TRANSACTIONS ---

    // Create mapping for income/expense (excluding fees which have category_id = 19)
    `INSERT INTO trx_map (old_id, new_id, source)
    SELECT id, randomblob(8), type FROM transactions
    WHERE type IN ('income', 'expense') AND category_id != 19;`,

    // Insert trx records using mapping
    `INSERT INTO trx (id, timestamp)
    SELECT m.new_id, strftime('%s', t.date_time)
    FROM transactions t
    JOIN trx_map m ON m.old_id = t.id AND m.source = t.type;`,

    // Create trx_base for income/expense using mapping
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, amount)
    SELECT
      m.new_id,
      a.id,
      COALESCE(tag.id, iif(old_trx.type = 'income', 9, 10)),
      iif(old_trx.type = 'income', '+', '-'),
      CAST(abs(old_trx.amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM transactions old_trx
    JOIN trx_map m ON m.old_id = old_trx.id AND m.source = old_trx.type
    JOIN account a ON a.id = old_trx.account_id
    JOIN currency cur ON a.currency_id = cur.id
    LEFT JOIN categories c ON old_trx.category_id = c.id
    LEFT JOIN tag ON tag.name = c.name;`,

    // Link transactions to counterparties using mapping
    `INSERT INTO trx_to_counterparty (trx_id, counterparty_id)
    SELECT m.new_id, old_trx.counterparty_id
    FROM transactions old_trx
    JOIN trx_map m ON m.old_id = old_trx.id AND m.source = old_trx.type
    WHERE old_trx.counterparty_id IS NOT NULL
    AND old_trx.type IN ('income', 'expense') AND old_trx.category_id != 19;`,

    // --- TRANSFER TRANSACTIONS ---

    // Create mapping for transfers
    `INSERT INTO trx_map (old_id, new_id, source)
    SELECT id, randomblob(8), 'transfer' FROM transactions WHERE type = 'transfer';`,

    // Insert trx records using mapping
    `INSERT INTO trx (id, timestamp)
    SELECT m.new_id, strftime('%s', t.date_time)
    FROM transactions t
    JOIN trx_map m ON m.old_id = t.id AND m.source = 'transfer';`,

    // Transfer: Source account (debit) using mapping
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, amount)
    SELECT
      m.new_id,
      a.id,
      6,
      '-',
      CAST(abs(old_trx.amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM transactions old_trx
    JOIN trx_map m ON m.old_id = old_trx.id AND m.source = 'transfer'
    JOIN account a ON a.id = old_trx.account_id
    JOIN currency cur ON a.currency_id = cur.id;`,

    // Transfer: Destination account (credit) using mapping
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, amount)
    SELECT
      m.new_id,
      a.id,
      6,
      '+',
      CAST(abs(COALESCE(old_trx.to_amount, old_trx.amount)) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM transactions old_trx
    JOIN trx_map m ON m.old_id = old_trx.id AND m.source = 'transfer'
    JOIN account a ON a.id = old_trx.to_account_id
    JOIN currency cur ON a.currency_id = cur.id;`,

    // --- FEE TRANSACTIONS (category_id = 19) ---
    // Fees are migrated as separate expense transactions with fee tag

    `INSERT INTO trx_map (old_id, new_id, source)
    SELECT id, randomblob(8), 'fee' FROM transactions WHERE category_id = 19;`,

    `INSERT INTO trx (id, timestamp)
    SELECT m.new_id, strftime('%s', t.date_time)
    FROM transactions t
    JOIN trx_map m ON m.old_id = t.id AND m.source = 'fee';`,

    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, amount)
    SELECT
      m.new_id,
      a.id,
      13,
      '-',
      CAST(abs(old_trx.amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM transactions old_trx
    JOIN trx_map m ON m.old_id = old_trx.id AND m.source = 'fee'
    JOIN account a ON a.id = old_trx.account_id
    JOIN currency cur ON a.currency_id = cur.id;`,

    // --- EXCHANGE TRANSACTIONS ---

    // Create mapping for exchanges
    `INSERT INTO trx_map (old_id, new_id, source)
    SELECT id, randomblob(8), 'exchange' FROM transactions WHERE type = 'exchange';`,

    // Insert trx records using mapping
    `INSERT INTO trx (id, timestamp)
    SELECT m.new_id, strftime('%s', t.date_time)
    FROM transactions t
    JOIN trx_map m ON m.old_id = t.id AND m.source = 'exchange';`,

    // Exchange: Source account (debit) using mapping
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, amount)
    SELECT
      m.new_id,
      a.id,
      7,
      '-',
      CAST(abs(old_trx.amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM transactions old_trx
    JOIN trx_map m ON m.old_id = old_trx.id AND m.source = 'exchange'
    JOIN account a ON a.id = old_trx.account_id
    JOIN currency cur ON a.currency_id = cur.id;`,

    // Exchange: Destination account (credit) using mapping
    `INSERT INTO trx_base (trx_id, account_id, tag_id, sign, amount)
    SELECT
      m.new_id,
      a.id,
      7,
      '+',
      CAST(abs(old_trx.to_amount) * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER)
    FROM transactions old_trx
    JOIN trx_map m ON m.old_id = old_trx.id AND m.source = 'exchange'
    JOIN account a ON a.id = old_trx.to_account_id
    JOIN currency cur ON a.currency_id = cur.id;`,

    // Migrate exchange rates from transactions (latest rate per currency pair)
    `INSERT INTO exchange_rate (currency_id, rate, updated_at)
    SELECT
      old_trx.currency_id,
      CAST(old_trx.exchange_rate * power(10, COALESCE(cur.decimal_places, 2)) AS INTEGER),
      strftime('%s', old_trx.date_time)
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
    );`,

    // Migrate notes using mapping table
    `INSERT INTO trx_note (trx_base_id, note)
    SELECT tb.id, old_trx.notes
    FROM transactions old_trx
    JOIN trx_map m ON m.old_id = old_trx.id AND m.source = old_trx.type
    JOIN trx_base tb ON tb.trx_id = m.new_id
    WHERE old_trx.notes IS NOT NULL AND old_trx.notes != ''
    AND old_trx.type IN ('income', 'expense');`,

    // Drop temporary mapping table
    `DROP TABLE trx_map;`,

    // --- DROP OLD TABLES AND VIEWS (ensure clean state) ---

    `DROP TABLE IF EXISTS counterparty_categories;`,
    `DROP TABLE IF EXISTS transactions;`,
    `DROP TABLE IF EXISTS counterparties;`,
    `DROP TABLE IF EXISTS categories;`,
    `DROP TABLE IF EXISTS accounts;`,
    `DROP TABLE IF EXISTS currencies;`,

    // Drop views in case of partial migration re-run
    `DROP VIEW IF EXISTS accounts;`,
    `DROP VIEW IF EXISTS transaction_view;`,
    `DROP VIEW IF EXISTS transactions;`,
    `DROP VIEW IF EXISTS exchanges;`,
    `DROP VIEW IF EXISTS transfers;`,
    `DROP VIEW IF EXISTS tags_graph;`,
    `DROP VIEW IF EXISTS tags_hierarchy;`,
    `DROP VIEW IF EXISTS budget_subtags;`,
    `DROP VIEW IF EXISTS summary;`,
    `DROP VIEW IF EXISTS counterparties_summary;`,
    `DROP VIEW IF EXISTS tags_summary;`,
    `DROP VIEW IF EXISTS trx_log;`,

    // --- VIEWS (created after old tables dropped) ---

    `CREATE VIEW IF NOT EXISTS accounts AS
    SELECT
      a.id as id,
      w.name as wallet,
      c.code as currency, c.symbol as symbol, c.decimal_places as decimal_places,
      group_concat(t.name, ', ') as tags,
      a.balance as balance,
      a.updated_at as updated_at
    FROM account a
    JOIN wallet w ON a.wallet_id = w.id
    JOIN currency c ON a.currency_id = c.id
    LEFT JOIN account_to_tags a2t ON a2t.account_id = a.id
    LEFT JOIN tag t ON a2t.tag_id = t.id
    GROUP BY a.id
    ORDER BY wallet_id;`,

    `CREATE VIEW IF NOT EXISTS transaction_view AS
    SELECT
      t.id as id,
      t.timestamp as timestamp,
      c.name as counterparty
    FROM trx t
    LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
    LEFT JOIN counterparty c ON t2c.counterparty_id = c.id;`,

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
    END;`,

    `CREATE VIEW IF NOT EXISTS transactions AS
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
    ORDER BY t.timestamp;`,

    `CREATE VIEW IF NOT EXISTS exchanges AS
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
    WHERE tb.tag_id IN (7, 13);`,

    `CREATE VIEW IF NOT EXISTS transfers AS
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
    WHERE tb.tag_id IN (6, 13);`,

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
    GROUP BY parent;`,

    `CREATE VIEW IF NOT EXISTS tags_hierarchy AS
    SELECT
      p.id as parent_id,
      p.name as parent,
      c.id as child_id,
      c.name as child
    FROM tag_to_tag t2t
    JOIN tag p ON p.id = t2t.parent_id
    JOIN tag c ON c.id = t2t.child_id;`,

    `CREATE VIEW IF NOT EXISTS budget_subtags AS
    SELECT
      budget.id as budget_id,
      th.child_id as child_id
    FROM budget
    LEFT JOIN tags_hierarchy th ON th.parent_id = budget.tag_id OR budget.tag_id = th.child_id;`,

    // Summary view uses amount * rate for default currency calculation
    `CREATE VIEW IF NOT EXISTS summary AS
    SELECT
      tag.name as tag,
      budget.amount as amount,
      abs(total(iif(tb.sign = '-', -tb.amount, tb.amount) * tb.rate)) as actual
    FROM budget
    JOIN tag ON budget.tag_id = tag.id
    JOIN trx ON trx.timestamp >= budget.start AND trx.timestamp < budget.end
    JOIN trx_base tb ON tb.trx_id = trx.id
      AND (tb.tag_id = budget.tag_id OR tb.tag_id IN (SELECT child_id FROM budget_subtags WHERE budget_id = budget.id))
    GROUP BY budget.tag_id, budget.end - budget.start;`,

    // Counterparties summary uses amount * rate
    `CREATE VIEW IF NOT EXISTS counterparties_summary AS
    SELECT
      c.name as counterparty,
      sum(iif(tb.sign = '-', -tb.amount, tb.amount) * rate) as amount
    FROM counterparty c
    JOIN trx_to_counterparty t2c ON t2c.counterparty_id = c.id
    LEFT JOIN trx_base tb ON t2c.trx_id = tb.trx_id
    GROUP BY c.id
    ORDER BY amount;`,

    // Tags summary uses amount * rate
    `CREATE VIEW IF NOT EXISTS tags_summary AS
    SELECT
      tag.name as tag,
      total(iif(tb.sign = '-', -tb.amount, tb.amount) * tb.rate) as amount
    FROM trx_base tb
    JOIN tag ON tb.tag_id = tag.id
    GROUP BY tb.tag_id
    ORDER BY amount;`,

    `CREATE VIEW IF NOT EXISTS trx_log AS
    SELECT
      t.id as id,
      datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
      c.name as counterparty,
      a.wallet as wallet,
      a.currency as currency,
      a.symbol as symbol,
      a.decimal_places as decimal_places,
      tag.name as tags,
      iif(tb.sign = '-', -tb.amount, tb.amount) as amount,
      tb.rate as rate
    FROM trx t
    JOIN trx_base tb ON tb.trx_id = t.id
    JOIN accounts a ON tb.account_id = a.id
    JOIN tag ON tb.tag_id = tag.id
    LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
    LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
    ORDER BY t.timestamp;`,

    // --- UPDATE INITIAL TRANSACTION DATES ---
    // Set initial balance transaction timestamps to match the first real transaction date for each account
    // This ensures initial balances appear at the start of the day of the first transaction

    `UPDATE trx
    SET timestamp = (
      SELECT strftime('%s', date(MIN(t2.timestamp), 'unixepoch'))
      FROM trx t2
      JOIN trx_base tb2 ON t2.id = tb2.trx_id
      WHERE tb2.account_id = (
        SELECT account_id FROM trx_base WHERE trx_id = trx.id AND tag_id = 3
      )
      AND tb2.tag_id != 3
    )
    WHERE id IN (SELECT trx_id FROM trx_base WHERE tag_id = 3)
    AND (
      SELECT MIN(t2.timestamp)
      FROM trx t2
      JOIN trx_base tb2 ON t2.id = tb2.trx_id
      WHERE tb2.account_id = (
        SELECT account_id FROM trx_base WHERE trx_id = trx.id AND tag_id = 3
      )
      AND tb2.tag_id != 3
    ) IS NOT NULL;`,

    // --- RECALCULATE BALANCES ---

    // Recalculate account balances from trx_base
    `UPDATE account SET
      balance = (
        SELECT COALESCE(SUM(
          CASE WHEN sign = '+' THEN amount ELSE -amount END
        ), 0) FROM trx_base WHERE account_id = account.id
      );`,

    // Re-enable balance trigger
    `CREATE TRIGGER trg_add_trx_base
    AFTER INSERT ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE account
      SET balance = (
        CASE
          WHEN NEW.sign = '-' THEN balance - NEW.amount
          ELSE balance + NEW.amount
        END
      )
      WHERE id = NEW.account_id;
    END;`,
  ],

  3: [
    // ============================================
    // MIGRATION 3: Auth settings table for PIN authentication
    // ============================================

    // Auth settings table for storing PIN hash, JWT salt, PBKDF2 salt
    `CREATE TABLE IF NOT EXISTS auth_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', datetime('now')))
    );`,
  ],

  4: [
    // ============================================
    // MIGRATION 4: Seed all currencies from currencyData.ts
    // This ensures both new and existing users get all currencies
    // ============================================
    // Add UNIQUE constraint to currency_to_tags on currency_id + tag_id
    `create temp table tmp (c_id integer, t_id integer);`,
    `insert into tmp select * from currency_to_tags;`,
    `drop table currency_to_tags;`,
    `CREATE TABLE IF NOT EXISTS currency_to_tags (
      currency_id INTEGER REFERENCES currency(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tag(id) ON DELETE CASCADE,
      UNIQUE(currency_id, tag_id)
    );`,
    `insert or ignore into currency_to_tags select * from tmp;`,
    `DROP TABLE tmp;`,

    // Insert all currencies (INSERT OR IGNORE to not overwrite existing)
    generateCurrencyInsertSQL(),

    // Tag fiat currencies (tag_id = 4)
    generateFiatTagSQL(),

    // Tag crypto currencies (tag_id = 5)
    generateCryptoTagSQL(),

    // Set USD as default if no default exists
    `INSERT OR IGNORE INTO currency_to_tags (currency_id, tag_id)
SELECT id, 2 FROM currency WHERE code = 'USD'
AND NOT EXISTS (SELECT 1 FROM currency_to_tags WHERE tag_id = 2);`,
    `CREATE VIEW IF NOT EXISTS currencies AS
SELECT
  c.id,
  c.code,
  c.name,
  c.symbol,
  c.decimal_places,
iif(t2c.tag_id = 2,1,0) AS is_default,
iif(t2c2.tag_id = 4,1,0) AS is_fiat,
iif(t2c2.tag_id = 5,1,0) AS is_crypto
FROM
  currency c
LEFT JOIN 
  currency_to_tags t2c ON t2c.currency_id = c.id AND t2c.tag_id = 2
LEFT JOIN
  currency_to_tags t2c2 ON t2c2.currency_id = c.id AND ( t2c2.tag_id = 5 OR t2c2.tag_id = 4 )
ORDER BY id
;`,
  ],
  5: [
    `insert into tag_to_tag (parent_id, child_id) values
    (9, 11), (9,13), (9,18);
`,
    `insert into tag_to_tag (parent_id, child_id) values
    (10, 12), (10,13), (10,14), (10,15), (10,16), (10,17), (10,19), (10,20), (10,21)
;`,
    `update trx_base set tag_id = 13 where tag_id = 27;
`,
    `update counterparty_to_tags set tag_id = 13 where tag_id = 27;
`,
    `update tag_icon set tag_id = 13 where tag_id = 27;
`,
    `delete from tag_to_tag where child_id IN (16,27);
`,
    `delete from tag where id IN (16, 27);`,
    // Rename tags only if no tag with the new name already exists
    `update tag set name = 'Fees' where id = 13 and not exists (select 1 from tag where name = 'Fees' and id != 13);`,
    `update tag set name = 'Sales' where id = 11 and not exists (select 1 from tag where name = 'Sales' and id != 11);`,
    `update tag set name = 'Food' where id = 12 and not exists (select 1 from tag where name = 'Food' and id != 12);`,
    `update tag set name = 'Transport' where id = 14 and not exists (select 1 from tag where name = 'Transport' and id != 14);`,
    `update tag set name = 'House' where id = 15 and not exists (select 1 from tag where name = 'House' and id != 15);`,
    `update tag set name = 'Utilities' where id = 17 and not exists (select 1 from tag where name = 'Utilities' and id != 17);`,
    `update tag set name = 'Discounts' where id = 18 and not exists (select 1 from tag where name = 'Discounts' and id != 18);`,
    `update tag set name = 'Fines' where id = 19 and not exists (select 1 from tag where name = 'Fines' and id != 19);`,
    `update tag set name = 'Households' where id = 20 and not exists (select 1 from tag where name = 'Households' and id != 20);`,
    `update tag set name = 'Auto' where id = 21 and not exists (select 1 from tag where name = 'Auto' and id != 21);`,
  ],
  6: [
    // ============================================
    // MIGRATION 6: Add adjustment tag for balance adjustments
    // Handle case where id 23 might already be taken by a user-created tag
    // ============================================

    // Disable foreign key checks for this migration
    `PRAGMA foreign_keys = OFF;`,

    // Step 1: Create temp table to track relocation if needed
    `CREATE TEMP TABLE IF NOT EXISTS _tag_remap (old_id INTEGER, new_id INTEGER);`,

    // Step 2: If id 23 is taken by a non-adjustment tag, calculate new id
    `INSERT INTO _tag_remap (old_id, new_id)
     SELECT 23, (SELECT COALESCE(MAX(id), 0) + 1 FROM tag)
     FROM tag WHERE id = 23 AND name != 'adjustment';`,

    // Step 3: Relocate the tag to new id
    `UPDATE tag SET id = (SELECT new_id FROM _tag_remap LIMIT 1)
     WHERE id = 23 AND EXISTS (SELECT 1 FROM _tag_remap);`,

    // Step 4-9: Update all foreign key references
    `UPDATE tag_to_tag SET child_id = (SELECT new_id FROM _tag_remap LIMIT 1)
     WHERE child_id = 23 AND EXISTS (SELECT 1 FROM _tag_remap);`,

    `UPDATE tag_to_tag SET parent_id = (SELECT new_id FROM _tag_remap LIMIT 1)
     WHERE parent_id = 23 AND EXISTS (SELECT 1 FROM _tag_remap);`,

    `UPDATE trx_base SET tag_id = (SELECT new_id FROM _tag_remap LIMIT 1)
     WHERE tag_id = 23 AND EXISTS (SELECT 1 FROM _tag_remap);`,

    `UPDATE counterparty_to_tags SET tag_id = (SELECT new_id FROM _tag_remap LIMIT 1)
     WHERE tag_id = 23 AND EXISTS (SELECT 1 FROM _tag_remap);`,

    `UPDATE tag_icon SET tag_id = (SELECT new_id FROM _tag_remap LIMIT 1)
     WHERE tag_id = 23 AND EXISTS (SELECT 1 FROM _tag_remap);`,

    `UPDATE budget SET tag_id = (SELECT new_id FROM _tag_remap LIMIT 1)
     WHERE tag_id = 23 AND EXISTS (SELECT 1 FROM _tag_remap);`,

    // Step 10: Clean up temp table
    `DROP TABLE IF EXISTS _tag_remap;`,

    // Step 11: Insert adjustment tag with id 23 (now guaranteed to be available)
    `INSERT OR IGNORE INTO tag (id, name) VALUES (23, 'adjustment');`,

    // Step 12: Link to system tag (parent_id = 1)
    `INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (23, 1);`,

    // Re-enable foreign key checks
    `PRAGMA foreign_keys = ON;`,
  ]
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
      await execSQL(statements.join(' '))
      // for (const sql of statements) {
      //   await execSQL(sql)
      // }
      // Update version
      if (version > 1) {
        await execSQL(`UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'db_version'`, [
          version.toString(),
        ])
      }
    }
  }
}

// console.log(migrations.values().map(v => v.join(' ').join(' ')))
// console.log(Object.values(migrations).map(v => v.join(' ')).join(' '))
