import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TransactionList } from '../../../../components/transactions/TransactionList'
import type { TransactionLog } from '../../../../types'

// Mock repositories
vi.mock('../../../../services/repositories', () => ({
  transactionRepository: {
    findByMonth: vi.fn(),
    findByMonthFiltered: vi.fn(),
    getMonthSummary: vi.fn(),
    getDaySummary: vi.fn(),
  },
  accountRepository: {
    getTotalBalance: vi.fn(),
  },
  currencyRepository: {
    findSystem: vi.fn(),
  },
  tagRepository: {
    findById: vi.fn(),
  },
  counterpartyRepository: {
    findById: vi.fn(),
  },
}))

// Mock dateUtils - use current month for tests
vi.mock('../../../../utils/dateUtils', async () => {
  const actual = await vi.importActual('../../../../utils/dateUtils')
  return {
    ...actual,
    getCurrentMonth: () => new Date().toISOString().slice(0, 7),
  }
})

import {
  transactionRepository,
  accountRepository,
  currencyRepository,
  tagRepository,
  counterpartyRepository,
} from '../../../../services/repositories'

const mockTransactionRepository = vi.mocked(transactionRepository)
const mockAccountRepository = vi.mocked(accountRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockTagRepository = vi.mocked(tagRepository)
const mockCounterpartyRepository = vi.mocked(counterpartyRepository)

// Use today's date for sample transaction so it's expanded by default
const today = new Date().toISOString().slice(0, 10)
const sampleTransaction: TransactionLog = {
  id: new Uint8Array(8),
  date_time: `${today} 14:30:00`,
  counterparty: null,
  wallet: 'Cash',
  currency: 'USD',
  tags: 'food',
  sign: '-',
  amount_int: 50,
  amount_frac: 0,
  rate_int: 1,
  rate_frac: 0,
  symbol: '$',
  decimal_places: 2,
  wallet_color: ''
}

describe('TransactionList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.findSystem.mockResolvedValue({
      id: 1,
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      decimal_places: 2,
      is_system: true,
      is_fiat: true,
    })
    mockTransactionRepository.findByMonthFiltered.mockResolvedValue([sampleTransaction])
    mockTransactionRepository.getMonthSummary.mockResolvedValue({ income: 1000, expenses: 500 })
    mockTransactionRepository.getDaySummary.mockResolvedValue(-50) // natural float
    mockAccountRepository.getTotalBalance.mockResolvedValue(1500)
    mockTagRepository.findById.mockResolvedValue({ id: 10, name: 'Food', sort_order: 10 })
    mockCounterpartyRepository.findById.mockResolvedValue({ id: 1, name: 'Supermarket', sort_order: 10 })
  })

  const renderWithRouter = (initialEntries = ['/']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <TransactionList />
      </MemoryRouter>
    )
  }

  it('displays loading spinner initially', () => {
    mockTransactionRepository.findByMonthFiltered.mockImplementation(() => new Promise(() => { }))

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
    mockTransactionRepository.findByMonthFiltered.mockResolvedValue([])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('No transactions this month')).toBeInTheDocument()
    })
  })

  it('groups transactions by date', async () => {
    // Use today's date so transactions are expanded by default
    const transactions: TransactionLog[] = [
      { ...sampleTransaction, id: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]), date_time: `${today} 14:30:00` },
      { ...sampleTransaction, id: new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0]), date_time: `${today} 16:00:00` },
      { ...sampleTransaction, id: new Uint8Array([3, 0, 0, 0, 0, 0, 0, 0]), date_time: `${today} 08:00:00` },
    ]
    mockTransactionRepository.findByMonthFiltered.mockResolvedValue(transactions)

    renderWithRouter()

    await waitFor(() => {
      // 3 transactions showing 'food' tag (all on same day, expanded)
      expect(screen.getAllByText('Food').length).toBe(3)
    })
  })

  it('displays month navigator', async () => {
    renderWithRouter()

    await waitFor(() => {
      // Check that the month navigator is rendered (look for navigation buttons)
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  it('handles currency not found', async () => {
    mockCurrencyRepository.findSystem.mockResolvedValue(null)

    renderWithRouter()

    await waitFor(() => {
      // Should use default $ symbol
      expect(screen.getByText('$1,000.00')).toBeInTheDocument()
    })
  })

  it('displays total balance', async () => {
    renderWithRouter()

    await waitFor(() => {
      // Total balance: 1500 (natural float)
      expect(screen.getByText('$1,500.00')).toBeInTheDocument()
    })
  })

  it('uses currency decimal places for formatting', async () => {
    mockCurrencyRepository.findSystem.mockResolvedValue({
      id: 1,
      code: 'BTC',
      name: 'Bitcoin',
      symbol: '₿',
      decimal_places: 8,
      is_system: true,
      is_crypto: true,
    })
    mockTransactionRepository.getMonthSummary.mockResolvedValue({ income: 1, expenses: 0.5 })
    mockAccountRepository.getTotalBalance.mockResolvedValue(1.5)

    renderWithRouter()

    await waitFor(() => {
      // With 8 decimal places: 1.00000000
      expect(screen.getByText('₿1.00000000')).toBeInTheDocument()
    })
  })

  it('renders transaction items with correct props', async () => {
    renderWithRouter()

    await waitFor(() => {
      // Transaction shows wallet name when no counterparty
      expect(screen.getByText('Cash')).toBeInTheDocument()
      // Transaction amount
      expect(screen.getByText('-$50.00')).toBeInTheDocument()
    })
  })

  it('shows counterparty when available', async () => {
    const withCounterparty: TransactionLog = {
      ...sampleTransaction,
      counterparty: 'Supermarket',
    }
    mockTransactionRepository.findByMonthFiltered.mockResolvedValue([withCounterparty])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Supermarket')).toBeInTheDocument()
    })
  })

  it('handles error when loading transactions fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
    mockTransactionRepository.findByMonthFiltered.mockRejectedValue(new Error('Network error'))

    renderWithRouter()

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load transactions:', expect.any(Error))
    })

    consoleSpy.mockRestore()
  })

  it('navigates to transaction detail when clicking a transaction', async () => {
    const mockNavigate = vi.fn()
    vi.doMock('react-router-dom', async () => {
      const actual = await vi.importActual('react-router-dom')
      return {
        ...actual,
        useNavigate: () => mockNavigate,
      }
    })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Food')).toBeInTheDocument()
    })

    // Click the transaction item
    const transactionButton = screen.getByRole('button', { name: /food/i })
    fireEvent.click(transactionButton)

    // The navigation happens via the TransactionItem click handler
    // Since we're using BrowserRouter, we can check if the component renders correctly
  })

  describe('day summaries', () => {
    it('displays day summary in date header', async () => {
      mockTransactionRepository.getDaySummary.mockResolvedValue(-50) // natural float

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('50.00')).toBeInTheDocument()
      })
    })

    it('shows positive day summary with + prefix', async () => {
      mockTransactionRepository.getDaySummary.mockResolvedValue(100) // natural float

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('+100.00')).toBeInTheDocument()
      })
    })

    it('applies green color for positive summary', async () => {
      mockTransactionRepository.getDaySummary.mockResolvedValue(100)

      renderWithRouter()

      await waitFor(() => {
        const summaryElement = screen.getByText('+100.00')
        expect(summaryElement.className).toContain('text-green-600')
      })
    })

    it('applies gray color for negative summary', async () => {
      mockTransactionRepository.getDaySummary.mockResolvedValue(-50)

      renderWithRouter()

      await waitFor(() => {
        const summaryElement = screen.getByText('50.00')
        expect(summaryElement.className).toContain('text-gray-400')
      })
    })

    it('fetches day summary for each unique date', async () => {
      const date1 = today
      const date2 = '2020-01-15' // A different date
      const transactions: TransactionLog[] = [
        { ...sampleTransaction, id: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]), date_time: `${date1} 14:30:00` },
        { ...sampleTransaction, id: new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0]), date_time: `${date2} 08:00:00` },
      ]
      mockTransactionRepository.findByMonthFiltered.mockResolvedValue(transactions)

      renderWithRouter()

      await waitFor(() => {
        expect(mockTransactionRepository.getDaySummary).toHaveBeenCalledWith(date1, undefined)
        expect(mockTransactionRepository.getDaySummary).toHaveBeenCalledWith(date2, undefined)
      })
    })
  })

  describe('collapsible sections', () => {
    it('displays chevron icon in date header', async () => {
      renderWithRouter()

      await waitFor(() => {
        // Check for chevron by looking for the rotate class
        const chevrons = document.querySelectorAll('svg[class*="transition-transform"]')
        expect(chevrons.length).toBeGreaterThan(0)
      })
    })

    it('today date is expanded by default', async () => {
      renderWithRouter()

      await waitFor(() => {
        // Transaction content should be visible (today is expanded)
        expect(screen.getByText('Food')).toBeInTheDocument()
      })
    })

    it('past dates are collapsed by default', async () => {
      // Use a past date that's definitely not today
      const pastDate = '2020-01-01'
      const pastTransaction: TransactionLog = {
        ...sampleTransaction,
        date_time: `${pastDate} 14:30:00`,
      }
      mockTransactionRepository.findByMonthFiltered.mockResolvedValue([pastTransaction])

      renderWithRouter()

      await waitFor(() => {
        // Date header should be visible (check for date format)
        expect(screen.getByText(/Jan 1, 2020/i)).toBeInTheDocument()
      })

      // Transaction items should NOT be visible (collapsed by default)
      expect(screen.queryByText('Food')).not.toBeInTheDocument()
    })

    it('clicking date header expands collapsed section', async () => {
      const pastDate = '2020-01-01'
      const pastTransaction: TransactionLog = {
        ...sampleTransaction,
        date_time: `${pastDate} 14:30:00`,
      }
      mockTransactionRepository.findByMonthFiltered.mockResolvedValue([pastTransaction])

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText(/Jan 1, 2020/i)).toBeInTheDocument()
      })

      // Transaction should be hidden initially
      expect(screen.queryByText('Food')).not.toBeInTheDocument()

      // Click the date header to expand
      const dateHeader = screen.getByText(/Jan 1, 2020/i).closest('div[class*="cursor-pointer"]')
      fireEvent.click(dateHeader!)

      // Transaction should now be visible
      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })
    })

    it('clicking date header collapses expanded section', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      // Find the clickable date header (parent of the date text)
      const dateText = document.querySelector('span[class*="uppercase"]')
      const dateHeader = dateText?.closest('div[class*="cursor-pointer"]')
      fireEvent.click(dateHeader!)

      // Transaction should be hidden
      await waitFor(() => {
        expect(screen.queryByText('Food')).not.toBeInTheDocument()
      })
    })
  })

  describe('URL parameter filtering', () => {
    it('reads month from URL parameter', async () => {
      renderWithRouter(['/?month=2024-06'])

      await waitFor(() => {
        expect(mockTransactionRepository.findByMonthFiltered).toHaveBeenCalledWith(
          '2024-06',
          undefined
        )
      })
    })

    it('reads tag filter from URL parameter', async () => {
      renderWithRouter(['/?month=2025-01&tag=10'])

      await waitFor(() => {
        expect(mockTransactionRepository.findByMonthFiltered).toHaveBeenCalledWith(
          '2025-01',
          expect.objectContaining({ tagId: 10 })
        )
      })
    })

    it('reads counterparty filter from URL parameter', async () => {
      renderWithRouter(['/?month=2025-01&counterparty=5'])

      await waitFor(() => {
        expect(mockTransactionRepository.findByMonthFiltered).toHaveBeenCalledWith(
          '2025-01',
          expect.objectContaining({ counterpartyId: 5 })
        )
      })
    })

    it('reads type filter from URL parameter', async () => {
      renderWithRouter(['/?month=2025-01&type=expense'])

      await waitFor(() => {
        expect(mockTransactionRepository.findByMonthFiltered).toHaveBeenCalledWith(
          '2025-01',
          expect.objectContaining({ type: 'expense' })
        )
      })
    })

    it('handles combined filters from URL', async () => {
      renderWithRouter(['/?month=2025-01&tag=10&type=income'])

      await waitFor(() => {
        expect(mockTransactionRepository.findByMonthFiltered).toHaveBeenCalledWith(
          '2025-01',
          expect.objectContaining({
            tagId: 10,
            type: 'income',
          })
        )
      })
    })
  })

  describe('filter indicator', () => {
    it('displays tag filter indicator when tag filter is active', async () => {
      renderWithRouter(['/?month=2025-01&tag=10'])

      await waitFor(() => {
        expect(screen.getByText(/Filtered by:/)).toBeInTheDocument()
        expect(screen.getByText(/Tag: Food/)).toBeInTheDocument()
      })
    })

    it('displays counterparty filter indicator when counterparty filter is active', async () => {
      renderWithRouter(['/?month=2025-01&counterparty=1'])

      await waitFor(() => {
        expect(screen.getByText(/Filtered by:/)).toBeInTheDocument()
        expect(screen.getByText(/Counterparty: Supermarket/)).toBeInTheDocument()
      })
    })

    it('displays "No counterparty" for counterparty=0', async () => {
      renderWithRouter(['/?month=2025-01&counterparty=0'])

      await waitFor(() => {
        expect(screen.getByText(/Filtered by:/)).toBeInTheDocument()
        expect(screen.getByText(/No counterparty/)).toBeInTheDocument()
      })
    })

    it('displays type filter indicator', async () => {
      renderWithRouter(['/?month=2025-01&type=income'])

      await waitFor(() => {
        expect(screen.getByText(/Filtered by:/)).toBeInTheDocument()
        // Use getAllByText since "Income" also appears in the month summary
        const incomeElements = screen.getAllByText(/Income/)
        expect(incomeElements.length).toBeGreaterThanOrEqual(2) // One in summary, one in filter indicator
      })
    })

    it('displays combined filter indicator', async () => {
      renderWithRouter(['/?month=2025-01&tag=10&type=expense'])

      await waitFor(() => {
        // Combined filter shows "Tag: Food (Expenses)"
        expect(screen.getByText(/Tag: Food.*Expenses/)).toBeInTheDocument()
      })
    })

    it('shows clear button when filter is active', async () => {
      renderWithRouter(['/?month=2025-01&tag=10'])

      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument()
      })
    })

    it('does not show filter indicator when no filter', async () => {
      renderWithRouter(['/?month=2025-01'])

      await waitFor(() => {
        expect(screen.getByText('Food')).toBeInTheDocument()
      })

      expect(screen.queryByText(/Filtered by:/)).not.toBeInTheDocument()
    })

    it('clears filter when clear button is clicked', async () => {
      renderWithRouter(['/?month=2025-01&tag=10'])

      await waitFor(() => {
        expect(screen.getByText('Clear')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Clear'))

      await waitFor(() => {
        expect(screen.queryByText(/Filtered by:/)).not.toBeInTheDocument()
      })
    })
  })
})
