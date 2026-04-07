import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  createDatabaseMock,
  getTestDatabase,
  getCurrencyIdByCode,
} from './setup'

// Mock the external API and settings — these have no real implementation in tests
vi.mock('../../services/exchangeRate/exchangeRateApi', () => ({
  getHistoricalRates: vi.fn(),
}))

vi.mock('../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: vi.fn(),
  },
}))

let dbMock: ReturnType<typeof createDatabaseMock>

// Helper: store a rate in the DB with a specific date (sets updated_at to midnight UTC of that date)
function insertRateForDate(currencyId: number, rateInt: number, rateFrac: number, date: string): void {
  const updatedAt = Math.floor(new Date(date).getTime() / 1000)
  getTestDatabase().run(
    'INSERT INTO exchange_rate (currency_id, rate_int, rate_frac, updated_at) VALUES (?, ?, ?, ?)',
    [currencyId, rateInt, rateFrac, updatedAt]
  )
}

// Helper: insert a "today" rate (uses DB default updated_at = now)
function insertLatestRate(currencyId: number, rateInt: number, rateFrac: number): void {
  getTestDatabase().run(
    'INSERT INTO exchange_rate (currency_id, rate_int, rate_frac) VALUES (?, ?, ?)',
    [currencyId, rateInt, rateFrac]
  )
}

describe('Historical Exchange Rates Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  beforeEach(() => {
    resetTestDatabase()
    // exchange_rate is not cleared by resetTestDatabase (it keeps config tables),
    // but for test isolation we need a clean slate on every test
    getTestDatabase().run('DELETE FROM exchange_rate')
    vi.clearAllMocks()
    dbMock = createDatabaseMock()
    vi.doMock('../../services/database/connection', () => dbMock)

    // Restore online state between tests
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true, configurable: true })
  })

  // ─── currencyRepository ────────────────────────────────────────────────────

  describe('currencyRepository.getExchangeRateForDate', () => {
    it('returns the rate stored for an exact date', async () => {
      const { currencyRepository } = await import('../../services/repositories/currencyRepository')

      const eurId = getCurrencyIdByCode('EUR')
      insertRateForDate(eurId, 0, 850_000_000_000_000_000, '2024-03-10')

      const result = await currencyRepository.getExchangeRateForDate(eurId, '2024-03-10')

      expect(result).not.toBeNull()
      expect(result!.rate_int).toBe(0)
      expect(result!.rate_frac).toBe(850_000_000_000_000_000)
    })

    it('returns null when no rate exists for that date', async () => {
      const { currencyRepository } = await import('../../services/repositories/currencyRepository')

      const eurId = getCurrencyIdByCode('EUR')
      insertRateForDate(eurId, 1, 0, '2024-01-15')

      const result = await currencyRepository.getExchangeRateForDate(eurId, '2024-03-10')

      expect(result).toBeNull()
    })

    it('returns the most recent row when multiple rates exist for the same date', async () => {
      const { currencyRepository } = await import('../../services/repositories/currencyRepository')

      const eurId = getCurrencyIdByCode('EUR')
      // Two rates on the same calendar date but different seconds
      const base = Math.floor(new Date('2024-03-10').getTime() / 1000)
      getTestDatabase().run(
        'INSERT INTO exchange_rate (currency_id, rate_int, rate_frac, updated_at) VALUES (?, ?, ?, ?)',
        [eurId, 0, 800_000_000_000_000_000, base]
      )
      getTestDatabase().run(
        'INSERT INTO exchange_rate (currency_id, rate_int, rate_frac, updated_at) VALUES (?, ?, ?, ?)',
        [eurId, 0, 900_000_000_000_000_000, base + 3600]
      )

      const result = await currencyRepository.getExchangeRateForDate(eurId, '2024-03-10')

      expect(result!.rate_frac).toBe(900_000_000_000_000_000) // latest of that day
    })
  })

  describe('currencyRepository.getExchangeRateNearDate', () => {
    it('returns the closest rate within the offset window', async () => {
      const { currencyRepository } = await import('../../services/repositories/currencyRepository')

      const gbpId = getCurrencyIdByCode('GBP')
      insertRateForDate(gbpId, 1, 200_000_000_000_000_000, '2024-03-07') // 3 days before target
      insertRateForDate(gbpId, 1, 300_000_000_000_000_000, '2024-03-12') // 2 days after target

      // Searching around 2024-03-10 within ±3 days — closest is March 12 (2 days away)
      const result = await currencyRepository.getExchangeRateNearDate(gbpId, '2024-03-10', 3)

      expect(result).not.toBeNull()
      expect(result!.rate_frac).toBe(300_000_000_000_000_000)
    })

    it('returns null when no rate within the window', async () => {
      const { currencyRepository } = await import('../../services/repositories/currencyRepository')

      const gbpId = getCurrencyIdByCode('GBP')
      insertRateForDate(gbpId, 1, 0, '2024-01-01') // far outside any ±3 window around March

      const result = await currencyRepository.getExchangeRateNearDate(gbpId, '2024-03-10', 3)

      expect(result).toBeNull()
    })

    it('respects the maxOffsetDays boundary exactly', async () => {
      const { currencyRepository } = await import('../../services/repositories/currencyRepository')

      const gbpId = getCurrencyIdByCode('GBP')
      insertRateForDate(gbpId, 2, 0, '2024-03-07') // exactly 3 days before

      const withinWindow = await currencyRepository.getExchangeRateNearDate(gbpId, '2024-03-10', 3)
      expect(withinWindow).not.toBeNull()

      const outsideWindow = await currencyRepository.getExchangeRateNearDate(gbpId, '2024-03-10', 2)
      expect(outsideWindow).toBeNull()
    })
  })

  describe('currencyRepository.setExchangeRate with dateStr', () => {
    it('stores the rate with updated_at at midnight UTC of the given date', async () => {
      const { currencyRepository } = await import('../../services/repositories/currencyRepository')

      const eurId = getCurrencyIdByCode('EUR')
      await currencyRepository.setExchangeRate(eurId, 0, 850_000_000_000_000_000, '2024-06-15')

      const db = getTestDatabase()
      const result = db.exec(
        "SELECT rate_int, rate_frac, date(updated_at, 'unixepoch') as rate_date FROM exchange_rate WHERE currency_id = ?",
        [eurId]
      )

      expect(result[0].values).toHaveLength(1)
      const [rateInt, rateFrac, rateDate] = result[0].values[0]
      expect(rateInt).toBe(0)
      expect(rateFrac).toBe(850_000_000_000_000_000)
      expect(rateDate).toBe('2024-06-15')
    })

    it('stored date-rate is retrievable by getExchangeRateForDate', async () => {
      const { currencyRepository } = await import('../../services/repositories/currencyRepository')

      const eurId = getCurrencyIdByCode('EUR')
      await currencyRepository.setExchangeRate(eurId, 1, 123_000_000_000_000_000, '2024-06-20')

      const result = await currencyRepository.getExchangeRateForDate(eurId, '2024-06-20')

      expect(result).not.toBeNull()
      expect(result!.rate_int).toBe(1)
      expect(result!.rate_frac).toBe(123_000_000_000_000_000)
    })
  })

  // ─── historicalRateService ─────────────────────────────────────────────────

  describe('getRateForDate', () => {
    beforeEach(async () => {
      // Provide a JWT token by default
      const { settingsRepository } = await import('../../services/repositories/settingsRepository')
      vi.mocked(settingsRepository.get).mockResolvedValue(JSON.stringify({ jwt: 'test-jwt' }))
    })

    it('returns latest rate immediately when date is today', async () => {
      const eurId = getCurrencyIdByCode('EUR')
      insertLatestRate(eurId, 1, 100_000_000_000_000_000)

      const { getRateForDate } = await import('../../services/exchangeRate/historicalRateService')
      const today = new Date().toISOString().slice(0, 10)

      const result = await getRateForDate(eurId, today)

      expect(result).toEqual({ int: 1, frac: 100_000_000_000_000_000 })
      const { getHistoricalRates } = await import('../../services/exchangeRate/exchangeRateApi')
      expect(vi.mocked(getHistoricalRates)).not.toHaveBeenCalled()
    })

    it('returns exact-date rate from DB without hitting the API', async () => {
      const eurId = getCurrencyIdByCode('EUR')
      insertRateForDate(eurId, 0, 920_000_000_000_000_000, '2024-04-01')

      const { getRateForDate } = await import('../../services/exchangeRate/historicalRateService')
      const result = await getRateForDate(eurId, '2024-04-01')

      expect(result).toEqual({ int: 0, frac: 920_000_000_000_000_000 })
      const { getHistoricalRates } = await import('../../services/exchangeRate/exchangeRateApi')
      expect(vi.mocked(getHistoricalRates)).not.toHaveBeenCalled()
    })

    it('fetches from API, stores in DB, and returns the computed rate', async () => {
      const { getHistoricalRates } = await import('../../services/exchangeRate/exchangeRateApi')
      vi.mocked(getHistoricalRates).mockResolvedValue({
        rates: [
          { code: 'EUR', value: 0.92, timestamp: '', date: '2024-05-10' },
          { code: 'USD', value: 1.0, timestamp: '', date: '2024-05-10' },
        ],
      })

      const eurId = getCurrencyIdByCode('EUR')
      const { getRateForDate } = await import('../../services/exchangeRate/historicalRateService')
      const result = await getRateForDate(eurId, '2024-05-10')

      // 0.92 / 1.0 = 0.92 → toIntFrac(0.92) = { int: 0, frac: 920000000000000000 }
      expect(result.int).toBe(0)
      expect(result.frac).toBeCloseTo(920_000_000_000_000_000, -10)

      // Rate should now be persisted in DB for that date
      const { currencyRepository } = await import('../../services/repositories/currencyRepository')
      const stored = await currencyRepository.getExchangeRateForDate(eurId, '2024-05-10')
      expect(stored).not.toBeNull()
    })

    it('falls back to nearby DB rate and caches it for the original date', async () => {
      const { getHistoricalRates } = await import('../../services/exchangeRate/exchangeRateApi')
      vi.mocked(getHistoricalRates).mockResolvedValue({ rates: [] }) // API returns nothing

      const eurId = getCurrencyIdByCode('EUR')
      // Store a rate 2 days before the target
      insertRateForDate(eurId, 0, 880_000_000_000_000_000, '2024-07-08')

      const { getRateForDate } = await import('../../services/exchangeRate/historicalRateService')
      const result = await getRateForDate(eurId, '2024-07-10')

      expect(result).toEqual({ int: 0, frac: 880_000_000_000_000_000 })

      // The found rate should also be cached for 2024-07-10
      const { currencyRepository } = await import('../../services/repositories/currencyRepository')
      const cached = await currencyRepository.getExchangeRateForDate(eurId, '2024-07-10')
      expect(cached).not.toBeNull()
      expect(cached!.rate_frac).toBe(880_000_000_000_000_000)
    })

    it('fetches a nearby date from API when local DB has nothing nearby', async () => {
      const targetDate = '2024-08-15'
      const nearbyDate = '2024-08-14' // 1 day before

      const { getHistoricalRates } = await import('../../services/exchangeRate/exchangeRateApi')
      vi.mocked(getHistoricalRates).mockImplementation(async (date) => {
        if (date === nearbyDate) {
          return {
            rates: [
              { code: 'EUR', value: 0.91, timestamp: '', date: nearbyDate },
              { code: 'USD', value: 1.0, timestamp: '', date: nearbyDate },
            ],
          }
        }
        return { rates: [] }
      })

      const eurId = getCurrencyIdByCode('EUR')
      const { getRateForDate } = await import('../../services/exchangeRate/historicalRateService')
      const result = await getRateForDate(eurId, targetDate)

      expect(result.int).toBe(0)
      expect(result.frac).toBeCloseTo(910_000_000_000_000_000, -10)

      // Both the nearby date and the original target should be stored
      const { currencyRepository } = await import('../../services/repositories/currencyRepository')
      const nearbyStored = await currencyRepository.getExchangeRateForDate(eurId, nearbyDate)
      const targetStored = await currencyRepository.getExchangeRateForDate(eurId, targetDate)
      expect(nearbyStored).not.toBeNull()
      expect(targetStored).not.toBeNull()
    })

    it('falls back to latest stored rate when offline and no nearby local rate', async () => {
      Object.defineProperty(global, 'navigator', { value: { onLine: false }, writable: true, configurable: true })

      const eurId = getCurrencyIdByCode('EUR')
      // Only a "today" rate exists — far from the requested date
      insertLatestRate(eurId, 1, 50_000_000_000_000_000)

      const { getRateForDate } = await import('../../services/exchangeRate/historicalRateService')
      const result = await getRateForDate(eurId, '2020-01-01')

      // No nearby rate → falls back to latest
      expect(result).toEqual({ int: 1, frac: 50_000_000_000_000_000 })
      const { getHistoricalRates } = await import('../../services/exchangeRate/exchangeRateApi')
      expect(vi.mocked(getHistoricalRates)).not.toHaveBeenCalled()
    })

    it('falls back to latest rate when no token available', async () => {
      const { settingsRepository } = await import('../../services/repositories/settingsRepository')
      vi.mocked(settingsRepository.get).mockResolvedValue(null)

      const eurId = getCurrencyIdByCode('EUR')
      insertLatestRate(eurId, 2, 0)

      const { getRateForDate } = await import('../../services/exchangeRate/historicalRateService')
      const result = await getRateForDate(eurId, '2024-01-01')

      expect(result).toEqual({ int: 2, frac: 0 })
      const { getHistoricalRates } = await import('../../services/exchangeRate/exchangeRateApi')
      expect(vi.mocked(getHistoricalRates)).not.toHaveBeenCalled()
    })

    it('falls back to latest rate when API returns nothing for any date', async () => {
      const { getHistoricalRates } = await import('../../services/exchangeRate/exchangeRateApi')
      vi.mocked(getHistoricalRates).mockResolvedValue({ rates: [] })

      const eurId = getCurrencyIdByCode('EUR')
      insertLatestRate(eurId, 1, 750_000_000_000_000_000)

      const { getRateForDate } = await import('../../services/exchangeRate/historicalRateService')
      // Use a date far enough in the past that no nearby rate exists
      const result = await getRateForDate(eurId, '2020-06-15')

      expect(result).toEqual({ int: 1, frac: 750_000_000_000_000_000 })
    })
  })
})
