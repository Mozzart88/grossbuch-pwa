import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../../services/repositories/currencyRepository', () => ({
  currencyRepository: {
    getRateForCurrency: vi.fn(),
    getExchangeRateForDate: vi.fn(),
    getExchangeRateNearDate: vi.fn(),
    setExchangeRate: vi.fn(),
    findById: vi.fn(),
    findSystem: vi.fn(),
  },
}))

vi.mock('../../../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: vi.fn(),
  },
}))

vi.mock('../../../../services/exchangeRate/exchangeRateApi', () => ({
  getHistoricalRates: vi.fn(),
}))

import { getRateForDate } from '../../../../services/exchangeRate/historicalRateService'
import { currencyRepository } from '../../../../services/repositories/currencyRepository'
import { settingsRepository } from '../../../../services/repositories/settingsRepository'
import { getHistoricalRates } from '../../../../services/exchangeRate/exchangeRateApi'
import type { Currency, ExchangeRate } from '../../../../types'

const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockSettingsGet = vi.mocked(settingsRepository.get)
const mockGetHistoricalRates = vi.mocked(getHistoricalRates)

const PAST_DATE = '2024-01-15'
const CURRENCY_ID = 2

const mockCurrency: Currency = {
  id: CURRENCY_ID, code: 'EUR', name: 'Euro', symbol: '€',
  decimal_places: 2, is_system: false, is_fiat: true, is_crypto: false,
}
const mockDefaultCurrency: Currency = {
  id: 1, code: 'USD', name: 'US Dollar', symbol: '$',
  decimal_places: 2, is_system: true, is_fiat: true, is_crypto: false,
}
const mockRate: ExchangeRate = { currency_id: CURRENCY_ID, rate_int: 1, rate_frac: 100000000000000000, updated_at: 1704067200 }

describe('historicalRateService', () => {
  const originalNavigator = global.navigator

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true })
    mockSettingsGet.mockResolvedValue(JSON.stringify({ jwt: 'test-token' }))
    mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 1, frac: 0 })
    mockCurrencyRepository.getExchangeRateForDate.mockResolvedValue(null)
    mockCurrencyRepository.getExchangeRateNearDate.mockResolvedValue(null)
    mockCurrencyRepository.setExchangeRate.mockResolvedValue(undefined)
    mockCurrencyRepository.findById.mockResolvedValue(mockCurrency)
    mockCurrencyRepository.findSystem.mockResolvedValue(mockDefaultCurrency)
    mockGetHistoricalRates.mockResolvedValue({ rates: [] })
  })

  afterEach(() => {
    Object.defineProperty(global, 'navigator', { value: originalNavigator, writable: true })
  })

  describe('when date is today or future', () => {
    it('returns latest rate without DB/API lookup', async () => {
      const today = new Date().toISOString().slice(0, 10)
      mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 2, frac: 0 })

      const result = await getRateForDate(CURRENCY_ID, today)

      expect(result).toEqual({ int: 2, frac: 0 })
      expect(mockCurrencyRepository.getExchangeRateForDate).not.toHaveBeenCalled()
    })
  })

  describe('when date is in the past', () => {
    it('returns local DB rate when exact date match found', async () => {
      mockCurrencyRepository.getExchangeRateForDate.mockResolvedValue(mockRate)

      const result = await getRateForDate(CURRENCY_ID, PAST_DATE)

      expect(result).toEqual({ int: mockRate.rate_int, frac: mockRate.rate_frac })
      expect(mockGetHistoricalRates).not.toHaveBeenCalled()
    })

    it('returns API rate and stores it when not in local DB', async () => {
      mockGetHistoricalRates.mockResolvedValue({
        rates: [
          { code: 'EUR', value: 0.85, timestamp: '', date: PAST_DATE },
          { code: 'USD', value: 1.0, timestamp: '', date: PAST_DATE },
        ],
      })

      const result = await getRateForDate(CURRENCY_ID, PAST_DATE)

      expect(result).toEqual({ int: 0, frac: 850000000000000000 })
      expect(mockCurrencyRepository.setExchangeRate).toHaveBeenCalledWith(
        CURRENCY_ID, 0, 850000000000000000, PAST_DATE
      )
    })

    it('returns {int:1, frac:0} for system currency without API call', async () => {
      mockCurrencyRepository.findById.mockResolvedValue({ ...mockDefaultCurrency, is_system: true })

      const result = await getRateForDate(1, PAST_DATE)

      expect(result).toEqual({ int: 1, frac: 0 })
      expect(mockGetHistoricalRates).not.toHaveBeenCalled()
    })

    it('falls back to latest rate when no auth token', async () => {
      mockSettingsGet.mockResolvedValue(null)
      mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 3, frac: 0 })

      const result = await getRateForDate(CURRENCY_ID, PAST_DATE)

      expect(result).toEqual({ int: 3, frac: 0 })
    })

    it('falls back to latest rate when currency not found', async () => {
      mockCurrencyRepository.findById.mockResolvedValue(null)
      mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 3, frac: 0 })

      const result = await getRateForDate(CURRENCY_ID, PAST_DATE)

      expect(result).toEqual({ int: 3, frac: 0 })
    })

    it('falls back to latest rate when default currency not found', async () => {
      mockCurrencyRepository.findSystem.mockResolvedValue(null)
      mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 3, frac: 0 })

      const result = await getRateForDate(CURRENCY_ID, PAST_DATE)

      expect(result).toEqual({ int: 3, frac: 0 })
    })
  })

  describe('offline fallback', () => {
    beforeEach(() => {
      Object.defineProperty(global, 'navigator', { value: { onLine: false }, writable: true })
    })

    it('returns nearby local rate within 3 days when offline', async () => {
      mockCurrencyRepository.getExchangeRateNearDate.mockResolvedValue(mockRate)

      const result = await getRateForDate(CURRENCY_ID, PAST_DATE)

      expect(result).toEqual({ int: mockRate.rate_int, frac: mockRate.rate_frac })
      expect(mockGetHistoricalRates).not.toHaveBeenCalled()
    })

    it('falls back to latest rate when offline and no nearby rate', async () => {
      mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 5, frac: 0 })

      const result = await getRateForDate(CURRENCY_ID, PAST_DATE)

      expect(result).toEqual({ int: 5, frac: 0 })
    })
  })

  describe('nearby date search', () => {
    it('searches local DB for nearby dates when API returns no rate for exact date', async () => {
      // Exact API call returns nothing, but a nearby local rate exists for PAST_DATE - 1
      mockCurrencyRepository.getExchangeRateForDate
        .mockResolvedValueOnce(null)   // exact date: miss
        .mockResolvedValueOnce(mockRate) // PAST_DATE - 1: hit

      const result = await getRateForDate(CURRENCY_ID, PAST_DATE)

      expect(result).toEqual({ int: mockRate.rate_int, frac: mockRate.rate_frac })
      // Should also cache the rate for the originally requested date
      expect(mockCurrencyRepository.setExchangeRate).toHaveBeenCalledWith(
        CURRENCY_ID, mockRate.rate_int, mockRate.rate_frac, PAST_DATE
      )
    })

    it('fetches from API for nearby date when not in local DB', async () => {
      // Exact date not in DB, nearby date not in DB, API returns rate for PAST_DATE - 1
      let historicalCallCount = 0
      mockGetHistoricalRates.mockImplementation(async (date) => {
        historicalCallCount++
        const candidateMinus1 = new Date(PAST_DATE)
        candidateMinus1.setUTCDate(candidateMinus1.getUTCDate() - 1)
        if (date === candidateMinus1.toISOString().slice(0, 10)) {
          return { rates: [
            { code: 'EUR', value: 0.9, timestamp: '', date },
            { code: 'USD', value: 1.0, timestamp: '', date },
          ]}
        }
        return { rates: [] }
      })

      const result = await getRateForDate(CURRENCY_ID, PAST_DATE)

      expect(result).toEqual({ int: 0, frac: 900000000000000000 })
    })

    it('falls back to latest rate when no rate found within max threshold', async () => {
      // All API calls return empty, all DB lookups return null
      mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 7, frac: 0 })

      const result = await getRateForDate(CURRENCY_ID, PAST_DATE)

      expect(result).toEqual({ int: 7, frac: 0 })
    })
  })

  describe('API error handling', () => {
    it('handles API throw gracefully and continues to nearby date search', async () => {
      mockGetHistoricalRates.mockRejectedValue(new Error('Network error'))
      mockCurrencyRepository.getExchangeRateNearDate.mockResolvedValue(null)
      mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 4, frac: 0 })

      // Since searchNearbyDates will also try API calls and they all throw,
      // it eventually falls back to latest
      const result = await getRateForDate(CURRENCY_ID, PAST_DATE)

      expect(result).toEqual({ int: 4, frac: 0 })
    })
  })
})
