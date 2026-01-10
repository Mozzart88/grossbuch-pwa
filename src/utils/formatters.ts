export function formatCurrency(amount: number, symbol: string, decimalPlaces: number = 2): string {
  const formatted = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  })
  const sign = amount < 0 ? '-' : ''
  return `${sign}${symbol}${formatted}`
}

export function formatAmount(amount: number, decimalPlaces: number = 2): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  })
}

export function parseAmount(value: string): number {
  // Remove all non-numeric characters except dots and minus
  const cleaned = value.replace(/[^\d.-]/g, '')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}
