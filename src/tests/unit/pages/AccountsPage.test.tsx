import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AccountsPage } from '../../../pages/AccountsPage'
import type { Account, Currency } from '../../../types'

// Mock dependencies
vi.mock('../../../services/repositories', () => ({
  accountRepository: {
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  currencyRepository: {
    findAll: vi.fn(),
  },
}))

vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: vi.fn() }),
  }
})

import { accountRepository, currencyRepository } from '../../../services/repositories'

const mockAccountRepository = vi.mocked(accountRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)

const mockAccounts: Account[] = [
  {
    id: 1,
    name: 'Cash',
    currency_id: 1,
    initial_balance: 1000,
    icon: null,
    color: null,
    is_active: 1,
    sort_order: 0,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
    currency_code: 'USD',
    currency_symbol: '$',
    current_balance: 1500,
  },
]

const mockCurrencies: Currency[] = [
  {
    id: 1,
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimal_places: 2,
    is_preset: 1,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  },
]

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccountRepository.findAll.mockResolvedValue(mockAccounts)
    mockCurrencyRepository.findAll.mockResolvedValue(mockCurrencies)
  })

  const renderWithRouter = () => {
    return render(
      <BrowserRouter>
        <AccountsPage />
      </BrowserRouter>
    )
  }

  it('displays loading spinner initially', () => {
    // Delay resolution to see loading state
    mockAccountRepository.findAll.mockImplementation(
      () => new Promise(() => {})
    )

    const { container } = renderWithRouter()

    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('displays accounts after loading', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument()
    })

    expect(screen.getByText('USD')).toBeInTheDocument()
    expect(screen.getByText('$1,500.00')).toBeInTheDocument()
  })

  it('displays page title', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Accounts')).toBeInTheDocument()
    })
  })

  it('displays Add button', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })
  })

  it('displays empty state when no accounts', async () => {
    mockAccountRepository.findAll.mockResolvedValue([])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('No accounts yet')).toBeInTheDocument()
    })
  })

  it('opens modal when Add button is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Account')).toBeInTheDocument()
    })
  })

  it('opens edit modal when Edit is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Edit'))

    await waitFor(() => {
      expect(screen.getByText('Edit Account')).toBeInTheDocument()
    })
  })

  it('displays account balance with correct color for positive', async () => {
    renderWithRouter()

    await waitFor(() => {
      const balance = screen.getByText('$1,500.00')
      expect(balance.className).toContain('text-green-600')
    })
  })

  it('displays account balance with correct color for negative', async () => {
    mockAccountRepository.findAll.mockResolvedValue([
      { ...mockAccounts[0], current_balance: -500 },
    ])

    renderWithRouter()

    await waitFor(() => {
      const balance = screen.getByText('-$500.00')
      expect(balance.className).toContain('text-red-600')
    })
  })

  it('calls findAll on mount', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(mockAccountRepository.findAll).toHaveBeenCalled()
      expect(mockCurrencyRepository.findAll).toHaveBeenCalled()
    })
  })
})
