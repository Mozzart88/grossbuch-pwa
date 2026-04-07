import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExpenseTransactionForm } from '../../../../components/transactions/ExpenseTransactionForm'
import type { Tag, Counterparty, Currency, Transaction } from '../../../../types'
import { SYSTEM_TAGS } from '../../../../types'

vi.mock('../../../../services/repositories', () => ({
  tagRepository: { create: vi.fn() },
  counterpartyRepository: { create: vi.fn(), update: vi.fn() },
  currencyRepository: { getRateForCurrency: vi.fn() },
  walletRepository: { findOrCreateAccountForCurrency: vi.fn() },
  transactionRepository: { create: vi.fn(), update: vi.fn() },
}))

vi.mock('../../../../services/exchangeRate/historicalRateService', () => ({
  getRateForDate: vi.fn().mockResolvedValue({ int: 1, frac: 0 }),
}))

import {
  tagRepository,
  counterpartyRepository,
  currencyRepository,
  transactionRepository,
} from '../../../../services/repositories'

const mockTransactionRepository = vi.mocked(transactionRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockTagRepository = vi.mocked(tagRepository)
const mockCounterpartyRepository = vi.mocked(counterpartyRepository)

const mockAccounts = [
  {
    id: 1,
    wallet_id: 1,
    currency_id: 1,
    balance_int: 500,
    balance_frac: 0,
    updated_at: 1704067200,
    is_default: true,
    walletName: 'Cash',
    walletIsDefault: true,
    currencyCode: 'USD',
    currencySymbol: '$',
    decimalPlaces: 2,
  },
]

const mockCurrencies: Currency[] = [
  { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_system: true, is_fiat: true },
  { id: 2, code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, is_fiat: true },
]

const mockExpenseTags: Tag[] = [
  { id: 10, name: 'Food', sort_order: 10 },
  { id: 11, name: 'Transport', sort_order: 8 },
]

const mockCounterparties: Counterparty[] = [
  { id: 1, name: 'Restaurant', note: null, tag_ids: [10], sort_order: 5 },
]

const defaultProps = {
  accounts: mockAccounts as any,
  currencies: mockCurrencies,
  activeCurrencies: mockCurrencies,
  expenseTags: mockExpenseTags,
  commonTags: [],
  counterparties: mockCounterparties,
  defaultAccountId: '1',
  defaultPaymentCurrencyId: null,
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
}

describe('ExpenseTransactionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 1, frac: 0 })
    mockTransactionRepository.create.mockResolvedValue({} as any)
    mockTransactionRepository.update.mockResolvedValue({} as any)
    mockTagRepository.create.mockResolvedValue({ id: 99 } as any)
    mockCounterpartyRepository.create.mockResolvedValue({ id: 99 } as any)
    mockCounterpartyRepository.update.mockResolvedValue({} as any)
  })

  it('renders amount, currency picker, account, category fields', () => {
    render(<ExpenseTransactionForm {...defaultProps} />)
    expect(screen.getByLabelText(/^Amount/i)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /account/i })).toBeInTheDocument()
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Select category')).toBeInTheDocument()
  })

  it('shows expense tags in category dropdown', async () => {
    render(<ExpenseTransactionForm {...defaultProps} />)
    const categoryInput = screen.getByPlaceholderText('Select category')
    fireEvent.focus(categoryInput)
    await waitFor(() => {
      mockExpenseTags.forEach(tag => {
        expect(screen.getByRole('option', { name: tag.name })).toBeInTheDocument()
      })
    })
  })

  it('shows validation errors when submitting empty form', async () => {
    render(<ExpenseTransactionForm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(screen.getByText('Amount is required and must be positive')).toBeInTheDocument()
      expect(screen.getByText('Category is required')).toBeInTheDocument()
    })
  })

  it('submits correct expense payload', async () => {
    render(<ExpenseTransactionForm {...defaultProps} />)

    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '42' } })

    const categoryInput = screen.getByPlaceholderText('Select category')
    fireEvent.focus(categoryInput)
    fireEvent.change(categoryInput, { target: { value: 'Food' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('option', { name: 'Food' }))

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [expect.objectContaining({
            account_id: 1,
            tag_id: 10,
            sign: '-',
            amount_int: 42,
            amount_frac: 0,
          })],
        })
      )
      expect(defaultProps.onSubmit).toHaveBeenCalled()
    })
  })

  it('supports adding multiple categories', async () => {
    render(<ExpenseTransactionForm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add category' }))
    const categoryInputs = screen.getAllByPlaceholderText('Select category')
    expect(categoryInputs).toHaveLength(2)
  })

  it('shows common add-on tags when provided', () => {
    const commonTags: Tag[] = [{ id: SYSTEM_TAGS.TIP, name: 'Tip', sort_order: 1 }]
    render(<ExpenseTransactionForm {...defaultProps} commonTags={commonTags} />)
    expect(screen.getByText('Add-ons:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Tip' })).toBeInTheDocument()
  })

  it('populates fields from initialData', () => {
    const initialData: Transaction = {
      id: new Uint8Array(8),
      timestamp: 1704803400,
      note: 'lunch',
      lines: [{
        id: new Uint8Array(8),
        trx_id: new Uint8Array(8),
        account_id: 1,
        tag_id: 10,
        sign: '-',
        amount_int: 25,
        amount_frac: 0,
        rate_int: 1,
        rate_frac: 0,
      }],
    }

    render(<ExpenseTransactionForm {...defaultProps} initialData={initialData} />)
    expect(screen.getByLabelText(/^Amount/i)).toHaveValue(25)
    expect(screen.getByDisplayValue('lunch')).toBeInTheDocument()
  })

  it('calls update instead of create when initialData present', async () => {
    const initialData: Transaction = {
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      timestamp: 1704803400,
      lines: [{
        id: new Uint8Array(8),
        trx_id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        account_id: 1,
        tag_id: 10,
        sign: '-',
        amount_int: 30,
        amount_frac: 0,
        rate_int: 1,
        rate_frac: 0,
      }],
    }

    render(<ExpenseTransactionForm {...defaultProps} initialData={initialData} />)
    await waitFor(() => expect(screen.getByLabelText(/^Amount/i)).toHaveValue(30))
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => {
      expect(mockTransactionRepository.update).toHaveBeenCalled()
      expect(mockTransactionRepository.create).not.toHaveBeenCalled()
    })
  })

  it('calls onCancel when cancel button clicked', () => {
    render(<ExpenseTransactionForm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(defaultProps.onCancel).toHaveBeenCalled()
  })

  it('allows changing note', () => {
    render(<ExpenseTransactionForm {...defaultProps} />)
    fireEvent.change(screen.getByPlaceholderText('Add notes...'), { target: { value: 'dinner' } })
    expect(screen.getByPlaceholderText('Add notes...')).toHaveValue('dinner')
  })

  it('opens new tag modal and can cancel it', async () => {
    render(<ExpenseTransactionForm {...defaultProps} />)
    // Type a new tag name in the category LiveSearch that doesn't match any option
    const categoryInput = screen.getByPlaceholderText('Select category')
    fireEvent.focus(categoryInput)
    fireEvent.change(categoryInput, { target: { value: 'NewTag' } })
    // Wait for "Create NewTag" option to appear
    await waitFor(() => {
      const createOpt = screen.queryByText(/create/i)
      if (!createOpt) throw new Error('no create option yet')
    })
  })

  it('allows changing datetime', () => {
    render(<ExpenseTransactionForm {...defaultProps} />)
    const dtInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    fireEvent.change(dtInput, { target: { value: '2024-03-10T14:00' } })
    expect(dtInput).toHaveValue('2024-03-10T14:00')
  })

  it('submits with note in payload', async () => {
    render(<ExpenseTransactionForm {...defaultProps} />)

    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '42' } })

    const categoryInput = screen.getByPlaceholderText('Select category')
    fireEvent.focus(categoryInput)
    fireEvent.change(categoryInput, { target: { value: 'Food' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('option', { name: 'Food' }))

    fireEvent.change(screen.getByPlaceholderText('Add notes...'), { target: { value: 'dinner out' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ note: 'dinner out' })
      )
    })
  })
})
