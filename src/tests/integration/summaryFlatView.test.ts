import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  createDatabaseMock,
  insertWallet,
  insertAccount,
  insertTransaction,
  insertTag,
} from './setup'
import { SYSTEM_TAGS } from '../../types'

describe('Summary Flat View Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  beforeEach(() => {
    resetTestDatabase()
    const dbMock = createDatabaseMock()
    vi.doMock('../../services/database', () => dbMock)
  })

  const getRepository = async () => {
    const { transactionRepository } = await import('../../services/repositories/transactionRepository')
    return transactionRepository
  }

  const YEAR_MONTH = '2025-06'
  const TIMESTAMP = Math.floor(new Date(`${YEAR_MONTH}-15T12:00:00`).getTime() / 1000)

  it('merges a shared tag\'s direct transactions across two different parent branches into one row', async () => {
    const transactionRepository = await getRepository()

    const walletId = insertWallet({ name: 'Cash' })
    const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

    const autoId = insertTag({ name: 'Flat Auto', parent_ids: [SYSTEM_TAGS.EXPENSE] })
    const boatId = insertTag({ name: 'Flat Boat', parent_ids: [SYSTEM_TAGS.EXPENSE] })
    const maintenanceId = insertTag({ name: 'Flat Maintenance', parent_ids: [autoId, boatId] })

    insertTransaction({
      account_id: accountId,
      tag_id: maintenanceId,
      sign: '-',
      amount_int: 30,
      rate_int: 1,
      tag_context_id: autoId,
      timestamp: TIMESTAMP,
    })
    insertTransaction({
      account_id: accountId,
      tag_id: maintenanceId,
      sign: '-',
      amount_int: 45,
      rate_int: 1,
      tag_context_id: boatId,
      timestamp: TIMESTAMP,
    })

    const categoryFlat = await transactionRepository.getMonthlyCategoryBreakdownFlat(YEAR_MONTH)
    const maintenanceRows = categoryFlat.filter(c => c.tag_id === maintenanceId)
    expect(maintenanceRows).toHaveLength(1)
    expect(maintenanceRows[0].amount).toBeCloseTo(75, 5)
    expect(maintenanceRows[0].tag_context_id ?? null).toBeNull()

    const tagsFlat = await transactionRepository.getMonthlyTagsSummaryFlat(YEAR_MONTH)
    const maintenanceRowsTags = tagsFlat.filter(t => t.tag_id === maintenanceId)
    expect(maintenanceRowsTags).toHaveLength(1)
    expect(maintenanceRowsTags[0].expense).toBeCloseTo(75, 5)
  })

  it('shows a top-level tag\'s own direct amount only, even when its child has transactions', async () => {
    const transactionRepository = await getRepository()

    const walletId = insertWallet({ name: 'Cash' })
    const accountId = insertAccount({ wallet_id: walletId, currency_id: 1 })

    const foodId = insertTag({ name: 'Flat Food', parent_ids: [SYSTEM_TAGS.EXPENSE] })
    const waterId = insertTag({ name: 'Flat Water', parent_ids: [foodId] })

    insertTransaction({
      account_id: accountId,
      tag_id: foodId,
      sign: '-',
      amount_int: 100,
      rate_int: 1,
      timestamp: TIMESTAMP,
    })
    insertTransaction({
      account_id: accountId,
      tag_id: waterId,
      sign: '-',
      amount_int: 50,
      rate_int: 1,
      timestamp: TIMESTAMP,
    })

    const categoryFlat = await transactionRepository.getMonthlyCategoryBreakdownFlat(YEAR_MONTH)
    const foodRow = categoryFlat.find(c => c.tag_id === foodId)
    const waterRow = categoryFlat.find(c => c.tag_id === waterId)

    expect(foodRow?.amount).toBeCloseTo(100, 5)
    expect(waterRow?.amount).toBeCloseTo(50, 5)

    // Reconciliation: sum of flat-view leaf amounts under a top-level tag
    // plus that tag's own flat amount equals the tree-view subtotal for
    // that top-level tag.
    const categoryTree = await transactionRepository.getMonthlyCategoryBreakdown(YEAR_MONTH)
    const foodTreeSubtotal = categoryTree.find(c => c.tag_id === foodId && (c.tag_context_id ?? null) === null)

    expect(foodTreeSubtotal?.amount).toBeCloseTo((foodRow?.amount ?? 0) + (waterRow?.amount ?? 0), 5)
  })
})
