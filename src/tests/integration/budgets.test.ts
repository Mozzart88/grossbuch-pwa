import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  createDatabaseMock,
  insertWallet,
  insertAccount,
  insertTag,
  insertTransaction,
  insertBudget,
  getTestDatabase,
} from './setup'
import { SYSTEM_TAGS } from '../../types'

describe('Budget Integration', () => {
  let dbMock: ReturnType<typeof createDatabaseMock>

  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  beforeEach(async () => {
    resetTestDatabase()
    dbMock = createDatabaseMock()
    vi.doMock('../../services/database', () => dbMock)
  })

  // Import repository AFTER mocking database
  const getRepository = async () => {
    const { budgetRepository } = await import('../../services/repositories/budgetRepository')
    return budgetRepository
  }

  it('should perform CRUD operations on budgets', async () => {
    const budgetRepository = await getRepository()

    // 1. Create a budget
    const budget = await budgetRepository.create({
      tag_id: SYSTEM_TAGS.FOOD,
      amount: 50000, // $500.00
    })

    expect(budget.tag_id).toBe(SYSTEM_TAGS.FOOD)
    expect(budget.amount).toBe(50000)

    // 2. Find by month
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const budgets = await budgetRepository.findByMonth(currentMonth)
    expect(budgets).toHaveLength(1)
    expect(budgets[0].tag).toBe('Food')

    // 3. Update
    const updated = await budgetRepository.update(budget.id, { amount: 75000 })
    expect(updated.amount).toBe(75000)

    // 4. Delete
    await budgetRepository.delete(budget.id)
    const finalBudgets = await budgetRepository.findAll()
    expect(finalBudgets).toHaveLength(0)
  })

  it('should calculate actual spending correctly', async () => {
    const budgetRepository = await getRepository()

    // Setup: Create a wallet, account and a tag
    const walletId = insertWallet({ name: 'Test Wallet' })
    const accountId = insertAccount({
      wallet_id: walletId,
      currency_id: 1, // USD from seed
      balance: 100000,
    })
    const tagId = insertTag({ name: 'Groceries' })

    // Create budget for the new tag
    await budgetRepository.create({
      tag_id: tagId,
      amount: 10000, // $100.00
    })

    // Insert transactions for this tag
    insertTransaction({
      account_id: accountId,
      tag_id: tagId,
      sign: '-',
      amount: 2500,
      rate: 100, // rate of 1.0 (integer representation)
      timestamp: Math.floor(Date.now() / 1000),
    })

    insertTransaction({
      account_id: accountId,
      tag_id: tagId,
      sign: '-',
      amount: 1500,
      rate: 100, // rate of 1.0
      timestamp: Math.floor(Date.now() / 1000),
    })

    // Verify actual spending
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const budgets = await budgetRepository.findByMonth(currentMonth)

    const groceriesBudget = budgets.find(b => b.tag_id === tagId)
    expect(groceriesBudget).toBeDefined()
    // findByMonth converts amounts to default currency
    // With rate=100 (1.0) and USD (2 decimal places):
    // actual = (2500 * 0.01) / (100 * 0.01) * 100 + (1500 * 0.01) / (100 * 0.01) * 100 = 4000
    expect(groceriesBudget?.actual).toBe(4000)
  })

  it('should convert multi-currency transactions to default currency', async () => {
    const budgetRepository = await getRepository()
    const db = getTestDatabase()

    // Setup: Create a wallet with EUR account
    const walletId = insertWallet({ name: 'Multi-Currency Wallet' })

    // USD account (default currency)
    const usdAccountId = insertAccount({
      wallet_id: walletId,
      currency_id: 1, // USD from seed (decimal_places=2)
      balance: 100000,
    })

    // EUR account
    const eurAccountId = insertAccount({
      wallet_id: walletId,
      currency_id: 2, // EUR from seed (decimal_places=2)
      balance: 100000,
    })

    const tagId = insertTag({ name: 'Shopping' })

    // Create budget for the tag
    await budgetRepository.create({
      tag_id: tagId,
      amount: 20000, // $200.00
    })

    // Insert USD transaction: $50.00 (rate=100 means 1.0 USD/USD)
    insertTransaction({
      account_id: usdAccountId,
      tag_id: tagId,
      sign: '-',
      amount: 5000, // $50.00
      rate: 100, // 1.0 (USD to USD)
      timestamp: Math.floor(Date.now() / 1000),
    })

    // Insert EUR transaction: €40.00 with rate of 0.90 (1 EUR = 1.11 USD)
    // rate = 90 means 0.90, so 40 EUR = 40 / 0.90 = 44.44 USD
    insertTransaction({
      account_id: eurAccountId,
      tag_id: tagId,
      sign: '-',
      amount: 4000, // €40.00
      rate: 90, // 0.90 EUR/USD
      timestamp: Math.floor(Date.now() / 1000),
    })

    // Verify actual spending is converted to USD
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const budgets = await budgetRepository.findByMonth(currentMonth)

    const shoppingBudget = budgets.find(b => b.tag_id === tagId)
    expect(shoppingBudget).toBeDefined()
    // USD: (5000 * 0.01) / (100 * 0.01) * 100 = 5000
    // EUR: (4000 * 0.01) / (90 * 0.01) * 100 = 40 / 0.9 * 100 = 4444.44 ≈ 4444
    // Total: 5000 + 4444 = 9444 (rounded)
    expect(shoppingBudget?.actual).toBeGreaterThan(9000)
    expect(shoppingBudget?.actual).toBeLessThan(10000)
  })

  it('should correctly handle budget summaries from the summary view', async () => {
    const budgetRepository = await getRepository()

    // Setup: Create a tag and some spending
    const walletId = insertWallet({ name: 'Test Wallet' })
    const accountId = insertAccount({
      wallet_id: walletId,
      currency_id: 1,
      balance: 100000,
    })
    const tagId = insertTag({ name: 'test-tag', parent_ids: [10] })

    insertBudget({
      tag_id: tagId,
      amount: 5000,
      start: Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000),
      end: Math.floor(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getTime() / 1000),
    })

    insertTransaction({
      account_id: accountId,
      tag_id: tagId,
      sign: '-',
      amount: 2000,
      rate: 100, // rate of 1.0 (integer representation)
      timestamp: Math.floor(Date.now() / 1000),
    })

    const summary = await budgetRepository.getSummary()
    expect(summary).toBeDefined()
    expect(Array.isArray(summary)).toBe(true)
    const transportSummary = summary.find(s => s.tag === 'test-tag')

    expect(transportSummary).toBeDefined()
    expect(transportSummary?.amount).toBe(5000)
    // actual = abs(sum(sign * amount * rate)) = abs(-2000 * 100) = 200000
    expect(transportSummary?.actual).toBe(200000)
  })

  it('should not allow duplicate budgets for the same tag and period', async () => {
    const budgetRepository = await getRepository()

    await budgetRepository.create({
      tag_id: SYSTEM_TAGS.FOOD,
      amount: 50000,
    })

    await expect(budgetRepository.create({
      tag_id: SYSTEM_TAGS.FOOD,
      amount: 60000,
    })).rejects.toThrow('A budget already exists for this tag and period')
  })
})
