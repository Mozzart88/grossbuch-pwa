import type { Account } from '../../types'
import { fromIntFrac, toIntFrac } from '../../utils/amount'
import { toLocalISOString } from '../../utils/dateUtils'
import { formatAmount } from '../../utils/formatters';

export type TransactionMode = 'expense' | 'income' | 'transfer' | 'exchange'

// Extended account with display info
export interface AccountOption extends Account {
  walletName: string
  walletIsDefault: boolean
  currencyCode: string
  currencySymbol: string
  decimalPlaces: number
}

export interface SubmitOptions {
  addAnother?: boolean
}

export interface WalletOption {
  id: number
  name: string
  isDefault: boolean
}

export const groupAccountsByWallet = (accounts: AccountOption[]) =>
  accounts.reduce<Record<number, AccountOption[]>>((groups, account) => {
    groups[account.wallet_id] = groups[account.wallet_id] || []
    groups[account.wallet_id].push(account)
    return groups
  }, {})

export const getWalletOptions = (accounts: AccountOption[]): WalletOption[] => {
  const seen = new Set<number>()
  return accounts.reduce<WalletOption[]>((wallets, account) => {
    if (seen.has(account.wallet_id)) return wallets
    seen.add(account.wallet_id)
    wallets.push({
      id: account.wallet_id,
      name: account.walletName,
      isDefault: account.walletIsDefault,
    })
    return wallets
  }, [])
}

export const getSelectedWalletId = (accounts: AccountOption[], accountId: string): string => {
  const account = accounts.find(a => a.id.toString() === accountId)
  return account?.wallet_id.toString() ?? ''
}

export const getAccountsForWallet = (accounts: AccountOption[], walletId: string): AccountOption[] =>
  walletId ? accounts.filter(a => a.wallet_id.toString() === walletId) : accounts

export const getDefaultAccountForWallet = (accounts: AccountOption[], walletId: string): AccountOption | undefined => {
  const walletAccounts = getAccountsForWallet(accounts, walletId)
  return walletAccounts.find(a => a.is_default) || walletAccounts[0]
}

export const formatAccountOptionLabel = (account: AccountOption): string =>
  `${account.currencyCode} (${formatAmount(account.balance_int, account.balance_frac, account.decimal_places)})`

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

export const toDateString = (datetimeMs: number): string =>
  toLocalISOString(new Date(datetimeMs)).slice(0, 10)

export const isDateInPast = (datetimeMs: number): boolean =>
  toDateString(datetimeMs) < toLocalISOString(new Date()).slice(0, 10)
