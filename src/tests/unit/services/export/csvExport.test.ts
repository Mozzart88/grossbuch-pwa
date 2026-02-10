import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock blobUtils
vi.mock('../../../../utils/blobUtils', () => ({
  blobToHex: vi.fn((blob: Uint8Array) =>
    Array.from(blob).map(b => b.toString(16).padStart(2, '0')).join('')
  ),
}))

// Mock transactionRepository
vi.mock('../../../../services/repositories', () => ({
  transactionRepository: {
    findAllForExportDetailed: vi.fn(),
  },
}))

import { exportTransactionsToCSV, downloadCSV } from '../../../../services/export/csvExport'
import { transactionRepository } from '../../../../services/repositories'

const mockFindAllForExportDetailed = vi.mocked(transactionRepository.findAllForExportDetailed)

describe('csvExport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleRow = {
    date_time: '2025-01-09T14:30:00',
    trx_id: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
    account_id: 1,
    wallet_name: 'Cash',
    currency_code: 'USD',
    tag_id: 12,
    tag_name: 'food',
    sign: '-' as const,
    amount: 5025,
    decimal_places: 2,
    rate: 100,
    counterparty_id: 1,
    counterparty_name: 'Supermarket',
    note: null as string | null,
  }

  describe('exportTransactionsToCSV', () => {
    it('generates CSV with correct headers', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([])

      const result = await exportTransactionsToCSV()
      const headers = result.split('\n')[0]

      expect(headers).toBe('date_time,trx_id,account_id,wallet,currency_code,tag_id,tag,amount,rate,counterparty_id,counterparty,note')
    })

    it('includes transaction data in CSV', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([sampleRow])

      const result = await exportTransactionsToCSV()
      const lines = result.split('\n')

      expect(lines.length).toBe(2)
      expect(lines[1]).toContain('2025-01-09T14:30:00')
      expect(lines[1]).toContain('0102030405060708')
      expect(lines[1]).toContain('Cash')
      expect(lines[1]).toContain('USD')
      expect(lines[1]).toContain('food')
      expect(lines[1]).toContain('-50.25')
      expect(lines[1]).toContain('Supermarket')
    })

    it('formats positive amounts correctly', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([{
        ...sampleRow,
        sign: '+' as const,
        amount: 100000,
      }])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('1000.00')
      expect(result).not.toContain('-1000.00')
    })

    it('formats negative amounts correctly', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([{
        ...sampleRow,
        sign: '-' as const,
        amount: 10000,
      }])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('-100.00')
    })

    it('handles different decimal places', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([{
        ...sampleRow,
        sign: '+' as const,
        amount: 12345678,
        decimal_places: 8,
      }])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('0.12345678')
    })

    it('escapes fields with commas', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([{
        ...sampleRow,
        wallet_name: 'Cash, Bank',
      }])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('"Cash, Bank"')
    })

    it('escapes fields with quotes', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([{
        ...sampleRow,
        counterparty_name: 'Said "Hello"',
      }])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('"Said ""Hello"""')
    })

    it('escapes fields with newlines', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([{
        ...sampleRow,
        note: 'Line 1\nLine 2',
      }])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('"Line 1\nLine 2"')
    })

    it('handles null counterparty', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([{
        ...sampleRow,
        counterparty_id: null,
        counterparty_name: null,
      }])

      const result = await exportTransactionsToCSV()
      const lines = result.split('\n')

      expect(lines.length).toBe(2)
      expect(lines[1]).not.toContain('null')
    })

    it('handles null note', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([sampleRow])

      const result = await exportTransactionsToCSV()
      const lines = result.split('\n')

      expect(lines.length).toBe(2)
      expect(lines[1]).not.toContain('null')
    })

    it('passes filters to repository', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([])

      await exportTransactionsToCSV({
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        walletIds: [1, 2],
        tagIds: [12],
      })

      expect(mockFindAllForExportDetailed).toHaveBeenCalledWith({
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        walletIds: [1, 2],
        tagIds: [12],
      })
    })

    it('passes empty filters when none provided', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([])

      await exportTransactionsToCSV()

      expect(mockFindAllForExportDetailed).toHaveBeenCalledWith({})
    })

    it('handles multiple transactions', async () => {
      const rows = [
        sampleRow,
        { ...sampleRow, amount: 10000 },
        { ...sampleRow, amount: 20000 },
      ]
      mockFindAllForExportDetailed.mockResolvedValue(rows)

      const result = await exportTransactionsToCSV()
      const lines = result.split('\n')

      expect(lines.length).toBe(4) // Header + 3 rows
    })

    it('escapes fields with carriage return', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([{
        ...sampleRow,
        note: 'Line 1\r\nLine 2',
      }])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('"Line 1\r\nLine 2"')
    })

    it('outputs rate as raw integer', async () => {
      mockFindAllForExportDetailed.mockResolvedValue([{
        ...sampleRow,
        rate: 31500,
      }])

      const result = await exportTransactionsToCSV()

      expect(result).toContain('31500')
    })
  })

  describe('downloadCSV', () => {
    it('creates download link with correct filename', () => {
      const realLink = document.createElement('a')
      const clickSpy = vi.fn()
      realLink.click = clickSpy

      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(realLink)

      downloadCSV('header\ndata', 'test.csv')

      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(realLink.download).toBe('test.csv')
      expect(clickSpy).toHaveBeenCalled()

      createElementSpy.mockRestore()
    })

    it('revokes object URL after download', () => {
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL')

      const realLink = document.createElement('a')
      realLink.click = vi.fn()

      vi.spyOn(document, 'createElement').mockReturnValue(realLink)

      downloadCSV('content', 'file.csv')

      expect(revokeObjectURLSpy).toHaveBeenCalled()
    })
  })
})
