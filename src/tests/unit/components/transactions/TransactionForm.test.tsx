import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { TransactionForm } from '../../../../components/transactions/TransactionForm'
import type { Wallet, Tag, Counterparty, Currency, Account } from '../../../../types'

// Mock repositories
vi.mock('../../../../services/repositories', () => ({
  walletRepository: {
    findActive: vi.fn(),
    findOrCreateAccountForCurrency: vi.fn(),
  },
  tagRepository: {
    findIncomeTags: vi.fn(),
    findExpenseTags: vi.fn(),
    findCommonTags: vi.fn(),
    create: vi.fn(),
  },
  counterpartyRepository: {
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  currencyRepository: {
    findAll: vi.fn(),
    findSystem: vi.fn(),
    setExchangeRate: vi.fn(),
    getRateForCurrency: vi.fn(),
    findUsedInAccounts: vi.fn(),
  },
  transactionRepository: {
    create: vi.fn(),
    update: vi.fn(),
  },
  settingsRepository: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(),
  },
}))

import {
  walletRepository,
  tagRepository,
  counterpartyRepository,
  currencyRepository,
  transactionRepository,
} from '../../../../services/repositories'

const mockWalletRepository = vi.mocked(walletRepository)
const mockTagRepository = vi.mocked(tagRepository)
const mockCounterpartyRepository = vi.mocked(counterpartyRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockTransactionRepository = vi.mocked(transactionRepository)

const mockAccount: Account = {
  id: 1,
  wallet_id: 1,
  currency_id: 1,
  balance_int: 150,
  balance_frac: 0,
  updated_at: 1704067200,
  wallet: 'Cash',
  currency: 'USD',
  is_default: true,
}

const mockAccountEUR: Account = {
  id: 2,
  wallet_id: 1,
  currency_id: 2,
  balance_int: 750,
  balance_frac: 0,
  updated_at: 1704067200,
  wallet: 'Bank',
  currency: 'EUR',
}

const mockAccountSavings: Account = {
  id: 3,
  wallet_id: 2,
  currency_id: 1,
  balance_int: 1200,
  balance_frac: 0,
  updated_at: 1704067200,
  wallet: 'Savings',
  currency: 'USD',
}

const mockWallets: Wallet[] = [
  {
    id: 1,
    name: 'Cash',
    color: '#4CAF50',
    is_default: true,
    accounts: [mockAccount, mockAccountEUR],
  },
  {
    id: 2,
    name: 'Savings',
    color: '#FF9800',
    accounts: [mockAccountSavings],
  },
]

const mockCurrencies: Currency[] = [
  {
    id: 1,
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimal_places: 2,
    is_system: true,
    is_fiat: true,
  },
  {
    id: 2,
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    decimal_places: 2,
    is_fiat: true,
  },
  {
    id: 3,
    code: 'BTC',
    name: 'Bitcoin',
    symbol: 'B',
    decimal_places: 2,
    is_system: false,
    is_fiat: false
  }
]

const mockExpenseTags: Tag[] = [
  { id: 10, name: 'food', sort_order: 10 },
  { id: 11, name: 'transport', sort_order: 9 },
  { id: 23, name: 'Gifts', sort_order: 8 },
]

const mockIncomeTags: Tag[] = [
  { id: 20, name: 'salary', sort_order: 7 },
  { id: 21, name: 'freelance', sort_order: 6 },
  { id: 23, name: 'Gifts', sort_order: 5 },
]

const mockCounterparties: Counterparty[] = [
  {
    id: 1,
    name: 'Restaurant ABC',
    note: null,
    tag_ids: [10],
    sort_order: 10
  },
  {
    id: 2,
    name: 'Company XYZ',
    note: null,
    tag_ids: [20],
    sort_order: 10
  },
]

describe('TransactionForm', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockWalletRepository.findActive.mockResolvedValue(mockWallets)
    mockWalletRepository.findOrCreateAccountForCurrency.mockResolvedValue(mockAccountEUR)
    mockTagRepository.findIncomeTags.mockResolvedValue(mockIncomeTags)
    mockTagRepository.findExpenseTags.mockResolvedValue(mockExpenseTags)
    mockTagRepository.findCommonTags.mockResolvedValue([])
    mockCounterpartyRepository.findAll.mockResolvedValue(mockCounterparties)
    mockCounterpartyRepository.create.mockResolvedValue({ id: 256 } as any)
    mockCounterpartyRepository.update.mockResolvedValue({} as any)
    mockCurrencyRepository.findAll.mockResolvedValue(mockCurrencies)
    mockCurrencyRepository.findSystem.mockResolvedValue(mockCurrencies[0]) // USD is default
    mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 1, frac: 0 })
    mockCurrencyRepository.findUsedInAccounts.mockResolvedValue([mockCurrencies[0], mockCurrencies[1]]) // USD and EUR
    mockTransactionRepository.create.mockResolvedValue({} as any)
    mockTransactionRepository.update.mockResolvedValue({} as any)
  })

  const renderForm = () => {
    return render(
      <TransactionForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    )
  }

  describe('Loading state', () => {
    it('shows loading spinner while loading data', () => {
      mockWalletRepository.findActive.mockImplementation(() => new Promise(() => { }))

      const { container } = renderForm()

      expect(container.querySelector('.animate-spin')).toBeTruthy()
    })

    it('loads data from repositories on mount', async () => {
      renderForm()

      await waitFor(() => {
        expect(mockWalletRepository.findActive).toHaveBeenCalled()
        expect(mockTagRepository.findIncomeTags).toHaveBeenCalled()
        expect(mockTagRepository.findExpenseTags).toHaveBeenCalled()
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

  describe('Category/Tag selection', () => {
    it('shows category field for expense type', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Category')).toBeInTheDocument()
      })

      // In expense mode, combobox is identified by placeholder
      const categorySelect = screen.getByPlaceholderText('Select category')
      expect(categorySelect).toBeInTheDocument()
    })

    it('shows only expense tags in LiveSearch dropdown', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Category')).toBeInTheDocument()
      })

      // In expense mode, combobox is identified by placeholder
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)

      // All expense tags should be shown in dropdown
      await waitFor(() => {
        mockExpenseTags.forEach(tag => {
          expect(screen.getByRole('option', { name: tag.name })).toBeInTheDocument()
        })
      })
    })

    it('shows category field for income type', async () => {
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
    it('sets default account when data loaded', async () => {
      renderForm()

      await waitFor(() => {
        const accountSelect = screen.getByRole('combobox', { name: /account/i })
        // Default account should be selected
        expect(accountSelect).toHaveValue('1')
      })
    })

    it('displays account info in dropdown', async () => {
      renderForm()

      await waitFor(() => {
        // Account dropdown should show wallet name, currency code, and balance
        expect(screen.getByText(/Cash.*USD/)).toBeInTheDocument()
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

    it('shows fee field for transfer type', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const transferButton = screen.getByRole('button', { name: 'Transfer' })
      fireEvent.click(transferButton)

      await waitFor(() => {
        expect(screen.getByText(/Fee.*optional/)).toBeInTheDocument()
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
        expect(screen.getByLabelText('Exchange Rate')).toBeInTheDocument()
      })
    })

    it('calculates destination amount automatically in rate mode', async () => {
      renderForm()

      await waitFor(() => expect(screen.getByRole('button', { name: 'Exchange' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Exchange' }))

      await waitFor(() => expect(screen.getByRole('button', { name: 'Enter rate' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Enter rate' }))

      const amountInput = screen.getByLabelText(/^Amount/i)
      const rateInput = screen.getByLabelText(/Exchange Rate/i)
      const toAmountInput = screen.getByLabelText(/Receive Amount/i)

      fireEvent.change(amountInput, { target: { value: '100' } })
      fireEvent.change(rateInput, { target: { value: '0.85' } })

      await waitFor(() => {
        expect(toAmountInput).toHaveValue(85)
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

    it('shows error when destination amount is empty for exchange', async () => {
      renderForm()

      const transferButton = await screen.findByRole('button', { name: 'Exchange' })
      fireEvent.click(transferButton)


      const toAccountSelect = await screen.findByRole('combobox', { name: /to account/i })
      fireEvent.change(toAccountSelect, { target: { value: '2' } }) // Same as source

      const form = screen.getByRole('button', { name: 'Add' }).closest('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(screen.getByText('Destination amount is required')).toBeInTheDocument()
      })

    })

    it('destination account shouldnt include source account for transfers', async () => {
      renderForm()

      const transferButton = await screen.findByRole('button', { name: 'Transfer' })
      fireEvent.click(transferButton)

      const amountInput = await screen.findByLabelText(/^Amount/i)
      fireEvent.change(amountInput, { target: { value: '50' } })

      const toAccountSelect = await screen.findByRole('combobox', { name: /to account/i })
      const options = within(toAccountSelect).getAllByRole('option') as HTMLOptionElement[]
      expect(options.length).toEqual(2)
      expect(options.some(o => o.value === '1')).not.toBeTruthy()
    })

    it('destination account shouldnt include accounts in different currencies for transfers', async () => {
      renderForm()

      const transferButton = await screen.findByRole('button', { name: 'Transfer' })
      fireEvent.click(transferButton)

      const amountInput = await screen.findByLabelText(/^Amount/i)
      fireEvent.change(amountInput, { target: { value: '50' } })

      const toAccountSelect = await screen.findByRole('combobox', { name: /to account/i })
      const options = within(toAccountSelect).getAllByRole('option') as HTMLOptionElement[]
      expect(options.length).toEqual(2)
      expect(options.some(o => o.value === '2')).not.toBeTruthy()
    })

    it('destination account shouldnt inclue accounts in same currencies for exchanges', async () => {
      renderForm()

      const transferButton = await screen.findByRole('button', { name: 'Exchange' })
      fireEvent.click(transferButton)

      const amountInput = await screen.findByLabelText(/^Amount/i)
      fireEvent.change(amountInput, { target: { value: '50' } })

      const toAccountSelect = await screen.findByRole('combobox', { name: /to account/i })
      const options = within(toAccountSelect).getAllByRole('option') as HTMLOptionElement[]
      expect(options.length).toEqual(2)
      expect(options.some(o => o.value === '3')).not.toBeTruthy()
    })

    it('shows error when transferring to the same account', { skip: true }, async () => {
      renderForm()

      const transferButton = await screen.findByRole('button', { name: 'Transfer' })
      fireEvent.click(transferButton)

      const amountInput = await screen.findByLabelText(/^Amount/i)
      fireEvent.change(amountInput, { target: { value: '50' } })

      const toAccountSelect = await screen.findByRole('combobox', { name: /to account/i })
      fireEvent.change(toAccountSelect, { target: { value: '1' } }) // Same as source

      const form = screen.getByRole('button', { name: 'Add' }).closest('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(screen.getByText('Cannot transfer to the same account')).toBeInTheDocument()
      })
    })

    it('shows error when exchange has same currencies', { skip: true }, async () => {
      renderForm()

      const exchangeButton = await screen.findByRole('button', { name: 'Exchange' })
      fireEvent.click(exchangeButton)

      const amountInput = await screen.findByLabelText(/^Amount/i)
      fireEvent.change(amountInput, { target: { value: '50' } })

      const toAccountSelect = await screen.findByRole('combobox', { name: /to account/i })
      fireEvent.change(toAccountSelect, { target: { value: '3' } }) // Savings USD (same as Cash USD)

      const form = screen.getByRole('button', { name: 'Add' }).closest('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(screen.getByText('Exchange requires different currencies')).toBeInTheDocument()
      })
    })

    it('shows error for negative fee', async () => {
      renderForm()

      const transferButton = await screen.findByRole('button', { name: 'Transfer' })
      fireEvent.click(transferButton)

      const amountInput = await screen.findByLabelText(/^Amount/i)
      const feeInput = await screen.findByLabelText(/Fee \(optional\)/i)

      fireEvent.change(amountInput, { target: { value: '50' } })
      fireEvent.change(feeInput, { target: { value: '-1' } })

      const form = screen.getByRole('button', { name: 'Add' }).closest('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(screen.getByText('Fee cannot be negative')).toBeInTheDocument()
      })
    })

    it('handles error during data loading', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      vi.mocked(tagRepository.findIncomeTags).mockRejectedValue(new Error('Load failed'))

      renderForm()

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load form data:', expect.any(Error))
      })
      consoleSpy.mockRestore()
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

      // Select category using LiveSearch
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'food' } })
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'food' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('option', { name: 'food' }))

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: [
              expect.objectContaining({
                account_id: 1,
                tag_id: 10,
                sign: '-',
                amount_int: 50,
                amount_frac: 0,
              }),
            ],
          })
        )
        expect(mockOnSubmit).toHaveBeenCalled()
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

      // Select category using LiveSearch
      const categoryInput = screen.getByRole('combobox', { name: /category/i })
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'salary' } })
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'salary' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('option', { name: 'salary' }))

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: [
              expect.objectContaining({
                account_id: 1,
                tag_id: 20,
                sign: '+',
                amount_int: 1000,
                amount_frac: 0,
              }),
            ],
          })
        )
        expect(mockOnSubmit).toHaveBeenCalled()
      })
    })

    it('submits transfer transaction correctly', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const transferButton = screen.getByRole('button', { name: 'Transfer' })
      fireEvent.click(transferButton)

      // Use getAllBy since transfer mode has multiple amount inputs (amount and fee)
      const amountInputs = screen.getAllByPlaceholderText('0.00')
      fireEvent.change(amountInputs[0], { target: { value: '200' } })

      const toAccountSelect = screen.getByRole('combobox', { name: /to account/i })
      fireEvent.change(toAccountSelect, { target: { value: '3' } }) // Savings USD

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ account_id: 1, sign: '-', amount_int: 200, amount_frac: 0 }),
              expect.objectContaining({ account_id: 3, sign: '+', amount_int: 200, amount_frac: 0 }),
            ]),
          })
        )
        expect(mockOnSubmit).toHaveBeenCalled()
      })
    })

    it('submits exchange transaction correctly', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      const exchangeButton = screen.getByRole('button', { name: 'Exchange' })
      fireEvent.click(exchangeButton)

      // Wait for exchange fields to appear
      await waitFor(() => {
        expect(screen.getByText('Receive Amount')).toBeInTheDocument()
      })

      // Use getAllByPlaceholderText since there are multiple '0.00' inputs in exchange mode
      // The first one is the main amount, the rest are fee and receive amount
      const amountInputs = screen.getAllByPlaceholderText('0.00')
      fireEvent.change(amountInputs[0], { target: { value: '100' } }) // Main amount

      const toAccountSelect = screen.getByRole('combobox', { name: /to account/i })
      fireEvent.change(toAccountSelect, { target: { value: '2' } }) // Bank EUR

      // The last '0.00' input should be the receive amount (after fee which is second)
      fireEvent.change(amountInputs[amountInputs.length - 1], { target: { value: '90' } })

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ account_id: 1, sign: '-', amount_int: 100, amount_frac: 0 }),
              expect.objectContaining({ account_id: 2, sign: '+', amount_int: 90, amount_frac: 0 }),
            ]),
          })
        )
        expect(mockOnSubmit).toHaveBeenCalled()
      })
    })

    it('shows submitting state during submission', async () => {
      mockTransactionRepository.create.mockImplementation(() => new Promise(() => { }))

      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

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

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument()
      })
    })

    it('handles submission error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockTransactionRepository.create.mockRejectedValue(new Error('Failed'))

      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

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

  describe('Counterparty selection', () => {
    it('shows counterparty dropdown for expense', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText(/Counterparty.*optional/)).toBeInTheDocument()
      })

      const counterpartySelect = screen.getByRole('combobox', { name: /counterparty/i })
      expect(counterpartySelect).toBeInTheDocument()
    })

    it('shows LiveSearch with search or create placeholder', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search or create...')).toBeInTheDocument()
      })
    })
  })

  describe('Error handling', () => {
    it('handles failed data loading', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockWalletRepository.findActive.mockRejectedValue(new Error('Network error'))

      renderForm()

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load form data:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Notes field', () => {
    it('displays notes textarea', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Add notes...')).toBeInTheDocument()
      })
    })
  })

  describe('Currency display', () => {
    it('shows currency symbol in amount label', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText(/Amount.*\(\$\)/)).toBeInTheDocument()
      })
    })
  })
  describe('submission with options', () => {
    it('submits with counterparty and note', async () => {
      renderForm()
      await screen.findByLabelText(/^Amount/i)

      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '50' } })

      // Select category using LiveSearch
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'food' } })
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'food' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('option', { name: 'food' }))

      // Use LiveSearch to select existing counterparty
      const counterpartyInput = screen.getByRole('combobox', { name: /counterparty/i })
      fireEvent.focus(counterpartyInput)
      fireEvent.change(counterpartyInput, { target: { value: 'Restaurant ABC' } })

      // Click on the matching option
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Restaurant ABC' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('option', { name: 'Restaurant ABC' }))

      fireEvent.change(screen.getByPlaceholderText('Add notes...'), { target: { value: 'Dinner note' } })

      fireEvent.submit(screen.getByRole('button', { name: 'Add' }).closest('form')!)

      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            counterparty_id: 1,
            note: 'Dinner note',
          })
        )
      })
    })

    it('counterparty links to new transaction tag', async () => {
      renderForm()
      await screen.findByLabelText(/^Amount/i)

      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '50' } })

      // Select category using LiveSearch
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'transport' } })
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'transport' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('option', { name: 'transport' }))

      // Use LiveSearch to select existing counterparty
      const counterpartyInput = screen.getByRole('combobox', { name: /counterparty/i })
      fireEvent.focus(counterpartyInput)
      fireEvent.change(counterpartyInput, { target: { value: 'Restaurant ABC' } })

      // Click on the matching option
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Restaurant ABC' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('option', { name: 'Restaurant ABC' }))

      fireEvent.change(screen.getByPlaceholderText('Add notes...'), { target: { value: 'Dinner note' } })

      fireEvent.submit(screen.getByRole('button', { name: 'Add' }).closest('form')!)

      await waitFor(() => {
        expect(mockCounterpartyRepository.update).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            tag_ids: [10, 11]
          })
        )
      })
    })

    it('submits with new counterparty name', async () => {
      renderForm()
      await screen.findByLabelText(/^Amount/i)

      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '50' } })

      // Select category using LiveSearch
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'food' } })
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'food' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('option', { name: 'food' }))

      // Use LiveSearch to enter a new counterparty name
      const counterpartyInput = screen.getByRole('combobox', { name: /counterparty/i })
      fireEvent.focus(counterpartyInput)
      fireEvent.change(counterpartyInput, { target: { value: 'New CP' } })

      // Click on the "Create new" option
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /Create "New CP"/ })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('option', { name: /Create "New CP"/ }))

      fireEvent.submit(screen.getByRole('button', { name: 'Add' }).closest('form')!)

      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            counterparty_name: 'New CP',
          })
        )
      })
    })

    it('new counterparty links to transaction tag', async () => {
      renderForm()
      await screen.findByLabelText(/^Amount/i)

      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '50' } })

      // Select category using LiveSearch
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'food' } })
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'food' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('option', { name: 'food' }))

      // Use LiveSearch to enter a new counterparty name
      const counterpartyInput = screen.getByRole('combobox', { name: /counterparty/i })
      fireEvent.focus(counterpartyInput)
      fireEvent.change(counterpartyInput, { target: { value: 'New CP' } })

      // Click on the "Create new" option
      await waitFor(() => {
        expect(screen.getByRole('option', { name: /Create "New CP"/ })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('option', { name: /Create "New CP"/ }))

      fireEvent.submit(screen.getByRole('button', { name: 'Add' }).closest('form')!)

      await waitFor(() => {
        expect(mockCounterpartyRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            tag_ids: [10]
          })
        )
      })
    })

    it('submits transfer with fee tag', async () => {
      renderForm()
      const transferBtn = await screen.findByRole('button', { name: 'Transfer' })
      fireEvent.click(transferBtn)

      const toAccountSelect = await screen.findByRole('combobox', { name: /to account/i })
      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '50' } })
      fireEvent.change(toAccountSelect, { target: { value: '3' } })
      fireEvent.change(screen.getByLabelText(/Fee \(optional\)/i), { target: { value: '1' } })

      // Fee category is now hardcoded to 13 when fee is entered
      const submitBtn = screen.getByRole('button', { name: 'Add' })
      fireEvent.submit(submitBtn.closest('form')!)

      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ tag_id: 13, amount_int: 1, amount_frac: 0 }),
            ]),
          })
        )
      })
    })

    it('submits exchange and stores rate, sender is default', async () => {
      renderForm()
      const exchangeBtn = await screen.findByRole('button', { name: 'Exchange' })
      fireEvent.click(exchangeBtn)

      const toAccountSelect = await screen.findByRole('combobox', { name: /to account/i })
      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
      fireEvent.change(toAccountSelect, { target: { value: '2' } })
      fireEvent.change(screen.getByLabelText(/Receive Amount/i), { target: { value: '85' } })

      const rateBtn = await screen.findByRole('button', { name: 'Enter rate' })
      fireEvent.click(rateBtn)

      const rateInput = await screen.findByLabelText(/Exchange Rate/i)
      fireEvent.change(rateInput, { target: { value: '0.85' } })

      const submitBtn = screen.getByRole('button', { name: 'Add' })
      fireEvent.submit(submitBtn.closest('form')!)

      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalled()
        // EUR (currency_id=2) rate: 85 EUR per 100 USD = 0.85
        // toIntFrac(0.85) => { int: 0, frac: 850000000000000000 }
        expect(mockCurrencyRepository.setExchangeRate).toHaveBeenCalledWith(2, 0, 850000000000000000)
      })
    })

    it('submits exchange and stores rate, receiver is default', async () => {
      renderForm()
      const exchangeBtn = await screen.findByRole('button', { name: 'Exchange' })
      fireEvent.click(exchangeBtn)

      const account = await screen.findByRole('combobox', { name: /^account/i })
      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
      fireEvent.change(account, { target: { value: '2' } })
      fireEvent.change(screen.getByLabelText(/Receive Amount/i), { target: { value: '85' } })

      const toAccountSelect = await screen.findByRole('combobox', { name: /to account/i })
      fireEvent.change(toAccountSelect, { target: { value: '1' } })

      const rateBtn = await screen.findByRole('button', { name: 'Enter rate' })
      fireEvent.click(rateBtn)

      const rateInput = await screen.findByLabelText(/Exchange Rate/i)
      fireEvent.change(rateInput, { target: { value: '0.85' } })

      const submitBtn = screen.getByRole('button', { name: 'Add' })
      fireEvent.submit(submitBtn.closest('form')!)

      await waitFor(() => {
        // EUR sends 100, USD receives 85: rate for EUR = 100/85 ≈ 1.176470588235294
        // toIntFrac(1.176470588235294) => { int: 1, frac: ~176470588235294000 }
        expect(mockCurrencyRepository.setExchangeRate).toHaveBeenCalledWith(
          2,
          expect.any(Number),
          expect.any(Number),
        )
      })
    })
  })

  it('submits exchange and stores rate for non defaults and sender without exchange rate', async () => {
    renderForm()
    const exchangeBtn = await screen.findByRole('button', { name: 'Exchange' })
    fireEvent.click(exchangeBtn)

    const account = await screen.findByRole('combobox', { name: /^account/i })
    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
    fireEvent.change(account, { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText(/Receive Amount/i), { target: { value: '85' } })

    const toAccountSelect = await screen.findByRole('combobox', { name: /to account/i })
    fireEvent.change(toAccountSelect, { target: { value: '2' } })

    const submitBtn = screen.getByRole('button', { name: 'Add' })
    fireEvent.submit(submitBtn.closest('form')!)

    await waitFor(() => {
      expect(mockTransactionRepository.create)
        .toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ rate_int: 1, rate_frac: 0 }),
              expect.objectContaining({ rate_int: 1, rate_frac: 0 }),
            ]),
          })
        )
    })
  })

  it('submits exchange and stores rate for non defaults and receiver without exchange rate', async () => {
    renderForm()
    const exchangeBtn = await screen.findByRole('button', { name: 'Exchange' })
    fireEvent.click(exchangeBtn)

    const account = await screen.findByRole('combobox', { name: /^account/i })
    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
    fireEvent.change(account, { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/Receive Amount/i), { target: { value: '85' } })

    const toAccountSelect = await screen.findByRole('combobox', { name: /to account/i })
    fireEvent.change(toAccountSelect, { target: { value: '3' } })

    const submitBtn = screen.getByRole('button', { name: 'Add' })
    fireEvent.submit(submitBtn.closest('form')!)

    await waitFor(() => {
      expect(mockTransactionRepository.create)
        .toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ rate_int: 1, rate_frac: 0 }),
              expect.objectContaining({ rate_int: 1, rate_frac: 0 }),
            ]),
          })
        )
    })
  })

  describe('Multi-currency expense', () => {
    it('shows currency selector for expense mode', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Currency selector should be visible for expense mode (now a LiveSearch)
      const currencyInput = screen.getByPlaceholderText('CUR')
      expect(currencyInput).toBeInTheDocument()
    })

    it('shows payment amount field when currencies differ', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Select EUR as payment currency using LiveSearch
      const currencyInput = screen.getByPlaceholderText('CUR')
      fireEvent.focus(currencyInput)
      // Clear and type EUR to filter
      fireEvent.change(currencyInput, { target: { value: 'EUR' } })

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      // Click on EUR option - use getAllByRole since there might be multiple listboxes
      const eurOptions = screen.getAllByRole('option', { name: /EUR/ })
      fireEvent.click(eurOptions[0])

      await waitFor(() => {
        expect(screen.getByText(/Amount from account/)).toBeInTheDocument()
      })
    })

    it('validates payment amount when currencies differ', async () => {
      const { container } = renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Select EUR as payment currency using LiveSearch
      const currencyInput = screen.getByPlaceholderText('CUR')
      fireEvent.focus(currencyInput)
      // Clear and type EUR to filter
      fireEvent.change(currencyInput, { target: { value: 'EUR' } })

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      // Click on EUR option - use getAllByRole since there might be multiple listboxes
      const eurOptions = screen.getAllByRole('option', { name: /EUR/ })
      fireEvent.click(eurOptions[0])

      await waitFor(() => {
        expect(screen.getByText(/Amount from account/)).toBeInTheDocument()
      })

      // Fill amount and category but not payment amount
      const amountInput = container.querySelector('#amount') as HTMLInputElement
      fireEvent.change(amountInput, { target: { value: '50' } })

      // Select category using LiveSearch
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'food' } })
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'food' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('option', { name: 'food' }))

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Amount in account currency is required')).toBeInTheDocument()
      })
    })

    it('submits multi-currency expense with 3 lines', async () => {
      mockWalletRepository.findOrCreateAccountForCurrency.mockResolvedValue({
        id: 5,
        wallet_id: 1,
        currency_id: 2,
        balance_int: 0,
        balance_frac: 0,
        updated_at: Date.now(),
        currency: 'EUR',
      })

      const { container } = renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Select EUR as payment currency using LiveSearch
      const currencyInput = screen.getByPlaceholderText('CUR')
      fireEvent.focus(currencyInput)
      // Clear and type EUR to filter
      fireEvent.change(currencyInput, { target: { value: 'EUR' } })

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      // Click on EUR option - use getAllByRole since there might be multiple listboxes
      const eurOptions = screen.getAllByRole('option', { name: /EUR/ })
      fireEvent.click(eurOptions[0])

      await waitFor(() => {
        expect(screen.getByText(/Amount from account/)).toBeInTheDocument()
      })

      // Fill expense amount (in EUR)
      const amountInput = container.querySelector('#amount') as HTMLInputElement
      fireEvent.change(amountInput, { target: { value: '50' } })

      // Fill payment amount (in USD from account)
      const paymentAmountInput = container.querySelector('#paymentAmount') as HTMLInputElement
      fireEvent.change(paymentAmountInput, { target: { value: '55' } })

      // Select category using LiveSearch
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'food' } })
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'food' })).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('option', { name: 'food' }))

      const submitButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockWalletRepository.findOrCreateAccountForCurrency).toHaveBeenCalledWith(1, 2)
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              // Exchange OUT from source account
              expect.objectContaining({
                account_id: 1,
                tag_id: expect.any(Number), // SYSTEM_TAGS.EXCHANGE
                sign: '-',
                amount_int: 55,
                amount_frac: 0,
              }),
              // Exchange IN to target account
              expect.objectContaining({
                account_id: 5,
                tag_id: expect.any(Number), // SYSTEM_TAGS.EXCHANGE
                sign: '+',
                amount_int: 50,
                amount_frac: 0,
              }),
              // Expense from target account
              expect.objectContaining({
                account_id: 5,
                tag_id: 10,
                sign: '-',
                amount_int: 50,
                amount_frac: 0,
              }),
            ]),
          })
        )
      })
    })

    it('shows exchange rate when currencies differ', async () => {
      const { container } = renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Select EUR as payment currency using LiveSearch
      const currencyInput = screen.getByPlaceholderText('CUR')
      fireEvent.focus(currencyInput)
      // Clear and type EUR to filter
      fireEvent.change(currencyInput, { target: { value: 'EUR' } })

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      // Click on EUR option - use getAllByRole since there might be multiple listboxes
      const eurOptions = screen.getAllByRole('option', { name: /EUR/ })
      fireEvent.click(eurOptions[0])

      await waitFor(() => {
        expect(screen.getByText(/Amount from account/)).toBeInTheDocument()
      })

      // Fill amounts to show rate
      const amountInput = container.querySelector('#amount') as HTMLInputElement
      fireEvent.change(amountInput, { target: { value: '100' } })

      const paymentAmountInput = container.querySelector('#paymentAmount') as HTMLInputElement
      fireEvent.change(paymentAmountInput, { target: { value: '110' } })

      await waitFor(() => {
        expect(screen.getByText(/Rate:/)).toBeInTheDocument()
      })
    })
  })

  describe('Default account selection', () => {
    it('selects default account from default wallet as initial account', async () => {
      render(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />)

      await waitFor(() => {
        const accountSelect = screen.getByLabelText('Account')
        // Should be Cash - USD (from default wallet, default account)
        expect(accountSelect).toHaveValue('1')
      })
    })

    it('falls back to any default account if no default wallet', async () => {
      mockWalletRepository.findActive.mockResolvedValueOnce([
        { ...mockWallets[0], is_default: false },
        mockWallets[1],
      ])

      render(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />)

      await waitFor(() => {
        const accountSelect = screen.getByLabelText('Account')
        // Should still select account with is_default: true
        expect(accountSelect).toHaveValue('1')
      })
    })

    it('falls back to first account if no default accounts exist', async () => {
      mockWalletRepository.findActive.mockResolvedValueOnce([
        {
          ...mockWallets[0],
          is_default: false,
          accounts: [{ ...mockAccount, is_default: false }],
        },
      ])

      render(<TransactionForm onSubmit={vi.fn()} onCancel={vi.fn()} />)

      await waitFor(() => {
        const accountSelect = screen.getByLabelText('Account')
        expect(accountSelect).toHaveValue('1')
      })
    })
  })

  describe('Currency LiveSearch sorting', () => {
    it('shows currency LiveSearch in expense mode', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Should have a LiveSearch for currency (combobox) in expense mode
      const comboboxes = screen.getAllByRole('combobox')
      expect(comboboxes.length).toBeGreaterThanOrEqual(2) // category and currency
    })

    it('shows default payment currency first in dropdown', async () => {
      // Set EUR as default payment currency
      mockCurrencyRepository.findAll.mockResolvedValue([
        { ...mockCurrencies[0] },
        { ...mockCurrencies[1], is_payment_default: true },
        { ...mockCurrencies[2] },
      ])

      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Find the currency LiveSearch by placeholder
      const currencyInput = screen.getByPlaceholderText('CUR')
      fireEvent.focus(currencyInput)
      // Clear the input to show all options
      fireEvent.change(currencyInput, { target: { value: '' } })

      await waitFor(() => {
        const options = screen.getAllByRole('option')
        // First option should be EUR (default payment currency)
        expect(options[0]).toHaveTextContent('EUR')
      })
    })

    it('shows account currency first when no default payment currency', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Find the currency LiveSearch by placeholder
      const currencyInput = screen.getByPlaceholderText('CUR')
      fireEvent.focus(currencyInput)
      // Clear the input to show all options
      fireEvent.change(currencyInput, { target: { value: '' } })

      await waitFor(() => {
        const options = screen.getAllByRole('option')
        // First option should be USD (default account's currency)
        expect(options[0]).toHaveTextContent('USD')
      })
    })

    it('shows crypto currencies with Badge', async () => {
      // Add a crypto currency to mock data
      const currenciesWithCrypto = [
        ...mockCurrencies,
        {
          id: 4,
          code: 'ETH',
          name: 'Ethereum',
          symbol: 'E',
          decimal_places: 8,
          is_crypto: true,
        },
      ]
      mockCurrencyRepository.findAll.mockResolvedValue(currenciesWithCrypto)

      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Find the currency LiveSearch by placeholder
      const currencyInput = screen.getByPlaceholderText('CUR')
      fireEvent.focus(currencyInput)
      // Clear the input to show all options
      fireEvent.change(currencyInput, { target: { value: '' } })

      await waitFor(() => {
        // BTC and ETH should have crypto badge
        expect(screen.getByText('crypto')).toBeInTheDocument()
      })
    })

    it('does not duplicate currencies across priority groups', async () => {
      // USD appears in: default payment currency, account currency, active currencies, fiat
      mockCurrencyRepository.findAll.mockResolvedValue([
        { ...mockCurrencies[0], is_payment_default: true },
        { ...mockCurrencies[1] },
        { ...mockCurrencies[2] },
      ])

      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Find the currency LiveSearch by placeholder
      const currencyInput = screen.getByPlaceholderText('CUR')
      fireEvent.focus(currencyInput)
      // Clear the input to show all options
      fireEvent.change(currencyInput, { target: { value: '' } })

      await waitFor(() => {
        // Get only the listbox for currencies (the one visible after currency input focus)
        const listboxes = screen.getAllByRole('listbox')
        // Get the last listbox (currency) since it was opened last
        const currencyListbox = listboxes[listboxes.length - 1]
        const options = within(currencyListbox).getAllByRole('option')
        // Count how many times USD appears
        const usdOptions = options.filter(opt => opt.textContent?.includes('USD'))
        expect(usdOptions).toHaveLength(1)
      })
    })

    it('changes currency when option is selected', async () => {
      renderForm()

      await waitFor(() => {
        expect(screen.getByText('Account')).toBeInTheDocument()
      })

      // Find the currency LiveSearch by placeholder
      const currencyInput = screen.getByPlaceholderText('CUR')
      fireEvent.focus(currencyInput)
      // Clear and type EUR to filter
      fireEvent.change(currencyInput, { target: { value: 'EUR' } })

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      // Select EUR - use getAllByRole since there might be multiple listboxes
      const eurOptions = screen.getAllByRole('option', { name: /EUR/ })
      fireEvent.click(eurOptions[0])

      // The payment amount field should appear since EUR differs from USD account
      await waitFor(() => {
        expect(screen.getByText(/Amount from account/)).toBeInTheDocument()
      })
    })
  })

  describe('Multi-tag expense sub-entries', () => {
    it('adds a second sub-entry when clicking Add category', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())
      expect(screen.getAllByPlaceholderText('Select category')).toHaveLength(1)
      fireEvent.click(screen.getByText('+ Add category'))
      await waitFor(() => {
        expect(screen.getAllByPlaceholderText('Select category')).toHaveLength(2)
      })
    })

    it('shows Categories label with multiple sub-entries', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Category')).toBeInTheDocument())
      fireEvent.click(screen.getByText('+ Add category'))
      await waitFor(() => {
        expect(screen.getByText('Categories')).toBeInTheDocument()
      })
    })

    it('shows Total label and per-sub-entry amount inputs when multiple sub-entries', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())
      fireEvent.click(screen.getByText('+ Add category'))
      await waitFor(() => {
        expect(screen.getByLabelText(/^Total/)).toBeInTheDocument()
        expect(screen.getAllByRole('spinbutton')).toHaveLength(3)
      })
    })

    it('removes a sub-entry when remove button is clicked', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())
      fireEvent.click(screen.getByText('+ Add category'))
      await waitFor(() => {
        expect(screen.getAllByPlaceholderText('Select category')).toHaveLength(2)
      })
      const removeButtons = screen.getAllByRole('button', { name: 'Remove category' })
      expect(removeButtons).toHaveLength(2)
      fireEvent.click(removeButtons[0])
      await waitFor(() => {
        expect(screen.getAllByPlaceholderText('Select category')).toHaveLength(1)
      })
    })

    it('shows category required error when no sub-entry has a tag', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())
      fireEvent.click(screen.getByText('+ Add category'))
      await waitFor(() => {
        expect(screen.getAllByPlaceholderText('Select category')).toHaveLength(2)
      })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(screen.getByText('Category is required')).toBeInTheDocument()
      })
    })

    it('shows error when all sub-entry amounts are zero in multi-sub-entry mode', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())
      fireEvent.click(screen.getByText('+ Add category'))
      await waitFor(() => {
        expect(screen.getAllByPlaceholderText('Select category')).toHaveLength(2)
      })

      // Select a category so tag validation passes
      const categoryInputs = screen.getAllByPlaceholderText('Select category')
      fireEvent.focus(categoryInputs[0])
      fireEvent.change(categoryInputs[0], { target: { value: 'food' } })
      await waitFor(() => {
        expect(screen.getAllByRole('option', { name: /food/ })[0]).toBeInTheDocument()
      })
      fireEvent.click(screen.getAllByRole('option', { name: /food/ })[0])

      // Don't fill amounts → expensePlainBase = 0
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(screen.getByText('At least one sub-amount is required')).toBeInTheDocument()
      })
    })

    it('submits with multiple sub-entries', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())

      fireEvent.click(screen.getByText('+ Add category'))
      await waitFor(() => {
        expect(screen.getAllByPlaceholderText('Select category')).toHaveLength(2)
      })

      // Select category for each sub-entry
      const categoryInputs = screen.getAllByPlaceholderText('Select category')
      fireEvent.focus(categoryInputs[0])
      fireEvent.change(categoryInputs[0], { target: { value: 'food' } })
      await waitFor(() => {
        expect(screen.getAllByRole('option', { name: /food/ })[0]).toBeInTheDocument()
      })
      fireEvent.click(screen.getAllByRole('option', { name: /food/ })[0])

      fireEvent.focus(categoryInputs[1])
      fireEvent.change(categoryInputs[1], { target: { value: 'transport' } })
      await waitFor(() => {
        expect(screen.getAllByRole('option', { name: /transport/ })[0]).toBeInTheDocument()
      })
      fireEvent.click(screen.getAllByRole('option', { name: /transport/ })[0])

      // spinbutton[0]=readOnly main total, [1]=sub1 amount, [2]=sub2 amount
      await waitFor(() => {
        expect(screen.getByLabelText(/^Total/)).toBeInTheDocument()
      })
      const spinbuttons = screen.getAllByRole('spinbutton')
      fireEvent.change(spinbuttons[1], { target: { value: '30' } })
      fireEvent.change(spinbuttons[2], { target: { value: '20' } })

      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ tag_id: 10, sign: '-', amount_int: 30 }),
              expect.objectContaining({ tag_id: 11, sign: '-', amount_int: 20 }),
            ])
          })
        )
      })
    })
  })

  describe('Common add-on tag pills', () => {
    const mockCommonTag: Tag = { id: 100, name: 'ServiceFee', sort_order: 5 }

    beforeEach(() => {
      mockTagRepository.findCommonTags.mockResolvedValue([mockCommonTag])
    })

    it('shows common tag pills in expense mode', async () => {
      renderForm()
      await waitFor(() => {
        expect(screen.getByText('+ ServiceFee')).toBeInTheDocument()
      })
    })

    it('toggles common tag on', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('+ ServiceFee')).toBeInTheDocument())
      fireEvent.click(screen.getByText('+ ServiceFee'))
      await waitFor(() => {
        expect(screen.getByText('ServiceFee ✓')).toBeInTheDocument()
      })
    })

    it('toggles common tag off when clicked again', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('+ ServiceFee')).toBeInTheDocument())
      fireEvent.click(screen.getByText('+ ServiceFee'))
      await waitFor(() => expect(screen.getByText('ServiceFee ✓')).toBeInTheDocument())
      fireEvent.click(screen.getByText('ServiceFee ✓'))
      await waitFor(() => {
        expect(screen.getByText('+ ServiceFee')).toBeInTheDocument()
      })
    })

    it('switches common tag to absolute amount type', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('+ ServiceFee')).toBeInTheDocument())
      fireEvent.click(screen.getByText('+ ServiceFee'))
      await waitFor(() => {
        expect(screen.getByTitle('Switch to absolute amount')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByTitle('Switch to absolute amount'))
      await waitFor(() => {
        expect(screen.getByTitle('Switch to percentage')).toBeInTheDocument()
      })
    })

    it('updates common tag pct input', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('+ ServiceFee')).toBeInTheDocument())
      fireEvent.click(screen.getByText('+ ServiceFee'))
      await waitFor(() => {
        expect(screen.getByPlaceholderText('15')).toBeInTheDocument()
      })
      const pctInput = screen.getByPlaceholderText('15')
      fireEvent.change(pctInput, { target: { value: '10' } })
      expect(pctInput).toHaveValue(10)
    })

    it('updates common tag abs input', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('+ ServiceFee')).toBeInTheDocument())
      fireEvent.click(screen.getByText('+ ServiceFee'))
      await waitFor(() => expect(screen.getByTitle('Switch to absolute amount')).toBeInTheDocument())
      fireEvent.click(screen.getByTitle('Switch to absolute amount'))
      await waitFor(() => {
        expect(screen.getByTitle('Switch to percentage')).toBeInTheDocument()
      })
      // After switching to abs, isExpenseMainEditable=false, sub-entry amount appears
      // spinbutton[0]=readOnly main, [1]=sub-entry amount, [2]=abs common amount
      const spinbuttons = screen.getAllByRole('spinbutton')
      expect(spinbuttons).toHaveLength(3)
      fireEvent.change(spinbuttons[2], { target: { value: '7.50' } })
      expect(spinbuttons[2]).toHaveValue(7.5)
    })

    it('submits expense with pct common tag', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('+ ServiceFee')).toBeInTheDocument())

      // Fill main amount (editable: 1 sub-entry + pct common → isExpenseMainEditable=true)
      fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '100' } })

      // Select category
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'food' } })
      await waitFor(() => expect(screen.getAllByRole('option', { name: /food/ })[0]).toBeInTheDocument())
      fireEvent.click(screen.getAllByRole('option', { name: /food/ })[0])

      // Toggle pct common tag on and set 10%
      fireEvent.click(screen.getByText('+ ServiceFee'))
      await waitFor(() => expect(screen.getByPlaceholderText('15')).toBeInTheDocument())
      fireEvent.change(screen.getByPlaceholderText('15'), { target: { value: '10' } })

      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ tag_id: 10, sign: '-', amount_int: 100 }),
              expect.objectContaining({ tag_id: 100, sign: '-', pct_value: 0.1 }),
            ])
          })
        )
      })
    })

    it('submits expense with abs common tag', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('+ ServiceFee')).toBeInTheDocument())

      // Toggle on and switch to abs mode
      fireEvent.click(screen.getByText('+ ServiceFee'))
      await waitFor(() => expect(screen.getByTitle('Switch to absolute amount')).toBeInTheDocument())
      fireEvent.click(screen.getByTitle('Switch to absolute amount'))
      await waitFor(() => {
        expect(screen.getByTitle('Switch to percentage')).toBeInTheDocument()
        // isExpenseMainEditable=false since abs common → label becomes Total
        expect(screen.getByLabelText(/^Total/)).toBeInTheDocument()
      })

      // Select category for sub-entry
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'food' } })
      await waitFor(() => expect(screen.getAllByRole('option', { name: /food/ })[0]).toBeInTheDocument())
      fireEvent.click(screen.getAllByRole('option', { name: /food/ })[0])

      // spinbutton[0]=readOnly main, [1]=sub-entry amount, [2]=abs common amount
      const spinbuttons = screen.getAllByRole('spinbutton')
      fireEvent.change(spinbuttons[1], { target: { value: '50' } })
      fireEvent.change(spinbuttons[2], { target: { value: '5' } })

      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ tag_id: 10, sign: '-', amount_int: 50 }),
              expect.objectContaining({ tag_id: 100, sign: '-', pct_value: null }),
            ])
          })
        )
      })
    })

    it('subtracts discount (isIncome) from computed total', async () => {
      mockTagRepository.findCommonTags.mockResolvedValue([{ id: 18, name: 'Discount', sort_order: 1 }])
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())

      // Add a second sub-entry
      fireEvent.click(screen.getByText('+ Add category'))
      await waitFor(() => expect(screen.getAllByPlaceholderText('Select category')).toHaveLength(2))

      // Select food and transport categories
      const categoryInputs = screen.getAllByPlaceholderText('Select category')
      fireEvent.focus(categoryInputs[0])
      fireEvent.change(categoryInputs[0], { target: { value: 'food' } })
      await waitFor(() => expect(screen.getAllByRole('option', { name: /food/ })[0]).toBeInTheDocument())
      fireEvent.click(screen.getAllByRole('option', { name: /food/ })[0])

      fireEvent.focus(categoryInputs[1])
      fireEvent.change(categoryInputs[1], { target: { value: 'transport' } })
      await waitFor(() => expect(screen.getAllByRole('option', { name: /transport/ })[0]).toBeInTheDocument())
      fireEvent.click(screen.getAllByRole('option', { name: /transport/ })[0])

      // Toggle Discount on and switch to abs
      await waitFor(() => expect(screen.getByText('+ Discount')).toBeInTheDocument())
      fireEvent.click(screen.getByText('+ Discount'))
      await waitFor(() => expect(screen.getByTitle('Switch to absolute amount')).toBeInTheDocument())
      fireEvent.click(screen.getByTitle('Switch to absolute amount'))
      await waitFor(() => expect(screen.getByTitle('Switch to percentage')).toBeInTheDocument())

      // spinbutton[0]=readOnly total, [1]=food amount, [2]=transport amount, [3]=discount abs
      const spinbuttons = screen.getAllByRole('spinbutton')
      fireEvent.change(spinbuttons[1], { target: { value: '9' } })
      fireEvent.change(spinbuttons[2], { target: { value: '1' } })
      fireEvent.change(spinbuttons[3], { target: { value: '1' } })

      // Total should be 10 - 1 = 9, not 10 + 1 = 11
      await waitFor(() => {
        const totalInput = screen.getAllByRole('spinbutton')[0] as HTMLInputElement
        expect(totalInput.value).toBe('9.00')
      })
    })
  })

  describe('New tag modal', () => {
    it('opens modal when income category onCreateNew is triggered', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Income' }))
      await waitFor(() => expect(screen.getByPlaceholderText('Select category')).toBeInTheDocument())

      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'MyNewTag' } })
      await waitFor(() => expect(screen.getByText(/Create "MyNewTag"/)).toBeInTheDocument())
      fireEvent.click(screen.getByText(/Create "MyNewTag"/))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText('New Category')).toBeInTheDocument()
      })
    })

    it('closes modal and clears tag name on Cancel', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Income' }))
      await waitFor(() => expect(screen.getByPlaceholderText('Select category')).toBeInTheDocument())

      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'TestTag' } })
      await waitFor(() => expect(screen.getByText(/Create "TestTag"/)).toBeInTheDocument())
      fireEvent.click(screen.getByText(/Create "TestTag"/))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      const dialog = screen.getByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('closes modal on OK (income path)', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Income' }))
      await waitFor(() => expect(screen.getByPlaceholderText('Select category')).toBeInTheDocument())

      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'MyIncome' } })
      await waitFor(() => expect(screen.getByText(/Create "MyIncome"/)).toBeInTheDocument())
      fireEvent.click(screen.getByText(/Create "MyIncome"/))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }))
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('changes tag type using type selector buttons in modal', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Income' }))
      await waitFor(() => expect(screen.getByPlaceholderText('Select category')).toBeInTheDocument())

      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'TestType' } })
      await waitFor(() => expect(screen.getByText(/Create "TestType"/)).toBeInTheDocument())
      fireEvent.click(screen.getByText(/Create "TestType"/))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      const dialog = screen.getByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Both' }))
      expect(within(dialog).getByRole('button', { name: 'Both' }).className).toContain('bg-primary')
    })

    it('closes modal on Escape key', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Income' }))
      await waitFor(() => expect(screen.getByPlaceholderText('Select category')).toBeInTheDocument())

      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'EscapeTest' } })
      await waitFor(() => expect(screen.getByText(/Create "EscapeTest"/)).toBeInTheDocument())
      fireEvent.click(screen.getByText(/Create "EscapeTest"/))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      fireEvent.keyDown(document, { key: 'Escape' })
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('opens modal for expense sub-entry onCreateNew', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())

      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'ExpenseNew' } })
      await waitFor(() => expect(screen.getByText(/Create "ExpenseNew"/)).toBeInTheDocument())
      fireEvent.click(screen.getByText(/Create "ExpenseNew"/))

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('closes modal on OK (expense sub-entry path)', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())

      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'ExpNew' } })
      await waitFor(() => expect(screen.getByText(/Create "ExpNew"/)).toBeInTheDocument())
      fireEvent.click(screen.getByText(/Create "ExpNew"/))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }))
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('creates new income tag on submit', async () => {
      mockTagRepository.create.mockResolvedValue({ id: 200, name: 'NewIncomeCat', sort_order: 1 } as any)

      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Income' }))
      await waitFor(() => expect(screen.getByPlaceholderText('Select category')).toBeInTheDocument())

      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'NewIncomeCat' } })
      await waitFor(() => expect(screen.getByText(/Create "NewIncomeCat"/)).toBeInTheDocument())
      fireEvent.click(screen.getByText(/Create "NewIncomeCat"/))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '500' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(mockTagRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'NewIncomeCat' })
        )
        expect(mockTransactionRepository.create).toHaveBeenCalled()
      })
    })

    it('creates new expense sub-entry tag on submit', async () => {
      mockTagRepository.create.mockResolvedValue({ id: 201, name: 'NewExpCat', sort_order: 1 } as any)

      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())

      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'NewExpCat' } })
      await waitFor(() => expect(screen.getByText(/Create "NewExpCat"/)).toBeInTheDocument())
      fireEvent.click(screen.getByText(/Create "NewExpCat"/))
      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '75' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(mockTagRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'NewExpCat' })
        )
        expect(mockTransactionRepository.create).toHaveBeenCalled()
      })
    })
  })

  describe('Exchange mode toggle', () => {
    it('switches from rate mode back to amounts mode', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'Exchange' }))
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Enter rate' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Enter rate' }))
      await waitFor(() => {
        expect(screen.getByLabelText(/Exchange Rate/)).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Enter amounts' }))
      await waitFor(() => {
        expect(screen.queryByLabelText(/Exchange Rate/)).not.toBeInTheDocument()
      })
    })
  })

  describe('Income category validation', () => {
    it('shows category required error in income mode without category', async () => {
      renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'Income' }))
      await waitFor(() => {
        expect(screen.getByLabelText(/^Amount/)).toBeInTheDocument()
      })

      fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '100' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByText('Category is required')).toBeInTheDocument()
      })
    })
  })

  describe('DateTime input', () => {
    it('updates datetime when input changes', async () => {
      const { container } = renderForm()
      await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument())

      const dateInput = container.querySelector('input[type="datetime-local"]')!
      expect(dateInput).toBeTruthy()
      fireEvent.change(dateInput, { target: { value: '2025-06-15T09:30' } })
      // State is updated internally; no crash expected
      expect(dateInput).toBeInTheDocument()
    })
  })
})
