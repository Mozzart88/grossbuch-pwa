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
    create: vi.fn(),
  },
  accountRepository: {
    findAll: vi.fn(),
  },
  categoryRepository: {
    findAll: vi.fn(),
  },
  counterpartyRepository: {
    findAll: vi.fn(),
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
}))

import { transactionRepository, accountRepository, categoryRepository, counterpartyRepository } from '../../../services/repositories'

const mockTransactionRepository = vi.mocked(transactionRepository)
const mockAccountRepository = vi.mocked(accountRepository)
const mockCategoryRepository = vi.mocked(categoryRepository)
const mockCounterpartyRepository = vi.mocked(counterpartyRepository)

describe('AddTransactionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransactionRepository.create.mockResolvedValue(1)
    mockAccountRepository.findAll.mockResolvedValue([
      {
        id: 1,
        name: 'Cash',
        currency_id: 1,
        initial_balance: 100,
        icon: '💵',
        color: '#4CAF50',
        is_active: 1,
        sort_order: 0,
        created_at: '2025-01-01 00:00:00',
        updated_at: '2025-01-01 00:00:00',
        currency_symbol: '$',
        currency_code: 'USD',
        currency_decimal_places: 2,
        current_balance: 150,
      },
    ])
    mockCategoryRepository.findAll.mockResolvedValue([
      {
        id: 1,
        name: 'Food',
        type: 'expense',
        icon: '🍔',
        color: '#FF5722',
        parent_id: null,
        is_preset: 1,
        sort_order: 0,
        created_at: '2025-01-01 00:00:00',
        updated_at: '2025-01-01 00:00:00',
      },
    ])
    mockCounterpartyRepository.findAll.mockResolvedValue([])
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
    const { container } = renderPage()

    await waitFor(() => {
      expect(screen.getByText('Account')).toBeInTheDocument()
    })

    // Fill form
    const amountInput = container.querySelector('input.text-2xl') as HTMLInputElement
    fireEvent.change(amountInput, { target: { value: '50' } })

    const categorySelect = screen.getByRole('combobox', { name: /category/i })
    fireEvent.change(categorySelect, { target: { value: '1' } })

    const submitButton = screen.getByRole('button', { name: 'Add' })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Transaction added', 'success')
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
