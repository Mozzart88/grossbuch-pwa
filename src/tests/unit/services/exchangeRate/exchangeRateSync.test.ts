import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the dependencies
vi.mock('../../../../services/repositories/currencyRepository', () => ({
  currencyRepository: {
    findUsedInAccounts: vi.fn(),
    findById: vi.fn(),
    findSystem: vi.fn(),
    setExchangeRate: vi.fn(),
  },
}))

vi.mock('../../../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

vi.mock('../../../../services/exchangeRate/exchangeRateApi', () => ({
  getLatestRates: vi.fn(),
}))

import { syncRates, syncSingleRate } from '../../../../services/exchangeRate/exchangeRateSync'
import { currencyRepository } from '../../../../services/repositories/currencyRepository'
import { settingsRepository } from '../../../../services/repositories/settingsRepository'
import { getLatestRates } from '../../../../services/exchangeRate/exchangeRateApi'
import type { Currency } from '../../../../types'

const mockFindUsedInAccounts = vi.mocked(currencyRepository.findUsedInAccounts)
const mockFindById = vi.mocked(currencyRepository.findById)
const mockFindSystem = vi.mocked(currencyRepository.findSystem)
const mockSetExchangeRate = vi.mocked(currencyRepository.setExchangeRate)
const mockGetLatestRates = vi.mocked(getLatestRates)
const mockSettingsGet = vi.mocked(settingsRepository.get)

describe('exchangeRateSync', () => {
  const originalNavigator = global.navigator

  beforeEach(() => {
    vi.clearAllMocks()
    // Default to online
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    })
    // Default to having a valid JWT
    mockSettingsGet.mockResolvedValue(JSON.stringify({ id: 'test-id', jwt: 'test-jwt-token' }))
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
    is_system: false,
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
      expect(mockFindUsedInAccounts).not.toHaveBeenCalled()
      expect(mockGetLatestRates).not.toHaveBeenCalled()
    })

    it('returns no_accounts result when no currencies linked to accounts', async () => {
      mockFindUsedInAccounts.mockResolvedValue([])

      const result = await syncRates()

      expect(result).toEqual({
        success: false,
        syncedCount: 0,
        skippedReason: 'no_accounts',
      })
      expect(mockGetLatestRates).not.toHaveBeenCalled()
    })

    it('returns no_default result when no default currency set', async () => {
      mockFindUsedInAccounts.mockResolvedValue([
        createCurrency({ id: 1, code: 'USD', is_system: false }),
        createCurrency({ id: 2, code: 'EUR', is_system: false }),
      ])

      const result = await syncRates()

      expect(result).toEqual({
        success: false,
        syncedCount: 0,
        skippedReason: 'no_default',
      })
      expect(mockGetLatestRates).not.toHaveBeenCalled()
    })

    it('fetches rates only for currencies linked to accounts', async () => {
      const currencies = [
        createCurrency({ id: 1, code: 'USD', is_system: true }),
        createCurrency({ id: 2, code: 'EUR', is_system: false }),
        createCurrency({ id: 3, code: 'GBP', is_system: false }),
      ]
      mockFindUsedInAccounts.mockResolvedValue(currencies)
      mockGetLatestRates.mockResolvedValue({
        rates: [
          createApiRate('USD', 1.0),
          createApiRate('EUR', 0.92),
          createApiRate('GBP', 0.79),
        ],
      })

      await syncRates()

      expect(mockGetLatestRates).toHaveBeenCalledWith(['USD', 'EUR', 'GBP'], 'test-jwt-token')
    })

    it('converts and saves rates relative to default currency', async () => {
      const currencies = [
        createCurrency({
          id: 1,
          code: 'USD',
          is_system: true,
          decimal_places: 2,
        }),
        createCurrency({
          id: 2,
          code: 'EUR',
          is_system: false,
          decimal_places: 2,
        }),
      ]
      mockFindUsedInAccounts.mockResolvedValue(currencies)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('USD', 1.0), createApiRate('EUR', 0.92)],
      })

      const result = await syncRates()

      // EUR rate = 0.92 / 1.0 = 0.92
      // toIntFrac(0.92) = { int: 0, frac: 920000000000000000 }
      expect(mockSetExchangeRate).toHaveBeenCalledWith(2, 0, expect.any(Number))
      expect(result).toEqual({ success: true, syncedCount: 1 })
    })

    it('handles different decimal places', async () => {
      const currencies = [
        createCurrency({
          id: 1,
          code: 'USD',
          is_system: true,
          decimal_places: 2,
        }),
        createCurrency({
          id: 2,
          code: 'BTC',
          is_system: false,
          decimal_places: 8,
        }),
      ]
      mockFindUsedInAccounts.mockResolvedValue(currencies)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('USD', 1.0), createApiRate('BTC', 0.00001234)],
      })

      const result = await syncRates()

      // BTC rate = 0.00001234 / 1.0 = 0.00001234
      // toIntFrac(0.00001234) = { int: 0, frac: ... }
      expect(mockSetExchangeRate).toHaveBeenCalledWith(2, 0, expect.any(Number))
      expect(result).toEqual({ success: true, syncedCount: 1 })
    })

    it('skips default currency when saving rates', async () => {
      const currencies = [
        createCurrency({ id: 1, code: 'USD', is_system: true }),
        createCurrency({ id: 2, code: 'EUR', is_system: false }),
      ]
      mockFindUsedInAccounts.mockResolvedValue(currencies)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('USD', 1.0), createApiRate('EUR', 0.92)],
      })

      const result = await syncRates()

      // Should only save EUR, not USD (default)
      expect(mockSetExchangeRate).toHaveBeenCalledTimes(1)
      expect(mockSetExchangeRate).toHaveBeenCalledWith(2, expect.any(Number), expect.any(Number))
      expect(result.syncedCount).toBe(1)
    })

    it('skips currency not found in API response', async () => {
      const currencies = [
        createCurrency({ id: 1, code: 'USD', is_system: true }),
        createCurrency({ id: 2, code: 'EUR', is_system: false }),
        createCurrency({ id: 3, code: 'XYZ', is_system: false }), // Not in API
      ]
      mockFindUsedInAccounts.mockResolvedValue(currencies)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('USD', 1.0), createApiRate('EUR', 0.92)], // No XYZ
      })

      const result = await syncRates()

      // Should only save EUR, not XYZ
      expect(mockSetExchangeRate).toHaveBeenCalledTimes(1)
      expect(mockSetExchangeRate).toHaveBeenCalledWith(2, expect.any(Number), expect.any(Number))
      expect(result).toEqual({ success: true, syncedCount: 1 })
    })

    it('handles non-USD base currency correctly', async () => {
      // User has EUR as default
      const currencies = [
        createCurrency({
          id: 1,
          code: 'EUR',
          is_system: true,
          decimal_places: 2,
        }),
        createCurrency({
          id: 2,
          code: 'USD',
          is_system: false,
          decimal_places: 2,
        }),
        createCurrency({
          id: 3,
          code: 'GBP',
          is_system: false,
          decimal_places: 2,
        }),
      ]
      mockFindUsedInAccounts.mockResolvedValue(currencies)
      // API returns USD-based rates
      mockGetLatestRates.mockResolvedValue({
        rates: [
          createApiRate('EUR', 0.92),
          createApiRate('USD', 1.0),
          createApiRate('GBP', 0.79),
        ],
      })

      const result = await syncRates()

      // USD rate relative to EUR = 1.0 / 0.92 = 1.087...
      // GBP rate relative to EUR = 0.79 / 0.92 = 0.858...
      expect(mockSetExchangeRate).toHaveBeenCalledTimes(2)
      expect(mockSetExchangeRate).toHaveBeenCalledWith(2, expect.any(Number), expect.any(Number)) // USD
      expect(mockSetExchangeRate).toHaveBeenCalledWith(3, expect.any(Number), expect.any(Number)) // GBP
      expect(result).toEqual({ success: true, syncedCount: 2 })
    })

    it('returns default_not_in_api when default currency not in API response', async () => {
      const currencies = [
        createCurrency({ id: 1, code: 'XYZ', is_system: true }), // Not in API
        createCurrency({ id: 2, code: 'EUR', is_system: false }),
      ]
      mockFindUsedInAccounts.mockResolvedValue(currencies)
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

    it('returns no_auth_token result when no JWT available', async () => {
      mockSettingsGet.mockResolvedValue(null)

      const result = await syncRates()

      expect(result).toEqual({
        success: false,
        syncedCount: 0,
        skippedReason: 'no_auth_token',
      })
      expect(mockGetLatestRates).not.toHaveBeenCalled()
    })

    it('handles installation setting returned as object (not string)', async () => {
      mockSettingsGet.mockResolvedValue({ id: 'test-id', jwt: 'obj-jwt-token' } as never)
      const currencies = [
        createCurrency({ id: 1, code: 'USD', is_system: true }),
        createCurrency({ id: 2, code: 'EUR', is_system: false }),
      ]
      mockFindUsedInAccounts.mockResolvedValue(currencies)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('USD', 1.0), createApiRate('EUR', 0.92)],
      })

      const result = await syncRates()

      expect(mockGetLatestRates).toHaveBeenCalledWith(['USD', 'EUR'], 'obj-jwt-token')
      expect(result).toEqual({ success: true, syncedCount: 1 })
    })
  })

  describe('syncSingleRate', () => {
    it('returns success: false when offline', async () => {
      Object.defineProperty(global.navigator, 'onLine', { value: false })

      const result = await syncSingleRate(2)

      expect(result).toEqual({ success: false })
      expect(mockFindById).not.toHaveBeenCalled()
    })

    it('returns success: false when no JWT available', async () => {
      mockSettingsGet.mockResolvedValue(null)

      const result = await syncSingleRate(2)

      expect(result).toEqual({ success: false })
      expect(mockGetLatestRates).not.toHaveBeenCalled()
    })

    it('handles installation setting returned as object (not string)', async () => {
      mockSettingsGet.mockResolvedValue({ id: 'test-id', jwt: 'obj-jwt-token' } as never)
      const eur = createCurrency({ id: 2, code: 'EUR', decimal_places: 2 })
      const usd = createCurrency({ id: 1, code: 'USD', is_system: true, decimal_places: 2 })
      mockFindById.mockResolvedValue(eur)
      mockFindSystem.mockResolvedValue(usd)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('EUR', 0.92), createApiRate('USD', 1.0)],
      })

      const result = await syncSingleRate(2)

      expect(mockGetLatestRates).toHaveBeenCalledWith(['EUR', 'USD'], 'obj-jwt-token')
      expect(result).toEqual({ success: true, rate: 0.92 })
    })

    it('returns success: false when currency not found', async () => {
      mockFindById.mockResolvedValue(null)

      const result = await syncSingleRate(999)

      expect(result).toEqual({ success: false })
    })

    it('returns success: false when no default currency', async () => {
      mockFindById.mockResolvedValue(createCurrency({ id: 2, code: 'EUR' }))
      mockFindSystem.mockResolvedValue(null)

      const result = await syncSingleRate(2)

      expect(result).toEqual({ success: false })
    })

    it('returns success: true without fetching when currency is default', async () => {
      const defaultCurrency = createCurrency({ id: 1, code: 'USD', is_system: true })
      mockFindById.mockResolvedValue(defaultCurrency)
      mockFindSystem.mockResolvedValue(defaultCurrency)

      const result = await syncSingleRate(1)

      expect(result).toEqual({ success: true })
      expect(mockGetLatestRates).not.toHaveBeenCalled()
    })

    it('fetches and saves rate for a single currency', async () => {
      const eur = createCurrency({ id: 2, code: 'EUR', decimal_places: 2 })
      const usd = createCurrency({ id: 1, code: 'USD', is_system: true, decimal_places: 2 })
      mockFindById.mockResolvedValue(eur)
      mockFindSystem.mockResolvedValue(usd)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('EUR', 0.92), createApiRate('USD', 1.0)],
      })

      const result = await syncSingleRate(2)

      expect(mockGetLatestRates).toHaveBeenCalledWith(['EUR', 'USD'], 'test-jwt-token')
      // relativeRate = 0.92 / 1.0 = 0.92
      expect(mockSetExchangeRate).toHaveBeenCalledWith(2, 0, expect.any(Number))
      expect(result).toEqual({ success: true, rate: 0.92 })
    })

    it('handles different decimal places', async () => {
      const btc = createCurrency({ id: 3, code: 'BTC', decimal_places: 8 })
      const usd = createCurrency({ id: 1, code: 'USD', is_system: true, decimal_places: 2 })
      mockFindById.mockResolvedValue(btc)
      mockFindSystem.mockResolvedValue(usd)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('BTC', 0.00001234), createApiRate('USD', 1.0)],
      })

      const result = await syncSingleRate(3)

      // relativeRate = 0.00001234
      expect(mockSetExchangeRate).toHaveBeenCalledWith(3, 0, expect.any(Number))
      expect(result).toEqual({ success: true, rate: 0.00001234 })
    })

    it('returns success: false when currency not in API response', async () => {
      const xyz = createCurrency({ id: 4, code: 'XYZ', decimal_places: 2 })
      const usd = createCurrency({ id: 1, code: 'USD', is_system: true })
      mockFindById.mockResolvedValue(xyz)
      mockFindSystem.mockResolvedValue(usd)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('USD', 1.0)], // No XYZ
      })

      const result = await syncSingleRate(4)

      expect(result).toEqual({ success: false })
      expect(mockSetExchangeRate).not.toHaveBeenCalled()
    })

    it('returns success: false when default currency not in API response', async () => {
      const eur = createCurrency({ id: 2, code: 'EUR', decimal_places: 2 })
      const xyz = createCurrency({ id: 1, code: 'XYZ', is_system: true })
      mockFindById.mockResolvedValue(eur)
      mockFindSystem.mockResolvedValue(xyz)
      mockGetLatestRates.mockResolvedValue({
        rates: [createApiRate('EUR', 0.92)], // No XYZ
      })

      const result = await syncSingleRate(2)

      expect(result).toEqual({ success: false })
      expect(mockSetExchangeRate).not.toHaveBeenCalled()
    })

    it('returns success: false when API call throws', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const eur = createCurrency({ id: 2, code: 'EUR', decimal_places: 2 })
      const usd = createCurrency({ id: 1, code: 'USD', is_system: true })
      mockFindById.mockResolvedValue(eur)
      mockFindSystem.mockResolvedValue(usd)
      mockGetLatestRates.mockRejectedValue(new Error('Network error'))

      const result = await syncSingleRate(2)

      expect(result).toEqual({ success: false })
      expect(mockSetExchangeRate).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })
})
