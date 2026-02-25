import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TransactionForm } from '../../../../components/transactions/TransactionForm'
import type { Wallet, Tag, Currency, Account, Transaction } from '../../../../types'
import { SYSTEM_TAGS } from '../../../../types'

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
  },
  counterpartyRepository: {
    findAll: vi.fn(),
  },
  currencyRepository: {
    findAll: vi.fn(),
    findSystem: vi.fn(),
    setExchangeRate: vi.fn(),
    getRateForCurrency: vi.fn(),
    findUsedInAccounts: vi.fn(),
  },
  transactionRepository: {
    createIncome: vi.fn(),
    createExpense: vi.fn(),
    createTransfer: vi.fn(),
    createExchange: vi.fn(),
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
  symbol: '$',
  decimal_places: 2,
  is_default: true,
}

const mockAccount2: Account = {
  id: 2,
  wallet_id: 2,
  currency_id: 2,
  balance_int: 200,
  balance_frac: 0,
  updated_at: 1704067200,
  wallet: 'Bank',
  currency: 'EUR',
  symbol: '€',
  decimal_places: 2,
}

const mockVirtualAccount: Account = {
  id: 3,
  wallet_id: 3,
  currency_id: 1,
  balance_int: 200,
  balance_frac: 0,
  updated_at: 1704067200,
  wallet: 'Virtual',
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
}

const mockWallets: Wallet[] = [
  {
    id: 1,
    name: 'Cash',
    color: '#4CAF50',
    is_default: true,
    accounts: [mockAccount],
  },
  {
    id: 2,
    name: 'Bank',
    color: '#2196F3',
    accounts: [mockAccount2],
  },
  {
    id: 3,
    name: 'Virtual',
    color: '#2196F3',
    accounts: [mockVirtualAccount],
  },
]

const mockExpenseTags: Tag[] = [
  { id: 10, name: 'Food', sort_order: 10 },
]

const mockIncomeTags: Tag[] = [
  { id: 20, name: 'Salary', sort_order: 8 },
]

const mockCurrencies: Currency[] = [
  { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_system: true },
  { id: 2, code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2 },
]

describe('TransactionForm Editing mode', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockWalletRepository.findActive.mockResolvedValue(mockWallets)
    mockWalletRepository.findOrCreateAccountForCurrency.mockResolvedValue(mockAccount2)
    mockTagRepository.findExpenseTags.mockResolvedValue(mockExpenseTags)
    mockTagRepository.findIncomeTags.mockResolvedValue(mockIncomeTags)
    mockTagRepository.findCommonTags.mockResolvedValue([])
    mockCounterpartyRepository.findAll.mockResolvedValue([])
    mockCurrencyRepository.findAll.mockResolvedValue(mockCurrencies)
    mockCurrencyRepository.findSystem.mockResolvedValue(mockCurrencies[0]) // USD is default
    mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 1, frac: 0 })
    mockCurrencyRepository.findUsedInAccounts.mockResolvedValue([mockCurrencies[0], mockCurrencies[1]]) // USD and EUR
    mockTransactionRepository.create.mockResolvedValue({} as any)
    mockTransactionRepository.update.mockResolvedValue({} as any)
  })

  const renderForm = (initialData?: Transaction) => {
    return render(
      <TransactionForm
        initialData={initialData}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    )
  }

  it('populates fields for an expense transaction', async () => {
    const expenseData: Transaction = {
      id: new Uint8Array(8),
      timestamp: 1704803400,
      lines: [
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 1,
          tag_id: 10,
          sign: '-',
          amount_int: 50,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
          wallet: 'Cash',
          currency: 'USD',
          tag: 'Food',
        },
      ],
    }

    renderForm(expenseData)

    await waitFor(() => {
      expect(screen.getByLabelText(/^Amount/i)).toHaveValue(50)
      expect(screen.getByRole('combobox', { name: /account/i })).toHaveValue('1')
      // LiveSearch shows the label (category name) not the value (ID)
      expect(screen.getByPlaceholderText('Select category')).toHaveValue('Food')
      expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
    })
  })

  it('populates fields for an income transaction', async () => {
    const incomeData: Transaction = {
      id: new Uint8Array(8),
      timestamp: 1704803400,
      lines: [
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 1,
          tag_id: 20,
          sign: '+',
          amount_int: 1000,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
          wallet: 'Cash',
          currency: 'USD',
          tag: 'Salary',
        },
      ],
    }

    renderForm(incomeData)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Income' }).className).toContain('shadow')
      expect(screen.getByLabelText(/^Amount/i)).toHaveValue(1000)
      // LiveSearch shows the label (category name) not the value (ID)
      expect(screen.getByRole('combobox', { name: /category/i })).toHaveValue('Salary')
    })
  })

  it('populates fields for a transfer transaction', async () => {
    const transferData: Transaction = {
      id: new Uint8Array(8),
      timestamp: 1704803400,
      lines: [
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 1,
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '-',
          amount_int: 20,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 1, // To account (simplifying mock wallets)
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '+',
          amount_int: 20,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
      ],
    }

    renderForm(transferData)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Transfer' }).className).toContain('shadow')
      expect(screen.getByLabelText(/^Amount/i)).toHaveValue(20)
    })
  })

  it('updates instead of creating when initialData is present', async () => {
    const expenseData: Transaction = {
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      timestamp: 1704803400,
      lines: [
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          account_id: 1,
          tag_id: 10,
          sign: '-',
          amount_int: 50,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
      ],
    }

    renderForm(expenseData)

    await waitFor(() => {
      expect(screen.getByLabelText(/^Amount/i)).toHaveValue(50)
      expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => {
      expect(mockTransactionRepository.update).toHaveBeenCalled()
      expect(mockTransactionRepository.create).not.toHaveBeenCalled()
    })
  })

  it('updates instead of creating when initialData is present (income)', async () => {
    const incomeData: Transaction = {
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      timestamp: 1704803400,
      lines: [
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          account_id: 1,
          tag_id: 20,
          sign: '+',
          amount_int: 1000,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
      ],
    }

    renderForm(incomeData)
    await waitFor(() => {
      expect(screen.getByLabelText(/^Amount/i)).toHaveValue(1000)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => {
      expect(mockTransactionRepository.update).toHaveBeenCalled()
    })
  })

  it('updates instead of creating when initialData is present (transfer)', async () => {
    const transferData: Transaction = {
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      timestamp: 1704803400,
      lines: [
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          account_id: 1,
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '-',
          amount_int: 20,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          account_id: 2,
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '+',
          amount_int: 20,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
      ],
    }

    renderForm(transferData)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Transfer' }).className).toContain('shadow')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => {
      expect(mockTransactionRepository.update).toHaveBeenCalled()
    })
  })

  it('updates instead of creating when initialData is present (exchange)', async () => {
    const exchangeData: Transaction = {
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      timestamp: 1704803400,
      lines: [
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          account_id: 1,
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '-',
          amount_int: 100,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          account_id: 2,
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '+',
          amount_int: 92,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
      ],
    }

    renderForm(exchangeData)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Exchange' }).className).toContain('shadow')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => {
      expect(mockTransactionRepository.update).toHaveBeenCalled()
    })
  })

  it('shows error if account is not selected', async () => {
    render(
      <TransactionForm
        onSubmit={() => { }}
        onCancel={() => { }}
      />
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    })

    // Force clear account select
    fireEvent.change(screen.getByRole('combobox', { name: /account/i }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(screen.getByText('Account is required')).toBeInTheDocument()
    })
  })

  it('early returns when initialData has no lines', async () => {
    const emptyData: Transaction = {
      id: new Uint8Array(8),
      timestamp: 1704803400,
      lines: [],
    }

    renderForm(emptyData)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
      // Should stay in default (expense) mode
      expect(screen.getByRole('button', { name: 'Expense' }).className).toContain('shadow')
    })
  })

  it('shows complex expense transaction with virtual account correctly', async () => {
    const complexExpenseData: Transaction = {
      id: new Uint8Array(8),
      timestamp: 1704803400,
      lines: [
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 2,
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '-',
          amount_int: 20,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 3, // To account (simplifying mock wallets)
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '+',
          amount_int: 21,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 3, // Virtual account
          tag_id: 10,
          sign: '-',
          amount_int: 21,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
          currency: 'USD', // Payment currency
        },
      ],
    }

    renderForm(complexExpenseData)

    await waitFor(() => {
      // Amount in payment currency (USD)
      expect(screen.getByRole('spinbutton', { name: /^Amount \(\$\)/i })).toHaveValue(21)
      // Payment currency should show USD code - LiveSearch shows only code in the input
      const currencyInput = screen.getByPlaceholderText('CUR')
      expect(currencyInput).toHaveValue('USD')
      // Source account should be Bank (where money came from)
      expect(screen.getByRole('combobox', { name: /^Account$/i })).toHaveValue('2')
    })

  })
})
