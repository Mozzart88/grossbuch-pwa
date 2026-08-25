import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GoalPutTakeForm } from '../../../../components/goals/GoalPutTakeForm'
import type { Goal } from '../../../../types'
import { LayoutProvider } from '../../../../store/LayoutContext'
import { TestActionBar } from '../../../helpers/TestActionBar'

vi.mock('../../../../services/repositories', () => ({
  currencyRepository: { getRateForCurrency: vi.fn() },
  goalRepository: { put: vi.fn(), take: vi.fn(), updatePutTake: vi.fn() },
}))

vi.mock('../../../../services/exchangeRate/historicalRateService', () => ({
  getRateForDate: vi.fn().mockResolvedValue({ int: 1, frac: 0 }),
}))

const mockShowToast = vi.fn()
vi.mock('../../../../components/ui', async () => {
  const actual = await vi.importActual('../../../../components/ui')
  return { ...actual, useToast: () => ({ showToast: mockShowToast }) }
})

import { currencyRepository, goalRepository } from '../../../../services/repositories'

const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockGoalRepository = vi.mocked(goalRepository)

const goal: Goal = {
  id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
  wallet_id: 10,
  name: 'Emergency Fund',
  color: null,
  currency_id: 1,
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
  balance: 500,
  target_int: 5000,
  target_frac: 0,
  due_date: null,
  updated_at: 0,
  is_achieved: false,
  is_archived: false,
  accounts: [
    { id: 1, wallet_id: 10, currency_id: 1, currency: 'USD', symbol: '$', decimal_places: 2, balance_int: 500, balance_frac: 0, updated_at: 0, is_default: true },
  ],
}

const savingsAccounts = [
  {
    id: 2, wallet_id: 20, currency_id: 1, balance_int: 800, balance_frac: 0, updated_at: 0,
    walletName: 'Bank', walletIsDefault: false, currencyCode: 'USD', currencySymbol: '$', decimalPlaces: 2, account_type: 'savings' as const,
  },
  {
    id: 3, wallet_id: 30, currency_id: 2, balance_int: 400, balance_frac: 0, updated_at: 0,
    walletName: 'Euro Bank', walletIsDefault: false, currencyCode: 'EUR', currencySymbol: '€', decimalPlaces: 2, account_type: 'savings' as const,
  },
]

const defaultProps = {
  goal,
  savingsAccounts,
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
}

describe('GoalPutTakeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 1, frac: 0 })
    mockGoalRepository.put.mockResolvedValue({} as any)
    mockGoalRepository.take.mockResolvedValue({} as any)
    mockGoalRepository.updatePutTake.mockResolvedValue({} as any)
  })

  it('Put offers every savings account regardless of currency — a matching goal account is created if needed', () => {
    render(<GoalPutTakeForm {...defaultProps} mode="put" />)

    const combobox = screen.getByRole('combobox')
    const options = combobox.querySelectorAll('option') as NodeListOf<HTMLOptionElement>
    const values = Array.from(options).map(o => o.value).filter(Boolean)
    expect(values).toEqual(['2', '3']) // both the USD and EUR savings accounts
  })

  it('Take only offers savings accounts whose currency matches one of the goal\'s linked accounts', () => {
    render(<GoalPutTakeForm {...defaultProps} mode="take" />)

    const combobox = screen.getByRole('combobox')
    const options = combobox.querySelectorAll('option') as NodeListOf<HTMLOptionElement>
    const values = Array.from(options).map(o => o.value).filter(Boolean)
    expect(values).toEqual(['2']) // only the USD savings account — the goal has no EUR account
  })

  it('shows the auto-detected goal account balance in the amount label once a counterparty is chosen', () => {
    render(<GoalPutTakeForm {...defaultProps} mode="put" />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })

    expect(screen.getByText('Amount ($): 500,00')).toBeInTheDocument()
  })

  it('shows a static savings-only hint regardless of selection', () => {
    render(<GoalPutTakeForm {...defaultProps} mode="put" />)

    expect(screen.getByText('Only savings accounts can be used here.')).toBeInTheDocument()
  })

  it('tells the user a new goal account will be created when the chosen currency has none yet', () => {
    render(<GoalPutTakeForm {...defaultProps} mode="put" />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '3' } }) // EUR savings account

    expect(screen.getByText(/A new EUR account will be added to this goal\./)).toBeInTheDocument()
  })

  it('submits a Put with the goal id and chosen counterparty account', async () => {
    render(<GoalPutTakeForm {...defaultProps} mode="put" />)

    fireEvent.change(document.getElementById('amount')!, { target: { value: '50' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Put' }))

    await waitFor(() => {
      expect(mockGoalRepository.put).toHaveBeenCalledWith(
        expect.objectContaining({
          goalId: goal.id,
          counterpartyAccountId: 2,
          amount_int: 50,
          amount_frac: 0,
        })
      )
    })
    expect(defaultProps.onSubmit).toHaveBeenCalled()
  })

  it('editing an existing Put/Take: prefills the form, locks the mode, and saves via updatePutTake', async () => {
    render(
      <GoalPutTakeForm
        {...defaultProps}
        mode="put"
        editingTrxId={new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9])}
        initialData={{ counterpartyAccountId: 2, amount_int: 50, amount_frac: 0, timestamp: 1700000000, note: 'existing note' }}
      />
    )

    expect((document.getElementById('amount') as HTMLInputElement).value).toBe('50,00')
    expect(screen.getByPlaceholderText('Add notes...')).toHaveValue('existing note')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Add notes...'), { target: { value: 'updated note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockGoalRepository.updatePutTake).toHaveBeenCalledWith(
        new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]),
        expect.objectContaining({ goalId: goal.id, counterpartyAccountId: 2, amount_int: 50, amount_frac: 0 })
      )
      expect(mockGoalRepository.put).not.toHaveBeenCalled()
    })
  })

  it('submits a Take using goalRepository.take', async () => {
    render(<GoalPutTakeForm {...defaultProps} mode="take" />)

    fireEvent.change(document.getElementById('amount')!, { target: { value: '20' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Take' }))

    await waitFor(() => {
      expect(mockGoalRepository.take).toHaveBeenCalled()
      expect(mockGoalRepository.put).not.toHaveBeenCalled()
    })
  })

  it('shows validation errors when submitting with no amount or account chosen', async () => {
    render(<GoalPutTakeForm {...defaultProps} mode="put" />)

    fireEvent.click(screen.getByRole('button', { name: 'Put' }))

    await waitFor(() => {
      expect(screen.getByText('Amount is required and must be positive')).toBeInTheDocument()
      expect(screen.getByText('A savings account is required')).toBeInTheDocument()
    })
    expect(mockGoalRepository.put).not.toHaveBeenCalled()
  })

  it('shows an error toast when the repository call fails', async () => {
    mockGoalRepository.put.mockRejectedValue(new Error('Put/Take requires a same-currency savings account'))
    render(<GoalPutTakeForm {...defaultProps} mode="put" />)

    fireEvent.change(document.getElementById('amount')!, { target: { value: '50' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Put' }))

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Put/Take requires a same-currency savings account', 'error')
    })
  })

  it('shows a generic error message for a non-Error rejection', async () => {
    mockGoalRepository.put.mockRejectedValue('nope')
    render(<GoalPutTakeForm {...defaultProps} mode="put" />)

    fireEvent.change(document.getElementById('amount')!, { target: { value: '50' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Put' }))

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to put funds', 'error')
    })
  })

  it('records the note and lets the user change the datetime', async () => {
    render(<GoalPutTakeForm {...defaultProps} mode="put" />)

    fireEvent.change(document.getElementById('amount')!, { target: { value: '50' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText('Add notes...'), { target: { value: 'birthday money' } })

    const datetimeInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    fireEvent.change(datetimeInput, { target: { value: '2024-01-15T10:00' } })

    fireEvent.click(screen.getByRole('button', { name: 'Put' }))

    await waitFor(() => {
      expect(mockGoalRepository.put).toHaveBeenCalledWith(
        expect.objectContaining({ note: 'birthday money', timestamp: expect.any(Number) })
      )
    })
  })

  it('rejects submission when the goal has no linked accounts to put/take against', async () => {
    const emptyGoal: Goal = { ...goal, accounts: [] }
    render(<GoalPutTakeForm {...defaultProps} goal={emptyGoal} mode="put" />)

    fireEvent.change(document.getElementById('amount')!, { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Put' }))

    await waitFor(() => {
      expect(screen.getByText('A savings account is required')).toBeInTheDocument()
    })
    expect(mockGoalRepository.put).not.toHaveBeenCalled()
  })

  describe('useActionBar with LayoutProvider', () => {
    const renderWithLayout = (props = {}) =>
      render(
        <LayoutProvider>
          <GoalPutTakeForm {...defaultProps} mode="put" useActionBar {...props} />
          <TestActionBar />
        </LayoutProvider>
      )

    it('moves Cancel/Save into the bottom ActionBar instead of the inline buttons', () => {
      renderWithLayout()

      // Only the ActionBar's Put/Cancel render — the form's own inline pair is suppressed.
      expect(screen.getAllByRole('button', { name: 'Put' })).toHaveLength(1)
      expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1)
    })

    it('disables the ActionBar Save until a field changes while editing', () => {
      renderWithLayout({
        editingTrxId: new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]),
        initialData: { counterpartyAccountId: 2, amount_int: 50, amount_frac: 0, timestamp: 1700000000, note: 'existing note' },
      })

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

      fireEvent.change(document.getElementById('amount')!, { target: { value: '75' } })
      expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    })

    it('submits via the ActionBar primary action', async () => {
      renderWithLayout()

      fireEvent.change(document.getElementById('amount')!, { target: { value: '50' } })
      fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } })
      fireEvent.click(screen.getByRole('button', { name: 'Put' }))

      await waitFor(() => {
        expect(mockGoalRepository.put).toHaveBeenCalled()
      })
    })
  })
})
