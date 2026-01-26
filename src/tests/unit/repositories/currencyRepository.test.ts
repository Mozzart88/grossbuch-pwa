import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Currency, CurrencyInput, ExchangeRate } from '../../../types'
import { SYSTEM_TAGS } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
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
    is_default: true,
    is_fiat: true,
    is_crypto: false,
  }

  describe('findAll', () => {
    it('returns all currencies with tag info ordered by default status and name', async () => {
      const currencies = [sampleCurrency, { ...sampleCurrency, id: 2, code: 'EUR', is_default: false }]
      mockQuerySQL.mockResolvedValue(currencies)

      const result = await currencyRepository.findAll()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('FROM currency c'),
        [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.FIAT, SYSTEM_TAGS.CRYPTO]
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
    it('returns currency with tag info when found', async () => {
      mockQueryOne.mockResolvedValue(sampleCurrency)

      const result = await currencyRepository.findById(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE c.id = ?'),
        [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.FIAT, SYSTEM_TAGS.CRYPTO, 1]
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
        expect.stringContaining('WHERE c.code = ?'),
        [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.FIAT, SYSTEM_TAGS.CRYPTO, 'USD']
      )
      expect(result).toEqual(sampleCurrency)
    })

    it('returns null when currency code not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await currencyRepository.findByCode('XXX')

      expect(result).toBeNull()
    })
  })

  describe('findDefault', () => {
    it('returns default currency', async () => {
      mockQueryOne.mockResolvedValue(sampleCurrency)

      const result = await currencyRepository.findDefault()

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE ct.tag_id = ?'),
        [SYSTEM_TAGS.DEFAULT]
      )
      expect(result).toEqual(sampleCurrency)
    })

    it('returns null when no default currency', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await currencyRepository.findDefault()

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('creates a new fiat currency', async () => {
      const input: CurrencyInput = {
        code: 'GBP',
        name: 'British Pound',
        symbol: '£',
        decimal_places: 2,
        is_fiat: true,
      }

      mockGetLastInsertId.mockResolvedValue(3)
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, id: 3, ...input })

      const result = await currencyRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currency'),
        ['GBP', 'British Pound', '£', 2]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [3, SYSTEM_TAGS.FIAT]
      )
      expect(result.code).toBe('GBP')
    })

    it('creates a new crypto currency', async () => {
      const input: CurrencyInput = {
        code: 'BTC',
        name: 'Bitcoin',
        symbol: '₿',
        decimal_places: 8,
        is_crypto: true,
      }

      mockGetLastInsertId.mockResolvedValue(4)
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, id: 4, ...input, is_fiat: false, is_crypto: true })

      const result = await currencyRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [4, SYSTEM_TAGS.CRYPTO]
      )
      expect(result.code).toBe('BTC')
    })

    it('uses default decimal places when not provided', async () => {
      const input: CurrencyInput = {
        code: 'JPY',
        name: 'Japanese Yen',
        symbol: '¥',
      }

      mockGetLastInsertId.mockResolvedValue(5)
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, id: 5, ...input, decimal_places: 2 })

      await currencyRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currency'),
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
    it('updates currency name', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, name: 'American Dollar' })

      const result = await currencyRepository.update(1, { name: 'American Dollar' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE currency SET'),
        expect.arrayContaining(['American Dollar', 1])
      )
      expect(result.name).toBe('American Dollar')
    })

    it('updates currency code', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, code: 'usd' })

      await currencyRepository.update(1, { code: 'usd' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('code = ?'),
        expect.arrayContaining(['usd'])
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

    it('updates fiat/crypto tags', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, is_fiat: false, is_crypto: true })

      await currencyRepository.update(1, { is_crypto: true })

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM currency_to_tags WHERE currency_id = ? AND tag_id IN (?, ?)',
        [1, SYSTEM_TAGS.FIAT, SYSTEM_TAGS.CRYPTO]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [1, SYSTEM_TAGS.CRYPTO]
      )
    })

    it('updates crypto/fiat tags', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleCurrency, is_fiat: true, is_crypto: false })

      await currencyRepository.update(1, { is_fiat: true })

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [1, SYSTEM_TAGS.FIAT]
      )
    })

    it('does not execute SQL if no fields provided', async () => {
      mockQueryOne.mockResolvedValue(sampleCurrency)

      await currencyRepository.update(1, {})

      // Only findById is called, not execSQL for update
      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('throws error if currency not found after update', async () => {
      mockQueryOne.mockResolvedValue(null)

      await expect(currencyRepository.update(999, { name: 'Test' })).rejects.toThrow('Currency not found')
    })
  })

  describe('setDefault', () => {
    it('sets currency as default via tag', async () => {
      await currencyRepository.setDefault(2)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [2, SYSTEM_TAGS.DEFAULT]
      )
    })
  })

  describe('delete', () => {
    it('deletes currency when not used by accounts', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      await currencyRepository.delete(3)

      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM currency WHERE id = ?', [3])
    })

    it('throws error when currency is used by accounts', async () => {
      mockQueryOne.mockResolvedValue({ count: 2 })

      await expect(currencyRepository.delete(1)).rejects.toThrow(
        'Cannot delete: 2 accounts use this currency'
      )
    })

    it('checks account usage before delete', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      await currencyRepository.delete(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM account WHERE currency_id = ?',
        [1]
      )
    })
  })

  describe('getExchangeRate', () => {
    it('returns latest exchange rate for currency', async () => {
      const rate: ExchangeRate = { currency_id: 2, rate: 11500, updated_at: 1704067200 }
      mockQueryOne.mockResolvedValue(rate)

      const result = await currencyRepository.getExchangeRate(2)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('FROM exchange_rate'),
        [2]
      )
      expect(result).toEqual(rate)
    })

    it('returns null when no exchange rate exists', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await currencyRepository.getExchangeRate(1)

      expect(result).toBeNull()
    })
  })

  describe('getAllExchangeRates', () => {
    it('returns latest exchange rate for each currency', async () => {
      const rates: ExchangeRate[] = [
        { currency_id: 2, rate: 11500, updated_at: 1704067200 },
        { currency_id: 3, rate: 12800, updated_at: 1704067200 },
      ]
      mockQuerySQL.mockResolvedValue(rates)

      const result = await currencyRepository.getAllExchangeRates()

      expect(mockQuerySQL).toHaveBeenCalledWith(expect.stringContaining('FROM exchange_rate'))
      expect(result).toEqual(rates)
    })
  })

  describe('setExchangeRate', () => {
    it('inserts new exchange rate', async () => {
      await currencyRepository.setExchangeRate(2, 11500)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO exchange_rate (currency_id, rate) VALUES (?, ?)',
        [2, 11500]
      )
    })
  })

  describe('getRateForCurrency', () => {
    it('returns latest exchange rate for currency', async () => {
      const rate: ExchangeRate = { currency_id: 2, rate: 11500, updated_at: 1704067200 }
      mockQueryOne.mockResolvedValue(rate)

      const result = await currencyRepository.getRateForCurrency(2)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('FROM exchange_rate'),
        [2]
      )
      expect(result).toEqual(rate.rate)
    })

    it('returns 100 when currency is default', async () => {
      mockQueryOne.mockResolvedValue({ is_default: true, decimal_places: 2 })

      const result = await currencyRepository.getRateForCurrency(1)

      expect(result).toEqual(100)
    })

    it('returns 100 when no currency', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await currencyRepository.getRateForCurrency(1)

      expect(result).toEqual(100)
    })

    it('returns 100 when no rate for currency', async () => {
      mockQueryOne.mockResolvedValueOnce({ decimal_places: 2 })
      mockQueryOne.mockResolvedValueOnce(null)

      const result = await currencyRepository.getRateForCurrency(1)

      expect(mockQueryOne).toHaveBeenCalledTimes(2)
      expect(mockQueryOne).toHaveBeenLastCalledWith(
        expect.stringContaining('FROM exchange_rate'),
        [1]
      )

      // expect(mockQueryOne.mock.results[1]).toBeNull()
      expect(mockQueryOne).toHaveLastResolvedWith(null)

      expect(result).toEqual(100)
    })
  })

})
