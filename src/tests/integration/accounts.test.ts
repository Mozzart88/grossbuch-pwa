import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  insertWallet,
  insertAccount,
  insertTransaction,
  getTestDatabase,
  getCurrencyIdByCode,
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
      // balance_int and balance_frac default to 0
      const cols = result[0].columns
      const balIntIdx = cols.indexOf('balance_int')
      const balFracIdx = cols.indexOf('balance_frac')
      expect(result[0].values[0][balIntIdx]).toBe(0)
      expect(result[0].values[0][balFracIdx]).toBe(0)
    })

    it('updates account properties', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Original' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      db.run(
        'UPDATE account SET balance_int = ?, balance_frac = ? WHERE id = ?',
        [500, 0, accountId]
      )

      const result = db.exec('SELECT balance_int, balance_frac FROM account WHERE id = ?', [accountId])

      expect(result[0].values[0][0]).toBe(500)
      expect(result[0].values[0][1]).toBe(0)
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

      const usdId = getCurrencyIdByCode('USD')
      const eurId = getCurrencyIdByCode('EUR')
      const gbpId = getCurrencyIdByCode('GBP')

      const walletId = insertWallet({ name: 'Multi-currency Wallet' })
      insertAccount({ wallet_id: walletId, currency_id: usdId })
      insertAccount({ wallet_id: walletId, currency_id: eurId })
      insertAccount({ wallet_id: walletId, currency_id: gbpId })

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

      const eurId = getCurrencyIdByCode('EUR')
      const walletId = insertWallet({ name: 'Euro Wallet' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: eurId })

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
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance_int: 1000 })

      // Income: +500.00
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.SALE,
        sign: '+',
        amount_int: 500,
      })

      // Expense: -200.00
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 200,
      })

      // Another Expense: -100.00
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 100,
      })

      // Calculate net from transactions
      const result = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE -(amount_int + amount_frac * 1e-18) END) as net
        FROM trx_base WHERE account_id = ?
      `, [accountId])

      // Net: +500 - 200 - 100 = 200
      expect(result[0].values[0][0]).toBeCloseTo(200, 5)
    })

    it('handles negative balance', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Main' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance_int: 100 })

      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 200,
      })

      const result = db.exec(`
        SELECT sum(CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE -(amount_int + amount_frac * 1e-18) END) as net
        FROM trx_base WHERE account_id = ?
      `, [accountId])

      expect(result[0].values[0][0]).toBeCloseTo(-200, 5)
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
        amount_int: 100,
      })

      // Transfer out (this account is source)
      const trxId1 = new Uint8Array(8)
      crypto.getRandomValues(trxId1)
      const timestamp = Math.floor(Date.now() / 1000)
      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId1, timestamp])

      const debitId = new Uint8Array(8)
      crypto.getRandomValues(debitId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [debitId, trxId1, accountId, SYSTEM_TAGS.TRANSFER, '-', 50, 0, 0, 0]
      )
      const creditId = new Uint8Array(8)
      crypto.getRandomValues(creditId)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [creditId, trxId1, account2Id, SYSTEM_TAGS.TRANSFER, '+', 50, 0, 0, 0]
      )

      // Transfer in (this account is destination)
      const trxId2 = new Uint8Array(8)
      crypto.getRandomValues(trxId2)
      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId2, timestamp])

      const debitId2 = new Uint8Array(8)
      crypto.getRandomValues(debitId2)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [debitId2, trxId2, account2Id, SYSTEM_TAGS.TRANSFER, '-', 25, 0, 0, 0]
      )
      const creditId2 = new Uint8Array(8)
      crypto.getRandomValues(creditId2)
      db.run(
        'INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [creditId2, trxId2, accountId, SYSTEM_TAGS.TRANSFER, '+', 25, 0, 0, 0]
      )

      // Count transactions linked to accountId
      const result = db.exec(`
        SELECT COUNT(*) FROM trx_base WHERE account_id = ?
      `, [accountId])

      expect(result[0].values[0][0]).toBe(3) // 1 expense + 1 transfer out + 1 transfer in
    })
  })

  describe('Initial Balance Transactions', () => {
    it('creates INITIAL transaction with correct tag', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'New Wallet' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      // Create INITIAL transaction manually (simulating what walletRepository.addAccount does)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.INITIAL,
        sign: '+',
        amount_int: 1000, // 1000.00
      })

      // Verify the INITIAL transaction exists
      const result = db.exec(`
        SELECT tb.tag_id, tb.sign, tb.amount_int, tb.amount_frac, tag.name as tag_name
        FROM trx_base tb
        JOIN tag ON tb.tag_id = tag.id
        WHERE tb.account_id = ? AND tb.tag_id = ?
      `, [accountId, SYSTEM_TAGS.INITIAL])

      expect(result[0].values.length).toBe(1)
      expect(result[0].values[0][0]).toBe(SYSTEM_TAGS.INITIAL)
      expect(result[0].values[0][1]).toBe('+')
      expect(result[0].values[0][2]).toBe(1000) // amount_int
      expect(result[0].values[0][3]).toBe(0) // amount_frac
      expect(result[0].values[0][4]).toBe('initial')
    })

    it('INITIAL transaction updates account balance via trigger', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Balance Test' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      // Account balance should start at 0
      let result = db.exec('SELECT balance_int, balance_frac FROM account WHERE id = ?', [accountId])
      expect(result[0].values[0][0]).toBe(0)
      expect(result[0].values[0][1]).toBe(0)

      // Create INITIAL transaction
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.INITIAL,
        sign: '+',
        amount_int: 500, // 500.00
      })

      // Account balance should now reflect the initial balance (trigger updates it)
      result = db.exec('SELECT balance_int, balance_frac FROM account WHERE id = ?', [accountId])
      expect(result[0].values[0][0]).toBe(500)
      expect(result[0].values[0][1]).toBe(0)
    })

    it('INITIAL transactions are excluded from trx_log by tag filter', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Filter Test' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      // Create INITIAL transaction
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.INITIAL,
        sign: '+',
        amount_int: 1000,
      })

      // Create regular expense
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 50,
      })

      // Query trx_log excluding 'initial' tag (as findByMonth does)
      const result = db.exec(`
        SELECT * FROM trx_log
        WHERE tags != 'initial'
      `)

      // Should only return the expense, not the initial
      expect(result[0].values.length).toBe(1)
      expect(result[0].values[0]).not.toContain('initial')
    })

    it('INITIAL transactions are excluded from month summary', async () => {
      const db = getTestDatabase()

      const walletId = insertWallet({ name: 'Summary Test' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

      const timestamp = Math.floor(Date.now() / 1000)

      // Create INITIAL transaction (+1000)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.INITIAL,
        sign: '+',
        amount_int: 1000,
        rate_int: 1,
        timestamp,
      })

      // Create income (+500)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.SALE,
        sign: '+',
        amount_int: 500,
        rate_int: 1,
        timestamp,
      })

      // Create expense (-200)
      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.FOOD,
        sign: '-',
        amount_int: 200,
        rate_int: 1,
        timestamp,
      })

      // Query summary excluding INITIAL, TRANSFER, EXCHANGE
      const result = db.exec(`
        SELECT
          COALESCE(SUM(CASE WHEN sign = '+' AND tag_id NOT IN (?, ?, ?) THEN (amount_int + amount_frac * 1e-18) ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN sign = '-' AND tag_id NOT IN (?, ?, ?) THEN (amount_int + amount_frac * 1e-18) ELSE 0 END), 0) as expenses
        FROM trx_base
        WHERE account_id = ?
      `, [
        SYSTEM_TAGS.INITIAL, SYSTEM_TAGS.TRANSFER, SYSTEM_TAGS.EXCHANGE,
        SYSTEM_TAGS.INITIAL, SYSTEM_TAGS.TRANSFER, SYSTEM_TAGS.EXCHANGE,
        accountId
      ])

      // Income should only include the sale (500), not the initial (1000)
      expect(result[0].values[0][0]).toBeCloseTo(500, 5)
      // Expenses should be 200
      expect(result[0].values[0][1]).toBeCloseTo(200, 5)
    })
  })
})
