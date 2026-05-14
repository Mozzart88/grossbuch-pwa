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
      end: Math.floor(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime() / 1000),
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

  it('allows separate budgets for the same shared tag in different contexts', async () => {
    const budgetRepository = await getRepository()
    const autoId = insertTag({ name: 'Budget Auto', parent_ids: [SYSTEM_TAGS.EXPENSE] })
    const boatId = insertTag({ name: 'Budget Boat', parent_ids: [SYSTEM_TAGS.EXPENSE] })
    const maintenanceId = insertTag({ name: 'Budget Maintenance', parent_ids: [autoId, boatId] })

    const now = new Date()
    const start = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000)
    const end = Math.floor(new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() / 1000)

    await budgetRepository.create({
      tag_id: maintenanceId,
      tag_context_id: autoId,
      amount_int: 100,
      amount_frac: 0,
      start,
      end,
    })
    await budgetRepository.create({
      tag_id: maintenanceId,
      tag_context_id: boatId,
      amount_int: 200,
      amount_frac: 0,
      start,
      end,
    })

    await expect(budgetRepository.create({
      tag_id: maintenanceId,
      tag_context_id: autoId,
      amount_int: 300,
      amount_frac: 0,
      start,
      end,
    })).rejects.toThrow('A budget already exists for this tag and period')

    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const budgets = await budgetRepository.findByMonth(currentMonth)
    expect(budgets.filter(b => b.tag_id === maintenanceId)).toHaveLength(2)
    expect(budgets.find(b => b.tag_context_id === autoId)?.amount_int).toBe(100)
    expect(budgets.find(b => b.tag_context_id === boatId)?.amount_int).toBe(200)
  })

  it('calculates contextual budget actuals by matching transaction context', async () => {
    const budgetRepository = await getRepository()
    const walletId = insertWallet({ name: 'Context Wallet' })
    const accountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance_int: 1000 })
    const autoId = insertTag({ name: 'Actual Auto', parent_ids: [SYSTEM_TAGS.EXPENSE] })
    const boatId = insertTag({ name: 'Actual Boat', parent_ids: [SYSTEM_TAGS.EXPENSE] })
    const dieselId = insertTag({ name: 'Actual Diesel', parent_ids: [autoId, boatId] })

    await budgetRepository.create({
      tag_id: dieselId,
      tag_context_id: autoId,
      amount_int: 100,
      amount_frac: 0,
    })
    await budgetRepository.create({
      tag_id: dieselId,
      tag_context_id: boatId,
      amount_int: 100,
      amount_frac: 0,
    })

    insertTransaction({
      account_id: accountId,
      tag_id: dieselId,
      tag_context_id: autoId,
      sign: '-',
      amount_int: 25,
      rate_int: 1,
      timestamp: Math.floor(Date.now() / 1000),
    })
    insertTransaction({
      account_id: accountId,
      tag_id: dieselId,
      tag_context_id: boatId,
      sign: '-',
      amount_int: 40,
      rate_int: 1,
      timestamp: Math.floor(Date.now() / 1000),
    })

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const budgets = await budgetRepository.findByMonth(currentMonth)
    expect(budgets.find(b => b.tag_context_id === autoId)?.actual).toBeCloseTo(25, 1)
    expect(budgets.find(b => b.tag_context_id === boatId)?.actual).toBeCloseTo(40, 1)
  })

  it('calculates savings and credit budget actuals from inbound transfer and exchange lines', async () => {
    const budgetRepository = await getRepository()
    const db = getTestDatabase()
    const walletId = insertWallet({ name: 'Account Budget Wallet' })
    const plainAccountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance_int: 1000 })
    const savingsAccountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance_int: 0 })
    const creditAccountId = insertAccount({ wallet_id: walletId, currency_id: 1, balance_int: -300 })
    const savingsTagId = Number(db.exec("SELECT id FROM tag WHERE name = 'savings'")[0].values[0][0])
    const creditsTagId = Number(db.exec("SELECT id FROM tag WHERE name = 'credits'")[0].values[0][0])

    db.run('INSERT INTO account_to_tags (account_id, tag_id) VALUES (?, ?)', [savingsAccountId, savingsTagId])
    db.run('INSERT INTO account_to_tags (account_id, tag_id) VALUES (?, ?)', [creditAccountId, creditsTagId])

    await budgetRepository.create({
      tag_id: savingsTagId,
      amount_int: 100,
      amount_frac: 0,
      type: 'expense',
    })
    await budgetRepository.create({
      tag_id: creditsTagId,
      amount_int: 200,
      amount_frac: 0,
      type: 'expense',
    })

    const now = Math.floor(Date.now() / 1000)
    insertTransaction({
      account_id: savingsAccountId,
      tag_id: SYSTEM_TAGS.TRANSFER,
      sign: '+',
      amount_int: 60,
      rate_int: 1,
      timestamp: now,
    })
    insertTransaction({
      account_id: savingsAccountId,
      tag_id: SYSTEM_TAGS.EXCHANGE,
      sign: '+',
      amount_int: 15,
      rate_int: 1,
      timestamp: now,
    })
    insertTransaction({
      account_id: savingsAccountId,
      tag_id: SYSTEM_TAGS.TRANSFER,
      sign: '-',
      amount_int: 10,
      rate_int: 1,
      timestamp: now,
    })
    insertTransaction({
      account_id: plainAccountId,
      tag_id: SYSTEM_TAGS.TRANSFER,
      sign: '+',
      amount_int: 999,
      rate_int: 1,
      timestamp: now,
    })
    insertTransaction({
      account_id: creditAccountId,
      tag_id: SYSTEM_TAGS.TRANSFER,
      sign: '+',
      amount_int: 120,
      rate_int: 1,
      timestamp: now,
    })
    insertTransaction({
      account_id: creditAccountId,
      tag_id: SYSTEM_TAGS.FOOD,
      sign: '-',
      amount_int: 45,
      rate_int: 1,
      timestamp: now,
    })

    const date = new Date(now * 1000)
    const currentMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const budgets = await budgetRepository.findByMonth(currentMonth)

    expect(budgets.find(b => b.tag_id === savingsTagId)?.actual).toBeCloseTo(75, 1)
    expect(budgets.find(b => b.tag_id === creditsTagId)?.actual).toBeCloseTo(120, 1)
  })
})
