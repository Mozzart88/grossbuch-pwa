import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AddTransactionPage } from '../../../pages/AddTransactionPage'

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
  },
  tagRepository: {
    findExpenseTags: vi.fn(),
    findIncomeTags: vi.fn(),
  },
  counterpartyRepository: {
    findAll: vi.fn(),
  },
  currencyRepository: {
    findAll: vi.fn(),
    findDefault: vi.fn(),
    setExchangeRate: vi.fn(),
    getExchangeRate: vi.fn(),
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

import { transactionRepository, walletRepository, tagRepository, counterpartyRepository, currencyRepository } from '../../../services/repositories'

const mockTransactionRepository = vi.mocked(transactionRepository)
const mockWalletRepository = vi.mocked(walletRepository)
const mockTagRepository = vi.mocked(tagRepository)
const mockCounterpartyRepository = vi.mocked(counterpartyRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)

describe('AddTransactionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransactionRepository.create.mockResolvedValue({} as any)
    mockTransactionRepository.update.mockResolvedValue({} as any)
    mockWalletRepository.findActive.mockResolvedValue([
      {
        id: 1,
        name: 'Cash',
        icon: '💵',
        color: '#4CAF50',
        is_default: true,
        created_at: 1704067200,
        updated_at: 1704067200,
        accounts: [
          {
            id: 1,
            wallet_id: 1,
            currency_id: 1,
            wallet: 'Cash',
            currency: 'USD',
            real_balance: 15000,
            actual_balance: 15000,
            tags: undefined,
            created_at: 1704067200,
            updated_at: 1704067200,
            is_default: true,
          },
        ],
      },
    ])
    mockTagRepository.findExpenseTags.mockResolvedValue([
      {
        id: 12,
        name: 'food',
        created_at: 1704067200,
        updated_at: 1704067200,
      },
    ])
    mockTagRepository.findIncomeTags.mockResolvedValue([
      {
        id: 11,
        name: 'sale',
        created_at: 1704067200,
        updated_at: 1704067200,
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
        created_at: 1704067200,
        updated_at: 1704067200,
        is_default: true,
        is_fiat: true,
      },
    ])
    mockCurrencyRepository.findDefault.mockResolvedValue({
      id: 1,
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      decimal_places: 2,
      is_default: true,
      is_fiat: true,
    })
    mockCurrencyRepository.getExchangeRate.mockResolvedValue({ rate: 100, currency_id: 1, updated_at: Date.now() })
  })

  const renderPage = () => {
    return render(
      <MemoryRouter>
        <AddTransactionPage />
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

    const categorySelect = screen.getByRole('combobox', { name: /category/i })
    fireEvent.change(categorySelect, { target: { value: '12' } }) // food tag

    const submitButton = screen.getByRole('button', { name: 'Add' })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({
              account_id: 1,
              tag_id: 12,
              sign: '-',
              amount: 5000,
            }),
          ],
        })
      )
    })

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('navigates to home on cancel', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Account')).toBeInTheDocument()
    })

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelButton)

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})
