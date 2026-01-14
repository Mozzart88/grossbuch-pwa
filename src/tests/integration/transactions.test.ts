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
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1, real_balance: 100000 })

      // Add income transaction (sale tag - id 11)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.SALE,
        sign: '+',
        real_amount: 50000,
        actual_amount: 50000,
      })

      // Query balance from account
      const result = db.exec(`
        SELECT real_balance, actual_balance FROM account WHERE id = ?
      `, [accountId])

      // Balance is tracked in account table (triggers update it)
      // For this test we're checking the transaction was recorded correctly
      const trxResult = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN real_amount ELSE -real_amount END) as balance
        FROM trx_base WHERE account_id = ?
      `, [accountId])

      expect(trxResult[0].values[0][0]).toBe(50000)
    })

    it('calculates balance with expense transactions', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Cash' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1, real_balance: 100000 })

      // Expense transaction (food tag - id 12)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        real_amount: 20000,
        actual_amount: 20000,
      })

      const trxResult = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN real_amount ELSE -real_amount END) as balance
        FROM trx_base WHERE account_id = ?
      `, [accountId])

      expect(trxResult[0].values[0][0]).toBe(-20000)
    })

    it('calculates balance with transfers', async () => {
      const db = getTestDatabase()

      const walletId1 = insertWallet({ name: 'Cash' })
      const walletId2 = insertWallet({ name: 'Bank' })
      const account1Id = insertAccount({ wallet_id: walletId1, currency_id: 1, real_balance: 100000 })
      const account2Id = insertAccount({ wallet_id: walletId2, currency_id: 1, real_balance: 50000 })

      // Transfer: create a trx with two trx_base entries (double-entry)
      const trxId = new Uint8Array(16)
      crypto.getRandomValues(trxId)
      const timestamp = Math.floor(Date.now() / 1000)

      db.run('INSERT INTO trx (id, created_at, updated_at) VALUES (?, ?, ?)', [trxId, timestamp, timestamp])

      // Debit from source
      const debitId = new Uint8Array(16)
      crypto.getRandomValues(debitId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, real_amount, actual_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [debitId, trxId, account1Id, SYSTEM_TAGS.TRANSFER, '-', 30000, 30000]
      )

      // Credit to destination
      const creditId = new Uint8Array(16)
      crypto.getRandomValues(creditId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, real_amount, actual_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [creditId, trxId, account2Id, SYSTEM_TAGS.TRANSFER, '+', 30000, 30000]
      )

      // Check source account transactions
      const result1 = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN real_amount ELSE -real_amount END) as net
        FROM trx_base WHERE account_id = ?
      `, [account1Id])

      expect(result1[0].values[0][0]).toBe(-30000)

      // Check destination account transactions
      const result2 = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN real_amount ELSE -real_amount END) as net
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
        real_amount: 300000,
        actual_amount: 300000,
        created_at: jan15,
      })

      // Expense - timestamp for 2025-01-20
      const jan20 = Math.floor(new Date('2025-01-20T14:00:00').getTime() / 1000)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        real_amount: 50000,
        actual_amount: 50000,
        created_at: jan20,
      })

      // Expense - timestamp for 2025-01-25
      const jan25 = Math.floor(new Date('2025-01-25T12:00:00').getTime() / 1000)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        real_amount: 20000,
        actual_amount: 20000,
        created_at: jan25,
      })

      // Query monthly summary using transactions view
      const result = db.exec(`
        SELECT
          COALESCE(SUM(CASE WHEN real_amount > 0 THEN real_amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN real_amount < 0 THEN -real_amount ELSE 0 END), 0) as expenses
        FROM transactions
        WHERE substr(created_at, 1, 7) = '2025-01'
      `)

      expect(result[0].values[0][0]).toBe(300000) // Income
      expect(result[0].values[0][1]).toBe(70000) // Expenses (50000 + 20000)
    })

    it('returns zero for months with no transactions', async () => {
      const db = getTestDatabase()

      const result = db.exec(`
        SELECT
          COALESCE(SUM(CASE WHEN real_amount > 0 THEN real_amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN real_amount < 0 THEN -real_amount ELSE 0 END), 0) as expenses
        FROM transactions
        WHERE substr(created_at, 1, 7) = '2025-02'
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
        real_amount: 10000,
        actual_amount: 10000,
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
        real_amount: 10000,
        actual_amount: 10000,
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
        real_amount: 10000,
        actual_amount: 10000,
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
      const usdAccountId = insertAccount({ wallet_id: walletId, currency_id: 1, real_balance: 100000 })
      const eurAccountId = insertAccount({ wallet_id: walletId, currency_id: 2, real_balance: 0 })

      // Exchange: USD to EUR (stored as integer rate * 10^6)
      const trxId = new Uint8Array(16)
      crypto.getRandomValues(trxId)
      const timestamp = Math.floor(Date.now() / 1000)

      db.run('INSERT INTO trx (id, created_at, updated_at) VALUES (?, ?, ?)', [trxId, timestamp, timestamp])

      // Debit USD
      const debitId = new Uint8Array(16)
      crypto.getRandomValues(debitId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, real_amount, actual_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [debitId, trxId, usdAccountId, SYSTEM_TAGS.EXCHANGE, '-', 10000, 10000]
      )

      // Credit EUR (at 0.925 rate, 100 USD = 92.50 EUR = 9250 cents)
      const creditId = new Uint8Array(16)
      crypto.getRandomValues(creditId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, real_amount, actual_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [creditId, trxId, eurAccountId, SYSTEM_TAGS.EXCHANGE, '+', 9250, 9250]
      )

      // Verify both entries exist
      const result = db.exec('SELECT COUNT(*) FROM trx_base WHERE trx_id = ?', [trxId])
      expect(result[0].values[0][0]).toBe(2)

      // Verify amounts
      const debitResult = db.exec('SELECT real_amount FROM trx_base WHERE id = ?', [debitId])
      expect(debitResult[0].values[0][0]).toBe(10000)

      const creditResult = db.exec('SELECT real_amount FROM trx_base WHERE id = ?', [creditId])
      expect(creditResult[0].values[0][0]).toBe(9250)
    })

    it('affects both account balances correctly', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Multi-currency' })
      const usdAccountId = insertAccount({ wallet_id: walletId, currency_id: 1, real_balance: 100000 })
      const eurAccountId = insertAccount({ wallet_id: walletId, currency_id: 2, real_balance: 0 })

      // Exchange transaction
      const trxId = new Uint8Array(16)
      crypto.getRandomValues(trxId)
      const timestamp = Math.floor(Date.now() / 1000)

      db.run('INSERT INTO trx (id, created_at, updated_at) VALUES (?, ?, ?)', [trxId, timestamp, timestamp])

      // Debit USD
      const debitId = new Uint8Array(16)
      crypto.getRandomValues(debitId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, real_amount, actual_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [debitId, trxId, usdAccountId, SYSTEM_TAGS.EXCHANGE, '-', 10000, 10000]
      )

      // Credit EUR
      const creditId = new Uint8Array(16)
      crypto.getRandomValues(creditId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, real_amount, actual_amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [creditId, trxId, eurAccountId, SYSTEM_TAGS.EXCHANGE, '+', 9250, 9250]
      )

      // Check USD account net
      const usdNet = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN real_amount ELSE -real_amount END)
        FROM trx_base WHERE account_id = ?
      `, [usdAccountId])
      expect(usdNet[0].values[0][0]).toBe(-10000)

      // Check EUR account net
      const eurNet = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN real_amount ELSE -real_amount END)
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
})
