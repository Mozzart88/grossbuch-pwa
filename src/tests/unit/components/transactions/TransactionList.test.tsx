import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { TransactionList } from '../../../../components/transactions/TransactionList'
import type { TransactionLog } from '../../../../types'

// Mock repositories
vi.mock('../../../../services/repositories', () => ({
  transactionRepository: {
    findByMonth: vi.fn(),
    getMonthSummary: vi.fn(),
  },
  accountRepository: {
    getTotalBalance: vi.fn(),
  },
  currencyRepository: {
    findDefault: vi.fn(),
  },
}))

// Mock dateUtils
vi.mock('../../../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../../../utils/dateUtils')
  return {
    ...actual,
    getCurrentMonth: () => '2025-01',
  }
})

import {
  transactionRepository,
  accountRepository,
  currencyRepository,
} from '../../../../services/repositories'

const mockTransactionRepository = vi.mocked(transactionRepository)
const mockAccountRepository = vi.mocked(accountRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)

const sampleTransaction: TransactionLog = {
  id: new Uint8Array(8),
  date_time: '2025-01-09 14:30:00',
  counterparty: null,
  wallet: 'Cash',
  currency: 'USD',
  tags: 'food',
  amount: -5000, // -50.00
  rate: 0,
  symbol: '$',
  decimal_places: 2
}

describe('TransactionList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.findDefault.mockResolvedValue({
      id: 1,
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      decimal_places: 2,
      is_default: true,
      is_fiat: true,
    })
    mockTransactionRepository.findByMonth.mockResolvedValue([sampleTransaction])
    mockTransactionRepository.getMonthSummary.mockResolvedValue({ income: 100000, expenses: 50000 })
    mockAccountRepository.getTotalBalance.mockResolvedValue(150000)
  })

  const renderWithRouter = () => {
    return render(
      <BrowserRouter>
        <TransactionList />
      </BrowserRouter>
    )
  }

  it('displays loading spinner initially', () => {
    mockTransactionRepository.findByMonth.mockImplementation(() => new Promise(() => { }))

    const { container } = renderWithRouter()

    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('displays transactions after loading', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Food').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('displays month summary', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('$1,000.00')).toBeInTheDocument()
      expect(screen.getByText('$500.00')).toBeInTheDocument()
    })
  })

  it('displays empty state when no transactions', async () => {
    mockTransactionRepository.findByMonth.mockResolvedValue([])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('No transactions this month')).toBeInTheDocument()
    })
  })

  it('groups transactions by date', async () => {
    const transactions: TransactionLog[] = [
      { ...sampleTransaction, id: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]), date_time: '2025-01-09 14:30:00' },
      { ...sampleTransaction, id: new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0]), date_time: '2025-01-09 16:00:00' },
      { ...sampleTransaction, id: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0]), date_time: '2025-01-10 08:00:00' },
    ]
    mockTransactionRepository.findByMonth.mockResolvedValue(transactions)

    renderWithRouter()

    await waitFor(() => {
      // 3 transactions showing 'food' tag
      expect(screen.getAllByText('Food').length).toBe(3)
    })
  })

  it('displays month navigator', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText(/January.*2025/)).toBeInTheDocument()
    })
  })

  it('handles currency not found', async () => {
    mockCurrencyRepository.findDefault.mockResolvedValue(null)

    renderWithRouter()

    await waitFor(() => {
      // Should use default $ symbol
      expect(screen.getByText('$1,000.00')).toBeInTheDocument()
    })
  })

  it('displays total balance', async () => {
    renderWithRouter()

    await waitFor(() => {
      // Total balance: 150000 / 100 = 1500.00
      expect(screen.getByText('$1,500.00')).toBeInTheDocument()
    })
  })

  it('uses currency decimal places for formatting', async () => {
    mockCurrencyRepository.findDefault.mockResolvedValue({
      id: 1,
      code: 'BTC',
      name: 'Bitcoin',
      symbol: '₿',
      decimal_places: 8,
      is_default: true,
      is_crypto: true,
    })
    mockTransactionRepository.getMonthSummary.mockResolvedValue({ income: 100000000, expenses: 50000000 })
    mockAccountRepository.getTotalBalance.mockResolvedValue(150000000)

    renderWithRouter()

    await waitFor(() => {
      // With 8 decimal places: 100000000 / 10^8 = 1.00000000
      expect(screen.getByText('₿1.00000000')).toBeInTheDocument()
    })
  })

  it('renders transaction items with correct props', async () => {
    renderWithRouter()

    await waitFor(() => {
      // Transaction shows wallet name when no counterparty
      expect(screen.getByText('Cash')).toBeInTheDocument()
      // Transaction amount
      expect(screen.getByText('$50.00')).toBeInTheDocument()
    })
  })

  it('shows counterparty when available', async () => {
    const withCounterparty: TransactionLog = {
      ...sampleTransaction,
      counterparty: 'Supermarket',
    }
    mockTransactionRepository.findByMonth.mockResolvedValue([withCounterparty])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Supermarket')).toBeInTheDocument()
    })
  })
})
