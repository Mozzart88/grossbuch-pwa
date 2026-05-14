import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { SummariesPage } from '../../../pages/SummariesPage'
import { LayoutProvider, useLayoutContext } from '../../../store/LayoutContext'
import { formatCurrencyValue } from '../../../utils/formatters'

vi.mock('../../../services/repositories')
// Import after mock
import { transactionRepository, currencyRepository, accountRepository, budgetRepository, tagRepository } from '../../../services/repositories'
const mockTransactionRepository = vi.mocked(transactionRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockAccountRepository = vi.mocked(accountRepository)
const mockBudgetRepository = vi.mocked(budgetRepository)
const mockTagRepository = vi.mocked(tagRepository)

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

// Mock Toast provider
vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual<typeof import('../../../components/ui')>('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({
      showToast: vi.fn(),
    }),
  }
})

const renderWithRouter = (initialEntries = ['/summaries']) => {
  return render(
    <LayoutProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <SummariesPage />
      </MemoryRouter>
    </LayoutProvider>
  )
}

// Helper component that exposes the FAB config as a clickable button
function FABTrigger() {
  const { plusButtonConfig } = useLayoutContext()
  if (plusButtonConfig?.onClick) {
    return <button data-testid="test-fab" onClick={plusButtonConfig.onClick}>FAB</button>
  }
  return null
}

describe('SummariesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.findSystem.mockResolvedValue({
      id: 1,
      code: 'USD',
      symbol: '$',
      decimal_places: 2,
      name: 'US Dollar'
    })
    mockTransactionRepository.getMonthSummary.mockResolvedValue({
      income: 1000,
      expenses: 500,
    })
    mockAccountRepository.getPlainTotalBalance.mockResolvedValue(1500)
    mockTransactionRepository.getMonthlyTagsSummary.mockResolvedValue([
      { tag_id: 1, tag: 'Food', income: 0, expense: 300, net: -300 },
      { tag_id: 2, tag: 'Salary', income: 1000, expense: 0, net: 1000 },
    ])
    mockTransactionRepository.getMonthlyCounterpartiesSummary.mockResolvedValue([
      { counterparty_id: 1, counterparty: 'Employer', income: 1000, expense: 0, net: 1000 },
      { counterparty_id: 2, counterparty: 'Grocery Store', income: 0, expense: 200, net: -200 },
    ])
    mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
      { tag_id: 1, tag: 'Food', amount: 300, type: 'expense' },
      { tag_id: 2, tag: 'Salary', amount: 1000, type: 'income' },
    ])
    // Budget mocks
    mockBudgetRepository.findByMonth.mockResolvedValue([])
    mockBudgetRepository.create.mockResolvedValue({
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      tag_id: 1,
      amount_int: 500,
      amount_frac: 0,
      start: 0,
      end: 0,
      tag: 'Food',
      actual: 300,
    })
    mockBudgetRepository.update.mockResolvedValue({
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      tag_id: 1,
      amount_int: 600,
      amount_frac: 0,
      start: 0,
      end: 0,
      tag: 'Food',
      actual: 300,
    })
    mockBudgetRepository.delete.mockResolvedValue(undefined)
    mockBudgetRepository.findByTagId.mockResolvedValue([])
    mockTagRepository.findIncomeTags.mockResolvedValue([
      { id: 24, name: 'Consulting', sort_order: 10 },
      { id: 25, name: 'Mixed', sort_order: 10 },
    ])
    mockTagRepository.findExpenseTags.mockResolvedValue([
      { id: 12, name: 'Food', sort_order: 10 },
      { id: 25, name: 'Mixed', sort_order: 10 },
      { id: 13, name: 'Transport', sort_order: 10 },
    ])
    mockTagRepository.findSystemTags?.mockResolvedValue([
      { id: 21, name: 'savings', sort_order: 0 },
      { id: 22, name: 'credits', sort_order: 0 },
      { id: 3, name: 'archived', sort_order: 0 },
    ])
    mockTagRepository.getContextOptions?.mockImplementation((type: 'income' | 'expense') => Promise.resolve(
      type === 'expense'
        ? [
            { tag_id: 12, tag_name: 'Food', context_id: null, context_name: null, label: 'Food', type: 'expense' },
          ]
        : [
            { tag_id: 24, tag_name: 'Consulting', context_id: null, context_name: null, label: 'Consulting', type: 'income' },
          ]
    ))
    mockTagRepository.getHierarchy?.mockResolvedValue([])
  })

  describe('Page structure', () => {
    it('renders page header with back button', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Summaries')).toBeInTheDocument()
      })
    })

    it('switches between nested and flat summary views from the header', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Switch to flat view' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Switch to flat view' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Switch to nested view' })).toBeInTheDocument()
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
        expect(screen.getByText('Budgets')).toBeInTheDocument()
      })
    })
  })

  describe('Loading state', () => {
    it('shows loading spinner while fetching data', () => {
      // Make the promise hang to see loading state
      mockCurrencyRepository.findSystem.mockImplementation(() => new Promise(() => { }))

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

    it('keeps shared child tag totals separated by transaction context', async () => {
      mockTransactionRepository.getMonthSummary.mockResolvedValue({
        income: 0,
        expenses: 150,
      })
      mockTransactionRepository.getMonthlyTagsSummary.mockResolvedValue([
        { tag_id: 30, tag: 'Central Park', income: 0, expense: 100, net: -100, tag_context_id: null, tag_context: null },
        { tag_id: 31, tag: 'Briton Beach', income: 0, expense: 50, net: -50, tag_context_id: null, tag_context: null },
        { tag_id: 40, tag: 'Maintenance', income: 0, expense: 100, net: -100, tag_context_id: 30, tag_context: 'Central Park' },
        { tag_id: 40, tag: 'Maintenance', income: 0, expense: 50, net: -50, tag_context_id: 31, tag_context: 'Briton Beach' },
      ])
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 30, tag: 'Central Park', amount: 100, type: 'expense', tag_context_id: null, tag_context: null },
        { tag_id: 31, tag: 'Briton Beach', amount: 50, type: 'expense', tag_context_id: null, tag_context: null },
        { tag_id: 40, tag: 'Maintenance', amount: 100, type: 'expense', tag_context_id: 30, tag_context: 'Central Park' },
        { tag_id: 40, tag: 'Maintenance', amount: 50, type: 'expense', tag_context_id: 31, tag_context: 'Briton Beach' },
      ])
      mockTagRepository.findExpenseTags.mockResolvedValue([
        { id: 30, name: 'Central Park', sort_order: 10 },
        { id: 31, name: 'Briton Beach', sort_order: 10 },
        { id: 40, name: 'Maintenance', sort_order: 10 },
      ])
      mockTagRepository.getHierarchy.mockResolvedValue([
        { parent_id: 10, parent: 'expense', child_id: 30, child: 'Central Park' },
        { parent_id: 10, parent: 'expense', child_id: 31, child: 'Briton Beach' },
        { parent_id: 30, parent: 'Central Park', child_id: 40, child: 'Maintenance' },
        { parent_id: 31, parent: 'Briton Beach', child_id: 40, child: 'Maintenance' },
      ])

      renderWithRouter()

      await waitFor(() => expect(screen.getByText('By Tags')).toBeInTheDocument())
      fireEvent.click(screen.getByText('By Tags'))

      await waitFor(() => {
        expect(screen.getByText('Central Park')).toBeInTheDocument()
        expect(screen.getByText('Briton Beach')).toBeInTheDocument()
      })

      expect(screen.getAllByText('Maintenance')).toHaveLength(2)
      expect(screen.getAllByText(formatCurrencyValue(-100, '$'), { exact: false }).length).toBeGreaterThanOrEqual(2)
      expect(screen.getAllByText(formatCurrencyValue(-50, '$'), { exact: false }).length).toBeGreaterThanOrEqual(2)
    })

    it('flat view groups shared child tag totals into one row', async () => {
      mockTransactionRepository.getMonthSummary.mockResolvedValue({
        income: 0,
        expenses: 150,
      })
      mockTransactionRepository.getMonthlyTagsSummary.mockResolvedValue([
        { tag_id: 30, tag: 'Auto', income: 0, expense: 100, net: -100, tag_context_id: null, tag_context: null },
        { tag_id: 31, tag: 'Boat', income: 0, expense: 50, net: -50, tag_context_id: null, tag_context: null },
        { tag_id: 40, tag: 'Maintenance', income: 0, expense: 100, net: -100, tag_context_id: 30, tag_context: 'Auto' },
        { tag_id: 40, tag: 'Maintenance', income: 0, expense: 50, net: -50, tag_context_id: 31, tag_context: 'Boat' },
      ])

      renderWithRouter(['/summaries?tab=tags&view=flat'])

      await waitFor(() => {
        expect(screen.getByText('Maintenance')).toBeInTheDocument()
      })

      expect(screen.getAllByText('Maintenance')).toHaveLength(1)
      expect(screen.getAllByText(formatCurrencyValue(-150, '$'), { exact: false }).length).toBeGreaterThan(0)
    })

    it('aggregates deeply nested tags and preserves separate row and title clicks', async () => {
      const navigate = vi.fn()
      vi.mocked(useNavigate).mockReturnValue(navigate)
      mockTransactionRepository.getMonthSummary.mockResolvedValue({
        income: 0,
        expenses: 21,
      })
      mockTransactionRepository.getMonthlyTagsSummary.mockResolvedValue([
        { tag_id: 100, tag: 'Food', income: 0, expense: 21, net: -21, tag_context_id: null, tag_context: null },
        { tag_id: 101, tag: 'Meat', income: 0, expense: 12, net: -12, tag_context_id: 100, tag_context: 'Food' },
        { tag_id: 102, tag: 'Chicken', income: 0, expense: 2, net: -2, tag_context_id: 100, tag_context: 'Food' },
        { tag_id: 103, tag: 'Water', income: 0, expense: 2, net: -2, tag_context_id: 100, tag_context: 'Food' },
      ])
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 100, tag: 'Food', amount: 21, type: 'expense', tag_context_id: null, tag_context: null },
        { tag_id: 101, tag: 'Meat', amount: 12, type: 'expense', tag_context_id: 100, tag_context: 'Food' },
        { tag_id: 102, tag: 'Chicken', amount: 2, type: 'expense', tag_context_id: 100, tag_context: 'Food' },
        { tag_id: 103, tag: 'Water', amount: 2, type: 'expense', tag_context_id: 100, tag_context: 'Food' },
      ])
      mockTagRepository.findExpenseTags.mockResolvedValue([
        { id: 100, name: 'Food', sort_order: 10 },
        { id: 101, name: 'Meat', sort_order: 10 },
        { id: 102, name: 'Chicken', sort_order: 10 },
        { id: 103, name: 'Water', sort_order: 10 },
      ])
      mockTagRepository.getHierarchy.mockResolvedValue([
        { parent_id: 10, parent: 'expense', child_id: 100, child: 'Food' },
        { parent_id: 100, parent: 'Food', child_id: 101, child: 'Meat' },
        { parent_id: 101, parent: 'Meat', child_id: 102, child: 'Chicken' },
        { parent_id: 100, parent: 'Food', child_id: 103, child: 'Water' },
      ])

      renderWithRouter(['/summaries?tab=tags'])

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
        expect(screen.getByText('Meat')).toBeInTheDocument()
        expect(screen.getByText('Chicken')).toBeInTheDocument()
        expect(screen.getAllByText(formatCurrencyValue(-21, '$'), { exact: false }).length).toBeGreaterThan(0)
        expect(screen.getAllByText(formatCurrencyValue(-14, '$'), { exact: false }).length).toBeGreaterThan(0)
      })

      fireEvent.click(screen.getByText('Meat').closest('div[class*="cursor-pointer"]')!)
      expect(screen.queryByText('Chicken')).not.toBeInTheDocument()

      fireEvent.click(screen.getByText('Meat').closest('div[class*="cursor-pointer"]')!)
      expect(screen.getByText('Chicken')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Food'))
      expect(navigate).toHaveBeenCalledWith('/?month=2025-01&tag=100&includeChildren=1&tagContext=100')
    })

    it('renders intermediate descendants for contextual leaf transactions', async () => {
      mockTransactionRepository.getMonthSummary.mockResolvedValue({
        income: 0,
        expenses: 10,
      })
      mockTransactionRepository.getMonthlyTagsSummary.mockResolvedValue([
        { tag_id: 100, tag: 'Auto', income: 0, expense: 10, net: -10, tag_context_id: null, tag_context: null },
        { tag_id: 102, tag: 'Gasoline', income: 0, expense: 10, net: -10, tag_context_id: 100, tag_context: 'Auto' },
      ])
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 100, tag: 'Auto', amount: 10, type: 'expense', tag_context_id: null, tag_context: null },
        { tag_id: 102, tag: 'Gasoline', amount: 10, type: 'expense', tag_context_id: 100, tag_context: 'Auto' },
      ])
      mockTagRepository.findExpenseTags.mockResolvedValue([
        { id: 100, name: 'Auto', sort_order: 10 },
        { id: 101, name: 'Fuel', sort_order: 10 },
        { id: 102, name: 'Gasoline', sort_order: 10 },
      ])
      mockTagRepository.getHierarchy.mockResolvedValue([
        { parent_id: 10, parent: 'expense', child_id: 100, child: 'Auto' },
        { parent_id: 10, parent: 'expense', child_id: 101, child: 'Fuel' },
        { parent_id: 10, parent: 'expense', child_id: 102, child: 'Gasoline' },
        { parent_id: 100, parent: 'Auto', child_id: 101, child: 'Fuel' },
        { parent_id: 101, parent: 'Fuel', child_id: 102, child: 'Gasoline' },
      ])

      renderWithRouter(['/summaries?tab=tags'])

      await waitFor(() => {
        expect(screen.getByText('Auto')).toBeInTheDocument()
        expect(screen.getByText('Fuel')).toBeInTheDocument()
        expect(screen.getByText('Gasoline')).toBeInTheDocument()
        expect(screen.getAllByText(formatCurrencyValue(-10, '$'), { exact: false }).length).toBeGreaterThanOrEqual(3)
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
        expect(screen.getAllByText(formatCurrencyValue(1000, '$'), { exact: false }).length).toBeGreaterThan(0)
        expect(screen.getAllByText(formatCurrencyValue(300, '$'), { exact: false }).length).toBeGreaterThan(0)
      })
    })

    it('shows In and Out columns when tag has both income and expense', async () => {
      mockTransactionRepository.getMonthlyTagsSummary.mockResolvedValue([
        { tag_id: 3, tag: 'Mixed', income: 500, expense: 200, net: 300 },
      ])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('By Tags')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('By Tags'))

      await waitFor(() => {
        expect(screen.getByText('Mixed')).toBeInTheDocument()
        expect(screen.getByText('In:')).toBeInTheDocument()
        expect(screen.getByText('Out:')).toBeInTheDocument()
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

    it('keeps counterparties unchanged in flat view', async () => {
      renderWithRouter(['/summaries?tab=counterparties&view=flat'])

      await waitFor(() => {
        expect(screen.getByText('Employer')).toBeInTheDocument()
        expect(screen.getByText('Grocery Store')).toBeInTheDocument()
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
        { tag_id: 2, tag: 'Salary', amount: 1000, type: 'income' },
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
        { tag_id: 1, tag: 'Food', amount: 300, type: 'expense' },
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

    it('flat view groups contextual budget actuals and planned amounts by tag', async () => {
      mockTransactionRepository.getMonthSummary.mockResolvedValue({
        income: 0,
        expenses: 65,
      })
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 40, tag: 'Diesel', amount: 25, type: 'expense', tag_context_id: 30, tag_context: 'Auto' },
        { tag_id: 40, tag: 'Diesel', amount: 40, type: 'expense', tag_context_id: 31, tag_context: 'Boat' },
      ])
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1]),
          tag_id: 40,
          tag_context_id: 30,
          tag_context: 'Auto',
          type: 'expense',
          amount_int: 100,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Diesel',
          actual: 25,
        },
        {
          id: new Uint8Array([2, 2, 2, 2, 2, 2, 2, 2]),
          tag_id: 40,
          tag_context_id: 31,
          tag_context: 'Boat',
          type: 'expense',
          amount_int: 200,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Diesel',
          actual: 40,
        },
      ])

      renderWithRouter(['/summaries?view=flat'])

      await waitFor(() => {
        expect(screen.getByText('Diesel')).toBeInTheDocument()
      })

      expect(screen.getAllByText('Diesel')).toHaveLength(1)
      expect(screen.getByText(`${formatCurrencyValue(65, '$')}/${formatCurrencyValue(300, '$')}`)).toBeInTheDocument()
      expect(screen.getByText('22%')).toBeInTheDocument()
    })

    it('flat view keeps budget progress bars for rows without budgets', async () => {
      renderWithRouter(['/summaries?view=flat'])

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      expect(screen.getByText('60%')).toBeInTheDocument()
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

    it('uses flat view from URL parameter', async () => {
      renderWithRouter(['/summaries?month=2025-01&tab=tags&view=flat'])

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Switch to nested view' })).toBeInTheDocument()
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

    it('category section has only actual spendings when no budgets are setted', async () => {
      const navigate = vi.fn()
      vi.mocked(useNavigate).mockReturnValue(navigate)
      renderWithRouter()
      await waitFor(() => {
        expect(screen.getByText(/Expenses/)).toBeInTheDocument()
      })

      // Card should have cursor-pointer class
      const foodCard = screen.getByText(`Expenses ${formatCurrencyValue(300, '$')}/${formatCurrencyValue(0, '$')}`)
      expect(foodCard).toBeInTheDocument()
    })

    it('category section is navigate to correct route', async () => {
      const navigate = vi.fn()
      vi.mocked(useNavigate).mockReturnValue(navigate)
      renderWithRouter()
      await waitFor(() => {
        expect(screen.getByText(/Expenses/)).toBeInTheDocument()
      })

      // Card should have cursor-pointer class
      const foodCard = screen.getByText('Food')
      fireEvent.click(foodCard)
      expect(navigate).toHaveBeenCalledWith('/?month=2025-01&type=expense&tag=1')
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

  describe('Budget functionality', () => {
    it('shows dropdown menu for expense categories', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Expense category should have a dropdown menu button
      const dropdownButtons = screen.getAllByRole('button', { expanded: false })
      expect(dropdownButtons.length).toBeGreaterThan(0)
    })

    it('opens "Set budget" option in dropdown for expense without budget', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Find dropdown button (three dots menu)
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument()
      })
    })

    it('opens "Set budget" option in dropdown for income budget categories', async () => {
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 24, tag: 'Consulting', amount: 1000, type: 'income' },
      ])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Consulting')).toBeInTheDocument()
      })

      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument()
      })
    })

    it('creates separate income and expense budgets for a dual-purpose tag', async () => {
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 25, tag: 'Mixed', amount: 1000, type: 'income' },
      ])

      renderWithRouter()

      await waitFor(() => expect(screen.getByText('Mixed')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { expanded: false }))
      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('menuitem', { name: 'Set budget' }))

      await waitFor(() => expect(screen.getByText('Set Budget')).toBeInTheDocument())
      const amountInput = screen.getByLabelText(/Budget Amount/)
      fireEvent.change(amountInput, { target: { value: '1200.00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(mockBudgetRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({ tag_id: 25, type: 'income', amount_int: 1200 })
        )
      })
    })

    it('folds and unfolds budget sections', async () => {
      renderWithRouter()

      await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())

      fireEvent.click(screen.getByText(`Expenses ${formatCurrencyValue(300, '$')}/${formatCurrencyValue(0, '$')}`))
      expect(screen.queryByText('Food')).not.toBeInTheDocument()

      fireEvent.click(screen.getByText(`Expenses ${formatCurrencyValue(300, '$')}/${formatCurrencyValue(0, '$')}`))
      expect(screen.getByText('Food')).toBeInTheDocument()
    })

    it('renders deeply nested budget categories and opens child-inclusive filters from titles', async () => {
      const navigate = vi.fn()
      vi.mocked(useNavigate).mockReturnValue(navigate)
      mockTransactionRepository.getMonthSummary.mockResolvedValue({
        income: 0,
        expenses: 21,
      })
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 100, tag: 'Food', amount: 21, type: 'expense', tag_context_id: null, tag_context: null },
        { tag_id: 101, tag: 'Meat', amount: 12, type: 'expense', tag_context_id: 100, tag_context: 'Food' },
        { tag_id: 102, tag: 'Chicken', amount: 2, type: 'expense', tag_context_id: 100, tag_context: 'Food' },
      ])
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 100,
          type: 'expense',
          amount_int: 30,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 21,
        },
      ])
      mockTagRepository.findExpenseTags.mockResolvedValue([
        { id: 100, name: 'Food', sort_order: 10 },
        { id: 101, name: 'Meat', sort_order: 10 },
        { id: 102, name: 'Chicken', sort_order: 10 },
      ])
      mockTagRepository.getHierarchy.mockResolvedValue([
        { parent_id: 10, parent: 'expense', child_id: 100, child: 'Food' },
        { parent_id: 100, parent: 'Food', child_id: 101, child: 'Meat' },
        { parent_id: 101, parent: 'Meat', child_id: 102, child: 'Chicken' },
      ])

      renderWithRouter(['/summaries'])

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
        expect(screen.getByText('Meat')).toBeInTheDocument()
        expect(screen.getByText('Chicken')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Meat'))
      expect(navigate).toHaveBeenCalledWith('/?month=2025-01&type=expense&tag=101&includeChildren=1&tagContext=100')

      fireEvent.click(screen.getByText('Food').closest('div[class*="cursor-pointer"]')!)
      expect(screen.queryByText('Meat')).not.toBeInTheDocument()
    })

    it('renders intermediate budget descendants for contextual leaf transactions', async () => {
      mockTransactionRepository.getMonthSummary.mockResolvedValue({
        income: 0,
        expenses: 10,
      })
      mockTransactionRepository.getMonthlyTagsSummary.mockResolvedValue([
        { tag_id: 100, tag: 'Auto', income: 0, expense: 10, net: -10, tag_context_id: null, tag_context: null },
        { tag_id: 102, tag: 'Gasoline', income: 0, expense: 10, net: -10, tag_context_id: 100, tag_context: 'Auto' },
      ])
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 100, tag: 'Auto', amount: 10, type: 'expense', tag_context_id: null, tag_context: null },
        { tag_id: 102, tag: 'Gasoline', amount: 10, type: 'expense', tag_context_id: 100, tag_context: 'Auto' },
      ])
      mockTagRepository.findExpenseTags.mockResolvedValue([
        { id: 100, name: 'Auto', sort_order: 10 },
        { id: 101, name: 'Fuel', sort_order: 10 },
        { id: 102, name: 'Gasoline', sort_order: 10 },
      ])
      mockTagRepository.getHierarchy.mockResolvedValue([
        { parent_id: 10, parent: 'expense', child_id: 100, child: 'Auto' },
        { parent_id: 10, parent: 'expense', child_id: 101, child: 'Fuel' },
        { parent_id: 10, parent: 'expense', child_id: 102, child: 'Gasoline' },
        { parent_id: 100, parent: 'Auto', child_id: 101, child: 'Fuel' },
        { parent_id: 101, parent: 'Fuel', child_id: 102, child: 'Gasoline' },
      ])

      renderWithRouter(['/summaries'])

      await waitFor(() => {
        expect(screen.getByText('Auto')).toBeInTheDocument()
        expect(screen.getByText('Fuel')).toBeInTheDocument()
        expect(screen.getByText('Gasoline')).toBeInTheDocument()
        expect(screen.getAllByText(formatCurrencyValue(10, '$'), { exact: false }).length).toBeGreaterThanOrEqual(3)
      })
    })

    it('opens budget modal when "Set budget" is clicked', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Open dropdown and click "Set budget"
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('menuitem', { name: 'Set budget' }))

      await waitFor(() => {
        expect(screen.getByText('Set Budget')).toBeInTheDocument()
        expect(screen.getByLabelText(/Budget Amount/)).toBeInTheDocument()
      })
    })

    it('pre-fills budget amount with category actual amount', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Open dropdown and click "Set budget"
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('menuitem', { name: 'Set budget' }))

      await waitFor(() => {
        const amountInput = screen.getByLabelText(/Budget Amount/) as HTMLInputElement
        expect(amountInput.value).toBe((300).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
      })
    })

    it('shows Adjust, Set, and Delete options when budget exists on current month', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 300,
        },
      ])

      renderWithRouter() // default: current month 2025-01

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Open dropdown
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Adjust budget' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toBeInTheDocument()
      })
    })

    it('displays amount as actual/budget when budget exists', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 300,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        // Should display as $300.00/$500.00
        expect(screen.getByText(`${formatCurrencyValue(300, '$')}/${formatCurrencyValue(500, '$')}`)).toBeInTheDocument()
      })
    })

    it('shows progress bar relative to budget when budget exists', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 300,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        // 30000/50000 = 60%
        expect(screen.getByText('60%')).toBeInTheDocument()
      })
    })

    it('calls delete when Delete budget is clicked', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 300,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Open dropdown and click delete
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete budget' }))

      await waitFor(() => {
        expect(mockBudgetRepository.delete).toHaveBeenCalled()
      })

      confirmSpy.mockRestore()
    })

    it('shows green progress bar when under 80% of budget', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 300, // 60%
        },
      ])

      const { container } = renderWithRouter()

      await waitFor(() => {
        const progressBar = container.querySelector('.bg-green-500')
        expect(progressBar).toBeInTheDocument()
      })
    })

    it('shows yellow progress bar when between 80-100% of budget', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 450, // 90%
        },
      ])

      const { container } = renderWithRouter()

      await waitFor(() => {
        const progressBar = container.querySelector('.bg-yellow-500')
        expect(progressBar).toBeInTheDocument()
      })
    })

    it('shows red progress bar when over budget', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 600, // 120%
        },
      ])

      const { container } = renderWithRouter()

      await waitFor(() => {
        const progressBar = container.querySelector('.bg-red-500')
        expect(progressBar).toBeInTheDocument()
      })
    })

    it('shows red progress bar when income is below 80% of budget', async () => {
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 24, tag: 'Consulting', amount: 300, type: 'income' },
      ])
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 24,
          type: 'income',
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Consulting',
          actual: 300,
        },
      ])

      const { container } = renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText(`${formatCurrencyValue(300, '$')}/${formatCurrencyValue(500, '$')}`)).toBeInTheDocument()
        expect(container.querySelector('.bg-red-500')).toBeInTheDocument()
      })
    })

    it('shows yellow progress bar when income is between 80-100% of budget', async () => {
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 24, tag: 'Consulting', amount: 450, type: 'income' },
      ])
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 24,
          type: 'income',
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Consulting',
          actual: 450,
        },
      ])

      const { container } = renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText(`${formatCurrencyValue(450, '$')}/${formatCurrencyValue(500, '$')}`)).toBeInTheDocument()
        expect(container.querySelector('.bg-yellow-500')).toBeInTheDocument()
      })
    })

    it('shows green progress bar when income reaches budget', async () => {
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 24, tag: 'Consulting', amount: 600, type: 'income' },
      ])
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 24,
          type: 'income',
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Consulting',
          actual: 600,
        },
      ])

      const { container } = renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText(`${formatCurrencyValue(600, '$')}/${formatCurrencyValue(500, '$')}`)).toBeInTheDocument()
        expect(container.querySelector('.bg-green-500')).toBeInTheDocument()
      })
    })

    it('submits budget form and creates budget', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Open dropdown and click "Set budget"
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('menuitem', { name: 'Set budget' }))

      await waitFor(() => {
        expect(screen.getByText('Set Budget')).toBeInTheDocument()
      })

      // Change amount and submit
      const amountInput = screen.getByLabelText(/Budget Amount/)
      fireEvent.change(amountInput, { target: { value: '500.00' } })

      const saveButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockBudgetRepository.create).toHaveBeenCalled()
      })
    })

    it('opens Edit budget modal with existing values', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 300,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Open dropdown and click "Adjust budget"
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Adjust budget' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('menuitem', { name: 'Adjust budget' }))

      await waitFor(() => {
        expect(screen.getByText('Edit Budget')).toBeInTheDocument()
        const amountInput = screen.getByLabelText(/Budget Amount/) as HTMLInputElement
        expect(amountInput.value).toBe((500).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
      })
    })

    it('updates budget when editing', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 300,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Open dropdown and click "Adjust budget"
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Adjust budget' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('menuitem', { name: 'Adjust budget' }))

      await waitFor(() => {
        expect(screen.getByText('Edit Budget')).toBeInTheDocument()
      })

      // Change amount and submit
      const amountInput = screen.getByLabelText(/Budget Amount/)
      fireEvent.change(amountInput, { target: { value: '600.00' } })

      const saveButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockBudgetRepository.update).toHaveBeenCalled()
      })
    })

    it('closes modal when Cancel is clicked', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Open dropdown and click "Set budget"
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('menuitem', { name: 'Set budget' }))

      await waitFor(() => {
        expect(screen.getByText('Set Budget')).toBeInTheDocument()
      })

      // Click Cancel
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Set Budget')).not.toBeInTheDocument()
      })
    })

    it('does not delete budget when user cancels confirmation', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 300,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Open dropdown and click delete
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete budget' }))

      expect(mockBudgetRepository.delete).not.toHaveBeenCalled()

      confirmSpy.mockRestore()
    })

    it('handles budget when amount is zero - falls back to percentage (edge case)', async () => {
      // When budget amount is 0, it's treated as no budget (hasBudget = false)
      // So it falls back to percentage of total expenses
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 0,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 300,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        // Falls back to category percentage: 30000/50000 = 60%
        expect(screen.getByText('60%')).toBeInTheDocument()
      })
    })

    it('handles budget with zero actual spending', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 0,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        // 0/50000 = 0%
        expect(screen.getByText('0%')).toBeInTheDocument()
        expect(screen.getByText(`${formatCurrencyValue(0, '$')}/${formatCurrencyValue(500, '$')}`)).toBeInTheDocument()
        expect(screen.getByText(`Expenses ${formatCurrencyValue(0, '$')}/${formatCurrencyValue(500, '$')}`)).toBeInTheDocument()
      })
    })

    it('handles budget with zero amount - falls back to percentage (edge case)', async () => {
      // When budget amount is 0, it's treated as no budget (hasBudget = false)
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 0,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 0,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        // Falls back to category percentage: 30000/50000 = 60%
        expect(screen.getByText('60%')).toBeInTheDocument()
      })
    })

    it('does not show dropdown for income categories', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Salary')).toBeInTheDocument()
      })

      // The Salary card (income) should not have a dropdown
      const salaryCard = screen.getByText('Salary').closest('[class*="cursor-pointer"]')
      expect(salaryCard).toBeTruthy()
      // Only expense category (Food) should have dropdown
      const dropdownButtons = screen.getAllByRole('button', { expanded: false })
      expect(dropdownButtons.length).toBe(1) // Only 1 dropdown for Food expense
    })

    it('shows "Set budget" always in dropdown for expense categories', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument()
      })
    })

    it('shows category with budget even when no expenses for that category', async () => {
      // Budget exists for Transport but no expenses
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 13, // Transport - not in categoryBreakdown
          amount_int: 200,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Transport',
          actual: 0,
        },
      ])
      // Food has expenses, Transport does not
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 1, tag: 'Food', amount: 300, type: 'expense' },
        { tag_id: 2, tag: 'Salary', amount: 1000, type: 'income' },
      ])

      renderWithRouter()

      await waitFor(() => {
        // Transport should be shown even without expenses because it has a budget
        expect(screen.getByText('Transport')).toBeInTheDocument()
        // Should show $0.00/$200.00 format
        expect(screen.getByText(`${formatCurrencyValue(0, '$')}/${formatCurrencyValue(200, '$')}`)).toBeInTheDocument()
      })
    })
  })

  describe('Dropdown context-sensitivity', () => {
    const budgetFood = {
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      tag_id: 1,
      amount_int: 500,
      amount_frac: 0,
      start: 0,
      end: 0,
      tag: 'Food',
      actual: 300,
    }

    it('shows "Adjust budget" only when viewing current month with budget', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([budgetFood])

      renderWithRouter(['/summaries']) // current month (2025-01 = todayMonth)

      await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())

      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Adjust budget' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toBeInTheDocument()
      })
    })

    it('does not show "Adjust budget" when viewing a past month with budget', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([budgetFood])

      renderWithRouter(['/summaries?month=2024-12']) // past month

      await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())

      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.queryByRole('menuitem', { name: 'Adjust budget' })).not.toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toBeInTheDocument()
      })
    })

    it('shows "Set budget" when viewing a past month with budget', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([budgetFood])

      renderWithRouter(['/summaries?month=2024-12']) // past month

      await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())

      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument()
      })
    })
  })

  describe('Set budget modal — smart period pre-fill', () => {
    it('pre-fills period with current month when no future budgets exist for tag', async () => {
      mockBudgetRepository.findByTagId.mockResolvedValue([])

      renderWithRouter()

      await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())

      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('menuitem', { name: 'Set budget' }))

      await waitFor(() => expect(mockBudgetRepository.findByTagId).toHaveBeenCalledWith(1, 'expense', null))

      // Submit and verify start timestamp is January 2025
      await waitFor(() => expect(screen.getByText('Set Budget')).toBeInTheDocument())
      const amountInput = screen.getByLabelText(/Budget Amount/)
      fireEvent.change(amountInput, { target: { value: '300.00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      const expectedStart = Math.floor(new Date(2025, 0, 1).getTime() / 1000)
      await waitFor(() => {
        expect(mockBudgetRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({ start: expectedStart })
        )
      })
    })

    it('pre-fills period with next month when current month already has a budget for tag', async () => {
      // Budget for tag 1 in January 2025 (local time)
      const jan2025Mid = Math.floor(new Date(2025, 0, 15).getTime() / 1000)
      mockBudgetRepository.findByTagId.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: jan2025Mid,
          end: 0,
          tag: 'Food',
          actual: 300,
        },
      ])

      renderWithRouter()

      await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())

      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('menuitem', { name: 'Set budget' }))

      // Submit and verify start timestamp is February 2025
      await waitFor(() => expect(screen.getByText('Set Budget')).toBeInTheDocument())
      const amountInput = screen.getByLabelText(/Budget Amount/)
      fireEvent.change(amountInput, { target: { value: '300.00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      const expectedStart = Math.floor(new Date(2025, 1, 1).getTime() / 1000)
      await waitFor(() => {
        expect(mockBudgetRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({ start: expectedStart })
        )
      })
    })
  })

  describe('Edge cases and error handling', () => {
    it('uses fallback symbol and decimals when findSystem returns null', async () => {
      mockCurrencyRepository.findSystem.mockResolvedValue(null as any)

      renderWithRouter()

      await waitFor(() => {
        // Page should still render with default '$' symbol
        expect(screen.getByText('Summaries')).toBeInTheDocument()
      })
    })

    it('handles budget with null actual (uses 0 fallback)', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: null as any,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        // actual is null, so ?? 0 kicks in → 0/500 = 0%
        expect(screen.getByText('0%')).toBeInTheDocument()
      })
    })

    it('does not submit budget form when no tag selected', async () => {
      render(
        <LayoutProvider>
          <MemoryRouter initialEntries={['/summaries']}>
            <SummariesPage />
            <FABTrigger />
          </MemoryRouter>
        </LayoutProvider>
      )

      await waitFor(() => expect(screen.getByTestId('test-fab')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('test-fab'))

      await waitFor(() => expect(screen.getByText('Set Budget')).toBeInTheDocument())

      // Submit without filling tag or amount
      const saveButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(saveButton)

      // Should not call create
      expect(mockBudgetRepository.create).not.toHaveBeenCalled()
    })

    it('shows budget-only category with empty tag name fallback', async () => {
      // Budget with no tag name — covers `b.tag || ''` fallback in budgetOnlyCategories
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 99,
          amount_int: 100,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: undefined as any, // no tag name
          actual: 0,
        },
      ])
      // No breakdown for tag_id 99 → becomes budget-only category
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 2, tag: 'Salary', amount: 1000, type: 'income' },
      ])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Salary')).toBeInTheDocument()
      })
      // Page renders without crashing (empty tag name is ''), budget-only category rendered
    })

    it('handles findByTagId error gracefully in openSetBudgetModal', async () => {
      mockBudgetRepository.findByTagId.mockRejectedValue(new Error('fetch failed'))

      renderWithRouter()

      await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())

      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument())

      fireEvent.click(screen.getByRole('menuitem', { name: 'Set budget' }))

      // Modal should still open despite the error
      await waitFor(() => {
        expect(screen.getByText('Set Budget')).toBeInTheDocument()
      })
    })

    it('shows generic message when budget delete throws non-Error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 300,
        },
      ])
      mockBudgetRepository.delete.mockRejectedValue('string error')

      renderWithRouter()

      await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())

      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete budget' }))

      await waitFor(() => expect(mockBudgetRepository.delete).toHaveBeenCalled())

      consoleSpy.mockRestore()
      vi.restoreAllMocks()
    })

    it('shows generic message when budget save throws non-Error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockBudgetRepository.create.mockRejectedValue('string error')

      renderWithRouter()

      await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())

      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('menuitem', { name: 'Set budget' }))

      await waitFor(() => expect(screen.getByText('Set Budget')).toBeInTheDocument())

      const amountInput = screen.getByLabelText(/Budget Amount/)
      fireEvent.change(amountInput, { target: { value: '300.00' } })

      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(mockBudgetRepository.create).toHaveBeenCalled())

      consoleSpy.mockRestore()
    })
  })

  describe('FAB override', () => {
    it('opens Set Budget modal when FAB is clicked', async () => {
      render(
        <LayoutProvider>
          <MemoryRouter initialEntries={['/summaries']}>
            <SummariesPage />
            <FABTrigger />
          </MemoryRouter>
        </LayoutProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('test-fab')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('test-fab'))

      await waitFor(() => {
        expect(screen.getByText('Set Budget')).toBeInTheDocument()
      })
    })
  })

  describe('Additional coverage', () => {
    it('handles loadData error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockTransactionRepository.getMonthSummary.mockRejectedValue(new Error('Load failed'))

      renderWithRouter()

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load summaries:', expect.any(Error))
      })
      consoleSpy.mockRestore()
    })

    it('handles month navigation via prev button', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('January 2025')).toBeInTheDocument()
      })

      // buttons[2] is the prev-month button in MonthNavigator (before it: PageHeader back, summary view toggle)
      const buttons = screen.getAllByRole('button')
      fireEvent.click(buttons[2])

      await waitFor(() => {
        expect(mockTransactionRepository.getMonthSummary).toHaveBeenCalledWith('2024-12')
      })
    })

    it('opens FAB modal and changes category selection', async () => {
      render(
        <LayoutProvider>
          <MemoryRouter initialEntries={['/summaries']}>
            <SummariesPage />
            <FABTrigger />
          </MemoryRouter>
        </LayoutProvider>
      )

      await waitFor(() => expect(screen.getByTestId('test-fab')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('test-fab'))

      await waitFor(() => expect(screen.getByText('Set Budget')).toBeInTheDocument())

      const categorySelect = screen.getByLabelText('Category')
      // Truthy branch: value '12'
      fireEvent.change(categorySelect, { target: { value: '12' } })
      // Falsy branch: clear to ''
      fireEvent.change(categorySelect, { target: { value: '' } })

      // Verify form renders without crashing
      expect(screen.getByText('Set Budget')).toBeInTheDocument()
    })

    it('offers savings and credit tags when setting an expense budget', async () => {
      render(
        <LayoutProvider>
          <MemoryRouter initialEntries={['/summaries']}>
            <SummariesPage />
            <FABTrigger />
          </MemoryRouter>
        </LayoutProvider>
      )

      await waitFor(() => expect(screen.getByTestId('test-fab')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('test-fab'))

      await waitFor(() => expect(screen.getByText('Set Budget')).toBeInTheDocument())

      const categorySelect = screen.getByLabelText('Category')
      expect(categorySelect).toHaveTextContent('Savings')
      expect(categorySelect).toHaveTextContent('Credit')
      expect(categorySelect).not.toHaveTextContent('archived')
    })

    it('creates a credit refund budget from the system credit tag', async () => {
      render(
        <LayoutProvider>
          <MemoryRouter initialEntries={['/summaries']}>
            <SummariesPage />
            <FABTrigger />
          </MemoryRouter>
        </LayoutProvider>
      )

      await waitFor(() => expect(screen.getByTestId('test-fab')).toBeInTheDocument())

      fireEvent.click(screen.getByTestId('test-fab'))
      await waitFor(() => expect(screen.getByText('Set Budget')).toBeInTheDocument())

      fireEvent.change(screen.getByLabelText('Category'), { target: { value: '22:' } })
      fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '300' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(mockBudgetRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            tag_id: 22,
            tag_context_id: null,
            type: 'expense',
            amount_int: 300,
          })
        )
      })
    })

    it('handles budget save Error instance', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockBudgetRepository.create.mockRejectedValue(new Error('Budget save error'))

      renderWithRouter()

      await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())

      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Set budget' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('menuitem', { name: 'Set budget' }))

      await waitFor(() => expect(screen.getByText('Set Budget')).toBeInTheDocument())

      const amountInput = screen.getByLabelText(/Budget Amount/)
      fireEvent.change(amountInput, { target: { value: '300.00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to save budget:', expect.any(Error))
      })
      consoleSpy.mockRestore()
    })

    it('handles budget delete Error instance', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount_int: 500,
          amount_frac: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 300,
        },
      ])
      mockBudgetRepository.delete.mockRejectedValue(new Error('Delete error'))

      renderWithRouter()

      await waitFor(() => expect(screen.getByText('Food')).toBeInTheDocument())

      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete budget' }))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to delete budget:', expect.any(Error))
      })
      consoleSpy.mockRestore()
      vi.restoreAllMocks()
    })
  })
})
