import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Currency, CurrencyInput } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  runSQL: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { currencyRepository } from '../../../services/repositories/currencyRepository'
import { execSQL, querySQL, queryOne, getLastInsertId } from '../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)
const mockGetLastInsertId = vi.mocked(getLastInsertId)

describe('currencyRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleCurrency: Currency = {
    id: 1,
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimal_places: 2,
    is_preset: 1,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  }

  describe('findAll', () => {
    it('returns all currencies ordered by preset status and name', async () => {
      const currencies = [sampleCurrency, { ...sampleCurrency, id: 2, code: 'EUR' }]
      mockQuerySQL.mockResolvedValue(currencies)

      const result = await currencyRepository.findAll()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        'SELECT * FROM currencies ORDER BY is_preset DESC, name ASC'
      )
      expect(result).toEqual(currencies)
    })

    it('returns empty array when no currencies exist', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await currencyRepository.findAll()

      expect(result).toEqual([])
    })
  })

  describe('findById', () => {
    it('returns currency when found', async () => {
      mockQueryOne.mockResolvedValue(sampleCurrency)

      const result = await currencyRepository.findById(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT * FROM currencies WHERE id = ?',
        [1]
      )
      expect(result).toEqual(sampleCurrency)
    })

    it('returns null when currency not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await currencyRepository.findById(999)

      expect(result).toBeNull()
    })
  })

  describe('findByCode', () => {
    it('returns currency when found by code', async () => {
      mockQueryOne.mockResolvedValue(sampleCurrency)

      const result = await currencyRepository.findByCode('USD')

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT * FROM currencies WHERE code = ?',
        ['USD']
      )
      expect(result).toEqual(sampleCurrency)
    })

    it('returns null when currency code not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await currencyRepository.findByCode('XYZ')

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('creates a new currency with all fields', async () => {
      const input: CurrencyInput = {
        code: 'EUR',
        name: 'Euro',
        symbol: '€',
        decimal_places: 2,
      }
      const created = { ...sampleCurrency, id: 2, ...input }

      mockGetLastInsertId.mockResolvedValue(2)
      mockQueryOne.mockResolvedValue(created)

      const result = await currencyRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currencies'),
        ['EUR', 'Euro', '€', 2]
      )
      expect(result).toEqual(created)
    })

    it('uses default decimal places when not provided', async () => {
      const input: CurrencyInput = {
        code: 'JPY',
        name: 'Japanese Yen',
        symbol: '¥',
      }

      mockGetLastInsertId.mockResolvedValue(3)
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, id: 3, ...input, decimal_places: 2 })

      await currencyRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currencies'),
        ['JPY', 'Japanese Yen', '¥', 2]
      )
    })

    it('throws error if creation fails', async () => {
      const input: CurrencyInput = {
        code: 'EUR',
        name: 'Euro',
        symbol: '€',
      }

      mockGetLastInsertId.mockResolvedValue(2)
      mockQueryOne.mockResolvedValue(null)

      await expect(currencyRepository.create(input)).rejects.toThrow('Failed to create currency')
    })
  })

  describe('update', () => {
    it('updates currency code', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, code: 'USD2' })

      const result = await currencyRepository.update(1, { code: 'USD2' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE currencies SET'),
        expect.arrayContaining(['USD2', 1])
      )
      expect(result.code).toBe('USD2')
    })

    it('updates currency name', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, name: 'Updated Dollar' })

      await currencyRepository.update(1, { name: 'Updated Dollar' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('name = ?'),
        expect.arrayContaining(['Updated Dollar'])
      )
    })

    it('updates currency symbol', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, symbol: '$$' })

      await currencyRepository.update(1, { symbol: '$$' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('symbol = ?'),
        expect.arrayContaining(['$$'])
      )
    })

    it('updates decimal places', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, decimal_places: 0 })

      await currencyRepository.update(1, { decimal_places: 0 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('decimal_places = ?'),
        expect.arrayContaining([0])
      )
    })

    it('updates multiple fields at once', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, code: 'NEW', name: 'New Currency' })

      await currencyRepository.update(1, { code: 'NEW', name: 'New Currency' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('code = ?'),
        expect.arrayContaining(['NEW', 'New Currency'])
      )
    })

    it('does not execute SQL if no fields provided', async () => {
      mockQueryOne.mockResolvedValue(sampleCurrency)

      await currencyRepository.update(1, {})

      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('throws error if currency not found after update', async () => {
      mockQueryOne.mockResolvedValue(null)

      await expect(currencyRepository.update(999, { name: 'Test' })).rejects.toThrow('Currency not found')
    })
  })

  describe('delete', () => {
    it('deletes currency when not used by accounts or transactions', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: 0 }) // account count
        .mockResolvedValueOnce({ count: 0 }) // transaction count

      await currencyRepository.delete(1)

      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM currencies WHERE id = ?', [1])
    })

    it('throws error when currency is used by accounts', async () => {
      mockQueryOne.mockResolvedValueOnce({ count: 2 })

      await expect(currencyRepository.delete(1)).rejects.toThrow('Cannot delete: 2 accounts use this currency')
    })

    it('throws error when currency is used by transactions', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: 0 }) // account count
        .mockResolvedValueOnce({ count: 5 }) // transaction count

      await expect(currencyRepository.delete(1)).rejects.toThrow('Cannot delete: 5 transactions use this currency')
    })

    it('checks both account and transaction usage', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })

      await currencyRepository.delete(1)

      expect(mockQueryOne).toHaveBeenCalledTimes(2)
      expect(mockQueryOne).toHaveBeenNthCalledWith(1,
        'SELECT COUNT(*) as count FROM accounts WHERE currency_id = ?',
        [1]
      )
      expect(mockQueryOne).toHaveBeenNthCalledWith(2,
        'SELECT COUNT(*) as count FROM transactions WHERE currency_id = ? OR to_currency_id = ?',
        [1, 1]
      )
    })
  })
})
