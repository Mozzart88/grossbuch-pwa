import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Transaction } from '../../../../types'

// Mock transactionRepository
vi.mock('../../../../services/repositories', () => ({
  transactionRepository: {
    findAllForExport: vi.fn(),
  },
}))

import { exportTransactionsToCSV, downloadCSV } from '../../../../services/export/csvExport'
import { transactionRepository } from '../../../../services/repositories'

const mockFindAllForExport = vi.mocked(transactionRepository.findAllForExport)

describe('csvExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleTransaction: Partial<Transaction> = {
    id: 1,
    type: 'expense',
    amount: 50.25,
    currency_id: 1,
    account_id: 1,
    category_id: 1,
    counterparty_id: null,
    to_account_id: null,
    to_amount: null,
    to_currency_id: null,
    exchange_rate: null,
    date_time: '2025-01-09 14:30:00',
    notes: 'Lunch',
    category_name: 'Food',
    account_name: 'Cash',
    currency_code: 'USD',
  }

  describe('exportTransactionsToCSV', () => {
    it('generates CSV with headers', async () => {
      mockFindAllForExport.mockResolvedValue([])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('Date')
      expect(result).toContain('Time')
      expect(result).toContain('Type')
      expect(result).toContain('Amount')
      expect(result).toContain('Currency')
      expect(result).toContain('Account')
      expect(result).toContain('Category')
      expect(result).toContain('Counterparty')
      expect(result).toContain('Notes')
      expect(result).toContain('To Account')
      expect(result).toContain('To Amount')
      expect(result).toContain('To Currency')
      expect(result).toContain('Exchange Rate')
    })

    it('includes transaction data in CSV', async () => {
      mockFindAllForExport.mockResolvedValue([sampleTransaction as Transaction])

      const result = await exportTransactionsToCSV()
      const lines = result.split('\n')

      expect(lines.length).toBe(2) // Header + 1 transaction
      expect(lines[1]).toContain('2025-01-09')
      expect(lines[1]).toContain('14:30')
      expect(lines[1]).toContain('expense')
      expect(lines[1]).toContain('50.25')
      expect(lines[1]).toContain('USD')
      expect(lines[1]).toContain('Cash')
      expect(lines[1]).toContain('Food')
      expect(lines[1]).toContain('Lunch')
    })

    it('handles transfer transactions', async () => {
      const transfer: Partial<Transaction> = {
        ...sampleTransaction,
        type: 'transfer',
        to_account_id: 2,
        to_account_name: 'Bank',
      }
      mockFindAllForExport.mockResolvedValue([transfer as Transaction])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('transfer')
      expect(result).toContain('Bank')
    })

    it('handles exchange transactions', async () => {
      const exchange: Partial<Transaction> = {
        ...sampleTransaction,
        type: 'exchange',
        to_account_id: 2,
        to_account_name: 'EUR Wallet',
        to_amount: 45.5,
        to_currency_id: 2,
        to_currency_code: 'EUR',
        exchange_rate: 0.9,
      }
      mockFindAllForExport.mockResolvedValue([exchange as Transaction])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('exchange')
      expect(result).toContain('EUR Wallet')
      expect(result).toContain('45.5')
      expect(result).toContain('EUR')
      expect(result).toContain('0.9')
    })

    it('escapes fields with commas', async () => {
      const withComma: Partial<Transaction> = {
        ...sampleTransaction,
        notes: 'Food, drinks, and snacks',
      }
      mockFindAllForExport.mockResolvedValue([withComma as Transaction])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('"Food, drinks, and snacks"')
    })

    it('escapes fields with quotes', async () => {
      const withQuotes: Partial<Transaction> = {
        ...sampleTransaction,
        notes: 'Said "Hello"',
      }
      mockFindAllForExport.mockResolvedValue([withQuotes as Transaction])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('"Said ""Hello"""')
    })

    it('escapes fields with newlines', async () => {
      const withNewline: Partial<Transaction> = {
        ...sampleTransaction,
        notes: 'Line 1\nLine 2',
      }
      mockFindAllForExport.mockResolvedValue([withNewline as Transaction])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('"Line 1\nLine 2"')
    })

    it('handles null values', async () => {
      const withNulls: Partial<Transaction> = {
        ...sampleTransaction,
        notes: null,
        counterparty_name: undefined,
      }
      mockFindAllForExport.mockResolvedValue([withNulls as Transaction])

      const result = await exportTransactionsToCSV()
      const lines = result.split('\n')

      // Should not throw and should have empty fields for nulls
      expect(lines.length).toBe(2)
    })

    it('passes date filters to repository', async () => {
      mockFindAllForExport.mockResolvedValue([])

      await exportTransactionsToCSV('2025-01-01', '2025-12-31')

      expect(mockFindAllForExport).toHaveBeenCalledWith('2025-01-01', '2025-12-31')
    })

    it('handles multiple transactions', async () => {
      const transactions = [
        { ...sampleTransaction, id: 1 },
        { ...sampleTransaction, id: 2, amount: 100 },
        { ...sampleTransaction, id: 3, amount: 200 },
      ]
      mockFindAllForExport.mockResolvedValue(transactions as Transaction[])

      const result = await exportTransactionsToCSV()
      const lines = result.split('\n')

      expect(lines.length).toBe(4) // Header + 3 transactions
    })

    it('handles income transactions', async () => {
      const income: Partial<Transaction> = {
        ...sampleTransaction,
        type: 'income',
        amount: 1000,
        category_name: 'Salary',
      }
      mockFindAllForExport.mockResolvedValue([income as Transaction])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('income')
      expect(result).toContain('1000')
      expect(result).toContain('Salary')
    })
  })

  describe('downloadCSV', () => {
    it('creates download link with correct filename', () => {
      // Create a real anchor element that we can spy on
      const realLink = document.createElement('a')
      const clickSpy = vi.fn()
      realLink.click = clickSpy

      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(realLink)

      downloadCSV('Date,Amount\n2025-01-01,100', 'test.csv')

      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(realLink.download).toBe('test.csv')
      expect(clickSpy).toHaveBeenCalled()

      createElementSpy.mockRestore()
    })

    it('revokes object URL after download', () => {
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL')

      // Create a real anchor element
      const realLink = document.createElement('a')
      realLink.click = vi.fn()

      vi.spyOn(document, 'createElement').mockReturnValue(realLink)

      downloadCSV('content', 'file.csv')

      expect(revokeObjectURLSpy).toHaveBeenCalled()
    })
  })
})
