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

// Mock currencyRepository for convertAmount
vi.mock('../../../services/repositories/currencyRepository', () => ({
  currencyRepository: {
    getExchangeRate: vi.fn(),
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
    real_balance: 100000, // 1000.00 (integer, divide by 100)
    actual_balance: 100000,
    created_at: 1704067200,
    updated_at: 1704067200,
    wallet: 'Main Wallet',
    currency: 'USD',
    is_default: true,
  }

  describe('findAll', () => {
    it('returns all accounts from accounts view', async () => {
      const accounts = [
        { id: 1, wallet: 'Main', currency: 'USD', tags: 'default', real_balance: 100000, actual_balance: 100000, created_at: 0, updated_at: 0 },
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
      mockQueryOne.mockResolvedValue({ count: 0 })

      await accountRepository.delete(1)

      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM account WHERE id = ?', [1])
    })

    it('throws error when transactions exist', async () => {
      mockQueryOne.mockResolvedValue({ count: 5 })

      await expect(accountRepository.delete(1)).rejects.toThrow(
        'Cannot delete: 5 transactions linked to this account'
      )
    })

    it('checks trx_base table for transactions', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      await accountRepository.delete(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM trx_base WHERE account_id = ?',
        [1]
      )
    })
  })

  describe('getTotalBalance', () => {
    it('returns sum of all account balances', async () => {
      mockQueryOne.mockResolvedValue({ total: 250000 })

      const result = await accountRepository.getTotalBalance()

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('SUM(balance)')
      )
      expect(result).toBe(250000)
    })

    it('returns 0 for empty accounts', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await accountRepository.getTotalBalance()

      expect(result).toBe(0)
    })
  })

  describe('getWalletBalance', () => {
    it('returns sum of balances for specific wallet', async () => {
      mockQueryOne.mockResolvedValue({ total: 150000 })

      const result = await accountRepository.getWalletBalance(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE wallet_id = ?'),
        [1]
      )
      expect(result).toBe(150000)
    })

    it('returns 0 for empty wallet', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await accountRepository.getWalletBalance(99)

      expect(result).toBe(0)
    })
  })

  describe('convertAmount', () => {
    it('returns same amount when currencies match', async () => {
      const result = await accountRepository.convertAmount(10000, 1, 1)

      expect(result).toBe(10000)
      expect(mockGetExchangeRate).not.toHaveBeenCalled()
    })

    it('converts using exchange rates', async () => {
      const fromRate: ExchangeRate = { currency_id: 2, rate: 11500, updated_at: 0 } // EUR rate
      const toRate: ExchangeRate = { currency_id: 1, rate: 10000, updated_at: 0 } // USD rate (base)

      mockGetExchangeRate
        .mockResolvedValueOnce(fromRate)
        .mockResolvedValueOnce(toRate)

      const result = await accountRepository.convertAmount(10000, 2, 1)

      // 10000 * 11500 / 10000 = 11500
      expect(result).toBe(11500)
    })

    it('returns original amount when no exchange rates available', async () => {
      mockGetExchangeRate.mockResolvedValue(null)

      const result = await accountRepository.convertAmount(10000, 2, 1)

      expect(result).toBe(10000)
    })
  })
})
