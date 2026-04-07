import { currencyRepository } from '../repositories/currencyRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import { getHistoricalRates } from './exchangeRateApi'
import { toIntFrac } from '../../utils/amount'
import type { IntFrac } from '../../utils/amount'

const MAX_THRESHOLD = 30

function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

function offsetDate(date: string, days: number): string {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function getToken(): Promise<string | null> {
  const raw = await settingsRepository.get('installation_id')
  const installation = raw
    ? typeof raw === 'string' ? JSON.parse(raw) : raw
    : null
  return installation?.jwt ?? null
}

async function fetchAndStoreRate(
  currencyId: number,
  currencyCode: string,
  defaultCurrencyCode: string,
  date: string,
  token: string
): Promise<IntFrac | null> {
  try {
    const response = await getHistoricalRates(date, [currencyCode, defaultCurrencyCode], token)
    const ratesMap = new Map(response.rates.map((r) => [r.code, r.value]))
    const apiRate = ratesMap.get(currencyCode)
    const defaultApiRate = ratesMap.get(defaultCurrencyCode)
    if (apiRate === undefined || defaultApiRate === undefined) return null

    const relativeRate = apiRate / defaultApiRate
    const { int: rateInt, frac: rateFrac } = toIntFrac(relativeRate)
    await currencyRepository.setExchangeRate(currencyId, rateInt, rateFrac, date)
    return { int: rateInt, frac: rateFrac }
  } catch {
    return null
  }
}

async function searchNearbyDates(
  currencyId: number,
  currencyCode: string,
  defaultCurrencyCode: string,
  targetDate: string,
  token: string,
  threshold: number
): Promise<IntFrac | null> {
  if (threshold > MAX_THRESHOLD) return null

  for (let offset = 1; offset <= threshold; offset++) {
    for (const candidate of [offsetDate(targetDate, -offset), offsetDate(targetDate, offset)]) {
      // Check local DB first
      const local = await currencyRepository.getExchangeRateForDate(currencyId, candidate)
      if (local) {
        // Also store for the originally requested date so future lookups hit cache
        await currencyRepository.setExchangeRate(currencyId, local.rate_int, local.rate_frac, targetDate)
        return { int: local.rate_int, frac: local.rate_frac }
      }

      // Try API for this candidate date
      const found = await fetchAndStoreRate(currencyId, currencyCode, defaultCurrencyCode, candidate, token)
      if (found) {
        // Also store for the originally requested date
        await currencyRepository.setExchangeRate(currencyId, found.int, found.frac, targetDate)
        return found
      }
    }
  }

  // Expand threshold by 1 and recurse
  return searchNearbyDates(currencyId, currencyCode, defaultCurrencyCode, targetDate, token, threshold + 1)
}

/**
 * Get the exchange rate for a currency on a specific date (YYYY-MM-DD).
 * Falls back progressively: local DB → API exact date → nearby dates (±3 expanding) → latest stored rate.
 */
export async function getRateForDate(currencyId: number, date: string): Promise<IntFrac> {
  // If not a past date, use the standard latest-rate flow
  if (date >= todayString()) {
    return currencyRepository.getRateForCurrency(currencyId)
  }

  // 1. Check local DB for exact date
  const local = await currencyRepository.getExchangeRateForDate(currencyId, date)
  if (local) return { int: local.rate_int, frac: local.rate_frac }

  // 2. Offline fallback: nearest local rate within 3 days, then latest
  if (!navigator.onLine) {
    const near = await currencyRepository.getExchangeRateNearDate(currencyId, date, 3)
    if (near) return { int: near.rate_int, frac: near.rate_frac }
    return currencyRepository.getRateForCurrency(currencyId)
  }

  // 3. Get auth token
  const token = await getToken()
  if (!token) return currencyRepository.getRateForCurrency(currencyId)

  // 4. Resolve currency codes
  const currency = await currencyRepository.findById(currencyId)
  if (!currency) return currencyRepository.getRateForCurrency(currencyId)
  const defaultCurrency = await currencyRepository.findSystem()
  if (!defaultCurrency) return currencyRepository.getRateForCurrency(currencyId)

  // System currency always has rate 1
  if (currency.is_system) return { int: 1, frac: 0 }

  // 5. Try API for exact date
  const exact = await fetchAndStoreRate(currencyId, currency.code, defaultCurrency.code, date, token)
  if (exact) return exact

  // 6. Search nearby dates with expanding threshold
  const nearby = await searchNearbyDates(
    currencyId, currency.code, defaultCurrency.code, date, token, 3
  )
  if (nearby) return nearby

  // 7. Final fallback: latest stored rate
  return currencyRepository.getRateForCurrency(currencyId)
}
