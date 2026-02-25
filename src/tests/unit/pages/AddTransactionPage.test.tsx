import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AddTransactionPage } from '../../../pages/AddTransactionPage'
import { LayoutProvider } from '../../../store/LayoutContext'
import { ActionBar } from '../../../components/layout/ActionBar'

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock repositories
vi.mock('../../../services/repositories', () => ({
  transactionRepository: {
    createExpense: vi.fn(),
    createIncome: vi.fn(),
    createTransfer: vi.fn(),
    createExchange: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  walletRepository: {
    findActive: vi.fn(),
    findOrCreateAccountForCurrency: vi.fn(),
  },
  tagRepository: {
    findExpenseTags: vi.fn(),
    findIncomeTags: vi.fn(),
    findCommonTags: vi.fn(),
  },
  counterpartyRepository: {
    findAll: vi.fn(),
  },
  currencyRepository: {
    findAll: vi.fn(),
    findSystem: vi.fn(),
    setExchangeRate: vi.fn(),
    getExchangeRate: vi.fn(),
    getRateForCurrency: vi.fn(),
    findUsedInAccounts: vi.fn(),
  },
  settingsRepository: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(),
  },
}))

// Mock toast
const mockShowToast = vi.fn()
vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: mockShowToast }),
  }
})

// Mock dateUtils
vi.mock('../../../utils/dateUtils', () => ({
  toDateTimeLocal: vi.fn(() => '2025-01-10T12:00'),
  fromDateTimeLocal: vi.fn((val: string) => val.replace('T', ' ') + ':00'),
  getCurrentDateTime: vi.fn(() => '2025-01-10 12:00:00'),
}))

import { transactionRepository, walletRepository, tagRepository, counterpartyRepository, currencyRepository, settingsRepository } from '../../../services/repositories'

const mockTransactionRepository = vi.mocked(transactionRepository)
const mockWalletRepository = vi.mocked(walletRepository)
const mockTagRepository = vi.mocked(tagRepository)
const mockCounterpartyRepository = vi.mocked(counterpartyRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockSettingsRepository = vi.mocked(settingsRepository)

describe('AddTransactionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransactionRepository.create.mockResolvedValue({} as any)
    mockTransactionRepository.update.mockResolvedValue({} as any)
    mockWalletRepository.findActive.mockResolvedValue([
      {
        id: 1,
        name: 'Cash',
        color: '#4CAF50',
        is_default: true,
        accounts: [
          {
            id: 1,
            wallet_id: 1,
            currency_id: 1,
            wallet: 'Cash',
            currency: 'USD',
            tags: undefined,
            updated_at: 1704067200,
            is_default: true,
            balance_int: 0,
            balance_frac: 0
          },
        ],
      },
    ])
    mockTagRepository.findExpenseTags.mockResolvedValue([
      {
        id: 12,
        name: 'food',
        sort_order: 10
      },
    ])
    mockTagRepository.findCommonTags.mockResolvedValue([])
    mockTagRepository.findIncomeTags.mockResolvedValue([
      {
        id: 11,
        name: 'sale',
        sort_order: 11
      },
    ])
    mockCounterpartyRepository.findAll.mockResolvedValue([])
    mockCurrencyRepository.findAll.mockResolvedValue([
      {
        id: 1,
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        decimal_places: 2,
        is_system: true,
        is_fiat: true,
      },
    ])
    mockCurrencyRepository.findSystem.mockResolvedValue({
      id: 1,
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      decimal_places: 2,
      is_system: true,
      is_fiat: true,
    })
    mockCurrencyRepository.getExchangeRate.mockResolvedValue({ rate_int: 1, rate_frac: 0, currency_id: 1, updated_at: Date.now() })
    mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 1, frac: 0 })
    mockCurrencyRepository.findUsedInAccounts.mockResolvedValue([
      {
        id: 1,
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        decimal_places: 2,
        is_system: true,
        is_fiat: true,
      },
    ])
    mockSettingsRepository.get.mockResolvedValue(null)
  })

  const renderPage = () => {
    return render(
      <MemoryRouter>
        <LayoutProvider>
          <AddTransactionPage />
          <ActionBar />
        </LayoutProvider>
      </MemoryRouter>
    )
  }

  it('renders page header with title', async () => {
    renderPage()

    expect(screen.getByText('Add Transaction')).toBeInTheDocument()
  })

  it('renders transaction form', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Account')).toBeInTheDocument()
    })
  })

  it('shows back button in header', async () => {
    const { container } = renderPage()

    // Back button should be present
    const backButton = container.querySelector('button')
    expect(backButton).toBeInTheDocument()
  })

  it('submits transaction and navigates to home', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Account')).toBeInTheDocument()
    })

    // Fill form
    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '50' } })

    // Select category using LiveSearch
    const categoryInput = screen.getByPlaceholderText('Select category')
    fireEvent.focus(categoryInput)
    fireEvent.change(categoryInput, { target: { value: 'food' } })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'food' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('option', { name: 'food' }))

    // Submit button is now in ActionBar with label "Submit"
    const submitButton = screen.getByRole('button', { name: 'Submit' })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({
              account_id: 1,
              tag_id: 12,
              sign: '-',
              amount_int: 50,
              amount_frac: 0,
            }),
          ],
        })
      )
    })

    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('navigates back on cancel', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Account')).toBeInTheDocument()
    })

    // Cancel button is now in ActionBar
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelButton)

    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('handles type=exchange query parameter', async () => {
    render(
      <MemoryRouter initialEntries={['/add?type=exchange']}>
        <LayoutProvider>
          <AddTransactionPage />
          <ActionBar />
        </LayoutProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Account')).toBeInTheDocument()
    })

    // Exchange button should be active
    const exchangeButton = screen.getByRole('button', { name: 'Exchange' })
    expect(exchangeButton.className).toContain('bg-white')
  })
})
