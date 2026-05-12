import { describe, expect, it } from 'vitest'
import {
  groupAccountsByWallet,
  getAccountsForWallet,
  getDefaultAccountForWallet,
  getSelectedWalletId,
  getWalletOptions,
  formatAccountOptionLabel,
} from '../../../../components/transactions/transactionFormShared'
import type { AccountOption } from '../../../../components/transactions/transactionFormShared'

const accounts: AccountOption[] = [
  {
    id: 1,
    wallet_id: 1,
    currency_id: 1,
    balance_int: 500,
    balance_frac: 0,
    updated_at: 1704067200,
    is_default: false,
    walletName: 'Cash',
    walletIsDefault: true,
    currencyCode: 'USD',
    currencySymbol: '$',
    decimalPlaces: 2,
  },
  {
    id: 2,
    wallet_id: 1,
    currency_id: 2,
    balance_int: 200,
    balance_frac: 0,
    updated_at: 1704067200,
    is_default: true,
    walletName: 'Cash',
    walletIsDefault: true,
    currencyCode: 'EUR',
    currencySymbol: '€',
    decimalPlaces: 2,
  },
  {
    id: 3,
    wallet_id: 2,
    currency_id: 1,
    balance_int: 100,
    balance_frac: 500000000000000000,
    updated_at: 1704067200,
    walletName: 'Bank',
    walletIsDefault: false,
    currencyCode: 'USD',
    currencySymbol: '$',
    decimalPlaces: 2,
  },
]

describe('transactionFormShared account helpers', () => {
  it('groups accounts by wallet', () => {
    expect(groupAccountsByWallet(accounts)).toEqual({
      1: [accounts[0], accounts[1]],
      2: [accounts[2]],
    })
  })

  it('derives wallet and account options', () => {
    expect(getWalletOptions(accounts)).toEqual([
      { id: 1, name: 'Cash', isDefault: true },
      { id: 2, name: 'Bank', isDefault: false },
    ])
    expect(getSelectedWalletId(accounts, '2')).toBe('1')
    expect(getSelectedWalletId(accounts, 'missing')).toBe('')
    expect(getAccountsForWallet(accounts, '2')).toEqual([accounts[2]])
    expect(getAccountsForWallet(accounts, '')).toEqual(accounts)
  })

  it('selects the wallet default account or falls back to the first account', () => {
    expect(getDefaultAccountForWallet(accounts, '1')).toBe(accounts[1])
    expect(getDefaultAccountForWallet(accounts, '2')).toBe(accounts[2])
    expect(getDefaultAccountForWallet(accounts, 'missing')).toBeUndefined()
  })

  it('formats account option labels without wallet names', () => {
    expect(formatAccountOptionLabel(accounts[0])).toMatch(/USD \(500[.,]00\)/)
    expect(formatAccountOptionLabel(accounts[2])).toMatch(/USD \(100[.,]50\)/)
  })
})
