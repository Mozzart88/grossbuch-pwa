import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { TransactionList } from '../../../../components/transactions/TransactionList'
import type { Transaction } from '../../../../types'

// Mock repositories
vi.mock('../../../../services/repositories', () => ({
  transactionRepository: {
    findByMonth: vi.fn(),
    getMonthSummary: vi.fn(),
  },
  accountRepository: {
    getTotalBalance: vi.fn(),
  },
  settingsRepository: {
    get: vi.fn(),
  },
  currencyRepository: {
    findById: vi.fn(),
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
  settingsRepository,
  currencyRepository,
} from '../../../../services/repositories'

const mockTransactionRepository = vi.mocked(transactionRepository)
const mockAccountRepository = vi.mocked(accountRepository)
const mockSettingsRepository = vi.mocked(settingsRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)

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
  notes: null,
  created_at: '2025-01-09 14:30:00',
  updated_at: '2025-01-09 14:30:00',
  category_name: 'Food',
  category_icon: '🍔',
  account_name: 'Cash',
  currency_symbol: '$',
}

describe('TransactionList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSettingsRepository.get.mockResolvedValue(1)
    mockCurrencyRepository.findById.mockResolvedValue({
      id: 1,
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      decimal_places: 2,
      is_preset: 1,
      created_at: '2025-01-01 00:00:00',
      updated_at: '2025-01-01 00:00:00',
    })
    mockTransactionRepository.findByMonth.mockResolvedValue([sampleTransaction])
    mockTransactionRepository.getMonthSummary.mockResolvedValue({ income: 1000, expenses: 500 })
    mockAccountRepository.getTotalBalance.mockResolvedValue(1500)
  })

  const renderWithRouter = () => {
    return render(
      <BrowserRouter>
        <TransactionList />
      </BrowserRouter>
    )
  }

  it('displays loading spinner initially', () => {
    mockTransactionRepository.findByMonth.mockImplementation(() => new Promise(() => {}))

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
      expect(screen.getByText('+$1,000.00')).toBeInTheDocument()
      expect(screen.getByText('-$500.00')).toBeInTheDocument()
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
    const transactions = [
      { ...sampleTransaction, id: 1, date_time: '2025-01-09 14:30:00' },
      { ...sampleTransaction, id: 2, date_time: '2025-01-09 16:00:00' },
      { ...sampleTransaction, id: 3, date_time: '2025-01-10 08:00:00' },
    ]
    mockTransactionRepository.findByMonth.mockResolvedValue(transactions)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Food').length).toBe(6) // 3 transactions x 2 (title + description)
    })
  })

  it('displays month navigator', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText(/January.*2025/)).toBeInTheDocument()
    })
  })

  it('handles currency not found', async () => {
    mockCurrencyRepository.findById.mockResolvedValue(null)

    renderWithRouter()

    await waitFor(() => {
      // Should use default $ symbol
      expect(screen.getByText('+$1,000.00')).toBeInTheDocument()
    })
  })

  it('handles settings not found', async () => {
    mockSettingsRepository.get.mockResolvedValue(null)

    renderWithRouter()

    await waitFor(() => {
      // Should use default currency id 1
      expect(mockCurrencyRepository.findById).toHaveBeenCalledWith(1)
    })
  })
})
