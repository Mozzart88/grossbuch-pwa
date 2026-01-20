import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SummariesPage } from '../../../pages/SummariesPage'

// Mock repositories
vi.mock('../../../services/repositories', () => ({
  transactionRepository: {
    getMonthSummary: vi.fn(),
    getMonthlyTagsSummary: vi.fn(),
    getMonthlyCounterpartiesSummary: vi.fn(),
    getMonthlyCategoryBreakdown: vi.fn(),
  },
  currencyRepository: {
    findDefault: vi.fn(),
  },
  accountRepository: {
    getTotalBalance: vi.fn(),
  },
}))

// Import after mock
import { transactionRepository, currencyRepository, accountRepository } from '../../../services/repositories'

const mockTransactionRepository = transactionRepository as {
  getMonthSummary: ReturnType<typeof vi.fn>
  getMonthlyTagsSummary: ReturnType<typeof vi.fn>
  getMonthlyCounterpartiesSummary: ReturnType<typeof vi.fn>
  getMonthlyCategoryBreakdown: ReturnType<typeof vi.fn>
}

const mockCurrencyRepository = currencyRepository as {
  findDefault: ReturnType<typeof vi.fn>
}

const mockAccountRepository = accountRepository as {
  getTotalBalance: ReturnType<typeof vi.fn>
}

// Mock dateUtils
vi.mock('../../../utils/dateUtils', () => ({
  getCurrentMonth: () => '2025-01',
  formatMonth: (month: string) => {
    const [year, m] = month.split('-')
    return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][parseInt(m) - 1]} ${year}`
  },
  getPreviousMonth: (month: string) => {
    const [year, m] = month.split('-').map(Number)
    const date = new Date(year, m - 2, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  },
  getNextMonth: (month: string) => {
    const [year, m] = month.split('-').map(Number)
    const date = new Date(year, m, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  },
}))

const renderWithRouter = (initialEntries = ['/summaries']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <SummariesPage />
    </MemoryRouter>
  )
}

describe('SummariesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.findDefault.mockResolvedValue({
      id: 1,
      code: 'USD',
      symbol: '$',
      decimal_places: 2,
    })
    mockTransactionRepository.getMonthSummary.mockResolvedValue({
      income: 100000,
      expenses: 50000,
    })
    mockAccountRepository.getTotalBalance.mockResolvedValue(150000)
    mockTransactionRepository.getMonthlyTagsSummary.mockResolvedValue([
      { tag_id: 1, tag: 'Food', income: 0, expense: 30000, net: -30000 },
      { tag_id: 2, tag: 'Salary', income: 100000, expense: 0, net: 100000 },
    ])
    mockTransactionRepository.getMonthlyCounterpartiesSummary.mockResolvedValue([
      { counterparty_id: 1, counterparty: 'Employer', income: 100000, expense: 0, net: 100000 },
      { counterparty_id: 2, counterparty: 'Grocery Store', income: 0, expense: 20000, net: -20000 },
    ])
    mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
      { tag_id: 1, tag: 'Food', amount: 30000, type: 'expense' },
      { tag_id: 2, tag: 'Salary', amount: 100000, type: 'income' },
    ])
  })

  describe('Page structure', () => {
    it('renders page header with back button', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Summaries')).toBeInTheDocument()
      })
    })

    it('renders month navigator', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('January 2025')).toBeInTheDocument()
      })
    })

    it('renders month summary', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Income')).toBeInTheDocument()
        expect(screen.getByText('Expenses')).toBeInTheDocument()
        expect(screen.getByText('Balance')).toBeInTheDocument()
      })
    })

    it('renders tabs', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('By Tags')).toBeInTheDocument()
        expect(screen.getByText('By Counterparties')).toBeInTheDocument()
        expect(screen.getByText('Income/Expense')).toBeInTheDocument()
      })
    })
  })

  describe('Loading state', () => {
    it('shows loading spinner while fetching data', () => {
      // Make the promise hang to see loading state
      mockCurrencyRepository.findDefault.mockImplementation(() => new Promise(() => {}))

      const { container } = renderWithRouter()

      expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    })
  })

  describe('Tags tab', () => {
    it('displays tags summary by default', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
        expect(screen.getByText('Salary')).toBeInTheDocument()
      })
    })

    it('shows income and expense for each tag', async () => {
      renderWithRouter()

      await waitFor(() => {
        // The same amounts may appear in multiple places (net, income/out columns)
        // So we use getAllByText and check there's at least one
        expect(screen.getAllByText('$1,000.00', { exact: false }).length).toBeGreaterThan(0)
        expect(screen.getAllByText('$300.00', { exact: false }).length).toBeGreaterThan(0)
      })
    })

    it('shows empty state when no tags', async () => {
      mockTransactionRepository.getMonthlyTagsSummary.mockResolvedValue([])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('No transactions this month')).toBeInTheDocument()
      })
    })
  })

  describe('Counterparties tab', () => {
    it('displays counterparties when tab is clicked', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('By Counterparties')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('By Counterparties'))

      await waitFor(() => {
        expect(screen.getByText('Employer')).toBeInTheDocument()
        expect(screen.getByText('Grocery Store')).toBeInTheDocument()
      })
    })

    it('shows empty state when no counterparties', async () => {
      mockTransactionRepository.getMonthlyCounterpartiesSummary.mockResolvedValue([])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('By Counterparties')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('By Counterparties'))

      await waitFor(() => {
        expect(screen.getByText('No transactions this month')).toBeInTheDocument()
      })
    })
  })

  describe('Income/Expense tab', () => {
    it('displays category breakdown when tab is clicked', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Income/Expense')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Income/Expense'))

      await waitFor(() => {
        // Should show category items - Salary for income, Food for expense
        expect(screen.getByText('Salary')).toBeInTheDocument()
        expect(screen.getByText('Food')).toBeInTheDocument()
      })
    })

    it('shows empty state when no categories', async () => {
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([])
      mockTransactionRepository.getMonthSummary.mockResolvedValue({
        income: 0,
        expenses: 0,
      })

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Income/Expense')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Income/Expense'))

      await waitFor(() => {
        expect(screen.getByText('No transactions this month')).toBeInTheDocument()
      })
    })
  })

  describe('Month navigation', () => {
    it('loads data for selected month', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(mockTransactionRepository.getMonthSummary).toHaveBeenCalledWith('2025-01')
      })
    })
  })

  describe('URL parameters', () => {
    it('uses month from URL parameter', async () => {
      renderWithRouter(['/summaries?month=2024-06'])

      await waitFor(() => {
        expect(mockTransactionRepository.getMonthSummary).toHaveBeenCalledWith('2024-06')
      })
    })

    it('uses tab from URL parameter', async () => {
      renderWithRouter(['/summaries?month=2025-01&tab=counterparties'])

      await waitFor(() => {
        expect(screen.getByText('Employer')).toBeInTheDocument()
      })
    })
  })
})
