import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { EditTransactionPage } from '../../../pages/EditTransactionPage'
import type { Transaction } from '../../../types'

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
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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

// Mock confirm
vi.spyOn(window, 'confirm').mockImplementation(() => true)

import { transactionRepository, accountRepository, categoryRepository, counterpartyRepository } from '../../../services/repositories'

const mockTransactionRepository = vi.mocked(transactionRepository)
const mockAccountRepository = vi.mocked(accountRepository)
const mockCategoryRepository = vi.mocked(categoryRepository)
const mockCounterpartyRepository = vi.mocked(counterpartyRepository)

const mockTransaction: Transaction = {
  id: 1,
  type: 'expense',
  amount: 50,
  currency_id: 1,
  account_id: 1,
  category_id: 1,
  counterparty_id: null,
  to_account_id: null,
  to_amount: null,
  to_currency_id: null,
  exchange_rate: null,
  date_time: '2025-01-09 14:30:00',
  notes: 'Test note',
  created_at: '2025-01-09 14:30:00',
  updated_at: '2025-01-09 14:30:00',
}

describe('EditTransactionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransactionRepository.findById.mockResolvedValue(mockTransaction)
    mockTransactionRepository.update.mockResolvedValue(undefined)
    mockTransactionRepository.delete.mockResolvedValue(undefined)
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

  const renderPage = (id = '1') => {
    return render(
      <MemoryRouter initialEntries={[`/edit/${id}`]}>
        <Routes>
          <Route path="/edit/:id" element={<EditTransactionPage />} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('renders page header with title', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Edit Transaction')).toBeInTheDocument()
    })
  })

  it('loads transaction data', async () => {
    renderPage()

    await waitFor(() => {
      expect(mockTransactionRepository.findById).toHaveBeenCalledWith(1)
    })
  })

  it('shows loading spinner while loading', async () => {
    mockTransactionRepository.findById.mockImplementation(() => new Promise(() => {}))

    const { container } = renderPage()

    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('shows not found message when transaction not found', async () => {
    mockTransactionRepository.findById.mockResolvedValue(null)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Transaction not found')).toBeInTheDocument()
    })
  })

  it('shows Go Back button when transaction not found', async () => {
    mockTransactionRepository.findById.mockResolvedValue(null)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Go Back' })).toBeInTheDocument()
    })
  })

  it('navigates home when Go Back clicked', async () => {
    mockTransactionRepository.findById.mockResolvedValue(null)

    renderPage()

    await waitFor(() => {
      const goBackButton = screen.getByRole('button', { name: 'Go Back' })
      fireEvent.click(goBackButton)
    })

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('shows delete button', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })
  })

  it('deletes transaction and navigates home', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockTransactionRepository.delete).toHaveBeenCalledWith(1)
    })

    expect(mockShowToast).toHaveBeenCalledWith('Transaction deleted', 'success')
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('shows error when delete fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockTransactionRepository.delete.mockRejectedValue(new Error('Delete failed'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to delete transaction', 'error')
    })

    consoleSpy.mockRestore()
  })

  it('does not delete when confirm cancelled', async () => {
    vi.spyOn(window, 'confirm').mockImplementationOnce(() => false)

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButton)

    expect(mockTransactionRepository.delete).not.toHaveBeenCalled()
  })

  it('shows Update button instead of Add', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
    })
  })

  it('updates transaction and navigates home', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
    })

    const submitButton = screen.getByRole('button', { name: 'Update' })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockTransactionRepository.update).toHaveBeenCalled()
    })

    expect(mockShowToast).toHaveBeenCalledWith('Transaction updated', 'success')
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('handles load error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockTransactionRepository.findById.mockRejectedValue(new Error('Load failed'))

    renderPage()

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to load transaction', 'error')
    })

    consoleSpy.mockRestore()
  })

  it('navigates home on cancel', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelButton)

    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('shows Deleting... text while deleting', async () => {
    mockTransactionRepository.delete.mockImplementation(() => new Promise(() => {}))

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByText('Deleting...')).toBeInTheDocument()
    })
  })
})
