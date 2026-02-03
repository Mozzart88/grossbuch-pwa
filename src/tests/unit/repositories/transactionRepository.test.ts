import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  TransactionLine,
  TransactionLineInput,
  TransactionLog,
  ExchangeView,
  TransferView,
  MonthlyTagSummary,
} from '../../../types'
import { SYSTEM_TAGS } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
}))

// Mock the accountRepository (used by addLine for rate lookup)
vi.mock('../../../services/repositories/accountRepository', () => ({
  accountRepository: {
    findById: vi.fn().mockResolvedValue({
      id: 1,
      currency_id: 1,
      balance: 0,
    }),
  },
}))

// Mock the currencyRepository (used by addLine for rate lookup)
vi.mock('../../../services/repositories/currencyRepository', () => ({
  currencyRepository: {
    getRateForCurrency: vi.fn().mockResolvedValue(100),
  },
}))

import { transactionRepository } from '../../../services/repositories/transactionRepository'
import { execSQL, querySQL, queryOne } from '../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)

// Helper to create a mock 8-byte UUID
const mockId = () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
const mockId2 = () => new Uint8Array([2, 2, 3, 4, 5, 6, 7, 8])

// Sample TransactionLog (from trx_log view)
const sampleTransactionLog: TransactionLog = {
  id: mockId(),
  date_time: '2025-01-09 14:30:00',
  counterparty: null,
  wallet: 'Cash',
  currency: 'USD',
  tags: 'food',
  amount: -5000,
  rate: 0,
  symbol: '$',
  decimal_places: 2
}

// Sample TransactionLine
const sampleLine: TransactionLine = {
  id: mockId(),
  trx_id: mockId(),
  account_id: 1,
  tag_id: 10, // food
  sign: '-',
  amount: 5000,
  rate: 0,
  wallet: 'Cash',
  currency: 'USD',
  tag: 'food',
  note: null,
}

const mockMonthlyTagSummary: MonthlyTagSummary[] = [
  {
    expense: 100,
    income: 0,
    net: -100,
    tag_id: 10,
    tag: 'food'
  }
]

describe('transactionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('findByMonth', () => {
    it('returns transactions for specified month', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransactionLog])

      const result = await transactionRepository.findByMonth('2025-01')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM trx_log'),
        expect.arrayContaining([expect.any(String)])
      )
      expect(result).toEqual([sampleTransactionLog])
    })

    it('returns empty array when no transactions in month', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await transactionRepository.findByMonth('2025-02')

      expect(result).toEqual([])
    })

    it('uses date pattern for filtering', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findByMonth('2025-01')

      const call = mockQuerySQL.mock.calls[0]
      expect(call![1]![0]).toBe('2025-01%')
    })

    it('orders by date_time DESC', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findByMonth('2025-01')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY date_time DESC'),
        expect.anything()
      )
    })

    it('excludes INITIAL transactions', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findByMonth('2025-01')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining("tags != 'initial'"),
        expect.anything()
      )
    })
  })

  describe('findByMonthFiltered', () => {
    it('calls findByMonth when no filter provided', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransactionLog])

      const result = await transactionRepository.findByMonthFiltered('2025-01')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM trx_log'),
        expect.arrayContaining(['2025-01%'])
      )
      expect(result).toEqual([sampleTransactionLog])
    })

    it('calls findByMonth when filter has no active filters', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransactionLog])

      const result = await transactionRepository.findByMonthFiltered('2025-01', {})

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM trx_log'),
        expect.arrayContaining(['2025-01%'])
      )
      expect(result).toEqual([sampleTransactionLog])
    })

    it('filters by tag_id when provided', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransactionLog])

      await transactionRepository.findByMonthFiltered('2025-01', { tagId: 10 })

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('tb.tag_id = ?'),
        expect.arrayContaining([10])
      )
    })

    it('filters by counterparty_id when provided', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransactionLog])

      await transactionRepository.findByMonthFiltered('2025-01', { counterpartyId: 5 })

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('t2c.counterparty_id = ?'),
        expect.arrayContaining([5])
      )
    })

    it('handles "No counterparty" case (id=0) with NULL check', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransactionLog])

      await transactionRepository.findByMonthFiltered('2025-01', { counterpartyId: 0 })

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('t2c.counterparty_id IS NULL'),
        expect.anything()
      )
    })

    it('filters by type income', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransactionLog])

      await transactionRepository.findByMonthFiltered('2025-01', { type: 'income' })

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('tb.sign = ?'),
        expect.arrayContaining(['+'])
      )
    })

    it('filters by type expense', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransactionLog])

      await transactionRepository.findByMonthFiltered('2025-01', { type: 'expense' })

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('tb.sign = ?'),
        expect.arrayContaining(['-'])
      )
    })

    it('combines multiple filters', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransactionLog])

      await transactionRepository.findByMonthFiltered('2025-01', {
        tagId: 10,
        counterpartyId: 5,
        type: 'expense',
      })

      const call = mockQuerySQL.mock.calls[0]
      expect(call![0]).toContain('tb.tag_id = ?')
      expect(call![0]).toContain('t2c.counterparty_id = ?')
      expect(call![0]).toContain('tb.sign = ?')
      expect(call![1]).toContain(10)
      expect(call![1]).toContain(5)
      expect(call![1]).toContain('-')
    })

    it('orders by timestamp DESC', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findByMonthFiltered('2025-01', { tagId: 10 })

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY t.timestamp DESC'),
        expect.anything()
      )
    })

    it('joins required tables for filtering', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findByMonthFiltered('2025-01', { tagId: 10 })

      const call = mockQuerySQL.mock.calls[0]
      expect(call![0]).toContain('JOIN trx_base tb ON tb.trx_id = t.id')
      expect(call![0]).toContain('JOIN accounts a ON tb.account_id = a.id')
      expect(call![0]).toContain('JOIN tag ON tb.tag_id = tag.id')
      expect(call![0]).toContain('LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id')
    })
  })

  describe('getMonthlyTagsSummary', () => {
    it('returns MonthlyTagsSummary ', async () => {
      mockQuerySQL.mockResolvedValue(mockMonthlyTagSummary)

      const result = await transactionRepository.getMonthlyTagsSummary('2025-01')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining(`WITH curr_dec AS (
        SELECT c.id as currency_id, power(10.0, -c.decimal_places) as divisor
        FROM currency c
      )`),
        expect.arrayContaining([

          1735700400,
          1738368000,
        ])
      )

      expect(result).toEqual(mockMonthlyTagSummary)
    })
  })

  describe('getMonthlyCounterpartiesSummary', () => {
    it('returns MonthlyTagsSummary ', async () => {
      mockQuerySQL.mockResolvedValue(mockMonthlyTagSummary)

      const result = await transactionRepository.getMonthlyCounterpartiesSummary('2025-01')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining(`WITH curr_dec AS (
        SELECT c.id as currency_id, power(10.0, -c.decimal_places) as divisor
        FROM currency c
      )`),
        expect.arrayContaining([

          1735700400,
          1738368000,
        ])
      )

      expect(result).toEqual(mockMonthlyTagSummary)
    })
  })

  describe('getMonthlyCounterpartiesSummary', () => {
    it('returns MonthlyTagsSummary ', async () => {
      mockQuerySQL.mockResolvedValue(mockMonthlyTagSummary)

      const result = await transactionRepository.getMonthlyCategoryBreakdown('2025-01')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining(`WITH curr_dec AS (
        SELECT c.id as currency_id, power(10.0, -c.decimal_places) as divisor
        FROM currency c
      )`),
        expect.arrayContaining([

          1735700400,
          1738368000,
        ])
      )

      expect(result).toEqual(mockMonthlyTagSummary)
    })
  })

  describe('getLog', () => {
    it('returns transaction log from trx_log view', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransactionLog])

      const result = await transactionRepository.getLog()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM trx_log'),
        []
      )
      expect(result).toEqual([sampleTransactionLog])
    })

    it('applies limit when provided', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.getLog(10)

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ?'),
        [10]
      )
    })

    it('applies offset when provided', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.getLog(10, 20)

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('OFFSET ?'),
        [10, 20]
      )
    })
  })

  describe('findById', () => {
    it('returns transaction with lines', async () => {
      mockQueryOne.mockResolvedValue({
        id: mockId(),
        timestamp: 1704803400,
        counterparty: 'Supermarket',
        counterparty_id: 1,
      })
      mockQuerySQL.mockResolvedValue([sampleLine])

      const result = await transactionRepository.findById(mockId())

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('FROM trx t'),
        expect.anything()
      )
      expect(result?.lines).toEqual([sampleLine])
    })

    it('returns null when transaction not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await transactionRepository.findById(mockId())

      expect(result).toBeNull()
    })

    it('uses blob ID for lookup', async () => {
      mockQueryOne.mockResolvedValue(null)

      await transactionRepository.findById(mockId())

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('t.id = ?'),
        expect.anything()
      )
    })
  })

  describe('getMonthSummary', () => {
    it('returns income and expenses for month', async () => {
      mockQueryOne.mockResolvedValue({ income: 100000, expenses: 50000 })

      const result = await transactionRepository.getMonthSummary('2025-01')

      expect(result).toEqual({ income: 100000, expenses: 50000 })
    })

    it('returns zero values when no transactions', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await transactionRepository.getMonthSummary('2025-01')

      expect(result).toEqual({ income: 0, expenses: 0 })
    })

    it('excludes system tags (initial, transfer, exchange) from summary', async () => {
      mockQueryOne.mockResolvedValue({ income: 100000, expenses: 50000 })

      await transactionRepository.getMonthSummary('2025-01')

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('tag_id NOT IN'),
        expect.arrayContaining([
          SYSTEM_TAGS.INITIAL,
          SYSTEM_TAGS.TRANSFER,
          SYSTEM_TAGS.EXCHANGE,
        ])
      )
    })

    it('uses rate-based conversion to default currency', async () => {
      mockQueryOne.mockResolvedValue({ income: 100000, expenses: 50000 })

      await transactionRepository.getMonthSummary('2025-01')

      // Should use (amount * divisor) / (rate * divisor) formula for float conversion
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('(tb.amount * cd.divisor) / (tb.rate * cd.divisor)'),
        expect.anything()
      )
    })

    it('filters out transactions with zero rate', async () => {
      mockQueryOne.mockResolvedValue({ income: 100000, expenses: 50000 })

      await transactionRepository.getMonthSummary('2025-01')

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('tb.rate > 0'),
        expect.anything()
      )
    })

    it('uses Unix timestamps for date range', async () => {
      mockQueryOne.mockResolvedValue({ income: 0, expenses: 0 })

      await transactionRepository.getMonthSummary('2025-01')

      const call = mockQueryOne.mock.calls[0]
      // Params: 6 system tags + DEFAULT tag + 2 timestamps = 9 total
      // Start timestamp is at index 7
      expect(call![1]![7]).toBe(Math.floor(new Date('2025-01-01T00:00:00').getTime() / 1000))
    })
  })

  describe('getDaySummary', () => {
    it('returns net amount for a specific date', async () => {
      mockQueryOne.mockResolvedValue({ net: 50000 })

      const result = await transactionRepository.getDaySummary('2025-01-09')

      expect(result).toBe(50000)
    })

    it('returns zero when no transactions', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await transactionRepository.getDaySummary('2025-01-09')

      expect(result).toBe(0)
    })

    it('excludes system tags (initial, transfer, exchange) from summary', async () => {
      mockQueryOne.mockResolvedValue({ net: 50000 })

      await transactionRepository.getDaySummary('2025-01-09')

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('tag_id NOT IN'),
        expect.arrayContaining([
          SYSTEM_TAGS.INITIAL,
          SYSTEM_TAGS.TRANSFER,
          SYSTEM_TAGS.EXCHANGE,
        ])
      )
    })

    it('uses rate-based conversion to default currency', async () => {
      mockQueryOne.mockResolvedValue({ net: 50000 })

      await transactionRepository.getDaySummary('2025-01-09')

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('(tb.amount * cd.divisor) / (tb.rate * cd.divisor)'),
        expect.anything()
      )
    })

    it('filters out transactions with zero rate', async () => {
      mockQueryOne.mockResolvedValue({ net: 50000 })

      await transactionRepository.getDaySummary('2025-01-09')

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('tb.rate > 0'),
        expect.anything()
      )
    })

    it('uses Unix timestamps for date range (single day)', async () => {
      mockQueryOne.mockResolvedValue({ net: 0 })

      await transactionRepository.getDaySummary('2025-01-09')

      const call = mockQueryOne.mock.calls[0]
      // Params: 3 system tags + DEFAULT tag + 2 timestamps = 6 total
      const startTs = call![1]![4] as number
      const endTs = call![1]![5] as number

      // Start should be beginning of day
      expect(startTs).toBe(Math.floor(new Date('2025-01-09T00:00:00').getTime() / 1000))
      // End should be end of day + 1 second
      expect(endTs).toBe(Math.floor(new Date('2025-01-09T23:59:59').getTime() / 1000) + 1)
    })

    it('calculates net as income minus expenses', async () => {
      mockQueryOne.mockResolvedValue({ net: 50000 })

      await transactionRepository.getDaySummary('2025-01-09')

      // SQL should include sign calculation: +1 for income, -1 for expense
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining("CASE WHEN tb.sign = '+' THEN 1 ELSE -1 END"),
        expect.anything()
      )
    })

    it('calculates net filtered by tag', async () => {
      mockQueryOne.mockResolvedValue({ net: 5000 })

      await transactionRepository.getDaySummary('2025-01-09', { tagId: 10 })

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('AND tb.tag_id = ?'),
        expect.arrayContaining([10])
      )
    })

    it('calculates net filtered by counterparty', async () => {
      mockQueryOne.mockResolvedValue({ net: 5000 })

      await transactionRepository.getDaySummary('2025-01-09', { counterpartyId: 10 })

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('AND t2c.counterparty_id = ?'),
        expect.arrayContaining([10])
      )
    })

    it('calculates net filtered by counterparty = 0', async () => {
      mockQueryOne.mockResolvedValue({ net: 5000 })

      await transactionRepository.getDaySummary('2025-01-09', { counterpartyId: 0 })

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('AND t2c.counterparty_id IS NULL'),
        expect.anything()
      )
    })

    it('calculates net filtered by type = expense', async () => {
      mockQueryOne.mockResolvedValue({ net: 5000 })

      await transactionRepository.getDaySummary('2025-01-09', { type: 'expense' })

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('AND tb.sign = ?'),
        expect.arrayContaining(['-'])
      )
    })

    it('calculates net filtered by type = income', async () => {
      mockQueryOne.mockResolvedValue({ net: 5000 })

      await transactionRepository.getDaySummary('2025-01-09', { type: 'income' })

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('AND tb.sign = ?'),
        expect.arrayContaining(['+'])
      )
    })
  })

  describe('create', () => {
    beforeEach(() => {
      // Mock successful transaction creation
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() }) // trx id lookup
        .mockResolvedValueOnce({ id: mockId2() }) // trx_base id lookup
        .mockResolvedValueOnce(sampleLine) // line result
    })

    it('creates transaction header in trx table', async () => {
      const input = {
        lines: [
          {
            account_id: 1,
            tag_id: 10,
            sign: '-' as const,
            amount: 5000,
          },
        ],
      }

      // Need to mock findById for final result
      mockQueryOne.mockReset()
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([sampleLine])

      await transactionRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx'),
        expect.anything()
      )
    })

    it('creates transaction line in trx_base table', async () => {
      const input = {
        lines: [
          {
            account_id: 1,
            tag_id: 10,
            sign: '-' as const,
            amount: 5000,
          },
        ],
      }

      mockQueryOne.mockReset()
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([sampleLine])

      await transactionRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_base'),
        expect.arrayContaining([1, 10, '-', 5000])
      )
    })

    it('links counterparty when counterparty_id provided', async () => {
      const input = {
        counterparty_id: 1,
        lines: [
          {
            account_id: 1,
            tag_id: 10,
            sign: '-' as const,
            amount: 5000,
          },
        ],
      }

      mockQueryOne.mockReset()
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([sampleLine])

      await transactionRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_to_counterparty'),
        expect.anything()
      )
    })

    it('auto-creates counterparty when counterparty_name provided', async () => {
      const input = {
        counterparty_name: 'New Store',
        lines: [
          {
            account_id: 1,
            tag_id: 10,
            sign: '-' as const,
            amount: 5000,
          },
        ],
      }

      mockQueryOne.mockReset()
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([sampleLine])

      await transactionRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO counterparty'),
        expect.arrayContaining(['New Store', 'New Store'])
      )
    })

    it('uses provided timestamp', async () => {
      const input = {
        timestamp: 1704800000,
        lines: [
          {
            account_id: 1,
            tag_id: 10,
            sign: '-' as const,
            amount: 5000,
          },
        ],
      }

      mockQueryOne.mockReset()
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704800000 })
      mockQuerySQL.mockResolvedValue([sampleLine])

      await transactionRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx'),
        expect.arrayContaining([1704800000])
      )
    })

    it('throws error if retrieval fails after creation', async () => {
      mockQueryOne.mockReset()
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() }) // trx id
        .mockResolvedValueOnce({ id: mockId2() }) // trx_base id
        .mockResolvedValueOnce(sampleLine) // line result
        .mockResolvedValueOnce(null) // findById returns null

      await expect(
        transactionRepository.create({
          lines: [
            {
              account_id: 1,
              tag_id: 10,
              sign: '-',
              amount: 5000,
            },
          ],
        })
      ).rejects.toThrow('Failed to create transaction')
    })

    it('throws error if initial creation fails', async () => {
      mockQueryOne.mockReset()
      mockQueryOne.mockResolvedValueOnce(null) // first queryOne returns null

      await expect(
        transactionRepository.create({
          lines: [{ account_id: 1, tag_id: 10, sign: '-', amount: 5000 }],
        })
      ).rejects.toThrow('Failed to create transaction')
    })
  })

  describe('addLine', () => {
    it('inserts line into trx_base', async () => {
      const line: TransactionLineInput = {
        account_id: 1,
        tag_id: 10,
        sign: '-',
        amount: 5000,
      }

      mockQueryOne
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce(sampleLine)

      await transactionRepository.addLine(mockId(), line)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_base'),
        expect.arrayContaining([1, 10, '-', 5000])
      )
    })

    it('inserts note into trx_note when provided', async () => {
      const line: TransactionLineInput = {
        account_id: 1,
        tag_id: 10,
        sign: '-',
        amount: 5000,
        note: 'Test note',
      }

      mockQueryOne
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce({ ...sampleLine, note: 'Test note' })

      await transactionRepository.addLine(mockId(), line)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_note'),
        expect.arrayContaining(['Test note'])
      )
    })

    it('throws error if line creation fails', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await expect(
        transactionRepository.addLine(mockId(), {
          account_id: 1,
          tag_id: 10,
          sign: '-',
          amount: 5000,
        })
      ).rejects.toThrow('Failed to create transaction line')
    })

    it('throws error if retrieval fails after creation', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId2() }) // line id
        .mockResolvedValueOnce(null) // retrieval fails

      await expect(
        transactionRepository.addLine(mockId(), {
          account_id: 1,
          tag_id: 10,
          sign: '-',
          amount: 5000,
        })
      ).rejects.toThrow('Failed to retrieve transaction line')
    })
  })

  describe('updateLine', () => {
    it('updates account_id', async () => {
      mockQueryOne.mockResolvedValue(sampleLine)

      await transactionRepository.updateLine(mockId(), { account_id: 2 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('account_id = ?'),
        expect.arrayContaining([2])
      )
    })

    it('updates tag_id', async () => {
      mockQueryOne.mockResolvedValue(sampleLine)

      await transactionRepository.updateLine(mockId(), { tag_id: 11 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('tag_id = ?'),
        expect.arrayContaining([11])
      )
    })

    it('updates sign', async () => {
      mockQueryOne.mockResolvedValue(sampleLine)

      await transactionRepository.updateLine(mockId(), { sign: '+' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('sign = ?'),
        expect.arrayContaining(['+'])
      )
    })

    it('updates amount', async () => {
      mockQueryOne.mockResolvedValue(sampleLine)

      await transactionRepository.updateLine(mockId(), { amount: 10000 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('amount = ?'),
        expect.arrayContaining([10000])
      )
    })

    it('updates rate', async () => {
      mockQueryOne.mockResolvedValue(sampleLine)

      await transactionRepository.updateLine(mockId(), { rate: 10000 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('rate = ?'),
        expect.arrayContaining([10000])
      )
    })

    it('updates note by deleting and reinserting', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleLine, note: 'New note' })

      await transactionRepository.updateLine(mockId(), { note: 'New note' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM trx_note'),
        expect.anything()
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_note'),
        expect.arrayContaining(['New note'])
      )
    })

    it('deletes note when set to empty string', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleLine, note: null })

      await transactionRepository.updateLine(mockId(), { note: '' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM trx_note'),
        expect.anything()
      )
      // Should not insert new note
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_note'),
        expect.anything()
      )
    })

    it('throws error if line not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      await expect(
        transactionRepository.updateLine(mockId(), { amount: 10000 })
      ).rejects.toThrow('Transaction line not found')
    })
  })

  describe('deleteLine', () => {
    it('deletes line from trx_base', async () => {
      await transactionRepository.deleteLine(mockId())

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM trx_base'),
        expect.anything()
      )
    })

    it('uses blob ID for deletion', async () => {
      await transactionRepository.deleteLine(mockId())

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('id = ?'),
        expect.anything()
      )
    })
  })

  describe('delete', () => {
    it('deletes transaction from trx table', async () => {
      await transactionRepository.delete(mockId())

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM trx'),
        expect.anything()
      )
    })

    it('uses blob ID for deletion', async () => {
      await transactionRepository.delete(mockId())

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('id = ?'),
        expect.anything()
      )
    })
  })

  describe('update', () => {
    const input = {
      timestamp: 1705000000,
      counterparty_id: 2,
      lines: [
        {
          account_id: 1,
          tag_id: 10,
          sign: '-' as const,
          amount: 5000,
          note: 'Updated note',
        },
      ],
    }

    beforeEach(() => {
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId2() }) // addLine: line id lookup
        .mockResolvedValueOnce(sampleLine) // addLine: line result
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1705000000 }) // findById: trx header
      mockQuerySQL.mockResolvedValue([sampleLine]) // findById: trx lines
    })

    it('updates trx header', async () => {
      await transactionRepository.update(mockId(), input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE trx SET timestamp = ?'),
        expect.arrayContaining([1705000000, mockId()])
      )
    })

    it('manages counterparty relationship', async () => {
      await transactionRepository.update(mockId(), input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM trx_to_counterparty WHERE trx_id = ?'),
        [mockId()]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_to_counterparty'),
        [mockId(), 2]
      )
    })

    it('wipes and recreates transaction lines', async () => {
      await transactionRepository.update(mockId(), input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM trx_base WHERE trx_id = ?'),
        [mockId()]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_base'),
        expect.arrayContaining([mockId(), 1, 10, '-', 5000])
      )
    })

    it('handles counterparty_name auto-creation', async () => {
      const inputWithName = { ...input, counterparty_id: undefined, counterparty_name: 'New CP' }
      await transactionRepository.update(mockId(), inputWithName)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO counterparty'),
        ['New CP', 'New CP']
      )
    })

    it('returns updated transaction', async () => {
      const result = await transactionRepository.update(mockId(), input)
      expect(result).toBeDefined()
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('FROM trx t'),
        [mockId()]
      )
    })

    it('throws error if retrieval fails after update', async () => {
      mockQueryOne.mockReset()
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId2() }) // addLine: line id extraction
        .mockResolvedValueOnce(sampleLine) // addLine: line retrieval
        .mockResolvedValueOnce(null) // findById returns null
      await expect(transactionRepository.update(mockId(), input)).rejects.toThrow('Failed to update transaction')
    })
  })

  describe('getExchanges', () => {
    it('returns exchange transactions from exchanges view', async () => {
      const exchangeView: ExchangeView = {
        id: mockId(),
        date_time: '2025-01-09 14:30:00',
        counterparty: null,
        wallet: 'Checking',
        currency: 'USD',
        tag: 'exchange',
        amount: -10000,
      }
      mockQuerySQL.mockResolvedValue([exchangeView])

      const result = await transactionRepository.getExchanges()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM exchanges')
      )
      expect(result).toEqual([exchangeView])
    })

    it('applies limit when provided', async () => {
      mockQuerySQL.mockResolvedValue([])
      await transactionRepository.getExchanges(10)
      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 10')
      )
    })

    it('does not apply limit when not provided', async () => {
      mockQuerySQL.mockResolvedValue([])
      await transactionRepository.getExchanges()
      expect(mockQuerySQL).not.toHaveBeenCalledWith(
        expect.stringContaining('LIMIT')
      )
    })
  })

  describe('getTransfers', () => {
    it('returns transfer transactions from transfers view', async () => {
      const transferView: TransferView = {
        id: mockId(),
        date_time: '2025-01-09 14:30:00',
        counterparty: null,
        wallet: 'Checking',
        currency: 'USD',
        tag: 'transfer',
        amount: -10000,
      }
      mockQuerySQL.mockResolvedValue([transferView])

      const result = await transactionRepository.getTransfers()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM transfers')
      )
      expect(result).toEqual([transferView])
    })

    it('applies limit when provided', async () => {
      mockQuerySQL.mockResolvedValue([])
      await transactionRepository.getTransfers(10)
      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 10')
      )
    })

    it('does not apply limit when not provided', async () => {
      mockQuerySQL.mockResolvedValue([])
      await transactionRepository.getTransfers()
      expect(mockQuerySQL).not.toHaveBeenCalledWith(
        expect.stringContaining('LIMIT')
      )
    })
  })

  describe('createIncome', () => {
    it('creates income transaction with + sign', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce({ ...sampleLine, sign: '+' })
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([{ ...sampleLine, sign: '+' }])

      await transactionRepository.createIncome(1, 10, 10000)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_base'),
        expect.arrayContaining([1, 10, '+', 10000])
      )
    })

    it('works without options', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce({ ...sampleLine, sign: '+' })
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([{ ...sampleLine, sign: '+' }])

      await transactionRepository.createIncome(1, 10, 10000)
    })

    it('passes counterparty options', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce({ ...sampleLine, sign: '+' })
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([{ ...sampleLine, sign: '+' }])

      await transactionRepository.createIncome(1, 10, 10000, {
        counterpartyId: 1,
      })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_to_counterparty'),
        expect.anything()
      )
    })
  })

  describe('createExpense', () => {
    it('creates expense transaction with - sign', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([sampleLine])

      await transactionRepository.createExpense(1, 10, 5000)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_base'),
        expect.arrayContaining([1, 10, '-', 5000])
      )
    })

    it('works without options', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([sampleLine])

      await transactionRepository.createExpense(1, 10, 5000)
      // Should hit this.create with minimal input
    })
  })

  describe('createTransfer', () => {
    it('creates transfer with two lines (from and to)', async () => {
      // Mock for trx creation
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() }) // trx id
        .mockResolvedValueOnce({ id: mockId2() }) // first line id
        .mockResolvedValueOnce(sampleLine) // first line result
        .mockResolvedValueOnce({ id: mockId() }) // second line id
        .mockResolvedValueOnce(sampleLine) // second line result
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([sampleLine])

      await transactionRepository.createTransfer(1, 2, 10000)

      // Should create two lines with SYSTEM_TAGS.TRANSFER
      const insertCalls = mockExecSQL.mock.calls.filter(
        call => call[0].includes('INSERT INTO trx_base')
      )
      expect(insertCalls.length).toBe(2)
    })

    it('adds fee line when fee option provided', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([sampleLine])

      await transactionRepository.createTransfer(1, 2, 10000, { fee: 100 })

      // Should create three lines (from, to, fee)
      const insertCalls = mockExecSQL.mock.calls.filter(
        call => call[0].includes('INSERT INTO trx_base')
      )
      expect(insertCalls.length).toBe(3)
    })
  })

  describe('createExchange', () => {
    it('creates exchange with two lines (from and to)', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([sampleLine])

      await transactionRepository.createExchange(1, 2, 10000, 9200)

      // Should create two lines with SYSTEM_TAGS.EXCHANGE
      const insertCalls = mockExecSQL.mock.calls.filter(
        call => call[0].includes('INSERT INTO trx_base')
      )
      expect(insertCalls.length).toBe(2)
    })

    it('uses different amounts for from and to', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([sampleLine])

      await transactionRepository.createExchange(1, 2, 10000, 9200)

      const insertCalls = mockExecSQL.mock.calls.filter(
        call => call[0].includes('INSERT INTO trx_base')
      )
      // First line: from amount
      expect(insertCalls[0][1]).toContain(10000)
      // Second line: to amount
      expect(insertCalls[1][1]).toContain(9200)
    })

    it('passes options correctly', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce({ id: mockId2() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId() })
        .mockResolvedValueOnce(sampleLine)
        .mockResolvedValueOnce({ id: mockId(), timestamp: 1704803400 })
      mockQuerySQL.mockResolvedValue([sampleLine])

      await transactionRepository.createExchange(1, 2, 10000, 9200, {
        counterpartyId: 1,
        note: 'Exchange note',
        timestamp: 1700000000,
      })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx'),
        expect.arrayContaining([1700000000])
      )
    })
  })

  describe('findAllForExport', () => {
    it('returns all transactions from trx_log view', async () => {
      mockQuerySQL.mockResolvedValue([sampleTransactionLog])

      const result = await transactionRepository.findAllForExport()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM trx_log'),
        []
      )
      expect(result).toEqual([sampleTransactionLog])
    })

    it('filters by start timestamp', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findAllForExport(1704067200)

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('date_time >= datetime'),
        [1704067200]
      )
    })

    it('filters by end timestamp', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findAllForExport(undefined, 1704153600)

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('date_time <= datetime'),
        [1704153600]
      )
    })

    it('filters by both start and end timestamp', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findAllForExport(1704067200, 1704153600)

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('date_time >= datetime'),
        [1704067200, 1704153600]
      )
      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('date_time <= datetime'),
        expect.anything()
      )
    })

    it('orders by date_time ASC', async () => {
      mockQuerySQL.mockResolvedValue([])

      await transactionRepository.findAllForExport()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY date_time ASC'),
        expect.anything()
      )
    })
  })
})
