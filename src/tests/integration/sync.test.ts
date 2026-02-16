import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { SYSTEM_TAGS } from '../../types'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  createDatabaseMock,
  insertWallet,
  insertAccount,
  insertTag,
  insertCounterparty,
  insertTransaction,
  insertBudget,
  insertIcon,
  insertTagIcon,
  insertCurrency,
  getCurrencyIdByCode,
  getTestDatabase,
} from './setup'

let dbMock: ReturnType<typeof createDatabaseMock>

describe('Sync Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  beforeEach(() => {
    resetTestDatabase()
    dbMock = createDatabaseMock()
    vi.doMock('../../services/database/connection', () => dbMock)
  })

  describe('syncExport', () => {
    it('exports icons changed since timestamp', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      insertIcon({ value: 'icon-test' })

      const pkg = await exportSyncPackage(0, 'sender-1')

      expect(pkg.version).toBe(1)
      expect(pkg.sender_id).toBe('sender-1')
      expect(pkg.since).toBe(0)
      // Icons created during migrations + our new one
      const testIcon = pkg.icons.find(i => i.value === 'icon-test')
      expect(testIcon).toBeDefined()
      expect(testIcon!.updated_at).toBeGreaterThan(0)
    })

    it('exports wallets with tags', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      insertWallet({ name: 'Cash', is_default: true })

      const pkg = await exportSyncPackage(0, 'sender-1')

      const wallet = pkg.wallets.find(w => w.name === 'Cash')
      expect(wallet).toBeDefined()
      expect(wallet!.tags).toContain(SYSTEM_TAGS.DEFAULT)
    })

    it('exports accounts with wallet and currency ids', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const walletId = insertWallet({ name: 'Main' })
      const usdId = getCurrencyIdByCode('USD')
      insertAccount({ wallet_id: walletId, currency_id: usdId })

      const pkg = await exportSyncPackage(0, 'sender-1')

      const account = pkg.accounts.find(a => a.wallet === walletId)
      expect(account).toBeDefined()
      expect(account!.currency).toBe(usdId)
    })

    it('exports counterparties with notes and tags', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const tagId = insertTag({ name: 'TestTag', parent_ids: [SYSTEM_TAGS.DEFAULT] })
      insertCounterparty({ name: 'Acme Corp', note: 'A test company', tag_ids: [tagId] })

      const pkg = await exportSyncPackage(0, 'sender-1')

      const cp = pkg.counterparties.find(c => c.name === 'Acme Corp')
      expect(cp).toBeDefined()
      expect(cp!.note).toBe('A test company')
      expect(cp!.tags).toContain(tagId)
    })

    it('exports currencies with tags', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const pkg = await exportSyncPackage(0, 'sender-1')

      const usdId = getCurrencyIdByCode('USD')
      const usd = pkg.currencies.find(c => c.id === usdId)
      expect(usd).toBeDefined()
      expect(usd!.decimal_places).toBe(2)
    })

    it('exports transactions with lines and counterparty', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const walletId = insertWallet({ name: 'Wallet1' })
      const usdId = getCurrencyIdByCode('USD')
      const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
      const cpId = insertCounterparty({ name: 'Shop' })

      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.EXPENSE,
        sign: '-',
        amount: 1000,
        rate: 100,
        counterparty_id: cpId,
        note: 'Groceries',
      })

      const pkg = await exportSyncPackage(0, 'sender-1')

      expect(pkg.transactions.length).toBeGreaterThan(0)
      const trx = pkg.transactions[0]
      expect(trx.counterparty).toBe(cpId)
      expect(trx.note).toBe('Groceries')
      expect(trx.lines.length).toBeGreaterThan(0)
      expect(trx.lines[0].account).toBe(accountId)
      expect(trx.lines[0].tag).toBe(SYSTEM_TAGS.EXPENSE)
      expect(trx.lines[0].sign).toBe('-')
      expect(trx.lines[0].amount).toBe(1000)
    })

    it('exports budgets with tag id', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      insertBudget({ tag_id: SYSTEM_TAGS.FOOD, amount: 50000 })

      const pkg = await exportSyncPackage(0, 'sender-1')

      expect(pkg.budgets.length).toBeGreaterThan(0)
      expect(pkg.budgets[0].tag).toBe(SYSTEM_TAGS.FOOD)
      expect(pkg.budgets[0].amount).toBe(50000)
    })

    it('exports deletions since timestamp', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const db = getTestDatabase()
      db.run(
        `INSERT INTO sync_deletions (table_name, entity_id, deleted_at) VALUES (?, ?, ?)`,
        ['wallet', '42', 500]
      )

      const pkg = await exportSyncPackage(0, 'sender-1')

      const del = pkg.deletions.find(d => d.entity_id === '42')
      expect(del).toBeDefined()
      expect(del!.entity).toBe('wallet')
    })

    it('only exports changes since given timestamp', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      insertWallet({ name: 'WalletBefore' })

      // Set a high since timestamp so nothing is returned
      const futureTimestamp = Math.floor(Date.now() / 1000) + 999999
      const pkg = await exportSyncPackage(futureTimestamp, 'sender-1')

      expect(pkg.wallets).toHaveLength(0)
      expect(pkg.accounts).toHaveLength(0)
      expect(pkg.transactions).toHaveLength(0)
    })

    it('exports tags without parents as empty parents', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      // Insert a user tag without any parent_id > 1
      insertTag({ name: 'OrphanTag' })

      const pkg = await exportSyncPackage(0, 'sender-1')

      const orphan = pkg.tags.find(t => t.name === 'OrphanTag')
      expect(orphan).toBeDefined()
      expect(orphan!.parents).toEqual([])
    })

    it('exports transactions without lines', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      // Insert a transaction header with no trx_base lines
      const db = getTestDatabase()
      const trxId = new Uint8Array(8)
      crypto.getRandomValues(trxId)
      db.run('INSERT INTO trx (id, timestamp) VALUES (?, ?)', [trxId, Math.floor(Date.now() / 1000)])

      const pkg = await exportSyncPackage(0, 'sender-1')

      const hexId = Array.from(trxId).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
      const trx = pkg.transactions.find(t => t.id === hexId)
      expect(trx).toBeDefined()
      expect(trx!.lines).toEqual([])
    })

    it('excludes system tags from export', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const pkg = await exportSyncPackage(0, 'sender-1')

      // System tags 1-10 and 22,23 should NOT be exported
      const systemNames = ['system', 'default', 'initial', 'fiat', 'crypto', 'transfer', 'exchange', 'purchase', 'income', 'expense', 'archived', 'adjustment']
      for (const name of systemNames) {
        expect(pkg.tags.find(t => t.name === name)).toBeUndefined()
      }

      // User category tags 11-21 SHOULD be exported
      const userTag = pkg.tags.find(t => t.name === 'Food')
      expect(userTag).toBeDefined()
    })
  })

  describe('syncImport', () => {
    it('imports new icons', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1000,
        since: 0,
        icons: [{ id: 999, value: 'new-icon', updated_at: 1000 }],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [],
      })

      expect(result.imported.icons).toBe(1)
      expect(result.errors).toHaveLength(0)

      const db = getTestDatabase()
      const icon = db.exec(`SELECT value FROM icon WHERE value = 'new-icon'`)
      expect(icon[0]?.values[0]?.[0]).toBe('new-icon')
    })

    it('imports new wallets with tags', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1000,
        since: 0,
        icons: [],
        tags: [],
        wallets: [{ id: 999, name: 'Remote Wallet', color: '#ff0000', updated_at: 1000, tags: [SYSTEM_TAGS.DEFAULT] }],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [],
      })

      expect(result.imported.wallets).toBe(1)

      const db = getTestDatabase()
      const wallet = db.exec(`SELECT name, color FROM wallet WHERE name = 'Remote Wallet'`)
      expect(wallet[0]?.values[0]?.[0]).toBe('Remote Wallet')
      expect(wallet[0]?.values[0]?.[1]).toBe('#ff0000')
    })

    it('updates existing wallet with last-write-wins', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const walletId = insertWallet({ name: 'MyWallet' })

      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [{ id: walletId, name: 'MyWallet', color: '#00ff00', updated_at: futureTs, tags: [] }],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [],
      })

      expect(result.imported.wallets).toBe(1)

      const db = getTestDatabase()
      const wallet = db.exec(`SELECT color FROM wallet WHERE name = 'MyWallet'`)
      expect(wallet[0]?.values[0]?.[0]).toBe('#00ff00')
    })

    it('skips wallet update when local is newer', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const walletId = insertWallet({ name: 'FreshWallet', color: '#111111' })

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1,
        since: 0,
        icons: [],
        tags: [],
        wallets: [{ id: walletId, name: 'FreshWallet', color: '#999999', updated_at: 1, tags: [] }],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [],
      })

      expect(result.imported.wallets).toBe(0)

      const db = getTestDatabase()
      const wallet = db.exec(`SELECT color FROM wallet WHERE name = 'FreshWallet'`)
      expect(wallet[0]?.values[0]?.[0]).toBe('#111111')
    })

    it('imports new counterparties with notes and tags', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1000,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [{ id: 999, name: 'RemoteCo', updated_at: 1000, note: 'Remote note', tags: [SYSTEM_TAGS.FOOD] }],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [],
      })

      expect(result.imported.counterparties).toBe(1)

      const db = getTestDatabase()
      const note = db.exec(`SELECT note FROM counterparty_note cn JOIN counterparty c ON c.id = cn.counterparty_id WHERE c.name = 'RemoteCo'`)
      expect(note[0]?.values[0]?.[0]).toBe('Remote note')
    })

    it('imports new accounts', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const walletId = insertWallet({ name: 'W1' })
      const usdId = getCurrencyIdByCode('USD')

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1000,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [{ id: 999, wallet: walletId, currency: usdId, updated_at: 1000, tags: [] }],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [],
      })

      expect(result.imported.accounts).toBe(1)

      const db = getTestDatabase()
      const acc = db.exec(`SELECT id FROM account WHERE id = 999`)
      expect(acc[0]?.values).toHaveLength(1)
    })

    it('imports transactions with lines and recalculates balances', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const walletId = insertWallet({ name: 'TrxWallet' })
      const usdId = getCurrencyIdByCode('USD')
      const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId, balance: 0 })

      const trxId = 'AABBCCDDEE001122'
      const lineId = '1122334455667788'

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1000,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [{
          id: trxId,
          timestamp: 1000,
          updated_at: 1000,
          counterparty: null,
          note: null,
          lines: [{
            id: lineId,
            account: accountId,
            tag: SYSTEM_TAGS.EXPENSE,
            sign: '-',
            amount: 5000,
            rate: 100,
          }],
        }],
        budgets: [],
        deletions: [],
      })

      expect(result.imported.transactions).toBe(1)

      const db = getTestDatabase()
      // Verify transaction exists
      const trx = db.exec(`SELECT hex(id) FROM trx WHERE hex(id) = '${trxId}'`)
      expect(trx[0]?.values).toHaveLength(1)

      // Verify balance recalculated
      const balance = db.exec(`SELECT balance FROM account WHERE id = ${accountId}`)
      expect(balance[0]?.values[0]?.[0]).toBe(-5000)
    })

    it('imports transactions with counterparty link', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const walletId = insertWallet({ name: 'W2' })
      const usdId = getCurrencyIdByCode('USD')
      const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
      const cpId = insertCounterparty({ name: 'LinkedCP' })

      await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1000,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [{
          id: 'FF00FF00FF00FF00',
          timestamp: 1000,
          updated_at: 1000,
          counterparty: cpId,
          note: 'Test note',
          lines: [{
            id: 'AA00AA00AA00AA00',
            account: accountId,
            tag: SYSTEM_TAGS.INCOME,
            sign: '+',
            amount: 2000,
            rate: 100,
          }],
        }],
        budgets: [],
        deletions: [],
      })

      const db = getTestDatabase()
      const link = db.exec(`SELECT counterparty_id FROM trx_to_counterparty WHERE hex(trx_id) = 'FF00FF00FF00FF00'`)
      expect(link[0]?.values[0]?.[0]).toBe(cpId)

      const note = db.exec(`SELECT note FROM trx_note WHERE hex(trx_id) = 'FF00FF00FF00FF00'`)
      expect(note[0]?.values[0]?.[0]).toBe('Test note')
    })

    it('imports budgets', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const budgetId = 'BB00BB00BB00BB00'

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1000,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [{
          id: budgetId,
          start: 1000,
          end: 2000,
          tag: SYSTEM_TAGS.FOOD,
          amount: 100000,
          updated_at: 1000,
        }],
        deletions: [],
      })

      expect(result.imported.budgets).toBe(1)

      const db = getTestDatabase()
      const budget = db.exec(`SELECT amount FROM budget WHERE hex(id) = '${budgetId}'`)
      expect(budget[0]?.values[0]?.[0]).toBe(100000)
    })

    it('applies deletions with delete-vs-modify conflict', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const cpId = insertCounterparty({ name: 'ToDelete' })

      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [{ entity: 'counterparty', entity_id: cpId.toString(), deleted_at: futureTs }],
      })

      expect(result.imported.deletions).toBe(1)

      const db = getTestDatabase()
      const cp = db.exec(`SELECT * FROM counterparty WHERE name = 'ToDelete'`)
      expect(cp).toHaveLength(0)
    })

    it('skips deletion when local is newer (modify wins)', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const cpId = insertCounterparty({ name: 'KeepMe' })

      // Old deletion timestamp - should not delete
      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [{ entity: 'counterparty', entity_id: cpId.toString(), deleted_at: 1 }],
      })

      expect(result.imported.deletions).toBe(0)

      const db = getTestDatabase()
      const cp = db.exec(`SELECT * FROM counterparty WHERE name = 'KeepMe'`)
      expect(cp[0]?.values).toHaveLength(1)
    })

    it('handles deletion of transactions by hex id', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const walletId = insertWallet({ name: 'DW' })
      const usdId = getCurrencyIdByCode('USD')
      const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
      const trxId = insertTransaction({ account_id: accountId, tag_id: SYSTEM_TAGS.EXPENSE, sign: '-', amount: 100 })

      const hexId = Array.from(trxId).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [{ entity: 'trx', entity_id: hexId, deleted_at: futureTs }],
      })

      expect(result.imported.deletions).toBe(1)
    })

    it('handles deletion of accounts by id', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const walletId = insertWallet({ name: 'AccWallet' })
      const usdId = getCurrencyIdByCode('USD')
      const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })

      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [{ entity: 'account', entity_id: accountId.toString(), deleted_at: futureTs }],
      })

      expect(result.imported.deletions).toBe(1)
    })

    it('rolls back on error', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1000,
        since: 0,
        icons: [],
        tags: [],
        wallets: [{ id: 999, name: 'RollbackWallet', color: null, updated_at: 1000, tags: [] }],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [],
      })

      // Should succeed since no errors
      expect(result.errors).toHaveLength(0)
    })

    it('imports new tags with parent relations and icons', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const iconId = insertIcon({ value: 'tag-icon-test' })

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1000,
        since: 0,
        icons: [],
        tags: [{ id: 100, name: 'NewCategory', updated_at: 1000, parents: [SYSTEM_TAGS.INCOME], children: [], icon: iconId }],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [],
      })

      expect(result.imported.tags).toBe(1)

      const db = getTestDatabase()
      const tag = db.exec(`SELECT id FROM tag WHERE name = 'NewCategory'`)
      expect(tag[0]?.values).toHaveLength(1)

      const tagId = tag[0].values[0][0]
      const parent = db.exec(`SELECT parent_id FROM tag_to_tag WHERE child_id = ${tagId}`)
      expect(parent[0]?.values[0]?.[0]).toBe(SYSTEM_TAGS.INCOME)

      const icon = db.exec(`SELECT icon_id FROM tag_icon WHERE tag_id = ${tagId}`)
      expect(icon[0]?.values).toHaveLength(1)
    })

    it('updates existing tag with last-write-wins', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const futureTs = Math.floor(Date.now() / 1000) + 10000
      const iconId = insertIcon({ value: 'updated-icon' })

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [{ id: SYSTEM_TAGS.FOOD, name: 'Food', updated_at: futureTs, parents: [SYSTEM_TAGS.EXPENSE], children: [], icon: iconId }],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [],
      })

      expect(result.imported.tags).toBe(1)
    })

    it('updates existing counterparty with last-write-wins', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const cpId = insertCounterparty({ name: 'UpdateMe', note: 'old note' })
      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [{ id: cpId, name: 'UpdateMe', updated_at: futureTs, note: 'new note', tags: [] }],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [],
      })

      expect(result.imported.counterparties).toBe(1)

      const db = getTestDatabase()
      const note = db.exec(`SELECT note FROM counterparty_note cn JOIN counterparty c ON c.id = cn.counterparty_id WHERE c.name = 'UpdateMe'`)
      expect(note[0]?.values[0]?.[0]).toBe('new note')
    })

    it('updates existing account tags with last-write-wins', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const walletId = insertWallet({ name: 'AccUpd' })
      const usdId = getCurrencyIdByCode('USD')
      const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })

      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [{ id: accountId, wallet: walletId, currency: usdId, updated_at: futureTs, tags: [SYSTEM_TAGS.DEFAULT] }],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [],
      })

      expect(result.imported.accounts).toBe(1)
    })

    it('updates existing transaction with last-write-wins', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const walletId = insertWallet({ name: 'TrxUpd' })
      const usdId = getCurrencyIdByCode('USD')
      const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
      const trxId = insertTransaction({ account_id: accountId, tag_id: SYSTEM_TAGS.EXPENSE, sign: '-', amount: 100 })

      const hexId = Array.from(trxId).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
      const lineId = 'CC00CC00CC00CC00'
      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [{
          id: hexId,
          timestamp: 2000,
          updated_at: futureTs,
          counterparty: null,
          note: null,
          lines: [{
            id: lineId,
            account: accountId,
            tag: SYSTEM_TAGS.INCOME,
            sign: '+',
            amount: 9999,
            rate: 100,
          }],
        }],
        budgets: [],
        deletions: [],
      })

      expect(result.imported.transactions).toBe(1)

      const db = getTestDatabase()
      const balance = db.exec(`SELECT balance FROM account WHERE id = ${accountId}`)
      expect(balance[0]?.values[0]?.[0]).toBe(9999)
    })

    it('updates existing budget with last-write-wins', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const budgetId = insertBudget({ tag_id: SYSTEM_TAGS.FOOD, amount: 50000 })
      const hexId = Array.from(budgetId).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()

      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [{
          id: hexId,
          start: 3000,
          end: 4000,
          tag: SYSTEM_TAGS.FOOD,
          amount: 99999,
          updated_at: futureTs,
        }],
        deletions: [],
      })

      expect(result.imported.budgets).toBe(1)

      const db = getTestDatabase()
      const budget = db.exec(`SELECT amount FROM budget WHERE hex(id) = '${hexId}'`)
      expect(budget[0]?.values[0]?.[0]).toBe(99999)
    })

    it('deletes tag via deletion import', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const tagId = insertTag({ name: 'DeleteMeTag', parent_ids: [SYSTEM_TAGS.DEFAULT] })
      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [{ entity: 'tag', entity_id: tagId.toString(), deleted_at: futureTs }],
      })

      expect(result.imported.deletions).toBe(1)
    })

    it('deletes wallet via deletion import', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const walletId = insertWallet({ name: 'DeleteMeWallet' })
      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [{ entity: 'wallet', entity_id: walletId.toString(), deleted_at: futureTs }],
      })

      expect(result.imported.deletions).toBe(1)
    })

    it('deletes icon via deletion import', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const iconId = insertIcon({ value: 'delete-me-icon' })
      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [{ entity: 'icon', entity_id: iconId.toString(), deleted_at: futureTs }],
      })

      expect(result.imported.deletions).toBe(1)
    })

    it('deletes currency via deletion import', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const currencyId = insertCurrency({ code: 'XDL', name: 'DeleteCur', symbol: 'X', decimal_places: 2 })
      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [{ entity: 'currency', entity_id: currencyId.toString(), deleted_at: futureTs }],
      })

      expect(result.imported.deletions).toBe(1)
    })

    it('deletes budget via deletion import', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const budgetId = insertBudget({ tag_id: SYSTEM_TAGS.FOOD, amount: 10000 })
      const hexId = Array.from(budgetId).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [{ entity: 'budget', entity_id: hexId, deleted_at: futureTs }],
      })

      expect(result.imported.deletions).toBe(1)
    })

    it('handles deletion of unknown table gracefully', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1000,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [{ entity: 'nonexistent', entity_id: 'x', deleted_at: 9999999999 }],
      })

      expect(result.imported.deletions).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('skips deletion of non-existent entities for all types', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const futureTs = Math.floor(Date.now() / 1000) + 10000

      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: futureTs,
        since: 0,
        icons: [],
        tags: [],
        wallets: [],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [
          { entity: 'tag', entity_id: '99999', deleted_at: futureTs },
          { entity: 'wallet', entity_id: '99999', deleted_at: futureTs },
          { entity: 'currency', entity_id: '99999', deleted_at: futureTs },
          { entity: 'icon', entity_id: '99999', deleted_at: futureTs },
          { entity: 'trx', entity_id: 'DEADBEEFDEADBEEF', deleted_at: futureTs },
          { entity: 'budget', entity_id: 'DEADBEEFDEADBEEF', deleted_at: futureTs },
          { entity: 'account', entity_id: '99999', deleted_at: futureTs },
        ],
      })

      expect(result.imported.deletions).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('rolls back and reports errors on failure', async () => {
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      // Force an error by providing a wallet insert that fails (null name violates NOT NULL)
      const result = await importSyncPackage({
        version: 1,
        sender_id: 'other',
        created_at: 1000,
        since: 0,
        icons: [],
        tags: [],
        wallets: [{ id: 999, name: null as unknown as string, color: '#000', updated_at: 1000, tags: [] }],
        accounts: [],
        counterparties: [],
        currencies: [],
        transactions: [],
        budgets: [],
        deletions: [],
      })

      expect(result.errors.length).toBeGreaterThan(0)
    })
  })
})
