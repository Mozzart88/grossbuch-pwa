import { describe, expect, it } from 'vitest'
import {
  groupAccountsByWallet,
  getAccountsForWallet,
  getDefaultAccountForWallet,
  getSelectedWalletId,
  getWalletOptions,
  formatAccountOptionLabel,
  encodeTagSelection,
  parseTagSelection,
  toTagLiveSearchOptions,
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

  it('encodes and parses tag selections with optional context', () => {
    expect(encodeTagSelection(40, 30)).toBe('40:30')
    expect(encodeTagSelection(40, null)).toBe('40:')
    expect(parseTagSelection('40:30')).toEqual({ tagId: 40, contextId: 30 })
    expect(parseTagSelection('40:')).toEqual({ tagId: 40, contextId: null })
    expect(parseTagSelection('bad:bad')).toEqual({ tagId: 0, contextId: null })
    expect(parseTagSelection(12)).toEqual({ tagId: 12, contextId: null })
  })

  it('converts tag context options to LiveSearch options', () => {
    expect(toTagLiveSearchOptions([
      {
        tag_id: 40,
        tag_name: 'Maintenance',
        context_id: 30,
        context_name: 'Central Park',
        label: 'Maintenance Central Park',
        type: 'expense',
      },
      {
        tag_id: 41,
        tag_name: 'Food',
        context_id: null,
        context_name: null,
        label: 'Food',
        type: 'expense',
      },
    ])).toEqual([
      {
        value: '40:30',
        label: 'Maintenance Central Park',
        tagName: 'Maintenance',
        contextName: 'Central Park',
      },
      {
        value: '41:',
        label: 'Food',
        tagName: 'Food',
        contextName: null,
      },
    ])
  })

  it('normalizes nested category options to top-level contexts only', () => {
    expect(toTagLiveSearchOptions([
      { tag_id: 1, tag_name: 'Auto', context_id: null, context_name: null, label: 'Auto', type: 'expense' },
      { tag_id: 2, tag_name: 'Boat', context_id: null, context_name: null, label: 'Boat', type: 'expense' },
      { tag_id: 3, tag_name: 'Housing', context_id: null, context_name: null, label: 'Housing', type: 'expense' },
      { tag_id: 4, tag_name: 'Fuel', context_id: null, context_name: null, label: 'Fuel', type: 'expense' },
      { tag_id: 4, tag_name: 'Fuel', context_id: 1, context_name: 'Auto', label: 'Fuel Auto', type: 'expense' },
      { tag_id: 4, tag_name: 'Fuel', context_id: 2, context_name: 'Boat', label: 'Fuel Boat', type: 'expense' },
      { tag_id: 5, tag_name: 'Gasoline', context_id: null, context_name: null, label: 'Gasoline', type: 'expense' },
      { tag_id: 5, tag_name: 'Gasoline', context_id: 4, context_name: 'Fuel', label: 'Gasoline Fuel', type: 'expense' },
      { tag_id: 5, tag_name: 'Gasoline', context_id: 1, context_name: 'Auto', label: 'Gasoline Auto', type: 'expense' },
      { tag_id: 6, tag_name: 'Diesel', context_id: null, context_name: null, label: 'Diesel', type: 'expense' },
      { tag_id: 6, tag_name: 'Diesel', context_id: 2, context_name: 'Boat', label: 'Diesel Boat', type: 'expense' },
      { tag_id: 6, tag_name: 'Diesel', context_id: 3, context_name: 'Housing', label: 'Diesel Housing', type: 'expense' },
    ])).toEqual([
      { value: '1:', label: 'Auto', tagName: 'Auto', contextName: null },
      { value: '2:', label: 'Boat', tagName: 'Boat', contextName: null },
      { value: '3:', label: 'Housing', tagName: 'Housing', contextName: null },
      { value: '4:1', label: 'Fuel Auto', tagName: 'Fuel', contextName: 'Auto' },
      { value: '5:1', label: 'Gasoline Auto', tagName: 'Gasoline', contextName: 'Auto' },
      { value: '6:2', label: 'Diesel Boat', tagName: 'Diesel', contextName: 'Boat' },
      { value: '6:3', label: 'Diesel Housing', tagName: 'Diesel', contextName: 'Housing' },
    ])
  })
})
