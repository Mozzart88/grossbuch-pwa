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

    // 1. Create a budget: $500.00 => amount_int=500, amount_frac=0
    const budget = await budgetRepository.create({
      tag_id: SYSTEM_TAGS.FOOD,
      amount_int: 500,
      amount_frac: 0,
    })

    expect(budget.tag_id).toBe(SYSTEM_TAGS.FOOD)
    expect(budget.amount_int).toBe(500)
    expect(budget.amount_frac).toBe(0)

    // 2. Find by month
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const budgets = await budgetRepository.findByMonth(currentMonth)
    expect(budgets).toHaveLength(1)
    expect(budgets[0].tag).toBe('Food')

    // 3. Update
    const updated = await budgetRepository.update(budget.id, { amount_int: 750, amount_frac: 0 })
    expect(updated.amount_int).toBe(750)
    expect(updated.amount_frac).toBe(0)

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
      balance_int: 1000,
    })
    const tagId = insertTag({ name: 'Groceries' })

    // Create budget for the new tag: $100.00
    await budgetRepository.create({
      tag_id: tagId,
      amount_int: 100,
      amount_frac: 0,
    })

    // Insert transactions for this tag
    // $25.00 with rate 1.0 (rate_int=1, rate_frac=0)
    insertTransaction({
      account_id: accountId,
      tag_id: tagId,
      sign: '-',
      amount_int: 25,
      rate_int: 1,
      timestamp: Math.floor(Date.now() / 1000),
    })

    // $15.00 with rate 1.0
    insertTransaction({
      account_id: accountId,
      tag_id: tagId,
      sign: '-',
      amount_int: 15,
      rate_int: 1,
      timestamp: Math.floor(Date.now() / 1000),
    })

    // Verify actual spending
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const budgets = await budgetRepository.findByMonth(currentMonth)

    const groceriesBudget = budgets.find(b => b.tag_id === tagId)
    expect(groceriesBudget).toBeDefined()
    // findByMonth converts amounts to default currency
    // With rate_int=1 (1.0) and USD: actual = 25/1 + 15/1 = 40
    expect(groceriesBudget?.actual).toBeCloseTo(40, 1)
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
      balance_int: 1000,
    })

    // EUR account
    const eurAccountId = insertAccount({
      wallet_id: walletId,
      currency_id: 2, // EUR from seed (decimal_places=2)
      balance_int: 1000,
    })

    const tagId = insertTag({ name: 'Shopping' })

    // Create budget for the tag: $200.00
    await budgetRepository.create({
      tag_id: tagId,
      amount_int: 200,
      amount_frac: 0,
    })

    // Insert USD transaction: $50.00 (rate=1.0 USD/USD)
    insertTransaction({
      account_id: usdAccountId,
      tag_id: tagId,
      sign: '-',
      amount_int: 50,
      rate_int: 1, // 1.0 (USD to USD)
      timestamp: Math.floor(Date.now() / 1000),
    })

    // Insert EUR transaction: 40.00 EUR with rate of 0.90 (1 EUR = 1.11 USD)
    // rate_int=0, rate_frac=0.9*10^18 = 900000000000000000
    insertTransaction({
      account_id: eurAccountId,
      tag_id: tagId,
      sign: '-',
      amount_int: 40,
      rate_int: 0,
      rate_frac: 900000000000000000,
      timestamp: Math.floor(Date.now() / 1000),
    })

    // Verify actual spending is converted to USD
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const budgets = await budgetRepository.findByMonth(currentMonth)

    const shoppingBudget = budgets.find(b => b.tag_id === tagId)
    expect(shoppingBudget).toBeDefined()
    // USD: 50 / 1.0 = 50
    // EUR: 40 / 0.9 = 44.44...
    // Total: ~94.44
    expect(shoppingBudget?.actual).toBeGreaterThan(90)
    expect(shoppingBudget?.actual).toBeLessThan(100)
  })

  it('should correctly handle budget summaries from the summary view', async () => {
    const budgetRepository = await getRepository()

    // Setup: Create a tag and some spending
    const walletId = insertWallet({ name: 'Test Wallet' })
    const accountId = insertAccount({
      wallet_id: walletId,
      currency_id: 1,
      balance_int: 1000,
    })
    const tagId = insertTag({ name: 'test-tag', parent_ids: [10] })

    insertBudget({
      tag_id: tagId,
      amount_int: 50,
      amount_frac: 0,
      start: Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000),
      end: Math.floor(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getTime() / 1000),
    })

    // Insert transaction: amount_int=20, rate_int=1 (rate=1.0)
    insertTransaction({
      account_id: accountId,
      tag_id: tagId,
      sign: '-',
      amount_int: 20,
      rate_int: 1,
      timestamp: Math.floor(Date.now() / 1000),
    })

    const summary = await budgetRepository.getSummary()
    expect(summary).toBeDefined()
    expect(Array.isArray(summary)).toBe(true)
    const transportSummary = summary.find(s => s.tag === 'test-tag')

    expect(transportSummary).toBeDefined()
    // amount from the view is budget.amount_int + budget.amount_frac * 1e-18 = 50
    expect(transportSummary?.amount).toBeCloseTo(50, 1)
    // actual = abs(sum(sign * amount / rate)) = abs(-20 / 1) = 20
    expect(transportSummary?.actual).toBeCloseTo(20, 1)
  })

  it('should not allow duplicate budgets for the same tag and period', async () => {
    const budgetRepository = await getRepository()

    await budgetRepository.create({
      tag_id: SYSTEM_TAGS.FOOD,
      amount_int: 500,
      amount_frac: 0,
    })

    await expect(budgetRepository.create({
      tag_id: SYSTEM_TAGS.FOOD,
      amount_int: 600,
      amount_frac: 0,
    })).rejects.toThrow('A budget already exists for this tag and period')
  })
})
