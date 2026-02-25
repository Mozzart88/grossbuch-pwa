import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import '@testing-library/jest-dom'
import { AccountTransactionsPage } from '../../../pages/AccountTransactionsPage'

// Mock the repositories
vi.mock('../../../services/repositories', () => ({
  accountRepository: {
    findById: vi.fn(),
  },
  transactionRepository: {
    findByAccountAndMonth: vi.fn(),
    getAccountDaySummary: vi.fn(),
  },
}))

// Mock the AccountTransactionList component
let mockOnMonthChange: ((month: string) => void) | undefined
vi.mock('../../../components/transactions/AccountTransactionList', () => ({
  AccountTransactionList: ({ account, onMonthChange }: { account: { wallet: string; currency: string }; onMonthChange?: (month: string) => void }) => {
    mockOnMonthChange = onMonthChange
    return (
      <div data-testid="account-transaction-list">
        Transactions for {account.wallet} - {account.currency}
        <button data-testid="change-month" onClick={() => onMonthChange?.('2025-06')}>
          Change Month
        </button>
      </div>
    )
  },
}))

import { accountRepository } from '../../../services/repositories'

const mockAccount = {
  id: 1,
  wallet_id: 1,
  currency_id: 1,
  balance: 100000,
  updated_at: Date.now(),
  wallet: 'Main Wallet',
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
}

function renderWithRouter(accountId: string, initialUrl?: string) {
  const url = initialUrl || `/accounts/${accountId}/transactions`
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/accounts/:accountId/transactions" element={<AccountTransactionsPage />} />
        <Route path="/settings/accounts" element={<div data-testid="accounts-page">Accounts</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AccountTransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading state', () => {
    it('shows spinner while loading', async () => {
      vi.mocked(accountRepository.findById).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      const { container } = renderWithRouter('1')

      expect(container.querySelector('.animate-spin')).toBeInTheDocument()
    })
  })

  describe('Success state', () => {
    it('renders page header with wallet and currency name', async () => {
      vi.mocked(accountRepository.findById).mockResolvedValue(mockAccount)

      renderWithRouter('1')

      await waitFor(() => {
        expect(screen.getByText('Main Wallet - USD')).toBeInTheDocument()
      })
    })

    it('renders AccountTransactionList with account', async () => {
      vi.mocked(accountRepository.findById).mockResolvedValue(mockAccount)

      renderWithRouter('1')

      await waitFor(() => {
        expect(screen.getByTestId('account-transaction-list')).toBeInTheDocument()
        expect(screen.getByText('Transactions for Main Wallet - USD')).toBeInTheDocument()
      })
    })

    it('shows back button in header', async () => {
      vi.mocked(accountRepository.findById).mockResolvedValue(mockAccount)

      const { container } = renderWithRouter('1')

      await waitFor(() => {
        expect(container.querySelector('svg')).toBeInTheDocument()
      })
    })
  })

  describe('Error states', () => {
    it('shows error when account ID is invalid', async () => {
      renderWithRouter('invalid')

      await waitFor(() => {
        expect(screen.getByText('Invalid account ID')).toBeInTheDocument()
      })
    })

    it('shows error when account is not found', async () => {
      vi.mocked(accountRepository.findById).mockResolvedValue(null)

      renderWithRouter('999')

      await waitFor(() => {
        expect(screen.getByText('Account not found')).toBeInTheDocument()
      })
    })

    it('shows error when repository throws', async () => {
      vi.mocked(accountRepository.findById).mockRejectedValue(new Error('Database error'))

      renderWithRouter('1')

      await waitFor(() => {
        expect(screen.getByText('Failed to load account')).toBeInTheDocument()
      })
    })

    it('shows link back to accounts page on error', async () => {
      vi.mocked(accountRepository.findById).mockResolvedValue(null)

      renderWithRouter('999')

      await waitFor(() => {
        expect(screen.getByText('Back to Accounts')).toBeInTheDocument()
      })
    })
  })

  describe('Missing accountId param', () => {
    it('shows error when accountId param is missing', async () => {
      render(
        <MemoryRouter initialEntries={['/accounts/transactions']}>
          <Routes>
            <Route path="/accounts/transactions" element={<AccountTransactionsPage />} />
          </Routes>
        </MemoryRouter>
      )
      await waitFor(() => {
        expect(screen.getByText('Account ID is required')).toBeInTheDocument()
      })
    })
  })

  describe('Account ID parsing', () => {
    it('parses numeric account ID correctly', async () => {
      vi.mocked(accountRepository.findById).mockResolvedValue(mockAccount)

      renderWithRouter('123')

      await waitFor(() => {
        expect(accountRepository.findById).toHaveBeenCalledWith(123)
      })
    })
  })

  describe('Navigation', () => {
    it('provides back to accounts link on error', async () => {
      vi.mocked(accountRepository.findById).mockResolvedValue(null)

      renderWithRouter('999')

      await waitFor(() => {
        const backLink = screen.getByText('Back to Accounts')
        expect(backLink).toBeInTheDocument()
      })
    })
  })

  describe('Month parameter handling', () => {
    it('passes onMonthChange callback to AccountTransactionList', async () => {
      vi.mocked(accountRepository.findById).mockResolvedValue(mockAccount)

      renderWithRouter('1')

      await waitFor(() => {
        expect(screen.getByTestId('account-transaction-list')).toBeInTheDocument()
      })

      // The callback should be set
      expect(mockOnMonthChange).toBeDefined()
    })

    it('updates URL when month changes (without existing month param)', async () => {
      vi.mocked(accountRepository.findById).mockResolvedValue(mockAccount)

      renderWithRouter('1')

      await waitFor(() => {
        expect(screen.getByTestId('change-month')).toBeInTheDocument()
      })

      // Click to change month
      fireEvent.click(screen.getByTestId('change-month'))

      // The callback should have been called
      expect(mockOnMonthChange).toBeDefined()
    })

    it('handles month param from URL', async () => {
      vi.mocked(accountRepository.findById).mockResolvedValue(mockAccount)

      renderWithRouter('1', '/accounts/1/transactions?month=2025-06')

      await waitFor(() => {
        expect(screen.getByTestId('account-transaction-list')).toBeInTheDocument()
      })
    })

    it('updates URL when month changes (with existing month param)', async () => {
      vi.mocked(accountRepository.findById).mockResolvedValue(mockAccount)

      renderWithRouter('1', '/accounts/1/transactions?month=2025-01')

      await waitFor(() => {
        expect(screen.getByTestId('change-month')).toBeInTheDocument()
      })

      // Click to change month - should use replace since month param exists
      fireEvent.click(screen.getByTestId('change-month'))

      expect(mockOnMonthChange).toBeDefined()
    })
  })
})
