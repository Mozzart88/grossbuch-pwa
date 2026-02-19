import { fromIntFrac, toIntFrac } from './amount'

/** Format currency from (int, frac) pair */
export function formatCurrency(int: number, frac: number, symbol: string, decimalPlaces: number = 2): string {
  const value = fromIntFrac(int, frac)
  return formatCurrencyValue(value, symbol, decimalPlaces)
}

/** Format currency from a float value */
export function formatCurrencyValue(value: number, symbol: string, decimalPlaces: number = 2): string {
  const formatted = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  })
  const sign = value < 0 ? '-' : ''
  return `${sign}${symbol}${formatted}`
}

/** Format amount from (int, frac) pair */
export function formatAmount(int: number, frac: number, decimalPlaces: number = 2): string {
  const value = fromIntFrac(int, frac)
  return formatAmountValue(value, decimalPlaces)
}

/** Format amount from a float value */
export function formatAmountValue(value: number, decimalPlaces: number = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  })
}

export function parseAmount(value: string): { int: number; frac: number } {
  const cleaned = value.replace(/[^\d.-]/g, '')
  const parsed = parseFloat(cleaned)
  if (isNaN(parsed)) return { int: 0, frac: 0 }
  return toIntFrac(Math.abs(parsed))
}
