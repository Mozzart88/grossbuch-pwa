import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  createDatabaseMock,
  insertAccount,
  insertCategory,
  insertTransaction,
  getTestDatabase,
} from './setup'

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

      // Create account and category
      const accountId = insertAccount({ name: 'Cash', currency_id: 1, initial_balance: 1000 })
      const categoryId = insertCategory({ name: 'Salary', type: 'income' })

      // Add income transaction
      insertTransaction({
        type: 'income',
        amount: 500,
        currency_id: 1,
        account_id: accountId,
        category_id: categoryId,
      })

      // Query balance
      const result = db.exec(`
        SELECT
          a.initial_balance + COALESCE(
            (SELECT SUM(
              CASE
                WHEN t.type = 'income' AND t.account_id = a.id THEN t.amount
                WHEN t.type = 'expense' AND t.account_id = a.id THEN -t.amount
                ELSE 0
              END
            ) FROM transactions t
            WHERE t.account_id = a.id), 0
          ) as balance
        FROM accounts a WHERE a.id = ?
      `, [accountId])

      expect(result[0].values[0][0]).toBe(1500) // 1000 + 500
    })

    it('calculates balance with expense transactions', async () => {
      const db = getTestDatabase()

      const accountId = insertAccount({ name: 'Cash', currency_id: 1, initial_balance: 1000 })
      const categoryId = insertCategory({ name: 'Food', type: 'expense' })

      insertTransaction({
        type: 'expense',
        amount: 200,
        currency_id: 1,
        account_id: accountId,
        category_id: categoryId,
      })

      const result = db.exec(`
        SELECT
          a.initial_balance + COALESCE(
            (SELECT SUM(
              CASE
                WHEN t.type = 'income' AND t.account_id = a.id THEN t.amount
                WHEN t.type = 'expense' AND t.account_id = a.id THEN -t.amount
                ELSE 0
              END
            ) FROM transactions t
            WHERE t.account_id = a.id), 0
          ) as balance
        FROM accounts a WHERE a.id = ?
      `, [accountId])

      expect(result[0].values[0][0]).toBe(800) // 1000 - 200
    })

    it('calculates balance with transfers', async () => {
      const db = getTestDatabase()

      const account1Id = insertAccount({ name: 'Cash', currency_id: 1, initial_balance: 1000 })
      const account2Id = insertAccount({ name: 'Bank', currency_id: 1, initial_balance: 500 })

      insertTransaction({
        type: 'transfer',
        amount: 300,
        currency_id: 1,
        account_id: account1Id,
        to_account_id: account2Id,
      })

      // Check source account
      const result1 = db.exec(`
        SELECT
          a.initial_balance + COALESCE(
            (SELECT SUM(
              CASE
                WHEN t.type = 'transfer' AND t.account_id = a.id THEN -t.amount
                WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN t.amount
                ELSE 0
              END
            ) FROM transactions t
            WHERE t.account_id = a.id OR t.to_account_id = a.id), 0
          ) as balance
        FROM accounts a WHERE a.id = ?
      `, [account1Id])

      expect(result1[0].values[0][0]).toBe(700) // 1000 - 300

      // Check destination account
      const result2 = db.exec(`
        SELECT
          a.initial_balance + COALESCE(
            (SELECT SUM(
              CASE
                WHEN t.type = 'transfer' AND t.account_id = a.id THEN -t.amount
                WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN t.amount
                ELSE 0
              END
            ) FROM transactions t
            WHERE t.account_id = a.id OR t.to_account_id = a.id), 0
          ) as balance
        FROM accounts a WHERE a.id = ?
      `, [account2Id])

      expect(result2[0].values[0][0]).toBe(800) // 500 + 300
    })
  })

  describe('Monthly Summary', () => {
    it('calculates correct monthly totals', async () => {
      const db = getTestDatabase()

      const accountId = insertAccount({ name: 'Cash', currency_id: 1 })
      const incomeCatId = insertCategory({ name: 'Salary', type: 'income' })
      const expenseCatId = insertCategory({ name: 'Food', type: 'expense' })

      // Add January transactions
      insertTransaction({
        type: 'income',
        amount: 3000,
        currency_id: 1,
        account_id: accountId,
        category_id: incomeCatId,
        date_time: '2025-01-15 10:00:00',
      })

      insertTransaction({
        type: 'expense',
        amount: 500,
        currency_id: 1,
        account_id: accountId,
        category_id: expenseCatId,
        date_time: '2025-01-20 14:00:00',
      })

      insertTransaction({
        type: 'expense',
        amount: 200,
        currency_id: 1,
        account_id: accountId,
        category_id: expenseCatId,
        date_time: '2025-01-25 12:00:00',
      })

      // Query monthly summary
      const result = db.exec(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
        FROM transactions
        WHERE substr(date_time, 1, 7) = '2025-01'
      `)

      expect(result[0].values[0][0]).toBe(3000) // Income
      expect(result[0].values[0][1]).toBe(700) // Expenses
    })

    it('returns zero for months with no transactions', async () => {
      const db = getTestDatabase()

      const result = db.exec(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
        FROM transactions
        WHERE substr(date_time, 1, 7) = '2025-02'
      `)

      expect(result[0].values[0][0]).toBe(0)
      expect(result[0].values[0][1]).toBe(0)
    })
  })

  describe('Foreign Key Constraints', () => {
    it('prevents deleting currency with linked accounts', async () => {
      const db = getTestDatabase()

      insertAccount({ name: 'Cash', currency_id: 1 })

      expect(() => {
        db.run('DELETE FROM currencies WHERE id = 1')
      }).toThrow()
    })

    it('prevents deleting account with transactions', async () => {
      const db = getTestDatabase()

      const accountId = insertAccount({ name: 'Cash', currency_id: 1 })
      const categoryId = insertCategory({ name: 'Food', type: 'expense' })

      insertTransaction({
        type: 'expense',
        amount: 100,
        currency_id: 1,
        account_id: accountId,
        category_id: categoryId,
      })

      expect(() => {
        db.run('DELETE FROM accounts WHERE id = ?', [accountId])
      }).toThrow()
    })

    it('prevents deleting category with transactions', async () => {
      const db = getTestDatabase()

      const accountId = insertAccount({ name: 'Cash', currency_id: 1 })
      const categoryId = insertCategory({ name: 'Food', type: 'expense' })

      insertTransaction({
        type: 'expense',
        amount: 100,
        currency_id: 1,
        account_id: accountId,
        category_id: categoryId,
      })

      expect(() => {
        db.run('DELETE FROM categories WHERE id = ?', [categoryId])
      }).toThrow()
    })
  })

  describe('Exchange Transactions', () => {
    it('stores exchange rate correctly', async () => {
      const db = getTestDatabase()

      const usdAccountId = insertAccount({ name: 'USD Wallet', currency_id: 1, initial_balance: 1000 })
      const eurAccountId = insertAccount({ name: 'EUR Wallet', currency_id: 2, initial_balance: 0 })

      db.run(`
        INSERT INTO transactions
          (type, amount, currency_id, account_id, to_account_id, to_amount, to_currency_id, exchange_rate, date_time)
        VALUES ('exchange', 100, 1, ?, ?, 92.5, 2, 0.925, '2025-01-09 14:30:00')
      `, [usdAccountId, eurAccountId])

      const result = db.exec(`
        SELECT amount, to_amount, exchange_rate FROM transactions WHERE type = 'exchange'
      `)

      expect(result[0].values[0][0]).toBe(100)
      expect(result[0].values[0][1]).toBe(92.5)
      expect(result[0].values[0][2]).toBe(0.925)
    })

    it('affects both account balances correctly', async () => {
      const db = getTestDatabase()

      const usdAccountId = insertAccount({ name: 'USD Wallet', currency_id: 1, initial_balance: 1000 })
      const eurAccountId = insertAccount({ name: 'EUR Wallet', currency_id: 2, initial_balance: 0 })

      db.run(`
        INSERT INTO transactions
          (type, amount, currency_id, account_id, to_account_id, to_amount, to_currency_id, date_time)
        VALUES ('exchange', 100, 1, ?, ?, 92.5, 2, '2025-01-09 14:30:00')
      `, [usdAccountId, eurAccountId])

      // USD account should decrease by 100
      const usdResult = db.exec(`
        SELECT initial_balance - COALESCE(
          (SELECT SUM(amount) FROM transactions WHERE type = 'exchange' AND account_id = ?), 0
        ) as balance
        FROM accounts WHERE id = ?
      `, [usdAccountId, usdAccountId])

      expect(usdResult[0].values[0][0]).toBe(900)

      // EUR account should increase by 92.5
      const eurResult = db.exec(`
        SELECT initial_balance + COALESCE(
          (SELECT SUM(to_amount) FROM transactions WHERE type = 'exchange' AND to_account_id = ?), 0
        ) as balance
        FROM accounts WHERE id = ?
      `, [eurAccountId, eurAccountId])

      expect(eurResult[0].values[0][0]).toBe(92.5)
    })
  })

  describe('Data Integrity', () => {
    it('enforces unique category names', async () => {
      const db = getTestDatabase()

      insertCategory({ name: 'Food', type: 'expense' })

      expect(() => {
        insertCategory({ name: 'Food', type: 'expense' })
      }).toThrow()
    })

    it('enforces unique currency codes', async () => {
      const db = getTestDatabase()

      // USD already exists from seed data
      expect(() => {
        db.run('INSERT INTO currencies (code, name, symbol) VALUES (?, ?, ?)', ['USD', 'Another Dollar', '$'])
      }).toThrow()
    })

    it('validates transaction types', async () => {
      const db = getTestDatabase()

      const accountId = insertAccount({ name: 'Cash', currency_id: 1 })

      expect(() => {
        db.run(`
          INSERT INTO transactions (type, amount, currency_id, account_id, date_time)
          VALUES ('invalid', 100, 1, ?, '2025-01-09 14:30:00')
        `, [accountId])
      }).toThrow()
    })

    it('validates category types', async () => {
      const db = getTestDatabase()

      expect(() => {
        db.run('INSERT INTO categories (name, type) VALUES (?, ?)', ['Invalid', 'invalid'])
      }).toThrow()
    })
  })
})
