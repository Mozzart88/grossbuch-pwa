import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SYSTEM_TAGS } from '../../../../types'

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
        expect.stringContaining('INSERT INTO currency'),
        expect.arrayContaining(['USD', 'US Dollar', '$', 2])
      )
    })

    it('seeds EUR currency', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currency'),
        expect.arrayContaining(['EUR', 'Euro', '€', 2])
      )
    })

    it('seeds RUB currency', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currency'),
        expect.arrayContaining(['RUB', 'Russian Ruble', '₽', 2])
      )
    })

    it('seeds ARS currency', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currency'),
        expect.arrayContaining(['ARS', 'Argentine Peso', '$', 2])
      )
    })

    it('seeds USDT currency', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currency'),
        expect.arrayContaining(['USDT', 'Tether', '₮', 2])
      )
    })

    it('seeds USDC currency', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currency'),
        expect.arrayContaining(['USDC', 'USD Coin', '$', 2])
      )
    })

    it('seeds all 6 currencies', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      const currencyInserts = mockExecSQL.mock.calls.filter(
        call => call[0].includes('INSERT INTO currency (')
      )
      expect(currencyInserts).toHaveLength(6)
    })
  })

  describe('Currency type tagging', () => {
    it('tags fiat currencies with FIAT tag', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      // USD (id=1) should be tagged as fiat
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [1, SYSTEM_TAGS.FIAT]
      )
      // EUR (id=2), RUB (id=3), ARS (id=4) should also be fiat
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [2, SYSTEM_TAGS.FIAT]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [3, SYSTEM_TAGS.FIAT]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [4, SYSTEM_TAGS.FIAT]
      )
    })

    it('tags crypto currencies with CRYPTO tag', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      // USDT (id=5) and USDC (id=6) should be tagged as crypto
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [5, SYSTEM_TAGS.CRYPTO]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [6, SYSTEM_TAGS.CRYPTO]
      )
    })

    it('sets first currency (USD) as default', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [1, SYSTEM_TAGS.DEFAULT]
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

    it('checks currency table before seeding', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT id FROM currency LIMIT 1'
      )
    })
  })

  describe('Note about tags', () => {
    it('does not seed categories (now tags are seeded in migration)', async () => {
      mockQueryOne.mockResolvedValue(null)

      await seedDatabase()

      // Should not have any category inserts
      const categoryInserts = mockExecSQL.mock.calls.filter(
        call => call[0].includes('INSERT INTO categories') || call[0].includes('INSERT INTO tag (')
      )
      expect(categoryInserts).toHaveLength(0)
    })
  })
})
