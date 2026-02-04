import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { AccountTransactionList } from '../../../../components/transactions/AccountTransactionList'
import type { Account, TransactionLog } from '../../../../types'

// Mock the navigation
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock the repositories
vi.mock('../../../../services/repositories', () => ({
  transactionRepository: {
    findByAccountAndMonth: vi.fn(),
    getAccountDaySummary: vi.fn(),
    getAccountTransactionsAfterMonth: vi.fn(),
  },
}))

import { transactionRepository } from '../../../../services/repositories'

const mockAccount: Account = {
  id: 1,
  wallet_id: 1,
  currency_id: 1,
  balance: 150000, // $1,500.00
  updated_at: Date.now(),
  wallet: 'Main Wallet',
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
}

const createMockTransaction = (overrides: Partial<TransactionLog> = {}): TransactionLog => ({
  id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
  date_time: '2026-02-04 10:30:00',
  counterparty: 'Test Counterparty',
  wallet: 'Main Wallet',
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
  tags: 'expense',
  amount: -5000, // -$50.00
  rate: 100,
  ...overrides,
})

function renderComponent(account: Account = mockAccount) {
  return render(
    <MemoryRouter>
      <AccountTransactionList account={account} />
    </MemoryRouter>
  )
}

describe('AccountTransactionList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue([])
    vi.mocked(transactionRepository.getAccountDaySummary).mockResolvedValue(0)
    vi.mocked(transactionRepository.getAccountTransactionsAfterMonth).mockResolvedValue(0)
  })

  describe('Loading state', () => {
    it('shows spinner while loading', async () => {
      vi.mocked(transactionRepository.findByAccountAndMonth).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      const { container } = renderComponent()

      expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    })
  })

  describe('Empty state', () => {
    it('shows empty message when no transactions', async () => {
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue([])

      renderComponent()

      await waitFor(() => {
        expect(screen.getByText('No transactions this month')).toBeInTheDocument()
      })
    })
  })

  describe('Account balance header', () => {
    it('shows start and end of month labels', async () => {
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue([])

      renderComponent()

      await waitFor(() => {
        expect(screen.getByText('Start of month:')).toBeInTheDocument()
        expect(screen.getByText('Current:')).toBeInTheDocument() // Current month shows "Current:" instead of "End of month:"
      })
    })

    it('shows "End of month:" label for previous months', async () => {
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue([])

      // Render with a previous month by using initialMonth prop
      render(
        <MemoryRouter>
          <AccountTransactionList account={mockAccount} initialMonth="2025-01" />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('End of month:')).toBeInTheDocument()
      })
    })

    it('shows positive end balance in green', async () => {
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue([])

      renderComponent({ ...mockAccount, balance: 100000 })

      await waitFor(() => {
        // End balance is shown with green color for positive values
        const balanceElements = screen.getAllByText('$1,000.00')
        const endBalanceElement = balanceElements.find(el => el.classList.contains('text-green-600'))
        expect(endBalanceElement).toBeInTheDocument()
      })
    })

    it('shows negative end balance in red', async () => {
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue([])

      renderComponent({ ...mockAccount, balance: -50000 })

      await waitFor(() => {
        // End balance is shown with red color for negative values
        const balanceElements = screen.getAllByText('$500.00')
        const endBalanceElement = balanceElements.find(el => el.classList.contains('text-red-600'))
        expect(endBalanceElement).toBeInTheDocument()
      })
    })
  })

  describe('Month navigation', () => {
    it('renders month navigator', async () => {
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue([])

      const { container } = renderComponent()

      await waitFor(() => {
        // Month navigator has navigation buttons
        const buttons = container.querySelectorAll('button')
        expect(buttons.length).toBeGreaterThan(0)
      })
    })

    it('loads data for the selected month', async () => {
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue([])

      renderComponent()

      await waitFor(() => {
        expect(transactionRepository.findByAccountAndMonth).toHaveBeenCalledWith(
          1,
          expect.stringMatching(/^\d{4}-\d{2}$/)
        )
      })
    })

    it('changes month when navigator is clicked', async () => {
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue([])

      const { container } = renderComponent()

      await waitFor(() => {
        expect(transactionRepository.findByAccountAndMonth).toHaveBeenCalled()
      })

      // Clear mocks to check for reload
      vi.mocked(transactionRepository.findByAccountAndMonth).mockClear()

      // Click the left arrow to go to previous month
      const prevButton = container.querySelector('button')
      expect(prevButton).toBeInTheDocument()
      fireEvent.click(prevButton!)

      await waitFor(() => {
        // Should reload data for the new month
        expect(transactionRepository.findByAccountAndMonth).toHaveBeenCalled()
      })
    })
  })

  describe('Transaction display', () => {
    it('groups transactions by date', async () => {
      const transactions = [
        createMockTransaction({ date_time: '2026-02-04 10:30:00' }),
        createMockTransaction({
          id: new Uint8Array([2, 2, 3, 4, 5, 6, 7, 8]),
          date_time: '2026-02-04 14:00:00'
        }),
        createMockTransaction({
          id: new Uint8Array([3, 2, 3, 4, 5, 6, 7, 8]),
          date_time: '2026-02-03 09:00:00'
        }),
      ]
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue(transactions)
      vi.mocked(transactionRepository.getAccountDaySummary).mockResolvedValue(-5000)

      renderComponent()

      await waitFor(() => {
        // Should show date headers (short format like "Feb 4, 2026")
        expect(screen.getByText(/Feb 4/i)).toBeInTheDocument()
        expect(screen.getByText(/Feb 3/i)).toBeInTheDocument()
      })
    })

    it('shows day summary with net change and currency symbol', async () => {
      const transactions = [createMockTransaction()]
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue(transactions)
      vi.mocked(transactionRepository.getAccountDaySummary).mockResolvedValue(-5000)

      renderComponent()

      await waitFor(() => {
        // Day summary shows the net change with currency symbol
        expect(screen.getByText('-$50.00')).toBeInTheDocument()
      })
    })

    it('shows running balance for each day', async () => {
      const transactions = [createMockTransaction()]
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue(transactions)
      vi.mocked(transactionRepository.getAccountDaySummary).mockResolvedValue(-5000)

      renderComponent()

      await waitFor(() => {
        // Running balance shown (account balance is $1,500) - appears in header and day row
        const balanceElements = screen.getAllByText('$1,500.00')
        expect(balanceElements.length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('Date expansion', () => {
    it('expands today by default', async () => {
      // Create a transaction for today
      const today = new Date().toISOString().slice(0, 10)
      const transactions = [createMockTransaction({ date_time: `${today} 10:30:00` })]
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue(transactions)
      vi.mocked(transactionRepository.getAccountDaySummary).mockResolvedValue(-5000)

      renderComponent()

      await waitFor(() => {
        // Transaction item should be visible (today is expanded by default)
        expect(screen.getByText('Test Counterparty')).toBeInTheDocument()
      })
    })

    it('collapses expanded date on click', async () => {
      const today = new Date().toISOString().slice(0, 10)
      const transactions = [createMockTransaction({ date_time: `${today} 10:30:00` })]
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue(transactions)
      vi.mocked(transactionRepository.getAccountDaySummary).mockResolvedValue(-5000)

      const { container } = renderComponent()

      await waitFor(() => {
        expect(screen.getByText('Test Counterparty')).toBeInTheDocument()
      })

      // Find and click the date header row (the sticky div with cursor-pointer)
      const dateHeader = container.querySelector('.sticky.cursor-pointer')
      expect(dateHeader).toBeInTheDocument()
      fireEvent.click(dateHeader!)

      // Transaction should be hidden now (collapsed)
      await waitFor(() => {
        expect(screen.queryByText('Test Counterparty')).not.toBeInTheDocument()
      })
    })

    it('expands collapsed date on click', async () => {
      // Use a date that isn't today so it's not auto-expanded
      const transactions = [createMockTransaction({ date_time: '2026-01-15 10:30:00' })]
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue(transactions)
      vi.mocked(transactionRepository.getAccountDaySummary).mockResolvedValue(-5000)

      const { container } = renderComponent()

      // Wait for data to load, but the transaction should not be visible initially
      // (date is not today so it's collapsed by default)
      await waitFor(() => {
        expect(screen.getByText(/Jan 15/i)).toBeInTheDocument()
      })

      // Transaction should be hidden initially (collapsed)
      expect(screen.queryByText('Test Counterparty')).not.toBeInTheDocument()

      // Click to expand
      const dateHeader = container.querySelector('.sticky.cursor-pointer')
      fireEvent.click(dateHeader!)

      // Transaction should be visible now (expanded)
      await waitFor(() => {
        expect(screen.getByText('Test Counterparty')).toBeInTheDocument()
      })
    })
  })

  describe('Transaction click', () => {
    it('navigates to transaction detail on click', async () => {
      const today = new Date().toISOString().slice(0, 10)
      const transactions = [createMockTransaction({ date_time: `${today} 10:30:00` })]
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue(transactions)
      vi.mocked(transactionRepository.getAccountDaySummary).mockResolvedValue(-5000)

      renderComponent()

      await waitFor(() => {
        expect(screen.getByText('Test Counterparty')).toBeInTheDocument()
      })

      // Click on the transaction
      fireEvent.click(screen.getByText('Test Counterparty'))

      expect(mockNavigate).toHaveBeenCalledWith('/transaction/0102030405060708')
    })
  })

  describe('Month sync with initialMonth prop', () => {
    it('updates month when initialMonth prop changes', async () => {
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue([])

      const { rerender } = render(
        <MemoryRouter>
          <AccountTransactionList account={mockAccount} initialMonth="2026-01" />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(transactionRepository.findByAccountAndMonth).toHaveBeenCalledWith(1, '2026-01')
      })

      // Change initialMonth prop (simulates browser back/forward)
      vi.mocked(transactionRepository.findByAccountAndMonth).mockClear()

      rerender(
        <MemoryRouter>
          <AccountTransactionList account={mockAccount} initialMonth="2025-12" />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(transactionRepository.findByAccountAndMonth).toHaveBeenCalledWith(1, '2025-12')
      })
    })
  })

  describe('Data loading', () => {
    it('reloads data when account changes', async () => {
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue([])

      const { rerender } = renderComponent()

      await waitFor(() => {
        expect(transactionRepository.findByAccountAndMonth).toHaveBeenCalledWith(1, expect.any(String))
      })

      // Rerender with different account
      rerender(
        <MemoryRouter>
          <AccountTransactionList account={{ ...mockAccount, id: 2 }} />
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(transactionRepository.findByAccountAndMonth).toHaveBeenCalledWith(2, expect.any(String))
      })
    })

    it('handles error gracefully during load', async () => {
      vi.mocked(transactionRepository.findByAccountAndMonth).mockRejectedValue(new Error('Load failed'))

      // Console error should be logged
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      renderComponent()

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load account transactions:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Running balance calculation', () => {
    it('shows running balance for day', async () => {
      const today = new Date().toISOString().slice(0, 10)
      const transactions = [createMockTransaction({ date_time: `${today} 10:30:00` })]
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue(transactions)
      vi.mocked(transactionRepository.getAccountDaySummary).mockResolvedValue(-5000)

      renderComponent()

      await waitFor(() => {
        // Balance is shown in both header (end balance) and day row (running balance)
        const balanceElements = screen.getAllByText('$1,500.00')
        expect(balanceElements.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('handles zero day summaries', async () => {
      const today = new Date().toISOString().slice(0, 10)
      const transactions = [createMockTransaction({ date_time: `${today} 10:30:00` })]
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue(transactions)
      vi.mocked(transactionRepository.getAccountDaySummary).mockResolvedValue(0)

      renderComponent()

      await waitFor(() => {
        // Should show $0.00 for day summary (with neutral gray color)
        expect(screen.getByText('$0.00')).toBeInTheDocument()
      })
    })
  })

  describe('Account with different currencies', () => {
    it('uses account symbol and decimal places', async () => {
      const euroAccount: Account = {
        ...mockAccount,
        symbol: '€',
        decimal_places: 2,
        balance: 100050, // €1,000.50
      }
      vi.mocked(transactionRepository.findByAccountAndMonth).mockResolvedValue([])

      render(
        <MemoryRouter>
          <AccountTransactionList account={euroAccount} />
        </MemoryRouter>
      )

      await waitFor(() => {
        // With start → end format, the balance appears twice (start and end are same when no transactions)
        const balanceElements = screen.getAllByText('€1,000.50')
        expect(balanceElements.length).toBeGreaterThanOrEqual(1)
      })
    })
  })
})
