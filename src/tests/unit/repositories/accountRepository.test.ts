import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Account, AccountInput, ExchangeRate } from '../../../types'
import { SYSTEM_TAGS } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  getLastInsertId: vi.fn(),
}))

vi.mock('../../../services/repositories/currencyRepository', () => ({
  currencyRepository: {
    getExchangeRate: vi.fn(),
    getSystemRateInfo: vi.fn().mockResolvedValue({ rate: 1, currencyId: 1 }),
  },
}))

import { accountRepository } from '../../../services/repositories/accountRepository'
import { currencyRepository } from '../../../services/repositories/currencyRepository'
import { execSQL, querySQL, queryOne, getLastInsertId } from '../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)
const mockGetLastInsertId = vi.mocked(getLastInsertId)
const mockGetExchangeRate = vi.mocked(currencyRepository.getExchangeRate)

describe('accountRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleAccount: Account = {
    id: 1,
    wallet_id: 1,
    currency_id: 1,
    balance_int: 1000,
    balance_frac: 0,
    updated_at: 1704067200,
    wallet: 'Main Wallet',
    currency: 'USD',
    is_default: true,
  }

  describe('findAll', () => {
    it('returns all accounts from accounts view', async () => {
      const accounts = [
        { id: 1, wallet: 'Main', currency: 'USD', tags: 'default', balance_int: 1000, balance_frac: 0, updated_at: 0 },
      ]
      mockQuerySQL.mockResolvedValue(accounts)

      const result = await accountRepository.findAll()

      expect(mockQuerySQL).toHaveBeenCalledWith('SELECT * FROM accounts')
      expect(result).toEqual(accounts)
    })

    it('returns empty array when no accounts exist', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await accountRepository.findAll()

      expect(result).toEqual([])
    })
  })

  describe('findById', () => {
    it('returns account with wallet and currency info when found', async () => {
      mockQueryOne.mockResolvedValue(sampleAccount)

      const result = await accountRepository.findById(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.id = ?'),
        [SYSTEM_TAGS.DEFAULT, 1]
      )
      expect(result).toEqual(sampleAccount)
    })

    it('returns null when account not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await accountRepository.findById(999)

      expect(result).toBeNull()
    })
  })

  describe('findByWalletId', () => {
    it('returns accounts for wallet ordered by default status', async () => {
      const accounts = [sampleAccount, { ...sampleAccount, id: 2, currency: 'EUR', is_default: false }]
      mockQuerySQL.mockResolvedValue(accounts)

      const result = await accountRepository.findByWalletId(1)

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.wallet_id = ?'),
        [SYSTEM_TAGS.DEFAULT, 1]
      )
      expect(result).toEqual(accounts)
    })
  })

  describe('findByCurrencyId', () => {
    it('returns accounts with specific currency', async () => {
      mockQuerySQL.mockResolvedValue([sampleAccount])

      const result = await accountRepository.findByCurrencyId(1)

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.currency_id = ?'),
        [SYSTEM_TAGS.DEFAULT, 1]
      )
      expect(result).toEqual([sampleAccount])
    })
  })

  describe('findByWalletAndCurrency', () => {
    it('returns account for wallet-currency combination', async () => {
      mockQueryOne.mockResolvedValue(sampleAccount)

      const result = await accountRepository.findByWalletAndCurrency(1, 1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.wallet_id = ? AND a.currency_id = ?'),
        [SYSTEM_TAGS.DEFAULT, 1, 1]
      )
      expect(result).toEqual(sampleAccount)
    })

    it('returns null when combination not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await accountRepository.findByWalletAndCurrency(1, 99)

      expect(result).toBeNull()
    })

    it('filters by account type when provided', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleAccount, account_type: 'savings' })

      const result = await accountRepository.findByWalletAndCurrency(1, 1, 'savings')

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining("= ?"),
        [SYSTEM_TAGS.DEFAULT, 1, 1, 'savings']
      )
      expect(result?.account_type).toBe('savings')
    })
  })

  describe('create', () => {
    it('creates account for wallet and currency', async () => {
      const input: AccountInput = {
        wallet_id: 1,
        currency_id: 2,
      }

      mockQueryOne
        .mockResolvedValueOnce(null) // findByWalletAndCurrency check
        .mockResolvedValueOnce({ ...sampleAccount, id: 2, currency_id: 2 }) // findById
      mockGetLastInsertId.mockResolvedValue(2)

      const result = await accountRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO account (wallet_id, currency_id) VALUES (?, ?)',
        [1, 2]
      )
      expect(result.currency_id).toBe(2)
    })

    it('throws error if wallet already has account with same currency', async () => {
      const input: AccountInput = {
        wallet_id: 1,
        currency_id: 1,
      }

      mockQueryOne.mockResolvedValueOnce(sampleAccount) // Already exists

      await expect(accountRepository.create(input)).rejects.toThrow(
        'This wallet already has an account with this currency'
      )
    })

    it('throws error if creation fails', async () => {
      const input: AccountInput = {
        wallet_id: 1,
        currency_id: 3,
      }

      mockQueryOne
        .mockResolvedValueOnce(null) // findByWalletAndCurrency check
        .mockResolvedValueOnce(null) // findById returns null
      mockGetLastInsertId.mockResolvedValue(3)

      await expect(accountRepository.create(input)).rejects.toThrow('Failed to create account')
    })

    it('creates a typed account and stores metadata', async () => {
      const input: AccountInput = {
        wallet_id: 1,
        currency_id: 2,
        account_type: 'savings',
        note: 'Emergency fund',
        due_date: '2026-06-01',
        rate: 4.5,
      }

      mockQueryOne
        .mockResolvedValueOnce(null) // findByWalletAndCurrency check
        .mockResolvedValueOnce({ wallet_id: 1, currency_id: 2 }) // validateUniqueAccountType account lookup
        .mockResolvedValueOnce(null) // duplicate lookup
        .mockResolvedValueOnce({ id: 21 }) // savings tag lookup
        .mockResolvedValueOnce({ ...sampleAccount, id: 9, currency_id: 2, account_type: 'savings' }) // findById
      mockGetLastInsertId.mockResolvedValue(9)

      const result = await accountRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM account_to_tags"),
        [9]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO account_to_tags (account_id, tag_id) VALUES (?, ?)',
        [9, 21]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO account_data'),
        [9, 'Emergency fund', '2026-06-01', 4.5]
      )
      expect(result.account_type).toBe('savings')
    })

    it('does not add a type tag when account_type is omitted', async () => {
      const input: AccountInput = {
        wallet_id: 1,
        currency_id: 2,
      }

      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...sampleAccount, id: 2, currency_id: 2 })
      mockGetLastInsertId.mockResolvedValue(2)

      await accountRepository.create(input)

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO account_to_tags (account_id, tag_id) VALUES (?, ?)',
        expect.anything()
      )
    })
  })

  describe('updateData', () => {
    it('updates account type and clears metadata for plain accounts', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ wallet_id: 1, currency_id: 1 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...sampleAccount, account_type: 'plain' })

      const result = await accountRepository.updateData(1, {
        account_type: 'plain',
        note: null,
        due_date: null,
        rate: null,
      })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM account_to_tags"),
        [1]
      )
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM account_data WHERE account_id = ?', [1])
      expect(result.account_type).toBe('plain')
    })

    it('throws when updating to a duplicate account type', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ wallet_id: 1, currency_id: 1 })
        .mockResolvedValueOnce({ id: 2 })

      await expect(accountRepository.updateData(1, { account_type: 'credits' })).rejects.toThrow(
        'This wallet already has an account with this currency and type'
      )
    })

    it('throws when account lookup fails while syncing account type', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await expect(accountRepository.updateData(1, { account_type: 'savings' })).rejects.toThrow('Account not found')
    })

    it('throws when updated account cannot be loaded', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await expect(accountRepository.updateData(1, { note: 'Only metadata' })).rejects.toThrow('Account not found')
    })
  })

  describe('setDefault', () => {
    it('sets account as default via tag', async () => {
      await accountRepository.setDefault(1)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO account_to_tags (account_id, tag_id) VALUES (?, ?)',
        [1, SYSTEM_TAGS.DEFAULT]
      )
    })
  })

  describe('delete', () => {
    it('deletes account when no transactions exist', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 }) // No non-INITIAL transactions
      mockQuerySQL.mockResolvedValue([]) // No INITIAL transactions to delete

      await accountRepository.delete(1)

      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM account WHERE id = ?', [1])
    })

    it('throws error when non-INITIAL transactions exist', async () => {
      mockQueryOne.mockResolvedValue({ count: 5 }) // 5 non-INITIAL transactions

      await expect(accountRepository.delete(1)).rejects.toThrow(
        'Cannot delete: 5 transactions linked to this account'
      )
    })

    it('checks trx_base table for non-INITIAL transactions', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })
      mockQuerySQL.mockResolvedValue([])

      await accountRepository.delete(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM trx_base WHERE account_id = ? AND tag_id != ?',
        [1, SYSTEM_TAGS.INITIAL]
      )
    })

    it('deletes account with only INITIAL transactions', async () => {
      const mockTrxId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
      mockQueryOne.mockResolvedValue({ count: 0 }) // No non-INITIAL transactions
      mockQuerySQL.mockResolvedValue([{ trx_id: mockTrxId }]) // One INITIAL transaction

      await accountRepository.delete(1)

      // Should delete the INITIAL transaction first
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM trx WHERE id = ?', [mockTrxId])
      // Then delete the account
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM account WHERE id = ?', [1])
    })

    it('deletes multiple INITIAL transactions before deleting account', async () => {
      const mockTrxId1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
      const mockTrxId2 = new Uint8Array([2, 2, 3, 4, 5, 6, 7, 8])
      mockQueryOne.mockResolvedValue({ count: 0 })
      mockQuerySQL.mockResolvedValue([{ trx_id: mockTrxId1 }, { trx_id: mockTrxId2 }])

      await accountRepository.delete(1)

      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM trx WHERE id = ?', [mockTrxId1])
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM trx WHERE id = ?', [mockTrxId2])
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM account WHERE id = ?', [1])
    })
  })

  describe('getTotalBalance', () => {
    it('returns sum of all account balances with rate conversion to system currency', async () => {
      mockQueryOne.mockResolvedValue({ total: 2500.00 })

      const result = await accountRepository.getTotalBalance()

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('balance_int'),
        expect.arrayContaining([expect.any(Number), expect.any(Number)])
      )
      expect(result).toBe(2500.00)
    })

    it('returns 0 for empty accounts', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await accountRepository.getTotalBalance()

      expect(result).toBe(0)
    })
  })

  describe('getPlainTotalBalance', () => {
    it('excludes savings and credit accounts from the total', async () => {
      mockQueryOne.mockResolvedValue({ total: 1500.00 })

      const result = await accountRepository.getPlainTotalBalance()

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining("account_tag.name IN ('savings', 'credits')"),
        expect.arrayContaining([expect.any(Number), expect.any(Number)])
      )
      expect(result).toBe(1500.00)
    })
  })

  describe('getWalletBalance', () => {
    it('returns sum of balances for specific wallet', async () => {
      mockQueryOne.mockResolvedValue({ total: 1500.00 })

      const result = await accountRepository.getWalletBalance(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE wallet_id = ?'),
        [1]
      )
      expect(result).toBe(1500.00)
    })

    it('returns 0 for empty wallet', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await accountRepository.getWalletBalance(99)

      expect(result).toBe(0)
    })
  })

  describe('convertAmount', () => {
    it('returns same amount when currencies match', async () => {
      const result = await accountRepository.convertAmount(100, 0, 1, 1)

      expect(result).toEqual({ int: 100, frac: 0 })
      expect(mockGetExchangeRate).not.toHaveBeenCalled()
    })

    it('converts using exchange rates', async () => {
      const fromRate: ExchangeRate = { currency_id: 2, rate_int: 1, rate_frac: 150000000000000000, updated_at: 0 } // 1.15
      const toRate: ExchangeRate = { currency_id: 1, rate_int: 1, rate_frac: 0, updated_at: 0 } // 1.0

      mockGetExchangeRate
        .mockResolvedValueOnce(fromRate)
        .mockResolvedValueOnce(toRate)

      const result = await accountRepository.convertAmount(100, 0, 2, 1)

      // 100 * 1.15 / 1.0 ≈ 115 (allow minor floating point variance)
      const resultFloat = result.int + result.frac / 1e18
      expect(resultFloat).toBeCloseTo(115, 5)
    })

    it('returns original amount when no exchange rates available', async () => {
      mockGetExchangeRate.mockResolvedValue(null)

      const result = await accountRepository.convertAmount(100, 0, 2, 1)

      expect(result).toEqual({ int: 100, frac: 0 })
    })
  })
})
