import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { SYSTEM_TAGS } from '../../types'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  createDatabaseMock,
  insertWallet,
  insertAccount,
  insertTransaction,
  insertBudget,
  insertIcon,
  insertCounterparty,
  insertCurrency,
  getCurrencyIdByCode,
  getTestDatabase,
} from './setup'

let dbMock: ReturnType<typeof createDatabaseMock>

/**
 * Drop all updated_at triggers directly on the test DB so that manual
 * `UPDATE ... SET updated_at = ?` calls are not overridden by triggers.
 */
function dropTriggersOnTestDb(): void {
  const db = getTestDatabase()
  const triggers = [
    'trg_icon_update',
    'trg_tag_update',
    'trg_wallet_update',
    'trg_account_update',
    'trg_counterparty_update',
    'trg_trx_update',
    'trg_budget_update',
    // Also the side-effect triggers that touch parent updated_at
    'trg_trx_base_insert',
    'trg_trx_base_update',
    'trg_trx_base_delete',
    'trg_trx_to_counterparty_insert',
    'trg_trx_to_counterparty_update',
    'trg_trx_to_counterparty_delete',
    'trg_trx_note_insert',
    'trg_trx_note_update',
    'trg_trx_note_delete',
    'trg_counterparty_note_insert',
    'trg_counterparty_note_update',
    'trg_counterparty_note_delete',
    'trg_counterparty_to_tags_insert',
    'trg_counterparty_to_tags_update',
    'trg_counterparty_to_tags_delete',
  ]
  for (const name of triggers) {
    db.run(`DROP TRIGGER IF EXISTS ${name}`)
  }
}

/**
 * Integration tests for the timestamp boundary fix.
 *
 * Bug: sync push was losing transactions due to two interacting issues:
 *   1. Export queries used strict `>` with 1-second granularity timestamps,
 *      so items created in the same second as `last_push_at` were permanently
 *      missed (`T > T` is false).
 *   2. `updatePushTimestamp` used `CURRENT_TIMESTAMP` (i.e. NOW) instead of a
 *      pre-captured timestamp, so writes that raced with the export were
 *      covered by the new `last_push_at` and skipped by the next export.
 *
 * Fix: all export/repository queries now use `>=`, `updatePushTimestamp`
 * accepts an explicit timestamp captured before the export begins, and
 * write-notifications are suppressed while updating `last_push_at`.
 */
describe('Sync Timestamp Boundary', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  beforeEach(() => {
    resetTestDatabase()
    dbMock = createDatabaseMock()
    vi.doMock('../../services/database/connection', () => ({
      ...dbMock,
      setSuppressWriteNotifications: vi.fn(),
    }))
  })

  // ---------------------------------------------------------------
  // 1. Export boundary: items at exactly `since` are included
  // ---------------------------------------------------------------
  describe('exportSyncPackage uses >= so boundary items are included', () => {
    it('exports wallets created at exactly the since timestamp', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const walletId = insertWallet({ name: 'BoundaryWallet' })

      // Read the wallet's actual updated_at set by the trigger
      const db = getTestDatabase()
      const row = db.exec(`SELECT updated_at FROM wallet WHERE id = ${walletId}`)
      const updatedAt = Number(row[0].values[0][0])

      // Export with since == updated_at (the exact boundary)
      const pkg = await exportSyncPackage(updatedAt, 'sender')

      const wallet = pkg.wallets.find(w => w.name === 'BoundaryWallet')
      expect(wallet).toBeDefined()
    })

    it('exports accounts created at exactly the since timestamp', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const walletId = insertWallet({ name: 'W' })
      const usdId = getCurrencyIdByCode('USD')
      const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })

      const db = getTestDatabase()
      const row = db.exec(`SELECT updated_at FROM account WHERE id = ${accountId}`)
      const updatedAt = Number(row[0].values[0][0])

      const pkg = await exportSyncPackage(updatedAt, 'sender')

      const account = pkg.accounts.find(a => a.id === accountId)
      expect(account).toBeDefined()
    })

    it('exports transactions created at exactly the since timestamp', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const walletId = insertWallet({ name: 'TW' })
      const usdId = getCurrencyIdByCode('USD')
      const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
      const trxId = insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.EXPENSE,
        sign: '-',
        amount_int: 50,
      })

      const hexId = Array.from(trxId).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()

      const db = getTestDatabase()
      const row = db.exec(`SELECT updated_at FROM trx WHERE hex(id) = '${hexId}'`)
      const updatedAt = Number(row[0].values[0][0])

      const pkg = await exportSyncPackage(updatedAt, 'sender')

      const trx = pkg.transactions.find(t => t.id === hexId)
      expect(trx).toBeDefined()
      expect(trx!.lines.length).toBeGreaterThan(0)
    })

    it('exports icons created at exactly the since timestamp', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const iconId = insertIcon({ value: 'boundary-icon' })

      const db = getTestDatabase()
      const row = db.exec(`SELECT updated_at FROM icon WHERE id = ${iconId}`)
      const updatedAt = Number(row[0].values[0][0])

      const pkg = await exportSyncPackage(updatedAt, 'sender')

      const icon = pkg.icons.find(i => i.value === 'boundary-icon')
      expect(icon).toBeDefined()
    })

    it('exports counterparties created at exactly the since timestamp', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const cpId = insertCounterparty({ name: 'BoundaryCo' })

      const db = getTestDatabase()
      const row = db.exec(`SELECT updated_at FROM counterparty WHERE id = ${cpId}`)
      const updatedAt = Number(row[0].values[0][0])

      const pkg = await exportSyncPackage(updatedAt, 'sender')

      const cp = pkg.counterparties.find(c => c.name === 'BoundaryCo')
      expect(cp).toBeDefined()
    })

    it('exports currencies created at exactly the since timestamp', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const currId = insertCurrency({ code: 'XBC', name: 'Boundary Coin', symbol: 'B', decimal_places: 2, is_fiat: true })

      const db = getTestDatabase()
      const row = db.exec(`SELECT updated_at FROM currency WHERE id = ${currId}`)
      const updatedAt = Number(row[0].values[0][0])

      const pkg = await exportSyncPackage(updatedAt, 'sender')

      const curr = pkg.currencies.find(c => c.id === currId)
      expect(curr).toBeDefined()
    })

    it('exports budgets created at exactly the since timestamp', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const budgetId = insertBudget({ tag_id: SYSTEM_TAGS.FOOD, amount_int: 500 })
      const hexId = Array.from(budgetId).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()

      const db = getTestDatabase()
      const row = db.exec(`SELECT updated_at FROM budget WHERE hex(id) = '${hexId}'`)
      const updatedAt = Number(row[0].values[0][0])

      const pkg = await exportSyncPackage(updatedAt, 'sender')

      const budget = pkg.budgets.find(b => b.id === hexId)
      expect(budget).toBeDefined()
    })

    it('exports deletions recorded at exactly the since timestamp', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')

      const T = 1700000000
      const db = getTestDatabase()
      db.run(
        `INSERT INTO sync_deletions (table_name, entity_id, deleted_at) VALUES (?, ?, ?)`,
        ['wallet', '42', T]
      )

      const pkg = await exportSyncPackage(T, 'sender')

      const del = pkg.deletions.find(d => d.entity_id === '42')
      expect(del).toBeDefined()
      expect(del!.entity).toBe('wallet')
    })
  })

  // ---------------------------------------------------------------
  // 2. hasUnpushedChanges detects items at the boundary
  // ---------------------------------------------------------------
  describe('hasUnpushedChanges uses >= so boundary items are detected', () => {
    it('returns true when wallet updated_at equals last_push_at', async () => {
      const { hasUnpushedChanges } = await import('../../services/sync/syncRepository')

      const walletId = insertWallet({ name: 'BoundaryCheck' })

      const db = getTestDatabase()
      const row = db.exec(`SELECT updated_at FROM wallet WHERE id = ${walletId}`)
      const updatedAt = Number(row[0].values[0][0])

      // Set last_push_at to exactly the wallet's updated_at
      db.run(
        `INSERT INTO sync_state (installation_id, last_push_at, last_sync_at) VALUES (?, ?, 0)`,
        ['test-inst', updatedAt]
      )

      const result = await hasUnpushedChanges('test-inst')
      expect(result).toBe(true)
    })

    it('returns true when deletion deleted_at equals last_push_at', async () => {
      const { hasUnpushedChanges } = await import('../../services/sync/syncRepository')

      const T = 1700000000
      const db = getTestDatabase()
      db.run(
        `INSERT INTO sync_deletions (table_name, entity_id, deleted_at) VALUES (?, ?, ?)`,
        ['wallet', '99', T]
      )
      db.run(
        `INSERT INTO sync_state (installation_id, last_push_at, last_sync_at) VALUES (?, ?, 0)`,
        ['test-inst', T]
      )

      const result = await hasUnpushedChanges('test-inst')
      expect(result).toBe(true)
    })
  })

  // ---------------------------------------------------------------
  // 3. getDeletionsSince picks up deletions at the boundary
  // ---------------------------------------------------------------
  describe('getDeletionsSince uses >= so boundary deletions are included', () => {
    it('returns deletions with deleted_at exactly equal to since', async () => {
      const { getDeletionsSince } = await import('../../services/sync/syncRepository')

      const T = 1700000000
      const db = getTestDatabase()
      db.run(
        `INSERT INTO sync_deletions (table_name, entity_id, deleted_at) VALUES (?, ?, ?)`,
        ['counterparty', '55', T]
      )

      const deletions = await getDeletionsSince(T)
      const found = deletions.find(d => d.entity_id === '55')
      expect(found).toBeDefined()
      expect(found!.entity).toBe('counterparty')
    })
  })

  // ---------------------------------------------------------------
  // 4. updatePushTimestamp accepts an explicit timestamp
  // ---------------------------------------------------------------
  describe('updatePushTimestamp stores explicit timestamp', () => {
    it('sets last_push_at to the provided value, not CURRENT_TIMESTAMP', async () => {
      const { updatePushTimestamp, getSyncState, ensureSyncState } = await import('../../services/sync/syncRepository')

      await ensureSyncState('ts-inst')
      const fixedTimestamp = 1700000042
      await updatePushTimestamp('ts-inst', fixedTimestamp)

      const state = await getSyncState('ts-inst')
      expect(state!.last_push_at).toBe(fixedTimestamp)
    })
  })

  // ---------------------------------------------------------------
  // 5. Full scenario: reproduce the original bug
  //    Device A creates wallet + USD account + ARS account in quick
  //    succession. All share the same 1-second timestamp. A first
  //    push captures last_push_at = T. A second push must still
  //    export items with updated_at = T thanks to >=.
  // ---------------------------------------------------------------
  describe('full scenario: items at push boundary are not lost', () => {
    it('second push re-exports items whose updated_at equals last_push_at', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')
      const { updatePushTimestamp, ensureSyncState, getSyncState } = await import('../../services/sync/syncRepository')

      const db = getTestDatabase()

      // Simulate: create wallet + USD account + ARS account all in the same second
      const walletId = insertWallet({ name: 'MyWallet' })
      const usdId = getCurrencyIdByCode('USD')
      const usdAccountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
      const arsId = insertCurrency({ code: 'XAR', name: 'Argentine Peso', symbol: '$', decimal_places: 2, is_fiat: true })
      const arsAccountId = insertAccount({ wallet_id: walletId, currency_id: arsId })

      // Create initial-balance transactions for each account
      const usdTrxId = insertTransaction({
        account_id: usdAccountId,
        tag_id: SYSTEM_TAGS.INITIAL,
        sign: '+',
        amount_int: 100, // $100.00
      })
      const arsTrxId = insertTransaction({
        account_id: arsAccountId,
        tag_id: SYSTEM_TAGS.INITIAL,
        sign: '+',
        amount_int: 100000, // ARS 100,000.00
      })

      // Drop triggers so manual updated_at sticks
      dropTriggersOnTestDb()

      // Force all entities to the SAME integer timestamp (simulating sub-second creation)
      const T = 1700000000
      db.run(`UPDATE wallet SET updated_at = ? WHERE id = ?`, [T, walletId])
      db.run(`UPDATE account SET updated_at = ? WHERE id = ?`, [T, usdAccountId])
      db.run(`UPDATE account SET updated_at = ? WHERE id = ?`, [T, arsAccountId])
      db.run(`UPDATE currency SET updated_at = ? WHERE id = ?`, [T, arsId])
      db.run(`UPDATE trx SET updated_at = ? WHERE hex(id) = ?`, [
        T,
        Array.from(usdTrxId).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(),
      ])
      db.run(`UPDATE trx SET updated_at = ? WHERE hex(id) = ?`, [
        T,
        Array.from(arsTrxId).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(),
      ])

      // --- PUSH 1 --- exports everything from time 0
      await ensureSyncState('device-a')
      const pkg1 = await exportSyncPackage(0, 'device-a')

      // Verify push 1 has both transactions
      expect(pkg1.transactions.length).toBe(2)

      // Simulate: updatePushTimestamp sets last_push_at = T (the pre-captured timestamp)
      await updatePushTimestamp('device-a', T)

      // --- PUSH 2 --- exports since last_push_at = T
      const state = await getSyncState('device-a')
      expect(state!.last_push_at).toBe(T)

      const pkg2 = await exportSyncPackage(state!.last_push_at, 'device-a')

      // With >= fix: both transactions (updated_at = T) should be re-exported
      // With the old > bug: pkg2.transactions would be empty!
      expect(pkg2.wallets.find(w => w.name === 'MyWallet')).toBeDefined()
      expect(pkg2.accounts.length).toBe(2)
      expect(pkg2.transactions.length).toBe(2)
    })

    it('import is idempotent for re-exported items (last-write-wins skips same timestamp)', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const db = getTestDatabase()

      // Create data on device A
      const walletId = insertWallet({ name: 'IdempotentWallet' })
      const usdId = getCurrencyIdByCode('USD')
      const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })

      insertTransaction({
        account_id: accountId,
        tag_id: SYSTEM_TAGS.EXPENSE,
        sign: '-',
        amount_int: 25,
      })

      // Export from A
      const pkg = await exportSyncPackage(0, 'device-a')
      expect(pkg.wallets.length).toBe(1)
      expect(pkg.transactions.length).toBe(1)

      // Import into B (first time)
      const result1 = await importSyncPackage(pkg)
      expect(result1.errors).toHaveLength(0)

      // Import the same package again (simulates re-export via >=)
      const result2 = await importSyncPackage(pkg)
      expect(result2.errors).toHaveLength(0)

      // The wallet should still exist once, no duplicates
      const wallets = db.exec(`SELECT id FROM wallet WHERE name = 'IdempotentWallet'`)
      expect(wallets[0].values.length).toBe(1)
    })
  })

  // ---------------------------------------------------------------
  // 6. Pre-captured timestamp prevents race condition
  //    If pushTimestamp is captured BEFORE export, items created
  //    AFTER that moment will have updated_at > pushTimestamp,
  //    so the next export (with since = pushTimestamp) will pick
  //    them up.
  // ---------------------------------------------------------------
  describe('pre-captured timestamp prevents race condition', () => {
    it('items created after pushTimestamp are not lost', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')
      const { updatePushTimestamp, ensureSyncState, getSyncState } = await import('../../services/sync/syncRepository')

      const db = getTestDatabase()
      await ensureSyncState('device-a')

      // Step 1: capture pushTimestamp BEFORE export
      const pushTimestamp = 1700000000

      // Step 2: create data that was exported by push 1 (wallet at boundary)
      const walletId = insertWallet({ name: 'ExistingWallet' })

      // Drop triggers so manual updated_at sticks
      dropTriggersOnTestDb()

      db.run(`UPDATE wallet SET updated_at = ? WHERE id = ?`, [pushTimestamp, walletId])

      // Step 3: set last_push_at to pushTimestamp (push 1 completed)
      await updatePushTimestamp('device-a', pushTimestamp)

      // Step 4: a new item is created AFTER the push (user action during push)
      const usdId = getCurrencyIdByCode('USD')
      const lateAccountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
      // Give it a timestamp 1 second after the push
      db.run(`UPDATE account SET updated_at = ? WHERE id = ?`, [pushTimestamp + 1, lateAccountId])

      // Step 5: next export uses since = last_push_at = pushTimestamp
      const state = await getSyncState('device-a')
      const pkg = await exportSyncPackage(state!.last_push_at, 'device-a')

      // The wallet at updated_at = pushTimestamp is included (>= boundary)
      expect(pkg.wallets.find(w => w.name === 'ExistingWallet')).toBeDefined()
      // The late account at updated_at = pushTimestamp + 1 is also included (> boundary)
      expect(pkg.accounts.find(a => a.id === lateAccountId)).toBeDefined()
    })

    it('items created during export window are caught by next push', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')
      const { updatePushTimestamp, ensureSyncState, getSyncState } = await import('../../services/sync/syncRepository')

      const db = getTestDatabase()
      await ensureSyncState('device-a')

      const T = 1700000000

      // Push 1: capture timestamp T, export, set last_push_at = T
      const walletId = insertWallet({ name: 'W1' })

      // Drop triggers so manual updated_at sticks
      dropTriggersOnTestDb()

      db.run(`UPDATE wallet SET updated_at = ? WHERE id = ?`, [T - 1, walletId])

      const pkg1 = await exportSyncPackage(0, 'device-a')
      expect(pkg1.wallets.length).toBe(1)

      await updatePushTimestamp('device-a', T)

      // Meanwhile, during push 1's network call, user creates a new counterparty
      // Its updated_at happens to be T (same second as pushTimestamp)
      const cpId = insertCounterparty({ name: 'RaceCo' })
      db.run(`UPDATE counterparty SET updated_at = ? WHERE id = ?`, [T, cpId])

      // Push 2: export since last_push_at = T
      const state = await getSyncState('device-a')
      const pkg2 = await exportSyncPackage(state!.last_push_at, 'device-a')

      // With >= the counterparty at T is included
      const cp = pkg2.counterparties.find(c => c.name === 'RaceCo')
      expect(cp).toBeDefined()

      // The wallet at T-1 is NOT re-exported (< boundary)
      expect(pkg2.wallets).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------
  // 7. Full roundtrip: export from A, import on B, verify nothing
  //    is lost even when all items share the same timestamp
  // ---------------------------------------------------------------
  describe('full export-import roundtrip at boundary', () => {
    it('device B receives all transactions when everything shares the same timestamp', async () => {
      const { exportSyncPackage } = await import('../../services/sync/syncExport')
      const { importSyncPackage } = await import('../../services/sync/syncImport')

      const db = getTestDatabase()

      // --- Device A: create wallet with two accounts and initial balances ---
      const walletId = insertWallet({ name: 'TestWallet' })
      const usdId = getCurrencyIdByCode('USD')
      const eurId = getCurrencyIdByCode('EUR')
      const usdAccountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
      const eurAccountId = insertAccount({ wallet_id: walletId, currency_id: eurId })

      const usdTrxId = insertTransaction({
        account_id: usdAccountId,
        tag_id: SYSTEM_TAGS.INITIAL,
        sign: '+',
        amount_int: 100,
      })
      const eurTrxId = insertTransaction({
        account_id: eurAccountId,
        tag_id: SYSTEM_TAGS.INITIAL,
        sign: '+',
        amount_int: 500,
      })

      const usdHex = Array.from(usdTrxId).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
      const eurHex = Array.from(eurTrxId).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()

      // Drop triggers so manual updated_at sticks
      dropTriggersOnTestDb()

      // Force everything to timestamp T
      const T = 1700000000
      db.run(`UPDATE wallet SET updated_at = ? WHERE id = ?`, [T, walletId])
      db.run(`UPDATE account SET updated_at = ?`, [T])
      db.run(`UPDATE trx SET updated_at = ?`, [T])
      // Also fix currency updated_at for seed currencies
      db.run(`UPDATE currency SET updated_at = ?`, [T])

      // Export with since = T (the boundary)
      const pkg = await exportSyncPackage(T, 'device-a')

      // Verify export has everything
      expect(pkg.wallets.length).toBe(1)
      expect(pkg.accounts.length).toBe(2)
      expect(pkg.transactions.length).toBe(2)
      expect(pkg.currencies.length).toBeGreaterThanOrEqual(2) // USD + EUR at minimum

      // --- Device B: start fresh and import ---
      // Clear local data to simulate clean device B
      resetTestDatabase()
      dbMock = createDatabaseMock()

      const result = await importSyncPackage(pkg)

      expect(result.errors).toHaveLength(0)
      expect(result.imported.wallets).toBe(1)
      expect(result.imported.accounts).toBe(2)
      expect(result.imported.transactions).toBe(2)

      // Verify both transactions exist on device B
      const trxOnB = db.exec(`SELECT hex(id) FROM trx ORDER BY hex(id)`)
      const trxIds = trxOnB[0].values.map(v => v[0])
      expect(trxIds).toContain(usdHex)
      expect(trxIds).toContain(eurHex)
    })
  })
})
