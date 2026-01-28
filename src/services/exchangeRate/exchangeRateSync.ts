import { currencyRepository } from '../repositories/currencyRepository'
import { getLatestRates } from './exchangeRateApi'

export async function syncRates(): Promise<void> {
  // Skip if offline
  if (!navigator.onLine) {
    console.warn('[ExchangeRateSync] Offline, skipping sync')
    return
  }

  // Get all user currencies
  const currencies = await currencyRepository.findAll()
  if (currencies.length === 0) {
    console.warn('[ExchangeRateSync] No currencies found')
    return
  }

  // Find default currency
  const defaultCurrency = currencies.find((c) => c.is_default)
  if (!defaultCurrency) {
    console.warn('[ExchangeRateSync] No default currency set')
    return
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
    return
  }

  // Save rates for each currency
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
  }

  console.log(
    `[ExchangeRateSync] Synced rates for ${currencies.length - 1} currencies`
  )
}
