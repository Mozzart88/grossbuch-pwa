import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Budget, BudgetInput, BudgetSummary } from '../../../types'
import { SYSTEM_TAGS } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
    execSQL: vi.fn(),
    querySQL: vi.fn(),
    queryOne: vi.fn(),
}))

// Mock currencyRepository (used by findByMonth, findWithActual, findActive for system rate)
vi.mock('../../../services/repositories/currencyRepository', () => ({
    currencyRepository: {
        getSystemRateInfo: vi.fn().mockResolvedValue({ rate: 1, currencyId: 1 }),
    },
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
    amount_int: 500,
    amount_frac: 0,
    tag: 'food',
    actual: 0,
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
        it('returns budgets for specified month with actual computed from matching trx_base rows', async () => {
            mockQuerySQL.mockImplementation(async (sql: string) => {
                if (sql.includes('WHERE b.start >= ? AND b.start < ?')) return [{ ...sampleBudget, actual: 0 }]
                if (sql.includes('tag_to_tag')) return []
                if (sql.includes('trx_base')) {
                    return [{
                        tag_id: SYSTEM_TAGS.FOOD,
                        sign: '-',
                        amount_int: 250,
                        amount_frac: 0,
                        rate_int: 1,
                        rate_frac: 0,
                        currency_id: 1,
                        account_id: 1,
                        timestamp: sampleBudget.start + 10,
                        ctx_tag_id: null,
                    }]
                }
                return []
            })

            const result = await budgetRepository.findByMonth('2024-01')

            expect(mockQuerySQL).toHaveBeenCalledWith(
                expect.stringContaining('WHERE b.start >= ? AND b.start < ?'),
                expect.arrayContaining([expect.any(Number), expect.any(Number)])
            )
            expect(result[0].actual).toBe(250)
        })

        it('issues a single batched trx_base query rather than a per-budget correlated subquery', async () => {
            mockQuerySQL.mockImplementation(async (sql: string) => {
                if (sql.includes('WHERE b.start >= ? AND b.start < ?')) return [{ ...sampleBudget, actual: 0 }]
                return []
            })

            await budgetRepository.findByMonth('2024-01')

            expect(mockQuerySQL).toHaveBeenCalledWith(
                expect.stringContaining('FROM trx_base tb'),
                expect.anything()
            )
            expect(mockQuerySQL).toHaveBeenCalledTimes(3) // budget list + tag_to_tag edges + trx_base rows
        })

        it('filters actuals by budget type sign', async () => {
            const incomeBudget = { ...sampleBudget, type: 'income' as const }
            mockQuerySQL.mockImplementation(async (sql: string) => {
                if (sql.includes('WHERE b.start >= ? AND b.start < ?')) return [{ ...incomeBudget, actual: 0 }]
                if (sql.includes('tag_to_tag')) return []
                if (sql.includes('trx_base')) {
                    return [
                        { tag_id: SYSTEM_TAGS.FOOD, sign: '+', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0, currency_id: 1, account_id: 1, timestamp: incomeBudget.start + 10, ctx_tag_id: null },
                        { tag_id: SYSTEM_TAGS.FOOD, sign: '-', amount_int: 999, amount_frac: 0, rate_int: 1, rate_frac: 0, currency_id: 1, account_id: 1, timestamp: incomeBudget.start + 10, ctx_tag_id: null },
                    ]
                }
                return []
            })

            const result = await budgetRepository.findByMonth('2024-01')

            // Only the '+' row should count toward an income-type budget
            expect(result[0].actual).toBe(100)
        })

        it('calculates savings and credit budgets from inbound transfers and exchanges to tagged accounts', async () => {
            const savingsTagId = 100
            const savingsBudget = { ...sampleBudget, tag: 'savings', tag_id: savingsTagId }
            mockQuerySQL.mockImplementation(async (sql: string) => {
                if (sql.includes('WHERE b.start >= ? AND b.start < ?')) return [{ ...savingsBudget, actual: 0 }]
                if (sql.includes("name IN ('transfer', 'exchange')")) return [{ id: SYSTEM_TAGS.TRANSFER }, { id: SYSTEM_TAGS.EXCHANGE }]
                if (sql.includes('account_to_tags')) return [{ account_id: 5, tag_id: savingsTagId }]
                if (sql.includes('tag_to_tag')) return []
                if (sql.includes('trx_base')) {
                    return [{
                        tag_id: SYSTEM_TAGS.TRANSFER,
                        sign: '+',
                        amount_int: 60,
                        amount_frac: 0,
                        rate_int: 1,
                        rate_frac: 0,
                        currency_id: 1,
                        account_id: 5,
                        timestamp: savingsBudget.start + 10,
                        ctx_tag_id: null,
                    }]
                }
                return []
            })

            const result = await budgetRepository.findByMonth('2024-01')

            expect(result[0].actual).toBe(60)
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

        it('can filter budgets for a tag by type', async () => {
            mockQuerySQL.mockResolvedValue([{ ...sampleBudget, type: 'income' }])

            await budgetRepository.findByTagId(SYSTEM_TAGS.FOOD, 'income')

            expect(mockQuerySQL).toHaveBeenCalledWith(
                expect.stringContaining('AND b.type = ?'),
                [SYSTEM_TAGS.FOOD, 'income']
            )
        })
    })

    describe('findActive', () => {
        it('returns budgets for current period', async () => {
            mockQuerySQL.mockImplementation(async (sql: string) => {
                if (sql.includes('WHERE b.start <= ? AND b.end > ?')) return [{ ...sampleBudget, actual: 0 }]
                return []
            })

            const result = await budgetRepository.findActive()

            expect(mockQuerySQL).toHaveBeenCalledWith(
                expect.stringContaining('WHERE b.start <= ? AND b.end > ?'),
                expect.arrayContaining([expect.any(Number), expect.any(Number)])
            )
            expect(result).toHaveLength(1)
        })

        it('includes actual spending computed from a batched trx_base query, with int/frac conversion', async () => {
            mockQuerySQL.mockImplementation(async (sql: string) => {
                if (sql.includes('WHERE b.start <= ? AND b.end > ?')) return [{ ...sampleBudget, actual: 0 }]
                if (sql.includes('tag_to_tag')) return []
                if (sql.includes('trx_base')) {
                    // amount = 15 + 0.5*1e-18*1e18 = 15.5 (foreign currency, rate = 1.0 -> converted stays 15.5)
                    return [{
                        tag_id: SYSTEM_TAGS.FOOD,
                        sign: '-',
                        amount_int: 15,
                        amount_frac: 500000000000000000,
                        rate_int: 1,
                        rate_frac: 0,
                        currency_id: 2,
                        account_id: 1,
                        timestamp: sampleBudget.start + 10,
                        ctx_tag_id: null,
                    }]
                }
                return []
            })

            const result = await budgetRepository.findActive()

            expect(mockQuerySQL).toHaveBeenCalledWith(expect.stringContaining('FROM trx_base tb'), expect.anything())
            expect(result[0].actual).toBeCloseTo(15.5, 5)
        })
    })

    describe('getSummary', () => {
        it('returns budget summary from view', async () => {
            const summary: BudgetSummary[] = [{ tag: 'food', type: 'expense', amount_int: 500, amount_frac: 0, actual: 250.00 }]
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
                amount_int: 500,
                amount_frac: 0,
            }

            mockQueryOne
                .mockResolvedValueOnce(null) // existing check
                .mockResolvedValueOnce(sampleBudget) // newly created

            const result = await budgetRepository.create(input)

            expect(mockExecSQL).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO budget'),
                expect.arrayContaining([SYSTEM_TAGS.FOOD, 500, 0])
            )
            expect(result.amount_int).toBe(500)
        })

        it('uses provided start and end dates', async () => {
            const input: BudgetInput = {
                tag_id: SYSTEM_TAGS.FOOD,
                amount_int: 500,
                amount_frac: 0,
                start: 1704067200,
                end: 1706745600,
            }

            mockQueryOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(sampleBudget)

            await budgetRepository.create(input)

            expect(mockExecSQL).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO budget'),
                [SYSTEM_TAGS.FOOD, 'expense', 500, 0, 1704067200, 1706745600]
            )
        })

        it('throws error when budget already exists for tag and period', async () => {
            const input: BudgetInput = {
                tag_id: SYSTEM_TAGS.FOOD,
                amount_int: 500,
                amount_frac: 0,
            }

            mockQueryOne.mockResolvedValueOnce(sampleBudget) // existing found

            await expect(budgetRepository.create(input)).rejects.toThrow(
                'A budget already exists for this tag and period'
            )
        })

        it('allows separate income and expense budgets for the same tag and period', async () => {
            const input: BudgetInput = {
                tag_id: SYSTEM_TAGS.FOOD,
                type: 'income',
                amount_int: 500,
                amount_frac: 0,
                start: 1704067200,
                end: 1706745600,
            }

            mockQueryOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ ...sampleBudget, type: 'income' })

            await budgetRepository.create(input)

            expect(mockQueryOne).toHaveBeenCalledWith(
                expect.stringContaining('b.type = ?'),
                [SYSTEM_TAGS.FOOD, 1704067200, 1706745600, 'income']
            )
            expect(mockExecSQL).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO budget'),
                [SYSTEM_TAGS.FOOD, 'income', 500, 0, 1704067200, 1706745600]
            )
        })

        it('throws error when creation fails', async () => {
            const input: BudgetInput = {
                tag_id: SYSTEM_TAGS.FOOD,
                amount_int: 500,
                amount_frac: 0,
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
        it('updates budget amount_int', async () => {
            mockQueryOne.mockResolvedValue({ ...sampleBudget, amount_int: 750, actual: 0 })

            const result = await budgetRepository.update(mockId(), { amount_int: 750 })

            expect(mockExecSQL).toHaveBeenCalledWith(
                expect.stringContaining('amount_int = ?'),
                expect.arrayContaining([750, mockHexId])
            )
            expect(result.amount_int).toBe(750)
        })

        it('updates budget tag_id', async () => {
            mockQueryOne.mockResolvedValue({ ...sampleBudget, tag_id: SYSTEM_TAGS.TRANSPORT, actual: 0 })

            await budgetRepository.update(mockId(), { tag_id: SYSTEM_TAGS.TRANSPORT })

            expect(mockExecSQL).toHaveBeenCalledWith(
                expect.stringContaining('tag_id = ?'),
                expect.arrayContaining([SYSTEM_TAGS.TRANSPORT])
            )
        })

        it('updates budget date range', async () => {
            mockQueryOne.mockResolvedValue({ ...sampleBudget, actual: 0 })

            await budgetRepository.update(mockId(), { start: 1707350400, end: 1709856000 })

            expect(mockExecSQL).toHaveBeenCalledWith(
                expect.stringContaining('start = ?'),
                expect.arrayContaining([1707350400, 1709856000])
            )
        })

        it('throws error when budget not found', async () => {
            mockQueryOne.mockResolvedValue(null)

            await expect(
                budgetRepository.update(mockId(), { amount_int: 750 })
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
        it('returns budget with actual spending computed from matching trx_base rows', async () => {
            mockQueryOne.mockResolvedValue({ ...sampleBudget, actual: 0 })
            mockQuerySQL.mockImplementation(async (sql: string) => {
                if (sql.includes('tag_to_tag')) return []
                if (sql.includes('trx_base')) {
                    return [{
                        tag_id: SYSTEM_TAGS.FOOD,
                        sign: '-',
                        amount_int: 350,
                        amount_frac: 0,
                        rate_int: 1,
                        rate_frac: 0,
                        currency_id: 1,
                        account_id: 1,
                        timestamp: sampleBudget.start + 100,
                        ctx_tag_id: null,
                    }]
                }
                return []
            })

            const result = await budgetRepository.findWithActual(mockId())

            expect(result?.actual).toBe(350)
        })

        it('issues a single batched trx_base query rather than a per-budget correlated subquery', async () => {
            mockQueryOne.mockResolvedValue({ ...sampleBudget, actual: 0 })
            mockQuerySQL.mockResolvedValue([])

            await budgetRepository.findWithActual(mockId())

            expect(mockQuerySQL).toHaveBeenCalledWith(
                expect.stringContaining('FROM trx_base tb'),
                expect.anything()
            )
            expect(mockQuerySQL).toHaveBeenCalledTimes(2) // tag_to_tag edges + trx_base rows (no savings/credits budget here)
        })

        it('applies the int/frac amount and rate conversion formula', async () => {
            mockQueryOne.mockResolvedValue({ ...sampleBudget, actual: 0 })
            mockQuerySQL.mockImplementation(async (sql: string) => {
                if (sql.includes('tag_to_tag')) return []
                if (sql.includes('trx_base')) {
                    // amount = 21 + 0 * 1e-18 = 21; rate = 2 + 0.5*1e18*1e-18 = 2.5
                    // foreign currency (currency_id=2 !== sysCurrencyId=1): (21 / 2.5) * sysRate(1) = 8.4
                    return [{
                        tag_id: SYSTEM_TAGS.FOOD,
                        sign: '-',
                        amount_int: 21,
                        amount_frac: 0,
                        rate_int: 2,
                        rate_frac: 500000000000000000,
                        currency_id: 2,
                        account_id: 1,
                        timestamp: sampleBudget.start + 100,
                        ctx_tag_id: null,
                    }]
                }
                return []
            })

            const result = await budgetRepository.findWithActual(mockId())

            expect(result?.actual).toBeCloseTo(8.4, 5)
        })

        it('handles amount_frac/rate_frac returned as BigInt (sqlite-wasm returns BigInt once a value exceeds Number.MAX_SAFE_INTEGER)', async () => {
            mockQueryOne.mockResolvedValue({ ...sampleBudget, actual: 0 })
            mockQuerySQL.mockImplementation(async (sql: string) => {
                if (sql.includes('tag_to_tag')) return []
                if (sql.includes('trx_base')) {
                    // amount = 10 + 500000000000000000n * 1e-18 = 10.5
                    return [{
                        tag_id: SYSTEM_TAGS.FOOD,
                        sign: '-',
                        amount_int: 10,
                        amount_frac: 500000000000000000n,
                        rate_int: 1,
                        rate_frac: 0n,
                        currency_id: 1,
                        account_id: 1,
                        timestamp: sampleBudget.start + 100,
                        ctx_tag_id: null,
                    }]
                }
                return []
            })

            const result = await budgetRepository.findWithActual(mockId())

            expect(result?.actual).toBeCloseTo(10.5, 5)
        })
    })
})
