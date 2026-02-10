import { currencyRepository } from '../repositories/currencyRepository'
import { getLatestRates } from './exchangeRateApi'

export interface SyncRatesResult {
  success: boolean
  syncedCount: number
  skippedReason?: 'offline' | 'no_currencies' | 'no_accounts' | 'no_default' | 'default_not_in_api'
}

export interface SyncSingleRateResult {
  success: boolean
  rate?: number
}

export async function syncSingleRate(currencyId: number): Promise<SyncSingleRateResult> {
  if (!navigator.onLine) {
    return { success: false }
  }

  const currency = await currencyRepository.findById(currencyId)
  if (!currency) {
    return { success: false }
  }

  const defaultCurrency = await currencyRepository.findDefault()
  if (!defaultCurrency) {
    return { success: false }
  }

  // No rate needed if this IS the default currency
  if (currency.id === defaultCurrency.id) {
    return { success: true }
  }

  try {
    const response = await getLatestRates([currency.code, defaultCurrency.code])
    const ratesMap = new Map(response.rates.map((r) => [r.code, r.value]))

    const apiRate = ratesMap.get(currency.code)
    const defaultCurrencyApiRate = ratesMap.get(defaultCurrency.code)

    if (apiRate === undefined || defaultCurrencyApiRate === undefined) {
      return { success: false }
    }

    const relativeRate = apiRate / defaultCurrencyApiRate
    const storedRate = Math.round(relativeRate * Math.pow(10, currency.decimal_places))

    await currencyRepository.setExchangeRate(currency.id, storedRate)

    return { success: true, rate: storedRate }
  } catch (error) {
    console.warn('[ExchangeRateSync] Failed to fetch single rate:', error)
    return { success: false }
  }
}

export async function syncRates(): Promise<SyncRatesResult> {
  // Skip if offline
  if (!navigator.onLine) {
    console.warn('[ExchangeRateSync] Offline, skipping sync')
    return { success: false, syncedCount: 0, skippedReason: 'offline' }
  }

  // Get only currencies that are linked to accounts (active or virtual)
  const currencies = await currencyRepository.findUsedInAccounts()
  if (currencies.length === 0) {
    console.warn('[ExchangeRateSync] No currencies linked to accounts')
    return { success: false, syncedCount: 0, skippedReason: 'no_accounts' }
  }

  // Find default currency
  const defaultCurrency = currencies.find((c) => c.is_default)
  if (!defaultCurrency) {
    console.warn('[ExchangeRateSync] No default currency set')
    return { success: false, syncedCount: 0, skippedReason: 'no_default' }
  }

  // Get currency codes to fetch
  const currencyCodes = currencies.map((c) => c.code)

  // Fetch rates from API
  const response = await getLatestRates(currencyCodes)

  // Convert rates array to map for easier lookup
  const ratesMap = new Map(response.rates.map((r) => [r.code, r.value]))

  // Get the API rate for the default currency (to convert all rates relative to it)
  const defaultCurrencyApiRate = ratesMap.get(defaultCurrency.code)
  if (defaultCurrencyApiRate === undefined) {
    console.warn(
      `[ExchangeRateSync] Default currency ${defaultCurrency.code} not found in API response`
    )
    return { success: false, syncedCount: 0, skippedReason: 'default_not_in_api' }
  }

  // Save rates for each currency
  let syncedCount = 0
  for (const currency of currencies) {
    // Skip default currency (rate is always 1)
    if (currency.is_default) {
      continue
    }

    const apiRate = ratesMap.get(currency.code)
    if (apiRate === undefined) {
      console.warn(
        `[ExchangeRateSync] Currency ${currency.code} not found in API response`
      )
      continue
    }

    // Convert rate relative to default currency
    // If API gives USD-based rates and default is EUR:
    // EUR rate = apiRate / defaultCurrencyApiRate
    const relativeRate = apiRate / defaultCurrencyApiRate

    // Convert to integer storage format (multiply by 10^decimalPlaces)
    const storedRate = Math.round(
      relativeRate * Math.pow(10, currency.decimal_places)
    )

    // Save to database
    await currencyRepository.setExchangeRate(currency.id, storedRate)
    syncedCount++
  }

  console.log(`[ExchangeRateSync] Synced rates for ${syncedCount} currencies`)
  return { success: true, syncedCount }
}
