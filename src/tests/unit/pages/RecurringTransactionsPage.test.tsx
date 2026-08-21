import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecurringTransactionsPage } from '../../../pages/RecurringTransactionsPage'
import { LayoutProvider } from '../../../store/LayoutContext'
import { TabBar } from '../../../components/ui/TabBar'
import {
  recurringRepository,
  settingsRepository,
  walletRepository,
  tagRepository,
  counterpartyRepository,
  currencyRepository,
} from '../../../services/repositories'
import type { RecurringPlan, TransactionInput } from '../../../types'
import type { RecurringPlanHydration } from '../../../services/repositories'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../../../services/repositories', () => ({
  recurringRepository: {
    findAll: vi.fn(),
    update: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    delete: vi.fn(),
    hydrateDraft: vi.fn(),
    derivePaymentPin: vi.fn(),
  },
  settingsRepository: {
    get: vi.fn(),
  },
  walletRepository: {
    findActive: vi.fn(),
  },
  tagRepository: {
    findIncomeTags: vi.fn(),
    findExpenseTags: vi.fn(),
    findCommonTags: vi.fn(),
  },
  counterpartyRepository: {
    findAll: vi.fn(),
  },
  currencyRepository: {
    findAll: vi.fn(),
    findUsedInAccounts: vi.fn(),
    getRateForCurrency: vi.fn(),
  },
}))

vi.mock('../../../services/exchangeRate/historicalRateService', () => ({
  getRateForDate: vi.fn().mockResolvedValue({ int: 1, frac: 0 }),
}))

const mockShowToast = vi.fn()
vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: mockShowToast }),
  }
})

const mockRecurringRepository = vi.mocked(recurringRepository)
const mockSettingsRepository = vi.mocked(settingsRepository)
const mockWalletRepository = vi.mocked(walletRepository)
const mockTagRepository = vi.mocked(tagRepository)
const mockCounterpartyRepository = vi.mocked(counterpartyRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)

const planId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])

const plan: RecurringPlan = {
  id: planId,
  schedule: {
    frequency: 'weekly',
    interval: 2,
    weekdays: [1, 5],
  },
  transaction_draft: {
    timestamp: 1760000000,
    lines: [
      {
        account_id: 1,
        tag_id: 2,
        sign: '-',
        amount_int: 10,
        amount_frac: 0,
        rate_int: 1,
        rate_frac: 0,
      },
    ],
  },
  mode: 'expense',
  start_date: '2026-05-01',
  next_due_date: '2026-05-15',
  until_policy: { type: 'count', count: 5 },
  occurrence_count: 0,
  status: 'active',
  payment_pin: null,
  notify_days_before: null,
  created_at: 1760000000,
  updated_at: 1760000000,
}

const planWithCounterparty: RecurringPlan = {
  ...plan,
  transaction_draft: { ...plan.transaction_draft, counterparty_id: 9 },
}

function hydrationFor(draft: TransactionInput): RecurringPlanHydration {
  return {
    categoryName: 'Groceries',
    counterpartyName: draft.counterparty_id ? 'Landlord' : null,
    walletName: 'Checking',
    currencyCode: 'USD',
    currencySymbol: '$',
    decimalPlaces: 2,
    amount: 10,
  }
}

describe('RecurringTransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecurringRepository.findAll.mockResolvedValue([plan])
    mockRecurringRepository.update.mockResolvedValue(plan)
    mockRecurringRepository.pause.mockResolvedValue()
    mockRecurringRepository.resume.mockResolvedValue()
    mockRecurringRepository.delete.mockResolvedValue()
    mockRecurringRepository.hydrateDraft.mockImplementation(async (draft) => hydrationFor(draft as TransactionInput))
    mockRecurringRepository.derivePaymentPin.mockResolvedValue(null)
    mockSettingsRepository.get.mockResolvedValue(null)

    mockWalletRepository.findActive.mockResolvedValue([
      {
        id: 1,
        name: 'Cash',
        color: null,
        is_default: true,
        accounts: [
          { id: 1, wallet_id: 1, currency_id: 1, balance_int: 100, balance_frac: 0, updated_at: 1, is_default: true, account_type: 'plain' },
        ],
      },
    ])
    mockTagRepository.findExpenseTags.mockResolvedValue([{ id: 2, name: 'Groceries', sort_order: 1 }])
    mockTagRepository.findIncomeTags.mockResolvedValue([])
    mockTagRepository.findCommonTags.mockResolvedValue([])
    mockCounterpartyRepository.findAll.mockResolvedValue([])
    mockCurrencyRepository.findAll.mockResolvedValue([
      { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_fiat: true },
    ])
    mockCurrencyRepository.findUsedInAccounts.mockResolvedValue([
      { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_fiat: true },
    ])
    mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 1, frac: 0 })
  })

  const renderPage = () => render(
    <MemoryRouter>
      <LayoutProvider>
        <RecurringTransactionsPage />
      </LayoutProvider>
    </MemoryRouter>
  )

  const openMenu = async () => {
    fireEvent.click(await screen.findByRole('button', { expanded: false }))
  }

  it('wires the add button to the recurring entry point', async () => {
    render(
      <MemoryRouter>
        <LayoutProvider>
          <RecurringTransactionsPage />
          <TabBar />
        </LayoutProvider>
      </MemoryRouter>
    )

    await screen.findByText(/Groceries/)
    fireEvent.click(screen.getByLabelText('Add'))

    expect(mockNavigate).toHaveBeenCalledWith('/add?recurring=1')
  })

  it('renders the plan card with When, Type, Category, Amount, and Wallet:Currency', async () => {
    renderPage()

    expect(await screen.findByText(/2026-05-15/)).toBeInTheDocument()
    expect(screen.getByText(/Expense/)).toBeInTheDocument()
    expect(screen.getByText(/Groceries/)).toBeInTheDocument()
    expect(screen.getByText(/\$10\.00/)).toBeInTheDocument()
    expect(screen.getByText(/Checking:USD/)).toBeInTheDocument()
  })

  it('renders the counterparty when present and omits it when absent', async () => {
    mockRecurringRepository.findAll.mockResolvedValue([planWithCounterparty])
    renderPage()

    expect(await screen.findByText('Landlord')).toBeInTheDocument()
  })

  it('omits the counterparty line when the plan has none', async () => {
    renderPage()

    await screen.findByText(/Groceries/)
    expect(screen.queryByText('Landlord')).not.toBeInTheDocument()
  })

  it('shows empty state when there are no recurring plans', async () => {
    mockRecurringRepository.findAll.mockResolvedValue([])

    renderPage()

    expect(await screen.findByText('No recurring transactions')).toBeInTheDocument()
  })

  it('collapses edit/pause/delete actions into a single dropdown menu', async () => {
    renderPage()
    await screen.findByText(/Groceries/)

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

    await openMenu()
    expect(screen.getByRole('menuitem', { name: 'Edit repetitions' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit transaction' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  it('pauses, resumes, and deletes plans from the list', async () => {
    const pausedPlan = {
      ...plan,
      status: 'paused' as const,
      next_due_date: null,
    }
    mockRecurringRepository.findAll
      .mockResolvedValueOnce([plan])
      .mockResolvedValueOnce([pausedPlan])
      .mockResolvedValueOnce([plan])
      .mockResolvedValueOnce([])

    renderPage()
    await screen.findByText(/Groceries/)

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pause' }))
    await waitFor(() => expect(mockRecurringRepository.pause).toHaveBeenCalledWith(plan.id))
    expect(await screen.findByText(/complete/)).toBeInTheDocument()

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Resume' }))
    await waitFor(() => expect(mockRecurringRepository.resume).toHaveBeenCalledWith(plan.id))

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await waitFor(() => expect(mockRecurringRepository.delete).toHaveBeenCalledWith(plan.id))
    expect(mockShowToast).toHaveBeenCalledWith('Recurring plan deleted', 'success')
  })

  it('edits repetitions with the same selectable controls as add transaction, without touching the transaction draft', async () => {
    renderPage()
    await screen.findByText(/Groceries/)

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit repetitions' }))

    const dialog = await screen.findByRole('dialog')
    const recurrence = within(dialog)

    expect(recurrence.getByRole('button', { name: 'Daily' })).toBeInTheDocument()
    expect(recurrence.getByRole('button', { name: 'Monthly' })).toBeInTheDocument()
    expect(recurrence.getByRole('button', { name: 'Weekly' })).toBeInTheDocument()
    expect(recurrence.getByRole('button', { name: 'Yearly' })).toBeInTheDocument()
    expect(recurrence.getByRole('button', { name: 'Mon' }).className).toContain('bg-primary-100')
    expect(recurrence.getByRole('button', { name: 'Fri' }).className).toContain('bg-primary-100')
    expect(recurrence.getByLabelText('Remind me N days before')).toBeInTheDocument()

    fireEvent.click(recurrence.getByRole('button', { name: 'Yearly' }))
    fireEvent.click(recurrence.getByRole('button', { name: 'Feb' }))
    fireEvent.click(recurrence.getByRole('button', { name: 'Oct' }))
    fireEvent.click(recurrence.getByRole('button', { name: '2' }))
    fireEvent.change(recurrence.getByRole('combobox'), { target: { value: 'date' } })
    fireEvent.change(recurrence.getByDisplayValue('2026-05-15'), { target: { value: '2026-12-31' } })
    fireEvent.change(recurrence.getByLabelText('Remind me N days before'), { target: { value: '3' } })
    fireEvent.click(recurrence.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockRecurringRepository.update).toHaveBeenCalledWith(plan.id, {
        schedule: {
          frequency: 'yearly',
          interval: 2,
          monthDays: [2],
          months: [2, 10],
        },
        until_policy: { type: 'date', date: '2026-12-31' },
        notify_days_before: 3,
      })
    })
    const [, updatePayload] = mockRecurringRepository.update.mock.calls[0]
    expect(updatePayload).not.toHaveProperty('transaction_draft')
    expect(updatePayload).not.toHaveProperty('mode')
    expect(updatePayload).not.toHaveProperty('payment_pin')
  })

  it('closes the edit repetitions modal without saving', async () => {
    renderPage()
    await screen.findByText(/Groceries/)

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit repetitions' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockRecurringRepository.update).not.toHaveBeenCalled()
  })

  it('edits the transaction content only, without touching schedule/until/notify_days_before', async () => {
    renderPage()
    await screen.findByText(/Groceries/)

    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit transaction' }))

    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Account')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(mockRecurringRepository.update).toHaveBeenCalledWith(
      plan.id,
      expect.objectContaining({ mode: 'expense' })
    ))
    const [, updatePayload] = mockRecurringRepository.update.mock.calls[0]
    expect(updatePayload).toHaveProperty('transaction_draft')
    expect(updatePayload).toHaveProperty('payment_pin')
    expect(updatePayload).not.toHaveProperty('schedule')
    expect(updatePayload).not.toHaveProperty('until_policy')
    expect(updatePayload).not.toHaveProperty('notify_days_before')
    expect(mockShowToast).toHaveBeenCalledWith('Recurring plan updated', 'success')
  })
})
