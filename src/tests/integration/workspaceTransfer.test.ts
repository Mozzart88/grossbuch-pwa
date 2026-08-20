import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
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
  getCurrencyIdByCode,
  getTestDatabase,
} from './setup'
import { SYSTEM_TAGS } from '../../types'

let dbMock: ReturnType<typeof createDatabaseMock>

describe('Workspace Transfer Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  beforeEach(async () => {
    resetTestDatabase()
    dbMock = createDatabaseMock()
    vi.doMock('../../services/database/connection', () => dbMock)

    // Initialize workspace.ts's session state (activeWorkspaceId, sessionDekShared)
    // for real, against the mock — see setup.ts's attachDatabase/detachDatabase no-ops.
    vi.resetModules()
    const { attachActiveWorkspace } = await import('../../services/database/workspace')
    await attachActiveWorkspace('test-dek-shared')
  })

  it('exports the active workspace as a self-contained package', async () => {
    const { exportWorkspacePackage } = await import('../../services/workspaceTransfer/workspaceExport')
    const { getActiveWorkspaceId } = await import('../../services/database/workspace')

    const walletId = insertWallet({ name: 'Cash' })
    const usdId = getCurrencyIdByCode('USD')
    const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId, balance_int: 100 })
    const foodTagId = insertTag({ name: 'ExportFood', parent_ids: [SYSTEM_TAGS.EXPENSE] })
    const cpId = insertCounterparty({ name: 'Grocery Store' })
    insertTransaction({
      account_id: accountId,
      tag_id: foodTagId,
      sign: '-',
      amount_int: 42,
      counterparty_id: cpId,
      note: 'weekly shop',
    })
    insertBudget({ tag_id: foodTagId, amount_int: 500 })

    const activeWorkspaceId = getActiveWorkspaceId()
    expect(activeWorkspaceId).not.toBeNull()

    const pkg = await exportWorkspacePackage(activeWorkspaceId!)

    expect(pkg.version).toBe(1)
    expect(pkg.workspace_name).toBe('Personal')
    expect(pkg.wallets).toEqual([{ id: walletId, name: 'Cash', color: null, tags: [] }])
    expect(pkg.accounts).toHaveLength(1)
    // 100 initial - 42 from the expense transaction below (trg_add_trx_base fires on insert)
    expect(pkg.accounts[0]).toMatchObject({ id: accountId, wallet: walletId, currency: 'USD', balance_int: 58 })
    expect(pkg.currencies).toEqual([expect.objectContaining({ code: 'USD' })])
    expect(pkg.counterparties).toEqual([{ name: 'Grocery Store', note: null, tags: [] }])
    expect(pkg.tags.map(t => t.name)).toContain('ExportFood')
    // System tag 'expense' referenced as ExportFood's parent must NOT be exported
    // (every installation pre-seeds system tags identically — see workspaceExport.ts)
    expect(pkg.tags.some(t => t.name === 'expense')).toBe(false)
    expect(pkg.transactions).toHaveLength(1)
    expect(pkg.transactions[0]).toMatchObject({
      counterparty: 'Grocery Store',
      note: 'weekly shop',
      lines: [expect.objectContaining({ account: accountId, tag: 'ExportFood', sign: '-', amount_int: 42 })],
    })
    expect(pkg.budgets).toHaveLength(1)
    expect(pkg.budgets[0]).toMatchObject({ tag: 'ExportFood', amount_int: 500 })
  })

  it('includes tag icons and hierarchy in the exported package', async () => {
    const { exportWorkspacePackage } = await import('../../services/workspaceTransfer/workspaceExport')
    const { getActiveWorkspaceId } = await import('../../services/database/workspace')

    const iconId = insertIcon({ value: 'basket' })
    const tagId = insertTag({ name: 'Snacks', parent_ids: [SYSTEM_TAGS.EXPENSE] })
    insertTagIcon({ tag_id: tagId, icon_id: iconId })

    const walletId = insertWallet({ name: 'W' })
    const usdId = getCurrencyIdByCode('USD')
    const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
    insertTransaction({ account_id: accountId, tag_id: tagId, sign: '-', amount_int: 5 })

    const pkg = await exportWorkspacePackage(getActiveWorkspaceId()!)

    const snacksTag = pkg.tags.find(t => t.name === 'Snacks')
    expect(snacksTag?.icon).toBe('basket')
    expect(pkg.icons).toEqual([{ value: 'basket' }])
  })

  it('round-trips through export and merge-import into the same workspace, reconciling existing entities and creating new ones', async () => {
    const { exportWorkspacePackage } = await import('../../services/workspaceTransfer/workspaceExport')
    const { importWorkspacePackage } = await import('../../services/workspaceTransfer/workspaceImport')
    const { getActiveWorkspaceId } = await import('../../services/database/workspace')

    const walletId = insertWallet({ name: 'Cash' })
    const usdId = getCurrencyIdByCode('USD')
    const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId, balance_int: 10 })
    const tagId = insertTag({ name: 'RoundTripTag', parent_ids: [SYSTEM_TAGS.EXPENSE] })
    const cpId = insertCounterparty({ name: 'Existing Counterparty' })
    insertTransaction({ account_id: accountId, tag_id: tagId, sign: '-', amount_int: 7, counterparty_id: cpId })

    const activeWorkspaceId = getActiveWorkspaceId()!
    const pkg = await exportWorkspacePackage(activeWorkspaceId)

    const db = getTestDatabase()
    const tagCountBefore = db.exec(`SELECT COUNT(*) FROM shared.tag WHERE name = 'RoundTripTag'`)[0].values[0][0]
    const cpCountBefore = db.exec(`SELECT COUNT(*) FROM shared.counterparty WHERE name = 'Existing Counterparty'`)[0].values[0][0]
    expect(tagCountBefore).toBe(1)
    expect(cpCountBefore).toBe(1)

    // insertTransaction() is a raw-SQL test helper (bypasses transactionRepository,
    // so it doesn't maintain tag_references itself) — capture the pre-import
    // count as the baseline for the 8.6 delta assertion below, rather than
    // assuming it reflects the transaction inserted above.
    const tagRefCountBefore = (db.exec(`SELECT count FROM shared.tag_references WHERE tag_id = ${tagId}`)[0]?.values[0]?.[0] as number) ?? 0

    const result = await importWorkspacePackage(pkg, { mergeIntoWorkspaceId: activeWorkspaceId })

    expect(result.workspaceId).toBe(activeWorkspaceId)
    expect(result.imported.wallets).toBe(1)
    expect(result.imported.accounts).toBe(1)
    expect(result.imported.transactions).toBe(1)

    // Reconciliation must REUSE the existing tag/counterparty, not duplicate them
    const tagCountAfter = db.exec(`SELECT COUNT(*) FROM shared.tag WHERE name = 'RoundTripTag'`)[0].values[0][0]
    const cpCountAfter = db.exec(`SELECT COUNT(*) FROM shared.counterparty WHERE name = 'Existing Counterparty'`)[0].values[0][0]
    expect(tagCountAfter).toBe(1)
    expect(cpCountAfter).toBe(1)

    // wallet.name is unique within a workspace, so the existing 'Cash' wallet is reused —
    // but account/transaction data has no natural key, so it's duplicated (always net-new)
    const walletCount = db.exec(`SELECT COUNT(*) FROM workspace.wallet WHERE name = 'Cash'`)[0].values[0][0]
    expect(walletCount).toBe(1)
    const trxCount = db.exec(`SELECT COUNT(*) FROM workspace.trx_base`)[0].values[0][0]
    expect(trxCount).toBe(2)

    // 8.6: tag_references stays correct after a bulk workspace import — the
    // imported trx_base row references the reconciled (reused) tag, so its
    // count must go up by exactly one.
    const tagRefCountAfter = db.exec(`SELECT count FROM shared.tag_references WHERE tag_id = ${tagId}`)[0].values[0][0]
    expect(tagRefCountAfter).toBe(tagRefCountBefore + 1)
  })

  it('does not double-count tag_references when merge-import reuses a wallet that already carries the same tag', async () => {
    const { exportWorkspacePackage } = await import('../../services/workspaceTransfer/workspaceExport')
    const { importWorkspacePackage } = await import('../../services/workspaceTransfer/workspaceImport')
    const { getActiveWorkspaceId } = await import('../../services/database/workspace')

    const walletId = insertWallet({ name: 'Tagged Wallet', is_default: true })
    const activeWorkspaceId = getActiveWorkspaceId()!
    const pkg = await exportWorkspacePackage(activeWorkspaceId)
    expect(pkg.wallets[0].tags).toContain('default')

    const db = getTestDatabase()
    const refBefore = (db.exec(`SELECT count FROM shared.tag_references WHERE tag_id = ${SYSTEM_TAGS.DEFAULT}`)[0]?.values[0]?.[0] as number) ?? 0

    await importWorkspacePackage(pkg, { mergeIntoWorkspaceId: activeWorkspaceId })

    // 'Tagged Wallet' is reused (matched by name), so wallet_to_tags must not
    // gain a second row for a tag it already carries, and tag_references must
    // not be incremented for a no-op insert.
    const walletTagRows = db.exec(`SELECT COUNT(*) FROM workspace.wallet_to_tags WHERE wallet_id = ${walletId} AND tag_id = ${SYSTEM_TAGS.DEFAULT}`)[0].values[0][0]
    expect(walletTagRows).toBe(1)
    const refAfter = (db.exec(`SELECT count FROM shared.tag_references WHERE tag_id = ${SYSTEM_TAGS.DEFAULT}`)[0]?.values[0]?.[0] as number) ?? 0
    expect(refAfter).toBe(refBefore)
  })

  it('resolves system tags used directly by transactions even though they are never exported', async () => {
    const { exportWorkspacePackage } = await import('../../services/workspaceTransfer/workspaceExport')
    const { importWorkspacePackage } = await import('../../services/workspaceTransfer/workspaceImport')
    const { getActiveWorkspaceId } = await import('../../services/database/workspace')

    const walletId = insertWallet({ name: 'Income Wallet' })
    const usdId = getCurrencyIdByCode('USD')
    const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
    insertTransaction({ account_id: accountId, tag_id: SYSTEM_TAGS.INCOME, sign: '+', amount_int: 1000 })

    const activeWorkspaceId = getActiveWorkspaceId()!
    const pkg = await exportWorkspacePackage(activeWorkspaceId)

    expect(pkg.transactions[0].lines[0].tag).toBe('income')
    expect(pkg.tags.some(t => t.name === 'income')).toBe(false)

    const result = await importWorkspacePackage(pkg, { mergeIntoWorkspaceId: activeWorkspaceId })
    expect(result.imported.transactions).toBe(1)

    const db = getTestDatabase()
    const incomeLines = db.exec(`SELECT COUNT(*) FROM workspace.trx_base WHERE tag_id = ${SYSTEM_TAGS.INCOME}`)[0].values[0][0]
    expect(incomeLines).toBe(2) // original + imported copy, both correctly resolved to the real system tag id
  })

  it('creates a new workspace by default and restores the original active workspace afterward', async () => {
    const { exportWorkspacePackage } = await import('../../services/workspaceTransfer/workspaceExport')
    const { importWorkspacePackage } = await import('../../services/workspaceTransfer/workspaceImport')
    const { getActiveWorkspaceId } = await import('../../services/database/workspace')

    const walletId = insertWallet({ name: 'Cash' })
    const usdId = getCurrencyIdByCode('USD')
    const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
    insertTransaction({ account_id: accountId, tag_id: SYSTEM_TAGS.EXPENSE, sign: '-', amount_int: 3 })

    const originalActiveId = getActiveWorkspaceId()!
    const pkg = await exportWorkspacePackage(originalActiveId)
    pkg.workspace_name = 'Business'

    const result = await importWorkspacePackage(pkg)

    expect(result.workspaceId).not.toBe(originalActiveId)
    expect(getActiveWorkspaceId()).toBe(originalActiveId) // restored, not left on the new workspace

    const db = getTestDatabase()
    const newWorkspaceRow = db.exec(`SELECT name FROM shared.workspace WHERE id = ${result.workspaceId}`)
    expect(newWorkspaceRow[0].values[0][0]).toBe('Business')
  })
})
