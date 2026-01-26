import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { SummariesPage } from '../../../pages/SummariesPage'

vi.mock('../../../services/repositories')
// Import after mock
import { transactionRepository, currencyRepository, accountRepository } from '../../../services/repositories'
const mockTransactionRepository = vi.mocked(transactionRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockAccountRepository = vi.mocked(accountRepository)

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

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn()
  }
})

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
      name: 'US Dollar'
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
      mockCurrencyRepository.findDefault.mockImplementation(() => new Promise(() => { }))

      const { container } = renderWithRouter()

      expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    })
  })

  describe('Tags tab', () => {
    it('displays tags summary when By Tags is clicked', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('By Tags')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('By Tags'))

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
        expect(screen.getByText('Salary')).toBeInTheDocument()
      })
    })

    it('shows income and expense for each tag', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('By Tags')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('By Tags'))

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
        expect(screen.getByText('By Tags')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('By Tags'))

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
    it('displays category breakdown by default', async () => {
      renderWithRouter()

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
        expect(screen.getByText('No transactions this month')).toBeInTheDocument()
      })
    })

    it('shows empty state when no expenses', async () => {
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 2, tag: 'Salary', amount: 100000, type: 'income' },
      ])
      mockTransactionRepository.getMonthSummary.mockResolvedValue({
        income: 0,
        expenses: 0,
      })

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('No expenses this month')).toBeInTheDocument()
      })
    })

    it('shows empty state when no incomes', async () => {
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 1, tag: 'Food', amount: 30000, type: 'expense' },
      ])
      mockTransactionRepository.getMonthSummary.mockResolvedValue({
        income: 0,
        expenses: 0,
      })

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('No income this month')).toBeInTheDocument()
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

  describe('Card click navigation', () => {
    it('tag card is clickable', async () => {
      renderWithRouter(['/summaries?tab=tags'])

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Card should have cursor-pointer class
      const foodCard = screen.getByText('Food').closest('div[class*="cursor-pointer"]')
      expect(foodCard).toBeTruthy()
    })

    it('tag card is navigate to correct route', async () => {
      const navigate = vi.fn()
      vi.mocked(useNavigate).mockReturnValue(navigate)
      renderWithRouter(['/summaries?tab=tags'])
      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Card should have cursor-pointer class
      const foodCard = screen.getByText('Food')
      fireEvent.click(foodCard)
      expect(navigate).toHaveBeenCalledWith('/?month=2025-01&tag=1')
    })

    it('counterparty card is clickable', async () => {
      renderWithRouter(['/summaries?tab=counterparties'])

      await waitFor(() => {
        expect(screen.getByText('Employer')).toBeInTheDocument()
      })

      // Card should have cursor-pointer class
      const employerCard = screen.getByText('Employer').closest('div[class*="cursor-pointer"]')
      expect(employerCard).toBeTruthy()
    })

    it('counterparty card is navigate to correct route', async () => {
      const navigate = vi.fn()
      vi.mocked(useNavigate).mockReturnValue(navigate)
      renderWithRouter(['/summaries?tab=counterparties'])
      await waitFor(() => {
        expect(screen.getByText('Employer')).toBeInTheDocument()
      })

      // Card should have cursor-pointer class
      const foodCard = screen.getByText('Employer')
      fireEvent.click(foodCard)
      expect(navigate).toHaveBeenCalledWith('/?month=2025-01&counterparty=1')
    })

    it('category card is clickable in income/expense tab', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Salary')).toBeInTheDocument()
      })

      // Card should have cursor-pointer class
      const salaryCard = screen.getByText('Salary').closest('div[class*="cursor-pointer"]')
      expect(salaryCard).toBeTruthy()
    })

    it('category card is navigate to correct route', async () => {
      const navigate = vi.fn()
      vi.mocked(useNavigate).mockReturnValue(navigate)
      renderWithRouter()
      await waitFor(() => {
        expect(screen.getByText('Salary')).toBeInTheDocument()
      })

      // Card should have cursor-pointer class
      const foodCard = screen.getByText('Salary')
      fireEvent.click(foodCard)
      expect(navigate).toHaveBeenCalledWith('/?month=2025-01&type=income&tag=2')
    })

    it('category section is navigate to correct route', async () => {
      const navigate = vi.fn()
      vi.mocked(useNavigate).mockReturnValue(navigate)
      renderWithRouter()
      await waitFor(() => {
        expect(screen.getByText(/Expenses/)).toBeInTheDocument()
      })

      // Card should have cursor-pointer class
      const foodCard = screen.getByText(/Expenses \(/)
      fireEvent.click(foodCard)
      expect(navigate).toHaveBeenCalledWith('/?month=2025-01&type=expense')
    })

    it('cards have hover styles when clickable', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Card should have hover styles
      const foodCard = screen.getByText('Food').closest('div[class*="cursor-pointer"]')
      expect(foodCard?.className).toMatch(/hover:/)
    })
  })
})
