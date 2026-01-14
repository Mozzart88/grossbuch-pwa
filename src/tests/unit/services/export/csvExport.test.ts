import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TransactionLog } from '../../../../types'

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

  const sampleTransaction: TransactionLog = {
    id: new Uint8Array(16),
    created_at: '2025-01-09 14:30:00',
    wallet: 'Cash',
    currency: 'USD',
    tags: 'food',
    real_amount: -5025, // -50.25 stored as integer
    actual_amount: -5025,
    counterparty: 'Supermarket',
  }

  describe('exportTransactionsToCSV', () => {
    it('generates CSV with headers', async () => {
      mockFindAllForExport.mockResolvedValue([])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('Date')
      expect(result).toContain('Time')
      expect(result).toContain('Wallet')
      expect(result).toContain('Currency')
      expect(result).toContain('Tags')
      expect(result).toContain('Real Amount')
      expect(result).toContain('Actual Amount')
      expect(result).toContain('Counterparty')
    })

    it('includes transaction data in CSV', async () => {
      mockFindAllForExport.mockResolvedValue([sampleTransaction])

      const result = await exportTransactionsToCSV()
      const lines = result.split('\n')

      expect(lines.length).toBe(2) // Header + 1 transaction
      expect(lines[1]).toContain('2025-01-09')
      expect(lines[1]).toContain('14:30')
      expect(lines[1]).toContain('Cash')
      expect(lines[1]).toContain('USD')
      expect(lines[1]).toContain('food')
      expect(lines[1]).toContain('-50.25')
      expect(lines[1]).toContain('Supermarket')
    })

    it('handles transfer transactions', async () => {
      const transfer: TransactionLog = {
        ...sampleTransaction,
        tags: 'transfer',
        real_amount: -10000,
        actual_amount: -10000,
      }
      mockFindAllForExport.mockResolvedValue([transfer])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('transfer')
      expect(result).toContain('-100.00')
    })

    it('handles income transactions (positive amounts)', async () => {
      const income: TransactionLog = {
        ...sampleTransaction,
        tags: 'sale',
        real_amount: 100000, // +1000.00
        actual_amount: 100000,
        counterparty: 'Client',
      }
      mockFindAllForExport.mockResolvedValue([income])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('sale')
      expect(result).toContain('1000.00')
      expect(result).toContain('Client')
    })

    it('escapes fields with commas', async () => {
      const withComma: TransactionLog = {
        ...sampleTransaction,
        tags: 'food, transport, house',
      }
      mockFindAllForExport.mockResolvedValue([withComma])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('"food, transport, house"')
    })

    it('escapes fields with quotes', async () => {
      const withQuotes: TransactionLog = {
        ...sampleTransaction,
        counterparty: 'Said "Hello"',
      }
      mockFindAllForExport.mockResolvedValue([withQuotes])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('"Said ""Hello"""')
    })

    it('escapes fields with newlines', async () => {
      const withNewline: TransactionLog = {
        ...sampleTransaction,
        tags: 'Line 1\nLine 2',
      }
      mockFindAllForExport.mockResolvedValue([withNewline])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('"Line 1\nLine 2"')
    })

    it('handles null counterparty', async () => {
      const withNull: TransactionLog = {
        ...sampleTransaction,
        counterparty: null,
      }
      mockFindAllForExport.mockResolvedValue([withNull])

      const result = await exportTransactionsToCSV()
      const lines = result.split('\n')

      // Should not throw and should have empty field for null
      expect(lines.length).toBe(2)
      expect(lines[1]).not.toContain('null')
    })

    it('converts date strings to timestamps for repository call', async () => {
      mockFindAllForExport.mockResolvedValue([])

      await exportTransactionsToCSV('2025-01-01', '2025-12-31')

      // Should convert date strings to unix timestamps
      expect(mockFindAllForExport).toHaveBeenCalledWith(
        expect.any(Number), // start timestamp
        expect.any(Number)  // end timestamp
      )

      const [startTs, endTs] = mockFindAllForExport.mock.calls[0]
      // Verify timestamps are reasonable (2025-01-01 should be around 1735689600)
      expect(startTs).toBeGreaterThan(1735600000)
      expect(endTs).toBeGreaterThan(startTs as number)
    })

    it('handles multiple transactions', async () => {
      const transactions = [
        { ...sampleTransaction },
        { ...sampleTransaction, real_amount: -10000, actual_amount: -10000 },
        { ...sampleTransaction, real_amount: -20000, actual_amount: -20000 },
      ]
      mockFindAllForExport.mockResolvedValue(transactions)

      const result = await exportTransactionsToCSV()
      const lines = result.split('\n')

      expect(lines.length).toBe(4) // Header + 3 transactions
    })

    it('formats amounts with specified decimal places', async () => {
      const transaction: TransactionLog = {
        ...sampleTransaction,
        real_amount: -123456, // Will be -1234.56 with 2 decimals
        actual_amount: -123456,
      }
      mockFindAllForExport.mockResolvedValue([transaction])

      const result = await exportTransactionsToCSV(undefined, undefined, 2)

      expect(result).toContain('-1234.56')
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
