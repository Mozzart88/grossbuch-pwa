import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Account, AccountInput } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  runSQL: vi.fn(),
  getLastInsertId: vi.fn(),
}))

// Mock transactionRepository for getTotalBalance
vi.mock('../../../services/repositories/transactionRepository', () => ({
  transactionRepository: {
    getExchangeRates: vi.fn(),
  },
}))

import { accountRepository } from '../../../services/repositories/accountRepository'
import { transactionRepository } from '../../../services/repositories/transactionRepository'
import { execSQL, querySQL, queryOne, getLastInsertId } from '../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)
const mockGetLastInsertId = vi.mocked(getLastInsertId)
const mockGetExchangeRates = vi.mocked(transactionRepository.getExchangeRates)

describe('accountRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleAccount: Account = {
    id: 1,
    name: 'Cash',
    currency_id: 1,
    initial_balance: 1000,
    icon: '💵',
    color: '#00FF00',
    is_active: 1,
    sort_order: 0,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
    currency_code: 'USD',
    currency_symbol: '$',
    currency_decimal_places: 2,
    current_balance: 1500,
  }

  describe('findAll', () => {
    it('returns all active accounts with calculated balances', async () => {
      mockQuerySQL.mockResolvedValue([sampleAccount])

      const result = await accountRepository.findAll()

      expect(mockQuerySQL).toHaveBeenCalledWith(expect.stringContaining('SELECT'))
      expect(mockQuerySQL).toHaveBeenCalledWith(expect.stringContaining('is_active = 1'))
      expect(result).toEqual([sampleAccount])
    })

    it('returns empty array when no accounts exist', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await accountRepository.findAll()

      expect(result).toEqual([])
    })

    it('includes balance calculation in query', async () => {
      mockQuerySQL.mockResolvedValue([sampleAccount])

      await accountRepository.findAll()

      expect(mockQuerySQL).toHaveBeenCalledWith(expect.stringContaining('current_balance'))
    })
  })

  describe('findById', () => {
    it('returns account with calculated balance', async () => {
      mockQuerySQL.mockResolvedValue([sampleAccount])

      const result = await accountRepository.findById(1)

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.id = ?'),
        [1]
      )
      expect(result).toEqual(sampleAccount)
    })

    it('returns null when account not found', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await accountRepository.findById(999)

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('creates account with all fields', async () => {
      const input: AccountInput = {
        name: 'New Account',
        currency_id: 1,
        initial_balance: 500,
        icon: '🏦',
        color: '#0000FF',
      }

      mockGetLastInsertId.mockResolvedValue(2)
      mockQuerySQL.mockResolvedValue([{ ...sampleAccount, id: 2, ...input }])

      const result = await accountRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO accounts'),
        ['New Account', 1, 500, '🏦', '#0000FF']
      )
      expect(result.name).toBe('New Account')
    })

    it('creates account with default values', async () => {
      const input: AccountInput = {
        name: 'Simple Account',
        currency_id: 1,
      }

      mockGetLastInsertId.mockResolvedValue(3)
      mockQuerySQL.mockResolvedValue([{ ...sampleAccount, id: 3 }])

      await accountRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO accounts'),
        ['Simple Account', 1, 0, null, null]
      )
    })

    it('throws error if creation fails', async () => {
      mockGetLastInsertId.mockResolvedValue(2)
      mockQuerySQL.mockResolvedValue([])

      await expect(accountRepository.create({ name: 'Test', currency_id: 1 })).rejects.toThrow(
        'Failed to create account'
      )
    })
  })

  describe('update', () => {
    it('updates account name', async () => {
      mockQuerySQL.mockResolvedValue([{ ...sampleAccount, name: 'Updated Name' }])

      const result = await accountRepository.update(1, { name: 'Updated Name' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('name = ?'),
        expect.arrayContaining(['Updated Name', 1])
      )
      expect(result.name).toBe('Updated Name')
    })

    it('updates currency_id', async () => {
      mockQuerySQL.mockResolvedValue([{ ...sampleAccount, currency_id: 2 }])

      await accountRepository.update(1, { currency_id: 2 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('currency_id = ?'),
        expect.arrayContaining([2])
      )
    })

    it('updates initial_balance', async () => {
      mockQuerySQL.mockResolvedValue([{ ...sampleAccount, initial_balance: 2000 }])

      await accountRepository.update(1, { initial_balance: 2000 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('initial_balance = ?'),
        expect.arrayContaining([2000])
      )
    })

    it('updates icon and color', async () => {
      mockQuerySQL.mockResolvedValue([{ ...sampleAccount, icon: '💰', color: '#FF0000' }])

      await accountRepository.update(1, { icon: '💰', color: '#FF0000' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('icon = ?'),
        expect.arrayContaining(['💰', '#FF0000'])
      )
    })

    it('does not execute SQL if no fields provided', async () => {
      mockQuerySQL.mockResolvedValue([sampleAccount])

      await accountRepository.update(1, {})

      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('throws error if account not found', async () => {
      mockQuerySQL.mockResolvedValue([])

      await expect(accountRepository.update(999, { name: 'Test' })).rejects.toThrow('Account not found')
    })
  })

  describe('delete', () => {
    it('deletes account when no transactions exist', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      await accountRepository.delete(1)

      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM accounts WHERE id = ?', [1])
    })

    it('throws error when transactions exist', async () => {
      mockQueryOne.mockResolvedValue({ count: 5 })

      await expect(accountRepository.delete(1)).rejects.toThrow(
        'Cannot delete: 5 transactions linked to this account'
      )
    })

    it('checks both source and destination transactions', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      await accountRepository.delete(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('account_id = ? OR to_account_id = ?'),
        [1, 1]
      )
    })
  })

  describe('archive', () => {
    it('sets is_active to 0', async () => {
      await accountRepository.archive(1)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('is_active = 0'),
        [1]
      )
    })

    it('updates updated_at timestamp', async () => {
      await accountRepository.archive(1)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("updated_at = datetime('now')"),
        expect.anything()
      )
    })
  })

  describe('getTotalBalance', () => {
    it('calculates total balance with exchange rates', async () => {
      const accounts = [
        { ...sampleAccount, currency_id: 1, current_balance: 1000 },
        { ...sampleAccount, id: 2, currency_id: 2, current_balance: 500 },
      ]
      mockQuerySQL.mockResolvedValue(accounts)

      const rates = new Map([[1, 1], [2, 1.5]])
      mockGetExchangeRates.mockResolvedValue(rates)

      const result = await accountRepository.getTotalBalance(1)

      expect(mockGetExchangeRates).toHaveBeenCalledWith(1)
      expect(result).toBe(1000 * 1 + 500 * 1.5) // 1750
    })

    it('returns 0 for empty accounts', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await accountRepository.getTotalBalance(1)

      expect(result).toBe(0)
    })

    it('uses rate of 1 for missing exchange rates', async () => {
      const accounts = [
        { ...sampleAccount, currency_id: 3, current_balance: 100 },
      ]
      mockQuerySQL.mockResolvedValue(accounts)
      mockGetExchangeRates.mockResolvedValue(new Map())

      const result = await accountRepository.getTotalBalance(1)

      expect(result).toBe(100) // Uses default rate of 1
    })

    it('handles undefined current_balance', async () => {
      const accounts = [
        { ...sampleAccount, current_balance: undefined },
      ]
      mockQuerySQL.mockResolvedValue(accounts)
      mockGetExchangeRates.mockResolvedValue(new Map([[1, 1]]))

      const result = await accountRepository.getTotalBalance(1)

      expect(result).toBe(0)
    })
  })
})
