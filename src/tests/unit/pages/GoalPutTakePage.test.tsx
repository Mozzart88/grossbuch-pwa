import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GoalPutTakePage } from '../../../pages/GoalPutTakePage'
import type { Goal, Wallet, Currency, Transaction } from '../../../types'
import { blobToHex } from '../../../utils/blobUtils'
import { LayoutProvider } from '../../../store/LayoutContext'
import { TestActionBar } from '../../helpers/TestActionBar'

vi.mock('../../../services/repositories', () => ({
  goalRepository: { findById: vi.fn(), put: vi.fn(), take: vi.fn(), updatePutTake: vi.fn() },
  walletRepository: { findActive: vi.fn() },
  currencyRepository: { findAll: vi.fn(), getRateForCurrency: vi.fn() },
  transactionRepository: { findById: vi.fn(), delete: vi.fn() },
}))

vi.mock('../../../services/exchangeRate/historicalRateService', () => ({
  getRateForDate: vi.fn().mockResolvedValue({ int: 1, frac: 0 }),
}))

const mockShowToast = vi.fn()
vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return { ...actual, useToast: () => ({ showToast: mockShowToast }) }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { goalRepository, walletRepository, currencyRepository, transactionRepository } from '../../../services/repositories'

const mockGoalRepository = vi.mocked(goalRepository)
const mockWalletRepository = vi.mocked(walletRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockTransactionRepository = vi.mocked(transactionRepository)

const goalId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
const goalIdHex = blobToHex(goalId)

const goal: Goal = {
  id: goalId,
  wallet_id: 10,
  name: 'Emergency Fund',
  color: null,
  currency_id: 1,
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
  balance: 250,
  target_int: 1000,
  target_frac: 0,
  due_date: null,
  updated_at: 0,
  is_achieved: false,
  is_archived: false,
  accounts: [{ id: 1, wallet_id: 10, currency_id: 1, currency: 'USD', decimal_places: 2, balance_int: 250, balance_frac: 0, updated_at: 0 }],
}

const savingsWallet: Wallet = {
  id: 20,
  name: 'Bank',
  color: null,
  account_type: 'savings',
  accounts: [{ id: 2, wallet_id: 20, currency_id: 1, currency: 'USD', decimal_places: 2, balance_int: 800, balance_frac: 0, updated_at: 0, account_type: 'savings' }],
}

const plainWallet: Wallet = {
  id: 30,
  name: 'Cash',
  color: null,
  accounts: [{ id: 3, wallet_id: 30, currency_id: 1, currency: 'USD', decimal_places: 2, balance_int: 100, balance_frac: 0, updated_at: 0 }],
}

const currencies: Currency[] = [{ id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2 }]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/goals/${goalIdHex}/put-take`]}>
      <LayoutProvider>
        <Routes>
          <Route path="/goals/:goalId/put-take" element={<GoalPutTakePage />} />
        </Routes>
        <TestActionBar />
      </LayoutProvider>
    </MemoryRouter>
  )
}

const trxId = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9])
const trxIdHex = blobToHex(trxId)

const putTransaction: Transaction = {
  id: trxId,
  timestamp: 1700000000,
  note: 'existing note',
  lines: [
    { id: new Uint8Array([1]), trx_id: trxId, account_id: 1, tag_id: 6, sign: '+', amount_int: 50, amount_frac: 0, rate_int: 1, rate_frac: 0 },
    { id: new Uint8Array([2]), trx_id: trxId, account_id: 2, tag_id: 6, sign: '-', amount_int: 0, amount_frac: 0, rate_int: 1, rate_frac: 0 },
  ],
}

function renderEditPage() {
  return render(
    <MemoryRouter initialEntries={[`/goals/${goalIdHex}/put-take/${trxIdHex}`]}>
      <LayoutProvider>
        <Routes>
          <Route path="/goals/:goalId/put-take/:trxId" element={<GoalPutTakePage />} />
        </Routes>
        <TestActionBar />
      </LayoutProvider>
    </MemoryRouter>
  )
}

describe('GoalPutTakePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGoalRepository.findById.mockResolvedValue(goal)
    mockWalletRepository.findActive.mockResolvedValue([savingsWallet, plainWallet])
    mockCurrencyRepository.findAll.mockResolvedValue(currencies)
    mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 1, frac: 0 })
  })

  // "Put"/"Take" appear twice: the mode-tab button and the form's submit
  // button share the same label — the tab button is always the first one.
  const modeTabButton = (name: 'Put' | 'Take') => screen.getAllByRole('button', { name })[0]

  it('defaults to Put mode and shows the goal name in the header', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })
    expect(modeTabButton('Put')).toHaveClass('bg-white')
  })

  it('only offers savings-type accounts as the counterparty, excluding plain wallets', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())

    const combobox = screen.getByRole('combobox')
    const values = Array.from(combobox.querySelectorAll('option'))
      .map(o => (o as HTMLOptionElement).value)
      .filter(Boolean)
    expect(values).toEqual(['2'])
  })

  it('switches to Take mode', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())

    fireEvent.click(modeTabButton('Take'))

    expect(modeTabButton('Take')).toHaveClass('bg-white')
  })

  it('navigates back after a successful submission', async () => {
    mockGoalRepository.put.mockResolvedValue({} as any)
    renderPage()
    await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Put' })).toHaveLength(2))

    fireEvent.change(document.getElementById('amount')!, { target: { value: '50' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Put' })[1])

    await waitFor(() => {
      expect(mockGoalRepository.put).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith(-1)
    })
  })

  it('shows a not-found message for an unknown goal', async () => {
    mockGoalRepository.findById.mockResolvedValue(null)
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Goal not found')).toBeInTheDocument()
    })
  })

  it('shows an error message when the goal id is missing from the route', async () => {
    render(
      <MemoryRouter initialEntries={['/goals/']}>
        <Routes>
          <Route path="/goals/*" element={<GoalPutTakePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Goal ID is required')).toBeInTheDocument()
    })
  })

  it('shows an error message when loading fails', async () => {
    mockGoalRepository.findById.mockRejectedValue(new Error('boom'))
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Failed to load goal')).toBeInTheDocument()
    })
  })

  it('falls back to an empty currency code/symbol when the account currency is unknown', async () => {
    mockCurrencyRepository.findAll.mockResolvedValue([])
    renderPage()

    await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('treats a wallet with no accounts field as contributing no savings-account options', async () => {
    mockWalletRepository.findActive.mockResolvedValue([{ id: 40, name: 'No Accounts Wallet', color: null }, savingsWallet])
    renderPage()

    await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
    const values = Array.from(screen.getByRole('combobox').querySelectorAll('option')).map(o => (o as HTMLOptionElement).value).filter(Boolean)
    expect(values).toEqual(['2'])
  })

  describe('editing an existing Put/Take', () => {
    beforeEach(() => {
      mockTransactionRepository.findById.mockResolvedValue(putTransaction)
      mockTransactionRepository.delete.mockResolvedValue(undefined)
      mockGoalRepository.updatePutTake.mockResolvedValue({} as any)
    })

    it('loads the transaction, hides the mode tabs, and shows a Delete action', async () => {
      renderEditPage()

      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
      expect(mockTransactionRepository.findById).toHaveBeenCalledWith(trxId)
      expect(screen.queryByRole('button', { name: 'Take' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
      expect((document.getElementById('amount') as HTMLInputElement).value).toMatch(/^50/)
      expect(screen.getByPlaceholderText('Add notes...')).toHaveValue('existing note')
    })

    it('disables Save until a field actually changes, moving Cancel/Save into the bottom ActionBar', async () => {
      renderEditPage()
      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled())

      fireEvent.change(document.getElementById('amount')!, { target: { value: '75' } })
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled())
    })

    it('saves via updatePutTake, not put/take', async () => {
      renderEditPage()
      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())

      fireEvent.change(document.getElementById('amount')!, { target: { value: '75' } })
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled())
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(mockGoalRepository.updatePutTake).toHaveBeenCalledWith(trxId, expect.objectContaining({ goalId, counterpartyAccountId: 2 }))
        expect(mockGoalRepository.put).not.toHaveBeenCalled()
        expect(mockNavigate).toHaveBeenCalledWith(-1)
      })
    })

    it('derives Take mode from a negative goal-side sign', async () => {
      mockTransactionRepository.findById.mockResolvedValue({
        ...putTransaction,
        lines: [
          { ...putTransaction.lines![0], sign: '-' },
          { ...putTransaction.lines![1], sign: '+' },
        ],
      })
      renderEditPage()

      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument())
    })

    it('deletes the entry after confirmation and navigates back', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      renderEditPage()
      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        expect(mockTransactionRepository.delete).toHaveBeenCalledWith(trxId)
        expect(mockNavigate).toHaveBeenCalledWith(-1)
      })
    })

    it('does not delete when confirmation is declined', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      renderEditPage()
      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

      expect(mockTransactionRepository.delete).not.toHaveBeenCalled()
    })

    it('shows an error toast when deleting fails', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      mockTransactionRepository.delete.mockRejectedValue(new Error('Delete failed'))
      renderEditPage()
      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Delete failed', 'error')
      })
    })

    it('shows a not-found message when the transaction does not exist', async () => {
      mockTransactionRepository.findById.mockResolvedValue(null)
      renderEditPage()

      await waitFor(() => {
        expect(screen.getByText('Transaction not found')).toBeInTheDocument()
      })
    })
  })
})
