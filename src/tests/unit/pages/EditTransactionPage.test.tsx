import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { EditTransactionPage } from '../../../pages/EditTransactionPage'
import { LayoutProvider } from '../../../store/LayoutContext'
import { TestActionBar } from '../../helpers/TestActionBar'
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
  tagRepository: {
    findAll: vi.fn(),
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
  walletRepository: {
    findActive: vi.fn(),
    findAll: vi.fn(),
    findOrCreateAccountForCurrency: vi.fn(),
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
  getFirstDayOfMonth: vi.fn(() => '2025-01-01'),
  getLastDayOfMonth: vi.fn(() => '2025-01-31'),
  formatDate: vi.fn(() => 'Jan 10, 2025'),
  formatTime: vi.fn(() => '12:00'),
}))

// Mock confirm
vi.spyOn(window, 'confirm').mockImplementation(() => true)

import { transactionRepository, accountRepository, tagRepository, counterpartyRepository, currencyRepository, walletRepository, settingsRepository } from '../../../services/repositories'

const mockTransactionRepository = vi.mocked(transactionRepository)
const mockAccountRepository = vi.mocked(accountRepository)
const mockTagRepository = vi.mocked(tagRepository)
const mockCounterpartyRepository = vi.mocked(counterpartyRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockWalletRepository = vi.mocked(walletRepository)
const mockSettingsRepository = vi.mocked(settingsRepository)

// Create a sample hex ID and its Uint8Array equivalent
const sampleHexId = '0102030405060708090a0b0c0d0e0f10'
const sampleBlobId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])

const mockTransaction: Transaction = {
  id: sampleBlobId,
  timestamp: 1736337000,
  lines: [
    {
      id: new Uint8Array(16),
      trx_id: sampleBlobId,
      account_id: 1,
      tag_id: 10,
      sign: '-' as const,
      amount_int: 50,
      amount_frac: 0,
      rate_int: 0,
      rate_frac: 0,
    },
  ],
}

describe('EditTransactionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransactionRepository.findById.mockResolvedValue(mockTransaction)
    mockTransactionRepository.update.mockResolvedValue({} as any)
    mockTransactionRepository.delete.mockResolvedValue(undefined)
    mockAccountRepository.findAll.mockResolvedValue([
      {
        id: 1,
        wallet: 'Cash',
        currency: 'USD',
        real_balance: 10000,
        actual_balance: 15000,
        tags: null,
        created_at: 1704067200,
        updated_at: 1704067200,
      },
    ] as any)
    mockWalletRepository.findActive.mockResolvedValue([
      {
        id: 1,
        name: 'Cash',
        created_at: 1704067200,
        updated_at: 1704067200,
        accounts: [
          {
            id: 1,
            wallet_id: 1,
            currency_id: 1,
            real_balance: 10000,
            actual_balance: 15000,
            created_at: 1704067200,
            updated_at: 1704067200,
          },
        ],
      } as any,
    ])
    mockCurrencyRepository.findAll.mockResolvedValue([
      { id: 1, code: 'USD', symbol: '$', decimal_places: 2 } as any,
    ])
    mockCurrencyRepository.findUsedInAccounts.mockResolvedValue([
      { id: 1, code: 'USD', symbol: '$', decimal_places: 2 } as any,
    ])
    mockTagRepository.findAll.mockResolvedValue([
      {
        id: 12,
        name: 'food',
      },
    ])
    mockTagRepository.findExpenseTags.mockResolvedValue([
      {
        id: 12,
        name: 'food',
      },
    ])
    mockTagRepository.findIncomeTags.mockResolvedValue([
      {
        id: 11,
        name: 'sale',
      },
    ])
    mockTagRepository.findCommonTags.mockResolvedValue([])
    mockCounterpartyRepository.findAll.mockResolvedValue([])
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
    mockWalletRepository.findAll.mockResolvedValue([
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
            balance_int: 100,
            balance_frac: 0,
            tags: undefined,
            updated_at: 1704067200,
          },
        ],
      },
    ])
    mockSettingsRepository.get.mockResolvedValue(null)
  })

  const renderPage = (id = sampleHexId) => {
    return render(
      <MemoryRouter initialEntries={[`/edit/${id}`]}>
        <LayoutProvider>
          <Routes>
            <Route path="/edit/:id" element={<EditTransactionPage />} />
          </Routes>
          <TestActionBar />
        </LayoutProvider>
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
      expect(mockTransactionRepository.findById).toHaveBeenCalledWith(sampleBlobId)
    })
  })

  it('shows loading spinner while loading', async () => {
    mockTransactionRepository.findById.mockImplementation(() => new Promise(() => { }))

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

    expect(mockNavigate).toHaveBeenCalledWith(-1)
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
      expect(mockTransactionRepository.delete).toHaveBeenCalledWith(sampleBlobId)
    })

    expect(mockShowToast).toHaveBeenCalledWith('Transaction deleted', 'success')
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('shows error when delete fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
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

  it('navigates home on successful submission', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText(/^Amount/i)).toHaveValue(50)
      expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
    })

    const updateButton = screen.getByRole('button', { name: 'Update' })
    fireEvent.click(updateButton)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(-1)
    })
  })

  it('handles load error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
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

    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  it('does nothing when id param is missing', async () => {
    render(
      <MemoryRouter initialEntries={['/edit']}>
        <LayoutProvider>
          <Routes>
            <Route path="/edit" element={<EditTransactionPage />} />
          </Routes>
          <TestActionBar />
        </LayoutProvider>
      </MemoryRouter>
    )
    await new Promise(r => setTimeout(r, 0))
    expect(mockTransactionRepository.findById).not.toHaveBeenCalled()
  })

  it('shows Deleting... text while deleting', async () => {
    mockTransactionRepository.delete.mockImplementation(() => new Promise(() => { }))

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
