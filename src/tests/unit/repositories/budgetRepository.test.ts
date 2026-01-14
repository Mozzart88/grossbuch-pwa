import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Budget, BudgetInput, BudgetSummary } from '../../../types'
import { SYSTEM_TAGS } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
    execSQL: vi.fn(),
    querySQL: vi.fn(),
    queryOne: vi.fn(),
}))

import { budgetRepository } from '../../../services/repositories/budgetRepository'
import { execSQL, querySQL, queryOne } from '../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)

// Helper to create a mock UUID
const mockId = () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
const mockHexId = '0102030405060708090A0B0C0D0E0F10'

const sampleBudget: Budget = {
    id: mockId(),
    start: 1704067200, // Jan 1, 2024
    end: 1706745600, // Feb 1, 2024
    tag_id: SYSTEM_TAGS.FOOD,
    amount: 50000, // $500.00
    tag: 'food',
}

describe('budgetRepository', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('findAll', () => {
        it('returns all budgets with tag names', async () => {
            const budgets = [sampleBudget, { ...sampleBudget, tag_id: SYSTEM_TAGS.TRANSPORT, tag: 'transport' }]
            mockQuerySQL.mockResolvedValue(budgets)

            const result = await budgetRepository.findAll()

            expect(mockQuerySQL).toHaveBeenCalledWith(
                expect.stringContaining('SELECT')
            )
            expect(result).toEqual(budgets)
        })

        it('returns empty array when no budgets exist', async () => {
            mockQuerySQL.mockResolvedValue([])

            const result = await budgetRepository.findAll()

            expect(result).toEqual([])
        })

        it('orders by start date descending', async () => {
            mockQuerySQL.mockResolvedValue([])

            await budgetRepository.findAll()

            expect(mockQuerySQL).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY b.start DESC')
            )
        })
    })

    describe('findById', () => {
        it('returns budget when found', async () => {
            mockQueryOne.mockResolvedValue(sampleBudget)

            const result = await budgetRepository.findById(mockId())

            expect(mockQueryOne).toHaveBeenCalledWith(
                expect.stringContaining('hex(b.id) = ?'),
                [mockHexId]
            )
            expect(result).toEqual(sampleBudget)
        })

        it('returns null when budget not found', async () => {
            mockQueryOne.mockResolvedValue(null)

            const result = await budgetRepository.findById(mockId())

            expect(result).toBeNull()
        })
    })

    describe('findByMonth', () => {
        it('returns budgets for specified month', async () => {
            mockQuerySQL.mockResolvedValue([{ ...sampleBudget, actual: 25000 }])

            const result = await budgetRepository.findByMonth('2024-01')

            expect(mockQuerySQL).toHaveBeenCalledWith(
                expect.stringContaining('WHERE b.start >= ? AND b.start < ?'),
                expect.arrayContaining([expect.any(Number), expect.any(Number)])
            )
            expect(result[0].actual).toBe(25000)
        })

        it('calculates actual spending from transactions', async () => {
            mockQuerySQL.mockResolvedValue([])

            await budgetRepository.findByMonth('2024-01')

            expect(mockQuerySQL).toHaveBeenCalledWith(
                expect.stringContaining('SELECT COALESCE(ABS(SUM'),
                expect.anything()
            )
        })
    })

    describe('findByTagId', () => {
        it('returns all budgets for a tag', async () => {
            mockQuerySQL.mockResolvedValue([sampleBudget])

            const result = await budgetRepository.findByTagId(SYSTEM_TAGS.FOOD)

            expect(mockQuerySQL).toHaveBeenCalledWith(
                expect.stringContaining('WHERE b.tag_id = ?'),
                [SYSTEM_TAGS.FOOD]
            )
            expect(result).toEqual([sampleBudget])
        })
    })

    describe('findActive', () => {
        it('returns budgets for current period', async () => {
            mockQuerySQL.mockResolvedValue([{ ...sampleBudget, actual: 10000 }])

            const result = await budgetRepository.findActive()

            expect(mockQuerySQL).toHaveBeenCalledWith(
                expect.stringContaining('WHERE b.start <= ? AND b.end > ?'),
                expect.arrayContaining([expect.any(Number), expect.any(Number)])
            )
            expect(result).toHaveLength(1)
        })

        it('includes actual spending in results', async () => {
            mockQuerySQL.mockResolvedValue([{ ...sampleBudget, actual: 30000 }])

            const result = await budgetRepository.findActive()

            expect(result[0].actual).toBe(30000)
        })
    })

    describe('getSummary', () => {
        it('returns budget summary from view', async () => {
            const summary: BudgetSummary[] = [{ tag: 'food', amount: 50000, actual: 25000 }]
            mockQuerySQL.mockResolvedValue(summary)

            const result = await budgetRepository.getSummary()

            expect(mockQuerySQL).toHaveBeenCalledWith('SELECT * FROM summary')
            expect(result).toEqual(summary)
        })
    })

    describe('create', () => {
        it('creates a new budget', async () => {
            const input: BudgetInput = {
                tag_id: SYSTEM_TAGS.FOOD,
                amount: 50000,
            }

            mockQueryOne
                .mockResolvedValueOnce(null) // existing check
                .mockResolvedValueOnce(sampleBudget) // newly created

            const result = await budgetRepository.create(input)

            expect(mockExecSQL).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO budget'),
                expect.arrayContaining([SYSTEM_TAGS.FOOD, 50000])
            )
            expect(result.amount).toBe(50000)
        })

        it('uses provided start and end dates', async () => {
            const input: BudgetInput = {
                tag_id: SYSTEM_TAGS.FOOD,
                amount: 50000,
                start: 1704067200,
                end: 1706745600,
            }

            mockQueryOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(sampleBudget)

            await budgetRepository.create(input)

            expect(mockExecSQL).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO budget'),
                [SYSTEM_TAGS.FOOD, 50000, 1704067200, 1706745600]
            )
        })

        it('throws error when budget already exists for tag and period', async () => {
            const input: BudgetInput = {
                tag_id: SYSTEM_TAGS.FOOD,
                amount: 50000,
            }

            mockQueryOne.mockResolvedValueOnce(sampleBudget) // existing found

            await expect(budgetRepository.create(input)).rejects.toThrow(
                'A budget already exists for this tag and period'
            )
        })

        it('throws error when creation fails', async () => {
            const input: BudgetInput = {
                tag_id: SYSTEM_TAGS.FOOD,
                amount: 50000,
            }

            mockQueryOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(null) // creation failed

            await expect(budgetRepository.create(input)).rejects.toThrow(
                'Failed to create budget'
            )
        })
    })

    describe('update', () => {
        it('updates budget amount', async () => {
            mockQueryOne.mockResolvedValue({ ...sampleBudget, amount: 75000 })

            const result = await budgetRepository.update(mockId(), { amount: 75000 })

            expect(mockExecSQL).toHaveBeenCalledWith(
                expect.stringContaining('amount = ?'),
                expect.arrayContaining([75000, mockHexId])
            )
            expect(result.amount).toBe(75000)
        })

        it('updates budget tag_id', async () => {
            mockQueryOne.mockResolvedValue({ ...sampleBudget, tag_id: SYSTEM_TAGS.TRANSPORT })

            await budgetRepository.update(mockId(), { tag_id: SYSTEM_TAGS.TRANSPORT })

            expect(mockExecSQL).toHaveBeenCalledWith(
                expect.stringContaining('tag_id = ?'),
                expect.arrayContaining([SYSTEM_TAGS.TRANSPORT])
            )
        })

        it('updates budget date range', async () => {
            mockQueryOne.mockResolvedValue(sampleBudget)

            await budgetRepository.update(mockId(), { start: 1707350400, end: 1709856000 })

            expect(mockExecSQL).toHaveBeenCalledWith(
                expect.stringContaining('start = ?'),
                expect.arrayContaining([1707350400, 1709856000])
            )
        })

        it('throws error when budget not found', async () => {
            mockQueryOne.mockResolvedValue(null)

            await expect(
                budgetRepository.update(mockId(), { amount: 75000 })
            ).rejects.toThrow('Budget not found')
        })
    })

    describe('canDelete', () => {
        it('returns true when budget exists', async () => {
            mockQueryOne.mockResolvedValue(sampleBudget)

            const result = await budgetRepository.canDelete(mockId())

            expect(result).toEqual({ canDelete: true })
        })

        it('returns false when budget not found', async () => {
            mockQueryOne.mockResolvedValue(null)

            const result = await budgetRepository.canDelete(mockId())

            expect(result).toEqual({ canDelete: false, reason: 'Budget not found' })
        })
    })

    describe('delete', () => {
        it('deletes budget by hex ID', async () => {
            await budgetRepository.delete(mockId())

            expect(mockExecSQL).toHaveBeenCalledWith(
                'DELETE FROM budget WHERE hex(id) = ?',
                [mockHexId]
            )
        })
    })

    describe('findWithActual', () => {
        it('returns budget with actual spending', async () => {
            mockQueryOne.mockResolvedValue({ ...sampleBudget, actual: 35000 })

            const result = await budgetRepository.findWithActual(mockId())

            expect(result?.actual).toBe(35000)
        })

        it('calculates actual from trx_base', async () => {
            mockQueryOne.mockResolvedValue(sampleBudget)

            await budgetRepository.findWithActual(mockId())

            expect(mockQueryOne).toHaveBeenCalledWith(
                expect.stringContaining('FROM trx_base tb'),
                [mockHexId]
            )
        })
    })
})
