const API_URL = import.meta.env.VITE_EXCHANGE_API_URL
const API_KEY = import.meta.env.VITE_EXCHANGE_API_KEY
const TIMEOUT_MS = 5000

export interface ExchangeRateItem {
  code: string
  value: number
  timestamp: string
  date: string
}

export interface ExchangeRateApiResponse {
  rates: ExchangeRateItem[]
}

export interface CurrencyListApiResponse {
  currencies: Record<string, string>
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        ...options.headers,
      },
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function getLatestRates(
  currencies?: string[]
): Promise<ExchangeRateApiResponse> {
  const params = new URLSearchParams()
  if (currencies?.length) {
    params.set('currencies', currencies.join(','))
  }

  const url = `${API_URL}/latest${params.toString() ? `?${params}` : ''}`
  const response = await fetchWithTimeout(url)

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export async function getSupportedCurrencies(
  includeCrypto = false
): Promise<CurrencyListApiResponse> {
  const params = new URLSearchParams()
  if (includeCrypto) {
    params.set('crypto', 'true')
  }

  const url = `${API_URL}/currencies${params.toString() ? `?${params}` : ''}`
  const response = await fetchWithTimeout(url)

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

export async function getHistoricalRates(
  date: string,
  currencies?: string[]
): Promise<ExchangeRateApiResponse> {
  const params = new URLSearchParams()
  params.set('date', date)
  if (currencies?.length) {
    params.set('currencies', currencies.join(','))
  }

  const url = `${API_URL}/historical?${params}`
  const response = await fetchWithTimeout(url)

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}
