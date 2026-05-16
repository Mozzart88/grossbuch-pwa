import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
  notificationRepository: {
    findByHexId: vi.fn(),
    markReaded: vi.fn(),
    deleteByHexId: vi.fn(),
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
  toLocalISOString: vi.fn(() => '2025-01-10T12:00:00.000Z'),
}))

import { transactionRepository, walletRepository, tagRepository, counterpartyRepository, currencyRepository, settingsRepository, notificationRepository } from '../../../services/repositories'

const mockTransactionRepository = vi.mocked(transactionRepository)
const mockWalletRepository = vi.mocked(walletRepository)
const mockTagRepository = vi.mocked(tagRepository)
const mockCounterpartyRepository = vi.mocked(counterpartyRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockSettingsRepository = vi.mocked(settingsRepository)
const mockNotificationRepository = vi.mocked(notificationRepository)

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
    mockNotificationRepository.findByHexId.mockResolvedValue(null)
    mockNotificationRepository.markReaded.mockResolvedValue(undefined)
    mockNotificationRepository.deleteByHexId.mockResolvedValue(undefined)
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

  const fillExpenseForm = async () => {
    await waitFor(() => {
      expect(screen.getByText('Account')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '50' } })

    const categoryInput = screen.getByPlaceholderText('Select category')
    fireEvent.focus(categoryInput)
    fireEvent.change(categoryInput, { target: { value: 'food' } })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'food' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('option', { name: 'food' }))
  }

  it('renders page header with title', async () => {
    renderPage()

    expect(screen.getByText('Add Transaction')).toBeInTheDocument()
  })

  it('renders recurring transaction action in the page header', async () => {
    renderPage()

    const recurringButton = await screen.findByRole('button', { name: /recurring transaction/i })
    expect(recurringButton.closest('header')).toBeInTheDocument()
    expect(recurringButton.className).toContain('p-2')
    expect(recurringButton.className).toContain('text-gray-400')
  })

  it('toggles recurring transaction action without opening setup immediately', async () => {
    renderPage()

    const recurringButton = await screen.findByRole('button', { name: /recurring transaction/i })
    fireEvent.click(recurringButton)

    await waitFor(() => {
      expect(recurringButton.className).toContain('text-primary-600')
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(recurringButton)

    await waitFor(() => {
      expect(recurringButton.className).toContain('text-gray-400')
    })
  })

  it('shows selectable recurrence controls in the setup modal on submit', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /recurring transaction/i }))
    await fillExpenseForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    const dialog = await screen.findByRole('dialog')
    const recurrence = within(dialog)

    expect(recurrence.getByRole('button', { name: 'Daily' })).toBeInTheDocument()
    expect(recurrence.getByRole('button', { name: 'Monthly' })).toBeInTheDocument()
    expect(recurrence.getByRole('button', { name: 'Weekly' })).toBeInTheDocument()
    expect(recurrence.getByRole('button', { name: 'Yearly' })).toBeInTheDocument()

    fireEvent.click(recurrence.getByRole('button', { name: 'Weekly' }))
    fireEvent.change(recurrence.getByLabelText('Repeat interval'), { target: { value: '2' } })
    fireEvent.click(recurrence.getByRole('button', { name: 'Mon' }))
    fireEvent.click(recurrence.getByRole('button', { name: 'Wed' }))

    expect(recurrence.getByText('weeks')).toBeInTheDocument()
    expect(recurrence.getByRole('button', { name: 'Mon' }).className).toContain('bg-primary-100')
    expect(recurrence.getByRole('button', { name: 'Wed' }).className).toContain('bg-primary-100')

    fireEvent.click(recurrence.getByRole('button', { name: 'Yearly' }))
    fireEvent.click(recurrence.getByRole('button', { name: 'Feb' }))
    fireEvent.click(recurrence.getByRole('button', { name: 'Oct' }))
    fireEvent.click(recurrence.getByRole('button', { name: '2' }))
    fireEvent.click(recurrence.getByRole('button', { name: '10' }))

    expect(recurrence.getByRole('button', { name: 'Feb' }).className).toContain('bg-primary-100')
    expect(recurrence.getByRole('button', { name: 'Oct' }).className).toContain('bg-primary-100')
    expect(recurrence.getByRole('button', { name: '2' }).className).toContain('bg-primary-100')
    expect(recurrence.getByRole('button', { name: '10' }).className).toContain('bg-primary-100')

    fireEvent.change(recurrence.getByRole('combobox'), { target: { value: 'count' } })

    expect(recurrence.getByText('Stop after')).toBeInTheDocument()
    expect(recurrence.getByText('repetitions')).toBeInTheDocument()
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

  it('keeps add form open and resets entry fields when Add another is checked', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Account')).toBeInTheDocument()
    })

    const addAnother = screen.getByRole('checkbox', { name: /add another/i })
    fireEvent.click(addAnother)

    const amountInput = screen.getByPlaceholderText('0.00')
    fireEvent.change(amountInput, { target: { value: '50' } })

    const categoryInput = screen.getByPlaceholderText('Select category')
    fireEvent.focus(categoryInput)
    fireEvent.change(categoryInput, { target: { value: 'food' } })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'food' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('option', { name: 'food' }))

    fireEvent.change(screen.getByPlaceholderText('Add notes...'), { target: { value: 'first entry' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalled()
      expect(amountInput).toHaveValue(null)
      expect(categoryInput).toHaveValue('')
      expect(screen.getByPlaceholderText('Add notes...')).toHaveValue('')
    })

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(addAnother).toBeChecked()
    expect(screen.getByRole('combobox', { name: /wallet/i })).toHaveValue('1')
    expect(screen.getByRole('combobox', { name: /account/i })).toHaveValue('1')
  })

  it('navigates back on cancel', async () => {
    renderPage()

    // Cancel button is in ActionBar — wait for it to appear after action bar config is set
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

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

    // Exchange button should be active — wait for the exchange form to render
    await waitFor(() => {
      expect(screen.getAllByRole('combobox')[0]).toBeInTheDocument()
    })

    const exchangeButton = screen.getByRole('button', { name: 'Exchange' })
    expect(exchangeButton.className).toContain('bg-white')
  })

  it('loads transaction notification draft and deletes it after submit', async () => {
    const notificationId = '0102030405060708'
    mockNotificationRepository.findByHexId.mockResolvedValue({
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      type: 'transaction',
      status: 'new',
      timestamp: 1700000000,
      readed_at: null,
      updated_at: 1700000000,
      payload: {
        title: 'Draft expense',
        mode: 'expense',
        draft: {
          timestamp: 1700000000,
          lines: [{
            account_id: 1,
            tag_id: 12,
            sign: '-',
            amount_int: 25,
            amount_frac: 0,
            rate_int: 1,
            rate_frac: 0,
          }],
        },
      },
    })

    render(
      <MemoryRouter initialEntries={[`/add?notification=${notificationId}`]}>
        <LayoutProvider>
          <AddTransactionPage />
          <ActionBar />
        </LayoutProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText<HTMLInputElement>('0.00').value).toMatch(/^25[,.]00$/)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalled()
      expect(mockNotificationRepository.markReaded).toHaveBeenCalled()
      expect(mockNotificationRepository.deleteByHexId).toHaveBeenCalledWith(notificationId)
    })
  })
})
