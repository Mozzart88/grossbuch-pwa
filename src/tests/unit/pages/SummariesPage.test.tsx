import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { SummariesPage } from '../../../pages/SummariesPage'

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
    <MemoryRouter initialEntries={initialEntries}>
      <SummariesPage />
    </MemoryRouter>
  )
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
    // Budget mocks
    mockBudgetRepository.findByMonth.mockResolvedValue([])
    mockBudgetRepository.create.mockResolvedValue({
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      tag_id: 1,
      amount: 50000,
      start: 0,
      end: 0,
      tag: 'Food',
      actual: 30000,
    })
    mockBudgetRepository.update.mockResolvedValue({
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      tag_id: 1,
      amount: 60000,
      start: 0,
      end: 0,
      tag: 'Food',
      actual: 30000,
    })
    mockBudgetRepository.delete.mockResolvedValue(undefined)
    mockTagRepository.findExpenseTags.mockResolvedValue([
      { id: 12, name: 'Food', sort_order: 10 },
      { id: 13, name: 'Transport', sort_order: 10 },
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

    it('shows In and Out columns when tag has both income and expense', async () => {
      mockTransactionRepository.getMonthlyTagsSummary.mockResolvedValue([
        { tag_id: 3, tag: 'Mixed', income: 50000, expense: 20000, net: 30000 },
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

    it('category section has only actual spendings when no budgets are setted', async () => {
      const navigate = vi.fn()
      vi.mocked(useNavigate).mockReturnValue(navigate)
      renderWithRouter()
      await waitFor(() => {
        expect(screen.getByText(/Expenses/)).toBeInTheDocument()
      })

      // Card should have cursor-pointer class
      const foodCard = screen.getByText('Expenses ($500.00)')
      expect(foodCard).toBeInTheDocument
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
        expect(amountInput.value).toBe('300.00')
      })
    })

    it('shows Edit and Delete options when budget exists', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount: 50000,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 30000,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Open dropdown
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Edit budget' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Delete budget' })).toBeInTheDocument()
      })
    })

    it('displays amount as actual/budget when budget exists', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount: 50000,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 30000,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        // Should display as $300.00/$500.00
        expect(screen.getByText('$300.00/$500.00')).toBeInTheDocument()
      })
    })

    it('shows progress bar relative to budget when budget exists', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount: 50000,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 30000,
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
          amount: 50000,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 30000,
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
          amount: 50000,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 30000, // 60%
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
          amount: 50000,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 45000, // 90%
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
          amount: 50000,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 60000, // 120%
        },
      ])

      const { container } = renderWithRouter()

      await waitFor(() => {
        const progressBar = container.querySelector('.bg-red-500')
        expect(progressBar).toBeInTheDocument()
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
          amount: 50000,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 30000,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Open dropdown and click "Edit budget"
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Edit budget' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('menuitem', { name: 'Edit budget' }))

      await waitFor(() => {
        expect(screen.getByText('Edit Budget')).toBeInTheDocument()
        const amountInput = screen.getByLabelText(/Budget Amount/) as HTMLInputElement
        expect(amountInput.value).toBe('500')
      })
    })

    it('updates budget when editing', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount: 50000,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 30000,
        },
      ])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Open dropdown and click "Edit budget"
      const dropdownButton = screen.getByRole('button', { expanded: false })
      fireEvent.click(dropdownButton)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Edit budget' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('menuitem', { name: 'Edit budget' }))

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
          amount: 50000,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 30000,
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
          amount: 0,
          start: 0,
          end: 0,
          tag: 'Food',
          actual: 30000,
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
          amount: 50000,
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
        expect(screen.getByText('$0.00/$500.00')).toBeInTheDocument()
        expect(screen.getByText('Expenses ($500.00/$500.00)')).toBeInTheDocument()
      })
    })

    it('handles budget with zero amount - falls back to percentage (edge case)', async () => {
      // When budget amount is 0, it's treated as no budget (hasBudget = false)
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 1,
          amount: 0,
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

    it('shows category with budget even when no expenses for that category', async () => {
      // Budget exists for Transport but no expenses
      mockBudgetRepository.findByMonth.mockResolvedValue([
        {
          id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          tag_id: 13, // Transport - not in categoryBreakdown
          amount: 20000,
          start: 0,
          end: 0,
          tag: 'Transport',
          actual: 0,
        },
      ])
      // Food has expenses, Transport does not
      mockTransactionRepository.getMonthlyCategoryBreakdown.mockResolvedValue([
        { tag_id: 1, tag: 'Food', amount: 30000, type: 'expense' },
        { tag_id: 2, tag: 'Salary', amount: 100000, type: 'income' },
      ])

      renderWithRouter()

      await waitFor(() => {
        // Transport should be shown even without expenses because it has a budget
        expect(screen.getByText('Transport')).toBeInTheDocument()
        // Should show $0.00/$200.00 format
        expect(screen.getByText('$0.00/$200.00')).toBeInTheDocument()
      })
    })
  })
})
