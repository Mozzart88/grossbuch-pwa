import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  insertWallet,
  insertAccount,
  insertTransaction,
  getTestDatabase,
} from './setup'
import { SYSTEM_TAGS } from '../../types'

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

      const walletId = insertWallet({ name: 'Test Wallet' })
      db.run(
        'INSERT INTO account (wallet_id, currency_id) VALUES (?, ?)',
        [walletId, 1]
      )

      const result = db.exec('SELECT * FROM account WHERE wallet_id = ?', [walletId])

      expect(result[0].values[0]).toBeDefined()
      expect(result[0].values[0][1]).toBe(walletId) // wallet_id
      expect(result[0].values[0][2]).toBe(1) // currency_id
      expect(result[0].values[0][3]).toBe(0) // balance default
    })

    it('updates account properties', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Original' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      db.run(
        'UPDATE account SET balance = ? WHERE id = ?',
        [50000, accountId]
      )

      const result = db.exec('SELECT balance FROM account WHERE id = ?', [accountId])

      expect(result[0].values[0][0]).toBe(50000)
    })

    it('archives account by adding archived tag', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Active Wallet' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      // Add archived tag
      db.run('INSERT INTO account_to_tags (account_id, tag_id) VALUES (?, ?)', [accountId, SYSTEM_TAGS.ARCHIVED])

      const result = db.exec(`
        SELECT COUNT(*) FROM account_to_tags
        WHERE account_id = ? AND tag_id = ?
      `, [accountId, SYSTEM_TAGS.ARCHIVED])

      expect(result[0].values[0][0]).toBe(1)
    })

    it('excludes archived accounts from active list', async () => {
      const db = getTestDatabase()

      const wallet1 = insertWallet({ name: 'Active Wallet 1' })
      const wallet2 = insertWallet({ name: 'Archived Wallet' })
      const wallet3 = insertWallet({ name: 'Active Wallet 2' })

      const account1 = insertAccount({ wallet_id: wallet1, currency_id: 1 })
      const account2 = insertAccount({ wallet_id: wallet2, currency_id: 1 })
      const account3 = insertAccount({ wallet_id: wallet3, currency_id: 1 })

      // Archive account2
      db.run('INSERT INTO account_to_tags (account_id, tag_id) VALUES (?, ?)', [account2, SYSTEM_TAGS.ARCHIVED])

      // Query non-archived accounts
      const result = db.exec(`
        SELECT COUNT(*) FROM account a
        WHERE NOT EXISTS (
          SELECT 1 FROM account_to_tags at
          WHERE at.account_id = a.id AND at.tag_id = ?
        )
      `, [SYSTEM_TAGS.ARCHIVED])

      expect(result[0].values[0][0]).toBe(2)
    })
  })

  describe('Multi-currency Support', () => {
    it('creates accounts with different currencies', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Multi-currency Wallet' })
      insertAccount({ wallet_id: walletId, currency_id: 1 }) // USD
      insertAccount({ wallet_id: walletId, currency_id: 2 }) // EUR
      insertAccount({ wallet_id: walletId, currency_id: 3 }) // GBP

      const result = db.exec(`
        SELECT w.name, c.code
        FROM account a
        JOIN wallet w ON a.wallet_id = w.id
        JOIN currency c ON a.currency_id = c.id
        WHERE w.id = ?
        ORDER BY c.code
      `, [walletId])

      expect(result[0].values.length).toBe(3)
      expect(result[0].values[0][1]).toBe('EUR')
      expect(result[0].values[1][1]).toBe('GBP')
      expect(result[0].values[2][1]).toBe('USD')
    })

    it('joins currency data correctly', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Euro Wallet' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 2 })

      const result = db.exec(`
        SELECT
          w.name as wallet_name,
          c.code as currency_code,
          c.symbol as currency_symbol,
          c.decimal_places
        FROM account a
        JOIN wallet w ON a.wallet_id = w.id
        JOIN currency c ON a.currency_id = c.id
        WHERE a.id = ?
      `, [accountId])

      expect(result[0].values[0][0]).toBe('Euro Wallet')
      expect(result[0].values[0][1]).toBe('EUR')
      expect(result[0].values[0][2]).toBe('€')
      expect(result[0].values[0][3]).toBe(2)
    })
  })

  describe('Balance Tracking', () => {
    it('tracks balance across multiple transaction types', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Main' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance: 100000 })

      // Income
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.SALE,
        sign: '+',
        amount: 50000,
      })

      // Expense
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount: 20000,
      })

      // Another Expense
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount: 10000,
      })

      // Calculate net from transactions
      const result = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN amount ELSE -amount END) as net
        FROM trx_base WHERE account_id = ?
      `, [accountId])

      // Net: +50000 - 20000 - 10000 = 20000
      expect(result[0].values[0][0]).toBe(20000)
    })

    it('handles negative balance', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Main' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance: 10000 })

      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount: 20000,
      })

      const result = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN amount ELSE -amount END) as net
        FROM trx_base WHERE account_id = ?
      `, [accountId])

      expect(result[0].values[0][0]).toBe(-20000)
    })
  })

  describe('Wallet Ordering', () => {
    it('can order wallets by name', async () => {
      const db = getTestDatabase()

      insertWallet({ name: 'Zebra Wallet' })
      insertWallet({ name: 'Alpha Wallet' })
      insertWallet({ name: 'Beta Wallet' })

      const result = db.exec(`
        SELECT name FROM wallet
        ORDER BY name ASC
      `)

      expect(result[0].values[0][0]).toBe('Alpha Wallet')
      expect(result[0].values[1][0]).toBe('Beta Wallet')
      expect(result[0].values[2][0]).toBe('Zebra Wallet')
    })
  })

  describe('Account Deletion Protection', () => {
    it('counts linked transactions correctly', async () => {
      const db = getTestDatabase()

      const walletId1 = insertWallet({ name: 'Main' })
      const walletId2 = insertWallet({ name: 'Other' })
      const accountId = insertAccount({ wallet_id: walletId1, currency_id: 1 })
      const account2Id = insertAccount({ wallet_id: walletId2, currency_id: 1 })

      // Regular expense
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount: 10000,
      })

      // Transfer out (this account is source)
      const trxId1 = new Uint8Array(8)
      crypto.getRandomValues(trxId1)
      const timestamp = Math.floor(Date.now() / 1000)
      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId1, timestamp])

      const debitId = new Uint8Array(8)
      crypto.getRandomValues(debitId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [debitId, trxId1, accountId, SYSTEM_TAGS.TRANSFER, '-', 5000, 0]
      )
      const creditId = new Uint8Array(8)
      crypto.getRandomValues(creditId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [creditId, trxId1, account2Id, SYSTEM_TAGS.TRANSFER, '+', 5000, 0]
      )

      // Transfer in (this account is destination)
      const trxId2 = new Uint8Array(8)
      crypto.getRandomValues(trxId2)
      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId2, timestamp])

      const debitId2 = new Uint8Array(8)
      crypto.getRandomValues(debitId2)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [debitId2, trxId2, account2Id, SYSTEM_TAGS.TRANSFER, '-', 2500, 0]
      )
      const creditId2 = new Uint8Array(8)
      crypto.getRandomValues(creditId2)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [creditId2, trxId2, accountId, SYSTEM_TAGS.TRANSFER, '+', 2500, 0]
      )

      // Count transactions linked to accountId
      const result = db.exec(`
        SELECT COUNT(*) FROM trx_base WHERE account_id = ?
      `, [accountId])

      expect(result[0].values[0][0]).toBe(3) // 1 expense + 1 transfer out + 1 transfer in
    })
  })
})
