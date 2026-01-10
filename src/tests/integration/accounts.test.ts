import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  insertAccount,
  insertCategory,
  insertTransaction,
  getTestDatabase,
} from './setup'

describe('Accounts Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  beforeEach(() => {
    resetTestDatabase()
  })

  describe('Account CRUD Operations', () => {
    it('creates account with default values', async () => {
      const db = getTestDatabase()

      db.run(
        'INSERT INTO accounts (name, currency_id) VALUES (?, ?)',
        ['Test Account', 1]
      )

      const result = db.exec('SELECT * FROM accounts WHERE name = ?', ['Test Account'])

      expect(result[0].values[0]).toBeDefined()
      expect(result[0].values[0][1]).toBe('Test Account') // name
      expect(result[0].values[0][3]).toBe(0) // initial_balance default
      expect(result[0].values[0][6]).toBe(1) // is_active default
    })

    it('updates account properties', async () => {
      const db = getTestDatabase()

      const accountId = insertAccount({ name: 'Original', currency_id: 1 })

      db.run(
        'UPDATE accounts SET name = ?, initial_balance = ? WHERE id = ?',
        ['Updated', 500, accountId]
      )

      const result = db.exec('SELECT name, initial_balance FROM accounts WHERE id = ?', [accountId])

      expect(result[0].values[0][0]).toBe('Updated')
      expect(result[0].values[0][1]).toBe(500)
    })

    it('archives account by setting is_active to 0', async () => {
      const db = getTestDatabase()

      const accountId = insertAccount({ name: 'Active Account', currency_id: 1 })

      db.run('UPDATE accounts SET is_active = 0 WHERE id = ?', [accountId])

      const result = db.exec('SELECT is_active FROM accounts WHERE id = ?', [accountId])

      expect(result[0].values[0][0]).toBe(0)
    })

    it('excludes archived accounts from active list', async () => {
      const db = getTestDatabase()

      insertAccount({ name: 'Active 1', currency_id: 1 })
      const archivedId = insertAccount({ name: 'Archived', currency_id: 1 })
      insertAccount({ name: 'Active 2', currency_id: 1 })

      db.run('UPDATE accounts SET is_active = 0 WHERE id = ?', [archivedId])

      const result = db.exec('SELECT COUNT(*) FROM accounts WHERE is_active = 1')

      expect(result[0].values[0][0]).toBe(2)
    })
  })

  describe('Multi-currency Support', () => {
    it('creates accounts with different currencies', async () => {
      const db = getTestDatabase()

      insertAccount({ name: 'USD Account', currency_id: 1 })
      insertAccount({ name: 'EUR Account', currency_id: 2 })
      insertAccount({ name: 'GBP Account', currency_id: 3 })

      const result = db.exec(`
        SELECT a.name, c.code
        FROM accounts a
        JOIN currencies c ON a.currency_id = c.id
        ORDER BY a.name
      `)

      expect(result[0].values.length).toBe(3)
      expect(result[0].values[0][1]).toBe('EUR')
      expect(result[0].values[1][1]).toBe('GBP')
      expect(result[0].values[2][1]).toBe('USD')
    })

    it('joins currency data correctly', async () => {
      const db = getTestDatabase()

      const accountId = insertAccount({ name: 'Euro Account', currency_id: 2 })

      const result = db.exec(`
        SELECT
          a.name,
          c.code as currency_code,
          c.symbol as currency_symbol,
          c.decimal_places
        FROM accounts a
        JOIN currencies c ON a.currency_id = c.id
        WHERE a.id = ?
      `, [accountId])

      expect(result[0].values[0][0]).toBe('Euro Account')
      expect(result[0].values[0][1]).toBe('EUR')
      expect(result[0].values[0][2]).toBe('€')
      expect(result[0].values[0][3]).toBe(2)
    })
  })

  describe('Balance Tracking', () => {
    it('tracks balance across multiple transaction types', async () => {
      const db = getTestDatabase()

      const accountId = insertAccount({ name: 'Main', currency_id: 1, initial_balance: 1000 })
      const incomeCatId = insertCategory({ name: 'Salary', type: 'income' })
      const expenseCatId = insertCategory({ name: 'Food', type: 'expense' })

      // Income
      insertTransaction({
        type: 'income',
        amount: 500,
        currency_id: 1,
        account_id: accountId,
        category_id: incomeCatId,
      })

      // Expense
      insertTransaction({
        type: 'expense',
        amount: 200,
        currency_id: 1,
        account_id: accountId,
        category_id: expenseCatId,
      })

      // Expense
      insertTransaction({
        type: 'expense',
        amount: 100,
        currency_id: 1,
        account_id: accountId,
        category_id: expenseCatId,
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

      // 1000 + 500 - 200 - 100 = 1200
      expect(result[0].values[0][0]).toBe(1200)
    })

    it('handles negative balance', async () => {
      const db = getTestDatabase()

      const accountId = insertAccount({ name: 'Main', currency_id: 1, initial_balance: 100 })
      const expenseCatId = insertCategory({ name: 'Food', type: 'expense' })

      insertTransaction({
        type: 'expense',
        amount: 200,
        currency_id: 1,
        account_id: accountId,
        category_id: expenseCatId,
      })

      const result = db.exec(`
        SELECT
          a.initial_balance + COALESCE(
            (SELECT SUM(
              CASE
                WHEN t.type = 'expense' AND t.account_id = a.id THEN -t.amount
                ELSE 0
              END
            ) FROM transactions t
            WHERE t.account_id = a.id), 0
          ) as balance
        FROM accounts a WHERE a.id = ?
      `, [accountId])

      expect(result[0].values[0][0]).toBe(-100)
    })
  })

  describe('Sorting and Ordering', () => {
    it('orders accounts by sort_order then name', async () => {
      const db = getTestDatabase()

      db.run('INSERT INTO accounts (name, currency_id, sort_order) VALUES (?, ?, ?)', ['Zebra', 1, 1])
      db.run('INSERT INTO accounts (name, currency_id, sort_order) VALUES (?, ?, ?)', ['Alpha', 1, 2])
      db.run('INSERT INTO accounts (name, currency_id, sort_order) VALUES (?, ?, ?)', ['Beta', 1, 1])

      const result = db.exec(`
        SELECT name FROM accounts
        ORDER BY sort_order ASC, name ASC
      `)

      expect(result[0].values[0][0]).toBe('Beta')
      expect(result[0].values[1][0]).toBe('Zebra')
      expect(result[0].values[2][0]).toBe('Alpha')
    })
  })

  describe('Account Deletion Protection', () => {
    it('counts linked transactions correctly', async () => {
      const db = getTestDatabase()

      const accountId = insertAccount({ name: 'Main', currency_id: 1 })
      const account2Id = insertAccount({ name: 'Other', currency_id: 1 })
      const categoryId = insertCategory({ name: 'Test', type: 'expense' })

      // Source transactions
      insertTransaction({
        type: 'expense',
        amount: 100,
        currency_id: 1,
        account_id: accountId,
        category_id: categoryId,
      })

      // Transfer (as source)
      insertTransaction({
        type: 'transfer',
        amount: 50,
        currency_id: 1,
        account_id: accountId,
        to_account_id: account2Id,
      })

      // Transfer (as destination)
      insertTransaction({
        type: 'transfer',
        amount: 25,
        currency_id: 1,
        account_id: account2Id,
        to_account_id: accountId,
      })

      const result = db.exec(`
        SELECT COUNT(*) FROM transactions
        WHERE account_id = ? OR to_account_id = ?
      `, [accountId, accountId])

      expect(result[0].values[0][0]).toBe(3)
    })
  })
})
