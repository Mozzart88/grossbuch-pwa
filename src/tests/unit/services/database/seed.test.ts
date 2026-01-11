import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock connection module
vi.mock('../../../../services/database/connection', () => ({
  execSQL: vi.fn(),
  queryOne: vi.fn(),
}))

import { execSQL, queryOne } from '../../../../services/database/connection'
import { seedDatabase } from '../../../../services/database/seed'

const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)

describe('seedDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
  })

  describe('Currency seeding', () => {
    it('skips seeding when currencies already exist', async () => {
      mockQueryOne.mockResolvedValue({ id: 1 })

      await seedDatabase()

      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('seeds currencies when database is empty', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      // Check USD was inserted
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currencies'),
        expect.arrayContaining(['USD', 'US Dollar', '$', 2])
      )
    })

    it('seeds EUR currency', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currencies'),
        expect.arrayContaining(['EUR', 'Euro', '€', 2])
      )
    })

    it('seeds RUB currency', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currencies'),
        expect.arrayContaining(['RUB', 'Russian Ruble', '₽', 2])
      )
    })

    it('seeds ARS currency', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currencies'),
        expect.arrayContaining(['ARS', 'Argentine Peso', '$', 2])
      )
    })

    it('seeds USDT currency', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currencies'),
        expect.arrayContaining(['USDT', 'Tether', '₮', 2])
      )
    })

    it('seeds USDC currency', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currencies'),
        expect.arrayContaining(['USDC', 'USD Coin', '$', 2])
      )
    })

    it('seeds all 6 preset currencies', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      const currencyInserts = mockExecSQL.mock.calls.filter(
        call => call[0].includes('INSERT INTO currencies')
      )
      expect(currencyInserts).toHaveLength(6)
    })

    it('marks currencies as preset', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      // All currency inserts should have is_preset = 1
      const calls = mockExecSQL.mock.calls.filter(call => call[0].includes('INSERT INTO currencies'))
      expect(calls.length).toBeGreaterThan(0)
      calls.forEach(call => {
        expect(call[0]).toContain('is_preset')
      })
    })
  })

  describe('Category seeding', () => {
    it('seeds expense categories', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        expect.arrayContaining(['Food & Dining', 'expense', '🍔'])
      )

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        expect.arrayContaining(['Transport', 'expense', '🚗'])
      )

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        expect.arrayContaining(['Utilities', 'expense', '💡'])
      )
    })

    it('seeds income categories', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        expect.arrayContaining(['Salary', 'income', '💰'])
      )

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        expect.arrayContaining(['Freelance', 'income', '💻'])
      )
    })

    it('seeds both type categories', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        expect.arrayContaining(['Gifts', 'both', '🎁'])
      )
    })

    it('seeds all preset categories', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      const categoryInserts = mockExecSQL.mock.calls.filter(
        call => call[0].includes('INSERT INTO categories')
      )
      // 11 expense + 6 income + 1 both = 18 categories
      expect(categoryInserts).toHaveLength(18)
    })

    it('marks categories as preset', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      const calls = mockExecSQL.mock.calls.filter(call => call[0].includes('INSERT INTO categories'))
      expect(calls.length).toBeGreaterThan(0)
      calls.forEach(call => {
        expect(call[0]).toContain('is_preset')
      })
    })

    it('seeds Housing expense category', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        expect.arrayContaining(['Housing', 'expense', '🏠'])
      )
    })

    it('seeds Healthcare expense category', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        expect.arrayContaining(['Healthcare', 'expense', '🏥'])
      )
    })

    it('seeds Investment income category', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        expect.arrayContaining(['Investment', 'income', '📈'])
      )
    })
  })

  describe('Idempotency', () => {
    it('is idempotent - does not reseed when already seeded', async () => {
      mockQueryOne.mockResolvedValue({ id: 1 })

      await seedDatabase()
      await seedDatabase()

      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('checks currencies table before seeding', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT id FROM currencies LIMIT 1'
      )
    })
  })

  describe('Execution order', () => {
    it('seeds currencies before categories', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      const calls = mockExecSQL.mock.calls
      let firstCurrencyIndex = -1
      let firstCategoryIndex = -1

      calls.forEach((call, index) => {
        if (call[0].includes('INSERT INTO currencies') && firstCurrencyIndex === -1) {
          firstCurrencyIndex = index
        }
        if (call[0].includes('INSERT INTO categories') && firstCategoryIndex === -1) {
          firstCategoryIndex = index
        }
      })

      expect(firstCurrencyIndex).toBeLessThan(firstCategoryIndex)
    })
  })
})
