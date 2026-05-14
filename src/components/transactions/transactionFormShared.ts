import type { Account, TagContextOption } from '../../types'
import type { LiveSearchOption, SelectUIOption } from '../ui'
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

export const encodeTagSelection = (tagId: number, contextId?: number | null): string =>
  `${tagId}:${contextId ?? ''}`

export const parseTagSelection = (value: string | number): { tagId: number; contextId: number | null } => {
  const [tagPart, contextPart] = String(value).split(':')
  return {
    tagId: parseInt(tagPart, 10) || 0,
    contextId: contextPart ? parseInt(contextPart, 10) || null : null,
  }
}

export interface TagLiveSearchOption extends LiveSearchOption {
  tagName: string
  contextName: string | null
}

const normalizeTagContextOptions = (options: TagContextOption[]): TagContextOption[] => {
  const contextualTagIds = new Set(
    options
      .filter(option => option.context_id !== null && option.context_id !== undefined)
      .map(option => option.tag_id)
  )
  const contextualTagNames = new Set(
    options
      .filter(option => option.context_id !== null && option.context_id !== undefined)
      .map(option => option.tag_name)
  )
  const contextNames = new Set(
    options
      .map(option => option.context_name)
      .filter((name): name is string => !!name)
  )
  const emittedBranchParentNames = new Set<string>()
  const emittedValues = new Set<string>()

  return options.filter(option => {
    const hasContext = option.context_id !== null && option.context_id !== undefined
    if (!hasContext) {
      return !contextualTagIds.has(option.tag_id)
    }

    if (option.context_name && contextualTagNames.has(option.context_name)) {
      return false
    }

    if (contextNames.has(option.tag_name)) {
      if (emittedBranchParentNames.has(option.tag_name)) return false
      emittedBranchParentNames.add(option.tag_name)
    }

    const value = encodeTagSelection(option.tag_id, option.context_id)
    if (emittedValues.has(value)) return false
    emittedValues.add(value)
    return true
  })
}

export const toTagLiveSearchOptions = (options: TagContextOption[]) =>
  normalizeTagContextOptions(options).map((option) => ({
    value: encodeTagSelection(option.tag_id, option.context_id),
    label: option.context_name ? `${option.tag_name} ${option.context_name}` : option.tag_name,
    tagName: option.tag_name,
    contextName: option.context_name,
  }))

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
  `${account.currencyCode}${account.account_type && account.account_type !== 'plain' ? ` ${account.account_type === 'credits' ? 'Credit' : 'Savings'}` : ''} (${formatAmount(account.balance_int, account.balance_frac, account.decimal_places)})`

export interface AccountSelectUIOption extends SelectUIOption {
  account: AccountOption
  accountTypeLabel: string | null
}

export const getAccountTypeLabel = (account: AccountOption): string | null => {
  if (!account.account_type || account.account_type === 'plain') return null
  return account.account_type === 'credits' ? 'Credit' : 'Savings'
}

export const formatAccountSelectLabel = (account: AccountOption): string =>
  `${account.walletName}:${account.currencyCode}`

export const toAccountSelectUIOptions = (accounts: AccountOption[]): AccountSelectUIOption[] =>
  accounts.map((account) => ({
    value: account.id,
    label: formatAccountSelectLabel(account),
    account,
    accountTypeLabel: getAccountTypeLabel(account),
  }))

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
