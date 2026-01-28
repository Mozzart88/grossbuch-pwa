import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the dependencies
vi.mock('../../../../services/repositories/currencyRepository', () => ({
  currencyRepository: {
    findAll: vi.fn(),
    setExchangeRate: vi.fn(),
  },
}))

vi.mock('../../../../services/exchangeRate/exchangeRateApi', () => ({
  getLatestRates: vi.fn(),
}))

import { syncRates } from '../../../../services/exchangeRate/exchangeRateSync'
import { currencyRepository } from '../../../../services/repositories/currencyRepository'
import { getLatestRates } from '../../../../services/exchangeRate/exchangeRateApi'
import type { Currency } from '../../../../types'

const mockFindAll = vi.mocked(currencyRepository.findAll)
const mockSetExchangeRate = vi.mocked(currencyRepository.setExchangeRate)
const mockGetLatestRates = vi.mocked(getLatestRates)

describe('exchangeRateSync', () => {
  const originalNavigator = global.navigator

  beforeEach(() => {
    vi.clearAllMocks()
    // Default to online
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    })
  })

  const createCurrency = (overrides: Partial<Currency> = {}): Currency => ({
    id: 1,
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimal_places: 2,
    is_default: false,
    ...overrides,
  })

  const createApiRate = (code: string, value: number) => ({
    code,
    value,
    timestamp: '2025-01-28 12:00:00',
    date: '2025-01-28',
  })

  describe('syncRates', () => {
    it('returns offline result when offline', async () => {
      Object.defineProperty(global.navigator, 'onLine', { value: false })

      const result = await syncRates()

      expect(result).toEqual({
        success: false,
        syncedCount: 0,
        skippedReason: 'offline',
      })
      expect(mockFindAll).not.toHaveBeenCalled()
      expect(mockGetLatestRates).not.toHaveBeenCalled()
    })

    it('returns no_currencies result when no currencies found', async () => {
      mockFindAll.mockResolvedValue([])

      const result = await syncRates()

      expect(result).toEqual({
        success: false,
        syncedCount: 0,
        skippedReason: 'no_currencies',
      })
      expect(mockGetLatestRates).not.toHaveBeenCalled()
    })

    it('returns no_default result when no default currency set', async () => {
      mockFindAll.mockResolvedValue([
        createCurrency({ id: 1, code: 'USD', is_default: false }),
        createCurrency({ id: 2, code: 'EUR', is_default: false }),
      ])

      const result = await syncRates()

      expect(result).toEqual({
        success: false,
        syncedCount: 0,
        skippedReason: 'no_default',
      })
      expect(mockGetLatestRates).not.toHaveBeenCalled()
    })

    it('fetches rates for all user currencies', async () => {
      const currencies = [
        createCurrency({ id: 1, code: 'USD', is_default: true }),
        createCurrency({ id: 2, code: 'EUR', is_default: false }),
        createCurrency({ id: 3, code: 'GBP', is_default: false }),
      ]
      mockFindAll.mockResolvedValue(currencies)
      mockGetLatestRates.mockResolvedValue({
        rates: [
          createApiRate('USD', 1.0),
          createApiRate('EUR', 0.92),
          createApiRate('GBP', 0.79),
        ],
      })

      await syncRates()

      expect(mockGetLatestRates).toHaveBeenCalledWith(['USD', 'EUR', 'GBP'])
    })

    it('converts and saves rates relative to default currency', async () => {
      const currencies = [
        createCurrency({
          id: 1,
          code: 'USD',
          is_default: true,
          decimal_places: 2,
        }),
        createCurrency({
          id: 2,
          code: 'EUR',
          is_default: false,
          decimal_places: 2,
        }),
      ]
      mockFindAll.mockResolvedValue(currencies)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('USD', 1.0), createApiRate('EUR', 0.92)],
      })

      const result = await syncRates()

      // EUR rate = 0.92 / 1.0 = 0.92
      // storedRate = round(0.92 * 100) = 92
      expect(mockSetExchangeRate).toHaveBeenCalledWith(2, 92)
      expect(result).toEqual({ success: true, syncedCount: 1 })
    })

    it('handles different decimal places', async () => {
      const currencies = [
        createCurrency({
          id: 1,
          code: 'USD',
          is_default: true,
          decimal_places: 2,
        }),
        createCurrency({
          id: 2,
          code: 'BTC',
          is_default: false,
          decimal_places: 8,
        }),
      ]
      mockFindAll.mockResolvedValue(currencies)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('USD', 1.0), createApiRate('BTC', 0.00001234)],
      })

      const result = await syncRates()

      // BTC rate = 0.00001234 / 1.0 = 0.00001234
      // storedRate = round(0.00001234 * 10^8) = 1234
      expect(mockSetExchangeRate).toHaveBeenCalledWith(2, 1234)
      expect(result).toEqual({ success: true, syncedCount: 1 })
    })

    it('skips default currency when saving rates', async () => {
      const currencies = [
        createCurrency({ id: 1, code: 'USD', is_default: true }),
        createCurrency({ id: 2, code: 'EUR', is_default: false }),
      ]
      mockFindAll.mockResolvedValue(currencies)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('USD', 1.0), createApiRate('EUR', 0.92)],
      })

      const result = await syncRates()

      // Should only save EUR, not USD (default)
      expect(mockSetExchangeRate).toHaveBeenCalledTimes(1)
      expect(mockSetExchangeRate).toHaveBeenCalledWith(2, expect.any(Number))
      expect(result.syncedCount).toBe(1)
    })

    it('skips currency not found in API response', async () => {
      const currencies = [
        createCurrency({ id: 1, code: 'USD', is_default: true }),
        createCurrency({ id: 2, code: 'EUR', is_default: false }),
        createCurrency({ id: 3, code: 'XYZ', is_default: false }), // Not in API
      ]
      mockFindAll.mockResolvedValue(currencies)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('USD', 1.0), createApiRate('EUR', 0.92)], // No XYZ
      })

      const result = await syncRates()

      // Should only save EUR, not XYZ
      expect(mockSetExchangeRate).toHaveBeenCalledTimes(1)
      expect(mockSetExchangeRate).toHaveBeenCalledWith(2, expect.any(Number))
      expect(result).toEqual({ success: true, syncedCount: 1 })
    })

    it('handles non-USD base currency correctly', async () => {
      // User has EUR as default
      const currencies = [
        createCurrency({
          id: 1,
          code: 'EUR',
          is_default: true,
          decimal_places: 2,
        }),
        createCurrency({
          id: 2,
          code: 'USD',
          is_default: false,
          decimal_places: 2,
        }),
        createCurrency({
          id: 3,
          code: 'GBP',
          is_default: false,
          decimal_places: 2,
        }),
      ]
      mockFindAll.mockResolvedValue(currencies)
      // API returns USD-based rates
      mockGetLatestRates.mockResolvedValue({
        rates: [
          createApiRate('EUR', 0.92),
          createApiRate('USD', 1.0),
          createApiRate('GBP', 0.79),
        ],
      })

      const result = await syncRates()

      // USD rate relative to EUR = 1.0 / 0.92 = 1.087 -> 109
      // GBP rate relative to EUR = 0.79 / 0.92 = 0.858 -> 86
      expect(mockSetExchangeRate).toHaveBeenCalledTimes(2)
      expect(mockSetExchangeRate).toHaveBeenCalledWith(2, 109) // USD
      expect(mockSetExchangeRate).toHaveBeenCalledWith(3, 86) // GBP
      expect(result).toEqual({ success: true, syncedCount: 2 })
    })

    it('returns default_not_in_api when default currency not in API response', async () => {
      const currencies = [
        createCurrency({ id: 1, code: 'XYZ', is_default: true }), // Not in API
        createCurrency({ id: 2, code: 'EUR', is_default: false }),
      ]
      mockFindAll.mockResolvedValue(currencies)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('USD', 1.0), createApiRate('EUR', 0.92)], // No XYZ
      })

      const result = await syncRates()

      expect(result).toEqual({
        success: false,
        syncedCount: 0,
        skippedReason: 'default_not_in_api',
      })
      expect(mockSetExchangeRate).not.toHaveBeenCalled()
    })
  })
})
