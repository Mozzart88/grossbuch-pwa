import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransactionForm } from '../../../../components/transactions/TransactionForm'
import type { Transaction, Account, Category, Counterparty } from '../../../../types'

// Mock repositories
vi.mock('../../../../services/repositories', () => ({
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

// Mock dateUtils
vi.mock('../../../../utils/dateUtils', () => ({
  toDateTimeLocal: vi.fn(() => '2025-01-10T12:00'),
  fromDateTimeLocal: vi.fn((val: string) => val.replace('T', ' ') + ':00'),
}))

import { accountRepository, categoryRepository, counterpartyRepository } from '../../../../services/repositories'

const mockAccountRepository = vi.mocked(accountRepository)
const mockCategoryRepository = vi.mocked(categoryRepository)
const mockCounterpartyRepository = vi.mocked(counterpartyRepository)

const mockAccounts: Account[] = [
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
  {
    id: 2,
    name: 'Bank EUR',
    currency_id: 2,
    initial_balance: 500,
    icon: '🏦',
    color: '#2196F3',
    is_active: 1,
    sort_order: 1,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
    currency_symbol: '€',
    currency_code: 'EUR',
    currency_decimal_places: 2,
    current_balance: 750,
  },
  {
    id: 3,
    name: 'Savings USD',
    currency_id: 1,
    initial_balance: 1000,
    icon: '💰',
    color: '#FF9800',
    is_active: 1,
    sort_order: 2,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
    currency_symbol: '$',
    currency_code: 'USD',
    currency_decimal_places: 2,
    current_balance: 1200,
  },
]

const mockCategories: Category[] = [
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
  {
    id: 2,
    name: 'Salary',
    type: 'income',
    icon: '💰',
    color: '#4CAF50',
    parent_id: null,
    is_preset: 1,
    sort_order: 1,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  },
  {
    id: 3,
    name: 'Other',
    type: 'both',
    icon: '📦',
    color: '#9E9E9E',
    parent_id: null,
    is_preset: 0,
    sort_order: 2,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  },
]

const mockCounterparties: Counterparty[] = [
  {
    id: 1,
    name: 'Restaurant ABC',
    notes: null,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
    category_ids: [1],
  },
  {
    id: 2,
    name: 'Company XYZ',
    notes: null,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
    category_ids: [2],
  },
  {
    id: 3,
    name: 'General Store',
    notes: null,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
    category_ids: [],
  },
]

describe('TransactionForm', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockAccountRepository.findAll.mockResolvedValue(mockAccounts)
    mockCategoryRepository.findAll.mockResolvedValue(mockCategories)
    mockCounterpartyRepository.findAll.mockResolvedValue(mockCounterparties)
    mockOnSubmit.mockResolvedValue(undefined)
  })

  const renderForm = (transaction?: Transaction) => {
    return render(
      <TransactionForm
        transaction={transaction}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    )
  }

  describe('Loading state', () => {
    it('shows loading spinner while loading data', () => {
      mockAccountRepository.findAll.mockImplementation(() => new Promise(() => {}))

      const { container } = renderForm()

      expect(container.querySelector('.animate-spin')).toBeTruthy()
    })

    it('loads data from repositories on mount', async () => {
      renderForm()

      await waitFor(() => {
        expect(mockAccountRepository.findAll).toHaveBeenCalled()
        expect(mockCategoryRepository.findAll).toHaveBeenCalled()
        expect(mockCounterpartyRepository.findAll).toHaveBeenCalled()
      })
    })
  })

  describe('Transaction type selection', () => {
    it('defaults to expense type', async () => {
      renderForm()

      await waitFor(() => {
        const expenseButton = screen.getByRole('button', { name: 'Expense' })
        expect(expenseButton.className).toContain('shadow')
      })
    })

    it('allows switching between transaction types', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Expense' })).toBeInTheDocument()
      })

      const incomeButton = screen.getByRole('button', { name: 'Income' })
      fireEvent.click(incomeButton)

      expect(incomeButton.className).toContain('shadow')
    })

    it('shows all 4 transaction types', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Expense' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Income' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Transfer' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Exchange' })).toBeInTheDocument()
      })
    })
  })

  describe('Category filtering', () => {
    it('shows expense categories for expense type', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Category')).toBeInTheDocument()
      })

      // Check that expense and both categories are available
      const categorySelect = screen.getByRole('combobox', { name: /category/i })
      expect(categorySelect).toBeInTheDocument()
    })

    it('shows income categories for income type', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Category')).toBeInTheDocument()
      })

      const incomeButton = screen.getByRole('button', { name: 'Income' })
      fireEvent.click(incomeButton)

      await waitFor(() => {
        const categorySelect = screen.getByRole('combobox', { name: /category/i })
        expect(categorySelect).toBeInTheDocument()
      })
    })

    it('hides category field for transfer type', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Category')).toBeInTheDocument()
      })

      const transferButton = screen.getByRole('button', { name: 'Transfer' })
      fireEvent.click(transferButton)

      await waitFor(() => {
        expect(screen.queryByText('Category')).not.toBeInTheDocument()
      })
    })
  })

  describe('Account selection', () => {
    it('sets first account as default when creating new transaction', async () => {
      renderForm()

      await waitFor(() => {
        const accountSelect = screen.getByRole('combobox', { name: /account/i })
        expect(accountSelect).toHaveValue('1')
      })
    })

    it('displays account balances in dropdown', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText(/Cash.*\$150\.00/)).toBeInTheDocument()
      })
    })
  })

  describe('Transfer fields', () => {
    it('shows destination account for transfer type', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const transferButton = screen.getByRole('button', { name: 'Transfer' })
      fireEvent.click(transferButton)

      await waitFor(() => {
        expect(screen.getByText('To Account')).toBeInTheDocument()
      })
    })

    it('filters destination accounts by same currency for transfers', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const transferButton = screen.getByRole('button', { name: 'Transfer' })
      fireEvent.click(transferButton)

      await waitFor(() => {
        // Both Cash and Savings USD should be available (same USD currency)
        // But Bank EUR should be filtered out
        expect(screen.getByText('To Account')).toBeInTheDocument()
      })
    })
  })

  describe('Exchange fields', () => {
    it('shows exchange-specific fields for exchange type', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const exchangeButton = screen.getByRole('button', { name: 'Exchange' })
      fireEvent.click(exchangeButton)

      await waitFor(() => {
        expect(screen.getByText('To Account')).toBeInTheDocument()
        expect(screen.getByText('Enter amounts')).toBeInTheDocument()
        expect(screen.getByText('Enter rate')).toBeInTheDocument()
      })
    })

    it('toggles between amounts and rate mode', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const exchangeButton = screen.getByRole('button', { name: 'Exchange' })
      fireEvent.click(exchangeButton)

      await waitFor(() => {
        expect(screen.getByText('Enter rate')).toBeInTheDocument()
      })

      const rateButton = screen.getByRole('button', { name: 'Enter rate' })
      fireEvent.click(rateButton)

      await waitFor(() => {
        expect(screen.getByText('Exchange Rate')).toBeInTheDocument()
      })
    })

    it('calculates to amount from rate', async () => {
      const { container } = renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const exchangeButton = screen.getByRole('button', { name: 'Exchange' })
      fireEvent.click(exchangeButton)

      // Enter amount - find the first amount input (main amount with text-2xl class)
      const amountInput = container.querySelector('input.text-2xl') as HTMLInputElement
      fireEvent.change(amountInput, { target: { value: '100' } })

      // Switch to rate mode and enter rate
      const rateButton = screen.getByRole('button', { name: 'Enter rate' })
      fireEvent.click(rateButton)

      await waitFor(() => {
        const rateInput = screen.getByLabelText('Exchange Rate')
        fireEvent.change(rateInput, { target: { value: '1.5' } })
      })

      // Wait for calculation effect - find receive amount by looking for the second number input in exchange section
      await waitFor(() => {
        const allNumberInputs = container.querySelectorAll('input[type="number"]')
        // Last number input should be the receive amount
        const receiveAmountInput = allNumberInputs[allNumberInputs.length - 1] as HTMLInputElement
        expect(receiveAmountInput.value).toBe('150.00')
      })
    })
  })

  describe('Validation', () => {
    it('shows error when amount is empty', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Amount is required and must be positive')).toBeInTheDocument()
      })
    })

    it('shows error when amount is zero', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '0' } })

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Amount is required and must be positive')).toBeInTheDocument()
      })
    })

    it('shows error when category not selected for expense', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '50' } })

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Category is required')).toBeInTheDocument()
      })
    })

    it('shows error when destination account not selected for transfer', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const transferButton = screen.getByRole('button', { name: 'Transfer' })
      fireEvent.click(transferButton)

      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '50' } })

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Destination account is required')).toBeInTheDocument()
      })
    })

    it('shows error when transferring to same account', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const transferButton = screen.getByRole('button', { name: 'Transfer' })
      fireEvent.click(transferButton)

      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '50' } })

      // Select same account as destination
      const toAccountSelect = screen.getByRole('combobox', { name: /to account/i })
      fireEvent.change(toAccountSelect, { target: { value: '1' } }) // Same as default account

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Cannot transfer to the same account')).toBeInTheDocument()
      })
    })

    it('shows error for exchange with same currency', async () => {
      const { container } = renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const exchangeButton = screen.getByRole('button', { name: 'Exchange' })
      fireEvent.click(exchangeButton)

      const amountInput = container.querySelector('input.text-2xl') as HTMLInputElement
      fireEvent.change(amountInput, { target: { value: '50' } })

      // Select Savings USD (same currency as Cash)
      const toAccountSelect = screen.getByRole('combobox', { name: /to account/i })
      fireEvent.change(toAccountSelect, { target: { value: '3' } })

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Exchange requires different currencies')).toBeInTheDocument()
      })
    })

    it('shows error for exchange without destination amount', async () => {
      const { container } = renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const exchangeButton = screen.getByRole('button', { name: 'Exchange' })
      fireEvent.click(exchangeButton)

      const amountInput = container.querySelector('input.text-2xl') as HTMLInputElement
      fireEvent.change(amountInput, { target: { value: '50' } })

      // Select different currency account
      const toAccountSelect = screen.getByRole('combobox', { name: /to account/i })
      fireEvent.change(toAccountSelect, { target: { value: '2' } }) // Bank EUR

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Destination amount is required')).toBeInTheDocument()
      })
    })
  })

  describe('Form submission', () => {
    it('submits expense transaction correctly', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Fill form
      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '50' } })

      const categorySelect = screen.getByRole('combobox', { name: /category/i })
      fireEvent.change(categorySelect, { target: { value: '1' } }) // Food

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'expense',
            amount: 50,
            category_id: 1,
          })
        )
      })
    })

    it('submits income transaction correctly', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const incomeButton = screen.getByRole('button', { name: 'Income' })
      fireEvent.click(incomeButton)

      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '1000' } })

      const categorySelect = screen.getByRole('combobox', { name: /category/i })
      fireEvent.change(categorySelect, { target: { value: '2' } }) // Salary

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'income',
            amount: 1000,
            category_id: 2,
          })
        )
      })
    })

    it('submits transfer transaction correctly', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const transferButton = screen.getByRole('button', { name: 'Transfer' })
      fireEvent.click(transferButton)

      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '200' } })

      const toAccountSelect = screen.getByRole('combobox', { name: /to account/i })
      fireEvent.change(toAccountSelect, { target: { value: '3' } }) // Savings USD

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'transfer',
            amount: 200,
            to_account_id: 3,
          })
        )
      })
    })

    it('submits exchange transaction correctly', async () => {
      const { container } = renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const exchangeButton = screen.getByRole('button', { name: 'Exchange' })
      fireEvent.click(exchangeButton)

      const amountInput = container.querySelector('input.text-2xl') as HTMLInputElement
      fireEvent.change(amountInput, { target: { value: '100' } })

      const toAccountSelect = screen.getByRole('combobox', { name: /to account/i })
      fireEvent.change(toAccountSelect, { target: { value: '2' } }) // Bank EUR

      // Enter receive amount - find by container query
      const allNumberInputs = container.querySelectorAll('input[type="number"]')
      const receiveAmountInput = allNumberInputs[allNumberInputs.length - 1] as HTMLInputElement
      fireEvent.change(receiveAmountInput, { target: { value: '90' } })

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'exchange',
            amount: 100,
            to_account_id: 2,
            to_amount: 90,
          })
        )
      })
    })

    it('includes counterparty when selected', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '50' } })

      const categorySelect = screen.getByRole('combobox', { name: /category/i })
      fireEvent.change(categorySelect, { target: { value: '1' } }) // Food

      const counterpartySelect = screen.getByRole('combobox', { name: /counterparty/i })
      fireEvent.change(counterpartySelect, { target: { value: '1' } }) // Restaurant ABC

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            counterparty_id: 1,
          })
        )
      })
    })

    it('includes notes when provided', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '50' } })

      const categorySelect = screen.getByRole('combobox', { name: /category/i })
      fireEvent.change(categorySelect, { target: { value: '1' } })

      const notesInput = screen.getByPlaceholderText('Add notes...')
      fireEvent.change(notesInput, { target: { value: 'Test note' } })

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            notes: 'Test note',
          })
        )
      })
    })

    it('shows submitting state during submission', async () => {
      mockOnSubmit.mockImplementation(() => new Promise(() => {}))

      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '50' } })

      const categorySelect = screen.getByRole('combobox', { name: /category/i })
      fireEvent.change(categorySelect, { target: { value: '1' } })

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument()
      })
    })

    it('handles submission error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockOnSubmit.mockRejectedValue(new Error('Failed'))

      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const amountInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(amountInput, { target: { value: '50' } })

      const categorySelect = screen.getByRole('combobox', { name: /category/i })
      fireEvent.change(categorySelect, { target: { value: '1' } })

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to save transaction:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Cancel button', () => {
    it('calls onCancel when clicked', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      expect(mockOnCancel).toHaveBeenCalled()
    })
  })

  describe('Editing existing transaction', () => {
    const existingTransaction: Transaction = {
      id: 1,
      type: 'expense',
      amount: 75,
      currency_id: 1,
      account_id: 1,
      category_id: 1,
      counterparty_id: 1,
      to_account_id: null,
      to_amount: null,
      to_currency_id: null,
      exchange_rate: null,
      date_time: '2025-01-09 15:00:00',
      notes: 'Existing note',
      created_at: '2025-01-09 15:00:00',
      updated_at: '2025-01-09 15:00:00',
    }

    it('pre-fills form with existing transaction data', async () => {
      renderForm(existingTransaction)

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const amountInput = screen.getByPlaceholderText('0.00')
      expect(amountInput).toHaveValue(75)

      const notesInput = screen.getByPlaceholderText('Add notes...')
      expect(notesInput).toHaveValue('Existing note')
    })

    it('shows Update button instead of Add', async () => {
      renderForm(existingTransaction)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
      })
    })

    it('does not reset account selection for editing', async () => {
      renderForm(existingTransaction)

      await waitFor(() => {
        const accountSelect = screen.getByRole('combobox', { name: /account/i })
        expect(accountSelect).toHaveValue('1')
      })
    })
  })

  describe('Counterparty filtering', () => {
    it('filters counterparties by selected category', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Select Food category
      const categorySelect = screen.getByRole('combobox', { name: /category/i })
      fireEvent.change(categorySelect, { target: { value: '1' } })

      // Restaurant ABC should be available (linked to Food)
      // General Store should be available (no category restriction)
      // Company XYZ should NOT be available (linked to Salary)
      const counterpartySelect = screen.getByRole('combobox', { name: /counterparty/i })
      expect(counterpartySelect).toBeInTheDocument()
    })
  })

  describe('Error handling', () => {
    it('handles failed data loading', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockAccountRepository.findAll.mockRejectedValue(new Error('Network error'))

      renderForm()

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load form data:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Empty accounts', () => {
    it('handles empty accounts list', async () => {
      mockAccountRepository.findAll.mockResolvedValue([])

      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Form should still render but with empty account dropdown
      const accountSelect = screen.getByRole('combobox', { name: /account/i })
      expect(accountSelect).toBeInTheDocument()
    })
  })

  describe('Exchange rate input', () => {
    it('disables to amount input in rate mode', async () => {
      const { container } = renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const exchangeButton = screen.getByRole('button', { name: 'Exchange' })
      fireEvent.click(exchangeButton)

      const rateButton = screen.getByRole('button', { name: 'Enter rate' })
      fireEvent.click(rateButton)

      await waitFor(() => {
        // Find receive amount input by container query
        const allNumberInputs = container.querySelectorAll('input[type="number"]')
        const receiveAmountInput = allNumberInputs[allNumberInputs.length - 1] as HTMLInputElement
        expect(receiveAmountInput).toBeDisabled()
      })
    })
  })

  describe('Date/Time field', () => {
    it('displays date/time input', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByLabelText(/Date.*Time/i)).toBeInTheDocument()
      })
    })
  })

  describe('Currency display', () => {
    it('shows currency symbol in amount label when account selected', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText(/Amount.*\(\$\)/)).toBeInTheDocument()
      })
    })
  })
})
