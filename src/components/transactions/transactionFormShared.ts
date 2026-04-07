import type { Account } from '../../types'
import { fromIntFrac, toIntFrac } from '../../utils/amount'

export type TransactionMode = 'expense' | 'income' | 'transfer' | 'exchange'

// Extended account with display info
export interface AccountOption extends Account {
  walletName: string
  walletIsDefault: boolean
  currencyCode: string
  currencySymbol: string
  decimalPlaces: number
}

export const getStep = (decimals: number) =>
  (1 / Math.pow(10, decimals)).toFixed(decimals)

export const getPlaceholder = (decimals: number) =>
  '0.' + '0'.repeat(decimals)

export const formatBalance = (balanceInt: number, balanceFrac: number, decimals: number) =>
  fromIntFrac(balanceInt, balanceFrac).toFixed(decimals)

export const toAmountIntFrac = (displayAmount: string): { int: number; frac: number } => {
  const parsed = parseFloat(displayAmount) || 0
  return toIntFrac(Math.abs(parsed))
}
