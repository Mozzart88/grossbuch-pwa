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
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance: 100000 })

      // Add income transaction (sale tag - id 11)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.SALE,
        sign: '+',
        amount: 50000,
      })

      // Query balance from transactions
      const trxResult = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN amount ELSE -amount END) as balance
        FROM trx_base WHERE account_id = ?
      `, [accountId])

      expect(trxResult[0].values[0][0]).toBe(50000)
    })

    it('calculates balance with expense transactions', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance: 100000 })

      // Expense transaction (food tag - id 12)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount: 20000,
      })

      const trxResult = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN amount ELSE -amount END) as balance
        FROM trx_base WHERE account_id = ?
      `, [accountId])

      expect(trxResult[0].values[0][0]).toBe(-20000)
    })

    it('calculates balance with transfers', async () => {
      const db = getTestDatabase()

      const walletId1 = insertWallet({ name: 'Cash' })
      const walletId2 = insertWallet({ name: 'Bank' })
      const account1Id = insertAccount({ wallet_id: walletId1, currency_id: 1, balance: 100000 })
      const account2Id = insertAccount({ wallet_id: walletId2, currency_id: 1, balance: 50000 })

      // Transfer: create a trx with two trx_base entries (double-entry)
      const trxId = new Uint8Array(8)
      crypto.getRandomValues(trxId)
      const timestamp = Math.floor(Date.now() / 1000)

      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId, timestamp])

      // Debit from source
      const debitId = new Uint8Array(8)
      crypto.getRandomValues(debitId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [debitId, trxId, account1Id, SYSTEM_TAGS.TRANSFER, '-', 30000, 0]
      )

      // Credit to destination
      const creditId = new Uint8Array(8)
      crypto.getRandomValues(creditId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [creditId, trxId, account2Id, SYSTEM_TAGS.TRANSFER, '+', 30000, 0]
      )

      // Check source account transactions
      const result1 = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN amount ELSE -amount END) as net
        FROM trx_base WHERE account_id = ?
      `, [account1Id])

      expect(result1[0].values[0][0]).toBe(-30000)

      // Check destination account transactions
      const result2 = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN amount ELSE -amount END) as net
        FROM trx_base WHERE account_id = ?
      `, [account2Id])

      expect(result2[0].values[0][0]).toBe(30000)
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
        amount: 300000,
        timestamp: jan15,
      })

      // Expense - timestamp for 2025-01-20
      const jan20 = Math.floor(new Date('2025-01-20T14:00:00').getTime() / 1000)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount: 50000,
        timestamp: jan20,
      })

      // Expense - timestamp for 2025-01-25
      const jan25 = Math.floor(new Date('2025-01-25T12:00:00').getTime() / 1000)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount: 20000,
        timestamp: jan25,
      })

      // Query monthly summary using trx_base directly
      const result = db.exec(`
        SELECT
          COALESCE(SUM(CASE WHEN sign = '+' THEN amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN sign = '-' THEN amount ELSE 0 END), 0) as expenses
        FROM trx_base tb
        JOIN trx t ON tb.trx_id = t.id
        WHERE datetime(t.timestamp, 'unixepoch', 'localtime') LIKE '2025-01%'
      `)

      expect(result[0].values[0][0]).toBe(300000) // Income
      expect(result[0].values[0][1]).toBe(70000) // Expenses (50000 + 20000)
    })

    it('returns zero for months with no transactions', async () => {
      const db = getTestDatabase()

      const result = db.exec(`
        SELECT
          COALESCE(SUM(CASE WHEN sign = '+' THEN amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN sign = '-' THEN amount ELSE 0 END), 0) as expenses
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
        amount: 10000,
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
        amount: 10000,
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
        amount: 10000,
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
      const usdAccountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance: 100000 })
      const eurAccountId = insertAccount({ wallet_id: walletId, currency_id: 2, balance: 0 })

      // Exchange: USD to EUR
      const trxId = new Uint8Array(8)
      crypto.getRandomValues(trxId)
      const timestamp = Math.floor(Date.now() / 1000)

      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId, timestamp])

      // Debit USD
      const debitId = new Uint8Array(8)
      crypto.getRandomValues(debitId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [debitId, trxId, usdAccountId, SYSTEM_TAGS.EXCHANGE, '-', 10000, 0]
      )

      // Credit EUR (at 0.925 rate, 100 USD = 92.50 EUR = 9250 cents)
      const creditId = new Uint8Array(8)
      crypto.getRandomValues(creditId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [creditId, trxId, eurAccountId, SYSTEM_TAGS.EXCHANGE, '+', 9250, 0]
      )

      // Verify both entries exist
      const result = db.exec('SELECT COUNT(*) FROM trx_base WHERE trx_id = ?', [trxId])
      expect(result[0].values[0][0]).toBe(2)

      // Verify amounts
      const debitResult = db.exec('SELECT amount FROM trx_base WHERE id = ?', [debitId])
      expect(debitResult[0].values[0][0]).toBe(10000)

      const creditResult = db.exec('SELECT amount FROM trx_base WHERE id = ?', [creditId])
      expect(creditResult[0].values[0][0]).toBe(9250)
    })

    it('affects both account balances correctly', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Multi-currency' })
      const usdAccountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance: 100000 })
      const eurAccountId = insertAccount({ wallet_id: walletId, currency_id: 2, balance: 0 })

      // Exchange transaction
      const trxId = new Uint8Array(8)
      crypto.getRandomValues(trxId)
      const timestamp = Math.floor(Date.now() / 1000)

      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId, timestamp])

      // Debit USD
      const debitId = new Uint8Array(8)
      crypto.getRandomValues(debitId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [debitId, trxId, usdAccountId, SYSTEM_TAGS.EXCHANGE, '-', 10000, 0]
      )

      // Credit EUR
      const creditId = new Uint8Array(8)
      crypto.getRandomValues(creditId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [creditId, trxId, eurAccountId, SYSTEM_TAGS.EXCHANGE, '+', 9250, 0]
      )

      // Check USD account net
      const usdNet = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN amount ELSE -amount END)
        FROM trx_base WHERE account_id = ?
      `, [usdAccountId])
      expect(usdNet[0].values[0][0]).toBe(-10000)

      // Check EUR account net
      const eurNet = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN amount ELSE -amount END)
        FROM trx_base WHERE account_id = ?
      `, [eurAccountId])
      expect(eurNet[0].values[0][0]).toBe(9250)
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
        amount: 5000,
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
        amount: 5000,
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
        amount: 5000,
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
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [lineId1, trxId, accountId, SYSTEM_TAGS.EXCHANGE, '-', 10000, 100]
      )

      const lineId2 = new Uint8Array(8)
      crypto.getRandomValues(lineId2)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [lineId2, trxId, accountId2, SYSTEM_TAGS.EXCHANGE, '+', 9000, 90]
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
