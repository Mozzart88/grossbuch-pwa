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
        expect(budgets[0].tag).toBe('food')

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
        // findByMonth sums amounts directly (not using rate)
        // actual = abs(sum(amounts)) = 2500 + 1500 = 4000
        expect(groceriesBudget?.actual).toBe(4000)
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
        const tagId = insertTag({ name: 'Transport' })

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
        const transportSummary = summary.find(s => s.tag === 'Transport')

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
