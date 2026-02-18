import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  createDatabaseMock,
  insertWallet,
  insertAccount,
  insertTransaction,
  getTestDatabase,
} from './setup'
import { SYSTEM_TAGS } from '../../types'

describe('Transactions Integration', () => {
  let dbMock: ReturnType<typeof createDatabaseMock>

  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  beforeEach(() => {
    resetTestDatabase()
    dbMock = createDatabaseMock()

    // Mock the database module
    vi.doMock('../../services/database', () => dbMock)
  })

  describe('Account Balance Calculations', () => {
    it('calculates balance with income transactions', async () => {
      const db = getTestDatabase()

      // Create wallet and account
      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance_int: 1000 })

      // Add income transaction (sale tag)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.SALE,
        sign: '+',
        amount_int: 500,
      })

      // Query balance from transactions
      const trxResult = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE -(amount_int + amount_frac * 1e-18) END) as balance
        FROM trx_base WHERE account_id = ?
      `, [accountId])

      expect(trxResult[0].values[0][0]).toBeCloseTo(500, 5)
    })

    it('calculates balance with expense transactions', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance_int: 1000 })

      // Expense transaction (food tag)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 200,
      })

      const trxResult = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE -(amount_int + amount_frac * 1e-18) END) as balance
        FROM trx_base WHERE account_id = ?
      `, [accountId])

      expect(trxResult[0].values[0][0]).toBeCloseTo(-200, 5)
    })

    it('calculates balance with transfers', async () => {
      const db = getTestDatabase()

      const walletId1 = insertWallet({ name: 'Cash' })
      const walletId2 = insertWallet({ name: 'Bank' })
      const account1Id = insertAccount({ wallet_id: walletId1, currency_id: 1, balance_int: 1000 })
      const account2Id = insertAccount({ wallet_id: walletId2, currency_id: 1, balance_int: 500 })

      // Transfer: create a trx with two trx_base entries (double-entry)
      const trxId = new Uint8Array(8)
      crypto.getRandomValues(trxId)
      const timestamp = Math.floor(Date.now() / 1000)

      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId, timestamp])

      // Debit from source
      const debitId = new Uint8Array(8)
      crypto.getRandomValues(debitId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [debitId, trxId, account1Id, SYSTEM_TAGS.TRANSFER, '-', 300, 0, 0, 0]
      )

      // Credit to destination
      const creditId = new Uint8Array(8)
      crypto.getRandomValues(creditId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [creditId, trxId, account2Id, SYSTEM_TAGS.TRANSFER, '+', 300, 0, 0, 0]
      )

      // Check source account transactions
      const result1 = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE -(amount_int + amount_frac * 1e-18) END) as net
        FROM trx_base WHERE account_id = ?
      `, [account1Id])

      expect(result1[0].values[0][0]).toBeCloseTo(-300, 5)

      // Check destination account transactions
      const result2 = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE -(amount_int + amount_frac * 1e-18) END) as net
        FROM trx_base WHERE account_id = ?
      `, [account2Id])

      expect(result2[0].values[0][0]).toBeCloseTo(300, 5)
    })
  })

  describe('Monthly Summary', () => {
    it('calculates correct monthly totals', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      // Add January transactions
      // Income - timestamp for 2025-01-15
      const jan15 = Math.floor(new Date('2025-01-15T10:00:00').getTime() / 1000)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.SALE,
        sign: '+',
        amount_int: 3000,
        timestamp: jan15,
      })

      // Expense - timestamp for 2025-01-20
      const jan20 = Math.floor(new Date('2025-01-20T14:00:00').getTime() / 1000)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 500,
        timestamp: jan20,
      })

      // Expense - timestamp for 2025-01-25
      const jan25 = Math.floor(new Date('2025-01-25T12:00:00').getTime() / 1000)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 200,
        timestamp: jan25,
      })

      // Query monthly summary using trx_base directly
      const result = db.exec(`
        SELECT
          COALESCE(SUM(CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN sign = '-' THEN (amount_int + amount_frac * 1e-18) ELSE 0 END), 0) as expenses
        FROM trx_base tb
        JOIN trx t ON tb.trx_id = t.id
        WHERE datetime(t.timestamp, 'unixepoch', 'localtime') LIKE '2025-01%'
      `)

      expect(result[0].values[0][0]).toBeCloseTo(3000, 5) // Income
      expect(result[0].values[0][1]).toBeCloseTo(700, 5) // Expenses (500 + 200)
    })

    it('returns zero for months with no transactions', async () => {
      const db = getTestDatabase()

      const result = db.exec(`
        SELECT
          COALESCE(SUM(CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN sign = '-' THEN (amount_int + amount_frac * 1e-18) ELSE 0 END), 0) as expenses
        FROM trx_base tb
        JOIN trx t ON tb.trx_id = t.id
        WHERE datetime(t.timestamp, 'unixepoch', 'localtime') LIKE '2025-02%'
      `)

      expect(result[0].values[0][0]).toBe(0)
      expect(result[0].values[0][1]).toBe(0)
    })
  })

  describe('Foreign Key Constraints', () => {
    it('prevents deleting currency with linked transactions', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      // Add a transaction to the account
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 100,
      })

      // Currency CASCADE deletes account, but account RESTRICT fails due to trx_base
      expect(() => {
        db.run('DELETE FROM currency WHERE id = 1')
      }).toThrow()
    })

    it('prevents deleting account with transactions', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 100,
      })

      // trx_base has ON DELETE RESTRICT for account_id
      expect(() => {
        db.run('DELETE FROM account WHERE id = ?', [accountId])
      }).toThrow()
    })

    it('prevents deleting tag with transactions', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      // Create a custom tag
      db.run('INSERT INTO tag (name) VALUES (?)', ['CustomTag'])
      const tagId = Number(db.exec('SELECT last_insert_rowid()')[0].values[0][0])

      insertTransaction({
        account_id: accountId,
        tag_id: tagId,
        sign: '-',
        amount_int: 100,
      })

      // trx_base has ON DELETE RESTRICT for tag_id
      expect(() => {
        db.run('DELETE FROM tag WHERE id = ?', [tagId])
      }).toThrow()
    })
  })

  describe('Exchange Transactions', () => {
    it('stores exchange rate correctly', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Multi-currency' })
      const usdAccountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance_int: 1000 })
      const eurAccountId = insertAccount({ wallet_id: walletId, currency_id: 2, balance_int: 0 })

      // Exchange: USD to EUR
      const trxId = new Uint8Array(8)
      crypto.getRandomValues(trxId)
      const timestamp = Math.floor(Date.now() / 1000)

      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId, timestamp])

      // Debit USD: 100.00
      const debitId = new Uint8Array(8)
      crypto.getRandomValues(debitId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [debitId, trxId, usdAccountId, SYSTEM_TAGS.EXCHANGE, '-', 100, 0, 0, 0]
      )

      // Credit EUR: 92.50 (at 0.925 rate, 100 USD = 92.50 EUR)
      const creditId = new Uint8Array(8)
      crypto.getRandomValues(creditId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [creditId, trxId, eurAccountId, SYSTEM_TAGS.EXCHANGE, '+', 92, 500000000000000000, 0, 0]
      )

      // Verify both entries exist
      const result = db.exec('SELECT COUNT(*) FROM trx_base WHERE trx_id = ?', [trxId])
      expect(result[0].values[0][0]).toBe(2)

      // Verify amounts
      const debitResult = db.exec('SELECT amount_int, amount_frac FROM trx_base WHERE id = ?', [debitId])
      expect(debitResult[0].values[0][0]).toBe(100)
      expect(debitResult[0].values[0][1]).toBe(0)

      const creditResult = db.exec('SELECT amount_int, amount_frac FROM trx_base WHERE id = ?', [creditId])
      expect(creditResult[0].values[0][0]).toBe(92)
      expect(creditResult[0].values[0][1]).toBe(500000000000000000)
    })

    it('affects both account balances correctly', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Multi-currency' })
      const usdAccountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance_int: 1000 })
      const eurAccountId = insertAccount({ wallet_id: walletId, currency_id: 2, balance_int: 0 })

      // Exchange transaction
      const trxId = new Uint8Array(8)
      crypto.getRandomValues(trxId)
      const timestamp = Math.floor(Date.now() / 1000)

      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId, timestamp])

      // Debit USD: 100.00
      const debitId = new Uint8Array(8)
      crypto.getRandomValues(debitId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [debitId, trxId, usdAccountId, SYSTEM_TAGS.EXCHANGE, '-', 100, 0, 0, 0]
      )

      // Credit EUR: 92.50
      const creditId = new Uint8Array(8)
      crypto.getRandomValues(creditId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [creditId, trxId, eurAccountId, SYSTEM_TAGS.EXCHANGE, '+', 92, 500000000000000000, 0, 0]
      )

      // Check USD account net
      const usdNet = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE -(amount_int + amount_frac * 1e-18) END)
        FROM trx_base WHERE account_id = ?
      `, [usdAccountId])
      expect(usdNet[0].values[0][0]).toBeCloseTo(-100, 5)

      // Check EUR account net
      const eurNet = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE -(amount_int + amount_frac * 1e-18) END)
        FROM trx_base WHERE account_id = ?
      `, [eurAccountId])
      expect(eurNet[0].values[0][0]).toBeCloseTo(92.5, 5)
    })
  })

  describe('Data Integrity', () => {
    it('enforces unique tag names', async () => {
      const db = getTestDatabase()

      db.run('INSERT INTO tag (name) VALUES (?)', ['UniqueTag'])

      expect(() => {
        db.run('INSERT INTO tag (name) VALUES (?)', ['UniqueTag'])
      }).toThrow()
    })

    it('enforces unique currency codes', async () => {
      const db = getTestDatabase()

      // USD already exists from seed data
      expect(() => {
        db.run('INSERT INTO currency (code, name, symbol) VALUES (?, ?, ?)', ['USD', 'Another Dollar', '$'])
      }).toThrow()
    })
  })

  describe('Transaction Notes', () => {
    it('stores notes at transaction level (trx_id)', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      // Insert transaction with note
      const trxId = insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 50,
        note: 'Lunch at restaurant',
      })

      // Verify note is stored with trx_id reference
      const result = db.exec('SELECT note FROM trx_note WHERE trx_id = ?', [trxId])
      expect(result[0].values[0][0]).toBe('Lunch at restaurant')
    })

    it('retrieves note when querying transaction with join', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      const trxId = insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 50,
        note: 'Test note for query',
      })

      // Query using the same pattern as findById
      const result = db.exec(`
        SELECT t.id, t.timestamp, tn.note
        FROM trx t
        LEFT JOIN trx_note tn ON tn.trx_id = t.id
        WHERE t.id = ?
      `, [trxId])

      expect(result[0].values[0][2]).toBe('Test note for query')
    })

    it('returns null note when transaction has no note', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      const trxId = insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 50,
        // No note
      })

      const result = db.exec(`
        SELECT t.id, tn.note
        FROM trx t
        LEFT JOIN trx_note tn ON tn.trx_id = t.id
        WHERE t.id = ?
      `, [trxId])

      expect(result[0].values[0][1]).toBeNull()
    })

    it('shares note across multiple lines in same transaction', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })
      const accountId2 = insertAccount({ wallet_id: walletId, currency_id: 2 })

      // Create transaction with multiple lines
      const trxId = new Uint8Array(8)
      crypto.getRandomValues(trxId)
      const timestamp = Math.floor(Date.now() / 1000)

      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId, timestamp])

      // Add note at transaction level
      db.run('INSERT INTO trx_note (trx_id, note) VALUES (?, ?)', [trxId, 'Multi-line transaction note'])

      // Add two lines (e.g., exchange)
      const lineId1 = new Uint8Array(8)
      crypto.getRandomValues(lineId1)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [lineId1, trxId, accountId, SYSTEM_TAGS.EXCHANGE, '-', 100, 0, 1, 0]
      )

      const lineId2 = new Uint8Array(8)
      crypto.getRandomValues(lineId2)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [lineId2, trxId, accountId2, SYSTEM_TAGS.EXCHANGE, '+', 90, 0, 0, 900000000000000000]
      )

      // Verify there's only one note for the transaction
      const noteCount = db.exec('SELECT COUNT(*) FROM trx_note WHERE trx_id = ?', [trxId])
      expect(noteCount[0].values[0][0]).toBe(1)

      // Verify both lines can access the same note via transaction
      const result = db.exec(`
        SELECT tb.id, tn.note
        FROM trx_base tb
        JOIN trx t ON tb.trx_id = t.id
        LEFT JOIN trx_note tn ON tn.trx_id = t.id
        WHERE t.id = ?
      `, [trxId])

      expect(result[0].values.length).toBe(2) // Two lines
      expect(result[0].values[0][1]).toBe('Multi-line transaction note')
      expect(result[0].values[1][1]).toBe('Multi-line transaction note')
    })

    it('deletes note when transaction is deleted (CASCADE)', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      // Create transaction manually without trx_base to test cascade
      const trxId = new Uint8Array(8)
      crypto.getRandomValues(trxId)
      const timestamp = Math.floor(Date.now() / 1000)

      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId, timestamp])
      db.run('INSERT INTO trx_note (trx_id, note) VALUES (?, ?)', [trxId, 'Will be deleted'])

      // Verify note exists
      const before = db.exec('SELECT COUNT(*) FROM trx_note WHERE trx_id = ?', [trxId])
      expect(before[0].values[0][0]).toBe(1)

      // Delete transaction
      db.run('DELETE FROM trx WHERE id = ?', [trxId])

      // Verify note is also deleted
      const after = db.exec('SELECT COUNT(*) FROM trx_note WHERE trx_id = ?', [trxId])
      expect(after[0].values[0][0]).toBe(0)
    })

    it('trx_note table has trx_id column (not trx_base_id)', async () => {
      const db = getTestDatabase()

      // Check table structure
      const schema = db.exec("PRAGMA table_info(trx_note)")
      const columns = schema[0].values.map(row => row[1])

      expect(columns).toContain('trx_id')
      expect(columns).not.toContain('trx_base_id')
    })
  })
})
