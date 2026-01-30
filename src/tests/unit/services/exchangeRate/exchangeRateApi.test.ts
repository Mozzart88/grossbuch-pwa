import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Set up environment before importing module
vi.stubEnv('VITE_EXCHANGE_API_URL', 'https://api.example.com')
vi.stubEnv('VITE_EXCHANGE_API_KEY', 'test-api-key')

// Dynamic import to pick up stubbed env vars
const { getLatestRates, getSupportedCurrencies, getHistoricalRates } =
  await import('../../../../services/exchangeRate/exchangeRateApi')

describe('exchangeRateApi', () => {
  const mockFetch = vi.fn()
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  const mockResponse = (data: unknown, ok = true, status = 200) => {
    return Promise.resolve({
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
    })
  }

  describe('getLatestRates', () => {
    it('fetches rates from /latest endpoint', async () => {
      const responseData = {
        rates: [
          { code: 'EUR', value: 0.92, timestamp: '2025-01-28 12:00:00', date: '2025-01-28' },
          { code: 'GBP', value: 0.79, timestamp: '2025-01-28 12:00:00', date: '2025-01-28' },
        ],
      }
      mockFetch.mockReturnValue(mockResponse(responseData))

      const result = await getLatestRates()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/latest',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      )
      expect(result).toEqual(responseData)
    })

    it('includes currencies parameter when provided', async () => {
      mockFetch.mockReturnValue(mockResponse({ rates: [] }))

      await getLatestRates(['EUR', 'GBP'])

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/latest?currencies=EUR%2CGBP',
        expect.any(Object)
      )
    })

    it('throws error on non-ok response', async () => {
      mockFetch.mockReturnValue(mockResponse({}, false, 401))

      await expect(getLatestRates()).rejects.toThrow('API error: 401 Error')
    })

    it('passes abort signal to fetch', async () => {
      mockFetch.mockReturnValue(mockResponse({ rates: [] }))

      await getLatestRates()

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      )
    })
  })

  describe('getSupportedCurrencies', () => {
    it('fetches from /currencies endpoint', async () => {
      const responseData = { currencies: { USD: 'US Dollar', EUR: 'Euro' } }
      mockFetch.mockReturnValue(mockResponse(responseData))

      const result = await getSupportedCurrencies()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/currencies',
        expect.any(Object)
      )
      expect(result).toEqual(responseData)
    })

    it('includes crypto parameter when true', async () => {
      mockFetch.mockReturnValue(mockResponse({ currencies: {} }))

      await getSupportedCurrencies(true)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/currencies?crypto=true',
        expect.any(Object)
      )
    })

    it('throws error on non-ok response', async () => {
      mockFetch.mockReturnValue(mockResponse({}, false, 500))

      await expect(getSupportedCurrencies()).rejects.toThrow('API error: 500')
    })
  })

  describe('getHistoricalRates', () => {
    it('fetches from /historical endpoint with date', async () => {
      const responseData = {
        rates: [
          { code: 'EUR', value: 0.91, timestamp: '2025-01-01 12:00:00', date: '2025-01-01' },
        ],
      }
      mockFetch.mockReturnValue(mockResponse(responseData))

      const result = await getHistoricalRates('2025-01-01')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/historical?date=2025-01-01',
        expect.any(Object)
      )
      expect(result).toEqual(responseData)
    })

    it('includes currencies parameter when provided', async () => {
      mockFetch.mockReturnValue(mockResponse({ rates: [] }))

      await getHistoricalRates('2025-01-01', ['EUR', 'JPY'])

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('date=2025-01-01'),
        expect.any(Object)
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('currencies=EUR%2CJPY'),
        expect.any(Object)
      )
    })

    it('throws error on non-ok response', async () => {
      mockFetch.mockReturnValue(mockResponse({}, false, 404))

      await expect(getHistoricalRates('2025-01-01')).rejects.toThrow(
        'API error: 404'
      )
    })
  })
})
