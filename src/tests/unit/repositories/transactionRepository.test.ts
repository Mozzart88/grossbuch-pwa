import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Transaction, TransactionInput } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  runSQL: vi.fn(),
  getLastInsertId: vi.fn(),
}))

// Mock dateUtils
vi.mock('../../../utils/dateUtils', () => ({
  toLocalDateTime: vi.fn(() => '2025-01-09 14:30:00'),
}))

import { transactionRepository } from '../../../services/repositories/transactionRepository'
import { execSQL, querySQL, queryOne, getLastInsertId } from '../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)
const mockGetLastInsertId = vi.mocked(getLastInsertId)

describe('transactionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleTransaction: Transaction = {
    id: 1,
    type: 'expense',
    amount: 50,
    currency_id: 1,
    account_id: 1,
    category_id: 1,
    counterparty_id: null,
    to_account_id: null,
    to_amount: null,
    to_currency_id: null,
    exchange_rate: null,
    date_time: '2025-01-09 14:30:00',
    notes: 'Test expense',
    created_at: '2025-01-09 14:30:00',
    updated_at: '2025-01-09 14:30:00',
    category_name: 'Food',
    account_name: 'Cash',
    currency_symbol: '$',
  }

  describe('findByMonth', () => {
    it('returns transactions for specified month', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      const result = await transactionRepository.findByMonth('2025-01')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining("substr(t.date_time, 1, 7) = ?"),
        ['2025-01']
      )
      expect(result).toEqual([sampleTransaction])
    })

    it('returns empty array when no transactions in month', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await transactionRepository.findByMonth('2025-02')

      expect(result).toEqual([])
    })

    it('orders by date_time DESC and id DESC', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findByMonth('2025-01')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY t.date_time DESC, t.id DESC'),
        expect.anything()
      )
    })
  })

  describe('findById', () => {
    it('returns transaction with joined data', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      const result = await transactionRepository.findById(1)

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('WHERE t.id = ?'),
        [1]
      )
      expect(result).toEqual(sampleTransaction)
    })

    it('returns null when transaction not found', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await transactionRepository.findById(999)

      expect(result).toBeNull()
    })
  })

  describe('getMonthSummary', () => {
    it('returns income and expenses for month', async () => {
      mockQueryOne.mockResolvedValue({ income: 1000, expenses: 500 })

      const result = await transactionRepository.getMonthSummary('2025-01')

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining("substr(date_time, 1, 7) = ?"),
        ['2025-01']
      )
      expect(result).toEqual({ income: 1000, expenses: 500 })
    })

    it('filters by currency when provided', async () => {
      mockQueryOne.mockResolvedValue({ income: 500, expenses: 200 })

      await transactionRepository.getMonthSummary('2025-01', 1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('currency_id = ?'),
        ['2025-01', 1]
      )
    })

    it('returns zero values when no transactions', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await transactionRepository.getMonthSummary('2025-01')

      expect(result).toEqual({ income: 0, expenses: 0 })
    })
  })

  describe('create', () => {
    it('creates expense transaction', async () => {
      const input: TransactionInput = {
        type: 'expense',
        amount: 50,
        currency_id: 1,
        account_id: 1,
        category_id: 1,
        date_time: '2025-01-09 14:30:00',
      }

      mockGetLastInsertId.mockResolvedValue(2)
      mockQuerySQL.mockResolvedValue([{ ...sampleTransaction, id: 2 }])

      const result = await transactionRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining(['expense', 50, 1, 1, 1])
      )
      expect(result.id).toBe(2)
    })

    it('creates income transaction', async () => {
      const input: TransactionInput = {
        type: 'income',
        amount: 1000,
        currency_id: 1,
        account_id: 1,
        category_id: 2,
      }

      mockGetLastInsertId.mockResolvedValue(3)
      mockQuerySQL.mockResolvedValue([{ ...sampleTransaction, id: 3, type: 'income' as const }])

      await transactionRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining(['income', 1000, 1, 1, 2])
      )
    })

    it('creates transfer transaction', async () => {
      const input: TransactionInput = {
        type: 'transfer',
        amount: 200,
        currency_id: 1,
        account_id: 1,
        to_account_id: 2,
      }

      mockGetLastInsertId.mockResolvedValue(4)
      mockQuerySQL.mockResolvedValue([{ ...sampleTransaction, id: 4, type: 'transfer' as const }])

      await transactionRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining(['transfer', 200, 1, 1])
      )
    })

    it('creates exchange transaction with all fields', async () => {
      const input: TransactionInput = {
        type: 'exchange',
        amount: 100,
        currency_id: 1,
        account_id: 1,
        to_account_id: 2,
        to_amount: 90,
        to_currency_id: 2,
        exchange_rate: 0.9,
      }

      mockGetLastInsertId.mockResolvedValue(5)
      mockQuerySQL.mockResolvedValue([{ ...sampleTransaction, id: 5, type: 'exchange' as const }])

      await transactionRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining(['exchange', 100, 1, 1, null, null, 2, 90, 2, 0.9])
      )
    })

    it('uses current datetime when not provided', async () => {
      const input: TransactionInput = {
        type: 'expense',
        amount: 50,
        currency_id: 1,
        account_id: 1,
      }

      mockGetLastInsertId.mockResolvedValue(6)
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      await transactionRepository.create(input)

      // Should use mocked toLocalDateTime result
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining(['2025-01-09 14:30:00'])
      )
    })

    it('throws error if creation fails', async () => {
      mockGetLastInsertId.mockResolvedValue(7)
      mockQuerySQL.mockResolvedValue([])

      await expect(transactionRepository.create({
        type: 'expense',
        amount: 50,
        currency_id: 1,
        account_id: 1,
      })).rejects.toThrow('Failed to create transaction')
    })
  })

  describe('update', () => {
    it('updates transaction type', async () => {
      mockQuerySQL.mockResolvedValue([{ ...sampleTransaction, type: 'income' as const }])

      await transactionRepository.update(1, { type: 'income' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('type = ?'),
        expect.arrayContaining(['income', 1])
      )
    })

    it('updates transaction amount', async () => {
      mockQuerySQL.mockResolvedValue([{ ...sampleTransaction, amount: 100 }])

      await transactionRepository.update(1, { amount: 100 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('amount = ?'),
        expect.arrayContaining([100])
      )
    })

    it('updates multiple fields', async () => {
      mockQuerySQL.mockResolvedValue([{ ...sampleTransaction, amount: 75, notes: 'Updated' }])

      await transactionRepository.update(1, { amount: 75, notes: 'Updated' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('amount = ?'),
        expect.arrayContaining([75, 'Updated'])
      )
    })

    it('updates currency_id', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      await transactionRepository.update(1, { currency_id: 2 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('currency_id = ?'),
        expect.arrayContaining([2])
      )
    })

    it('updates account_id', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      await transactionRepository.update(1, { account_id: 3 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('account_id = ?'),
        expect.arrayContaining([3])
      )
    })

    it('updates category_id', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      await transactionRepository.update(1, { category_id: 4 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('category_id = ?'),
        expect.arrayContaining([4])
      )
    })

    it('updates counterparty_id', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      await transactionRepository.update(1, { counterparty_id: 5 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('counterparty_id = ?'),
        expect.arrayContaining([5])
      )
    })

    it('updates transfer fields', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      await transactionRepository.update(1, { to_account_id: 6 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('to_account_id = ?'),
        expect.arrayContaining([6])
      )
    })

    it('updates exchange fields', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      await transactionRepository.update(1, {
        to_amount: 95,
        to_currency_id: 2,
        exchange_rate: 0.95,
      })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('to_amount = ?'),
        expect.arrayContaining([95, 2, 0.95])
      )
    })

    it('updates date_time', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      await transactionRepository.update(1, { date_time: '2025-01-10 10:00:00' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('date_time = ?'),
        expect.arrayContaining(['2025-01-10 10:00:00'])
      )
    })

    it('updates notes', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      await transactionRepository.update(1, { notes: 'New note' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('notes = ?'),
        expect.arrayContaining(['New note'])
      )
    })

    it('does not execute SQL if no fields provided', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      await transactionRepository.update(1, {})

      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('throws error if transaction not found', async () => {
      mockQuerySQL.mockResolvedValue([])

      await expect(transactionRepository.update(999, { amount: 100 })).rejects.toThrow(
        'Transaction not found'
      )
    })
  })

  describe('delete', () => {
    it('deletes transaction by id', async () => {
      await transactionRepository.delete(1)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM transactions WHERE id = ?',
        [1]
      )
    })
  })

  describe('getExchangeRates', () => {
    it('returns rate of 1 for target currency', async () => {
      mockQuerySQL.mockResolvedValue([]) // No exchange transactions

      const result = await transactionRepository.getExchangeRates(1)

      expect(result.get(1)).toBe(1)
    })

    it('returns direct exchange rates', async () => {
      mockQuerySQL
        .mockResolvedValueOnce([{ currency_id: 2, rate: 1.2 }]) // Direct rates
        .mockResolvedValueOnce([]) // Inverse rates

      const result = await transactionRepository.getExchangeRates(1)

      expect(result.get(2)).toBe(1.2)
    })

    it('returns inverse exchange rates when no direct rate exists', async () => {
      mockQuerySQL
        .mockResolvedValueOnce([]) // No direct rates
        .mockResolvedValueOnce([{ to_currency_id: 3, rate: 0.8 }]) // Inverse rates

      const result = await transactionRepository.getExchangeRates(1)

      expect(result.get(3)).toBe(0.8)
    })

    it('prefers direct rates over inverse rates', async () => {
      mockQuerySQL
        .mockResolvedValueOnce([{ currency_id: 2, rate: 1.2 }]) // Direct rate
        .mockResolvedValueOnce([{ to_currency_id: 2, rate: 0.9 }]) // Inverse rate

      const result = await transactionRepository.getExchangeRates(1)

      expect(result.get(2)).toBe(1.2) // Direct rate used
    })
  })

  describe('findAllForExport', () => {
    it('returns all transactions without date filters', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransaction])

      const result = await transactionRepository.findAllForExport()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY t.date_time ASC'),
        []
      )
      expect(result).toEqual([sampleTransaction])
    })

    it('filters by start date', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findAllForExport('2025-01-01')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('t.date_time >= ?'),
        ['2025-01-01']
      )
    })

    it('filters by end date', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findAllForExport(undefined, '2025-12-31')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('t.date_time <= ?'),
        ['2025-12-31']
      )
    })

    it('filters by both start and end date', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findAllForExport('2025-01-01', '2025-12-31')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('t.date_time >= ?'),
        ['2025-01-01', '2025-12-31']
      )
      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('t.date_time <= ?'),
        expect.anything()
      )
    })
  })
})
