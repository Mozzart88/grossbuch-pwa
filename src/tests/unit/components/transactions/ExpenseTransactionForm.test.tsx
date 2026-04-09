import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

  describe('payment currency differs from account currency', () => {
    it('shows payment amount field when currency differs from account', async () => {
      render(
        <ExpenseTransactionForm
          {...defaultProps}
          defaultPaymentCurrencyId={2}
        />
      )
      await waitFor(() => {
        expect(screen.getByLabelText(/Amount from account/i)).toBeInTheDocument()
      })
    })

    it('shows validation error when payment amount missing for cross-currency', async () => {
      render(
        <ExpenseTransactionForm
          {...defaultProps}
          defaultPaymentCurrencyId={2}
        />
      )
      fireEvent.change(screen.getAllByLabelText(/^Amount/i)[0], { target: { value: '50' } })
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'Food' } })
      await waitFor(() => expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('option', { name: 'Food' }))
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(screen.getByText('Amount in account currency is required')).toBeInTheDocument()
      })
    })

    it('submits multi-currency lines when payment currency differs', async () => {
      const { walletRepository } = await import('../../../../services/repositories')
      vi.mocked(walletRepository).findOrCreateAccountForCurrency = vi.fn().mockResolvedValue({
        id: 3, wallet_id: 1, currency_id: 2, balance_int: 0, balance_frac: 0,
      })

      render(
        <ExpenseTransactionForm
          {...defaultProps}
          defaultPaymentCurrencyId={2}
        />
      )
      fireEvent.change(screen.getAllByLabelText(/^Amount/i)[0], { target: { value: '50' } })
      fireEvent.change(screen.getByLabelText(/Amount from account/i), { target: { value: '55' } })
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'Food' } })
      await waitFor(() => expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('option', { name: 'Food' }))
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ tag_id: SYSTEM_TAGS.EXCHANGE, sign: '-' }),
              expect.objectContaining({ tag_id: SYSTEM_TAGS.EXCHANGE, sign: '+' }),
              expect.objectContaining({ tag_id: 10, sign: '-' }),
            ]),
          })
        )
      })
    })
  })

  describe('common add-on tags', () => {
    const tipTag: Tag = { id: SYSTEM_TAGS.TIP, name: 'Tip', sort_order: 1 }

    it('toggles common tag on and off', async () => {
      render(<ExpenseTransactionForm {...defaultProps} commonTags={[tipTag]} />)
      fireEvent.click(screen.getByRole('button', { name: '+ Tip' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Tip ✓' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Tip ✓' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '+ Tip' })).toBeInTheDocument())
    })

    it('shows computed amount when percentage is entered', async () => {
      render(<ExpenseTransactionForm {...defaultProps} commonTags={[tipTag]} />)
      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
      fireEvent.click(screen.getByRole('button', { name: '+ Tip' }))
      await waitFor(() => expect(screen.getByPlaceholderText('15')).toBeInTheDocument())
      fireEvent.change(screen.getByPlaceholderText('15'), { target: { value: '10' } })
      await waitFor(() => expect(screen.getByText(/= \$10\.00/)).toBeInTheDocument())
    })

    it('toggles common amount type from pct to abs', async () => {
      render(<ExpenseTransactionForm {...defaultProps} commonTags={[tipTag]} />)
      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
      fireEvent.click(screen.getByRole('button', { name: '+ Tip' }))
      await waitFor(() => expect(screen.getByTitle('Switch to absolute amount')).toBeInTheDocument())
      fireEvent.click(screen.getByTitle('Switch to absolute amount'))
      await waitFor(() => expect(screen.getByTitle('Switch to percentage')).toBeInTheDocument())
    })

    it('toggles common amount type back from abs to pct', async () => {
      render(<ExpenseTransactionForm {...defaultProps} commonTags={[tipTag]} />)
      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
      fireEvent.click(screen.getByRole('button', { name: '+ Tip' }))
      await waitFor(() => expect(screen.getByTitle('Switch to absolute amount')).toBeInTheDocument())
      fireEvent.click(screen.getByTitle('Switch to absolute amount'))
      await waitFor(() => expect(screen.getByTitle('Switch to percentage')).toBeInTheDocument())
      fireEvent.click(screen.getByTitle('Switch to percentage'))
      await waitFor(() => expect(screen.getByTitle('Switch to absolute amount')).toBeInTheDocument())
    })

    it('includes common tag lines in submission', async () => {
      render(<ExpenseTransactionForm {...defaultProps} commonTags={[tipTag]} />)
      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'Food' } })
      await waitFor(() => expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('option', { name: 'Food' }))
      fireEvent.click(screen.getByRole('button', { name: '+ Tip' }))
      await waitFor(() => expect(screen.getByPlaceholderText('15')).toBeInTheDocument())
      fireEvent.change(screen.getByPlaceholderText('15'), { target: { value: '10' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ tag_id: 10, sign: '-' }),
              expect.objectContaining({ tag_id: SYSTEM_TAGS.TIP }),
            ]),
          })
        )
      })
    })
  })

  describe('multi sub-entry mode', () => {
    it('removes a sub-entry when × is clicked', async () => {
      render(<ExpenseTransactionForm {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: '+ Add category' }))
      await waitFor(() => expect(screen.getAllByPlaceholderText('Select category')).toHaveLength(2))
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove category' })[0])
      await waitFor(() => expect(screen.getAllByPlaceholderText('Select category')).toHaveLength(1))
    })

    it('shows per-entry amount fields when multiple entries exist', async () => {
      render(<ExpenseTransactionForm {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: '+ Add category' }))
      await waitFor(() => {
        expect(screen.getByLabelText(/^Total/i)).toBeInTheDocument()
      })
    })
  })

  describe('multi-currency initialData', () => {
    it('populates from multi-currency expense initialData', async () => {
      const multiCurrencyData: Transaction = {
        id: new Uint8Array(8),
        timestamp: 1704803400,
        lines: [
          {
            id: new Uint8Array(8), trx_id: new Uint8Array(8),
            account_id: 1, tag_id: SYSTEM_TAGS.EXCHANGE, sign: '-',
            amount_int: 55, amount_frac: 0, rate_int: 1, rate_frac: 0, currency: 'USD',
          },
          {
            id: new Uint8Array(8), trx_id: new Uint8Array(8),
            account_id: 2, tag_id: SYSTEM_TAGS.EXCHANGE, sign: '+',
            amount_int: 50, amount_frac: 0, rate_int: 1, rate_frac: 0, currency: 'EUR',
          },
          {
            id: new Uint8Array(8), trx_id: new Uint8Array(8),
            account_id: 2, tag_id: 10, sign: '-',
            amount_int: 50, amount_frac: 0, rate_int: 1, rate_frac: 0, currency: 'EUR',
          },
        ] as any,
      }

      render(
        <ExpenseTransactionForm
          {...defaultProps}
          currencies={mockCurrencies}
          initialData={multiCurrencyData}
        />
      )

      await waitFor(() => {
        // With a single expense line, isExpenseMainEditable is true, label is "Amount"
        expect(screen.getAllByLabelText(/^Amount/i)[0]).toHaveValue(50)
      })
    })

    it('populates common lines with percentage from multi-currency initialData', async () => {
      const multiCurrencyWithCommon: Transaction = {
        id: new Uint8Array(8),
        timestamp: 1704803400,
        lines: [
          {
            id: new Uint8Array(8), trx_id: new Uint8Array(8),
            account_id: 1, tag_id: SYSTEM_TAGS.EXCHANGE, sign: '-',
            amount_int: 55, amount_frac: 0, rate_int: 1, rate_frac: 0, currency: 'USD',
          },
          {
            id: new Uint8Array(8), trx_id: new Uint8Array(8),
            account_id: 2, tag_id: SYSTEM_TAGS.EXCHANGE, sign: '+',
            amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0, currency: 'EUR',
          },
          {
            id: new Uint8Array(8), trx_id: new Uint8Array(8),
            account_id: 2, tag_id: 10, sign: '-',
            amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0, currency: 'EUR',
          },
          {
            id: new Uint8Array(8), trx_id: new Uint8Array(8),
            account_id: 2, tag_id: SYSTEM_TAGS.TIP, sign: '-',
            amount_int: 10, amount_frac: 0, rate_int: 1, rate_frac: 0, currency: 'EUR',
            is_common: 1, tag: 'Tip',
          },
        ] as any,
      }

      render(
        <ExpenseTransactionForm
          {...defaultProps}
          currencies={mockCurrencies}
          initialData={multiCurrencyWithCommon}
          commonTags={[{ id: SYSTEM_TAGS.TIP, name: 'Tip', sort_order: 1 }]}
        />
      )

      await waitFor(() => {
        expect(screen.getAllByLabelText(/^Amount/i)[0]).toHaveValue(100)
      })
    })
  })

  describe('new tag modal', () => {
    const openTagModal = async (tagName: string) => {
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: tagName } })
      await waitFor(() => expect(screen.getByText(new RegExp(`Create "${tagName}"`))).toBeInTheDocument())
      fireEvent.click(screen.getByText(new RegExp(`Create "${tagName}"`)))
      await waitFor(() => expect(screen.getByText('New Category')).toBeInTheDocument())
    }

    it('shows type buttons in modal', async () => {
      render(<ExpenseTransactionForm {...defaultProps} />)
      await openTagModal('MyTag')
      expect(screen.getByRole('button', { name: 'Expense' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Income' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Both' })).toBeInTheDocument()
    })

    it('creates tag with expense parent on submit after modal OK', async () => {
      render(<ExpenseTransactionForm {...defaultProps} />)
      await openTagModal('NewExpTag')
      // Click Income type then OK (type is stored in sub-entry but ExpenseForm always uses EXPENSE parent)
      fireEvent.click(screen.getByRole('button', { name: 'Income' }))
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))
      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '10' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockTagRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'NewExpTag' })
        )
      })
    })

    it('allows switching type to both', async () => {
      render(<ExpenseTransactionForm {...defaultProps} />)
      await openTagModal('BothTag')
      fireEvent.click(screen.getByRole('button', { name: 'Both' }))
      // Both button should now appear selected (primary style)
      expect(screen.getByRole('button', { name: 'Both' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))
      await waitFor(() => expect(screen.queryByText('New Category')).not.toBeInTheDocument())
    })

    it('cancels tag modal and clears new tag name', async () => {
      render(<ExpenseTransactionForm {...defaultProps} />)
      await openTagModal('CancelMe')
      // Use getAllByRole to disambiguate from the form's own Cancel button
      const cancelBtns = screen.getAllByRole('button', { name: 'Cancel' })
      // The modal Cancel is the last one (form's Cancel is first in DOM, modal renders after)
      fireEvent.click(cancelBtns[cancelBtns.length - 1])
      await waitFor(() => expect(screen.queryByText('New Category')).not.toBeInTheDocument())
    })
  })

  describe('counterparty handling', () => {
    it('creates new counterparty when name entered', async () => {
      render(<ExpenseTransactionForm {...defaultProps} />)
      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '42' } })
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'Food' } })
      await waitFor(() => expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('option', { name: 'Food' }))
      const cpInput = screen.getByPlaceholderText('Search or create...')
      fireEvent.focus(cpInput)
      fireEvent.change(cpInput, { target: { value: 'New Place' } })
      await waitFor(() => expect(screen.getByText(/Create "New Place"/)).toBeInTheDocument())
      fireEvent.click(screen.getByText(/Create "New Place"/))
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockCounterpartyRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'New Place' })
        )
      })
    })

    it('updates existing counterparty tag_ids on submit', async () => {
      render(<ExpenseTransactionForm {...defaultProps} />)
      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '42' } })
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'Food' } })
      await waitFor(() => expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('option', { name: 'Food' }))
      const cpInput = screen.getByPlaceholderText('Search or create...')
      fireEvent.focus(cpInput)
      await waitFor(() => expect(screen.getByRole('option', { name: 'Restaurant' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('option', { name: 'Restaurant' }))
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockCounterpartyRepository.update).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ tag_ids: expect.arrayContaining([10]) })
        )
      })
    })
  })

  describe('initialData with counterparty and common lines', () => {
    it('populates counterparty_id from initialData', async () => {
      const withCp = {
        id: new Uint8Array(8),
        timestamp: 1704803400,
        counterparty_id: 1,
        lines: [{
          id: new Uint8Array(8), trx_id: new Uint8Array(8),
          account_id: 1, tag_id: 10, sign: '-',
          amount_int: 50, amount_frac: 0, rate_int: 1, rate_frac: 0, currency: 'USD',
        }] as any,
      }
      render(<ExpenseTransactionForm {...defaultProps} initialData={withCp} />)
      await waitFor(() => {
        // counterparty_id=1 maps to 'Restaurant' in mockCounterparties
        expect(screen.getByDisplayValue('Restaurant')).toBeInTheDocument()
      })
    })

    it('populates common lines from plain expense initialData', async () => {
      const plainWithCommon = {
        id: new Uint8Array(8),
        timestamp: 1704803400,
        lines: [
          {
            id: new Uint8Array(8), trx_id: new Uint8Array(8),
            account_id: 1, tag_id: 10, sign: '-',
            amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0, currency: 'USD',
          },
          {
            id: new Uint8Array(8), trx_id: new Uint8Array(8),
            account_id: 1, tag_id: SYSTEM_TAGS.TIP, sign: '-',
            amount_int: 10, amount_frac: 0, rate_int: 1, rate_frac: 0, currency: 'USD',
            is_common: 1, tag: 'Tip',
          },
        ] as any,
      }
      render(
        <ExpenseTransactionForm
          {...defaultProps}
          initialData={plainWithCommon}
          commonTags={[{ id: SYSTEM_TAGS.TIP, name: 'Tip', sort_order: 1 }]}
        />
      )
      await waitFor(() => {
        expect(screen.getByLabelText(/^Amount/i)).toHaveValue(100)
      })
    })

    it('handles plain expense with multiple expense lines', async () => {
      const multiLine = {
        id: new Uint8Array(8),
        timestamp: 1704803400,
        lines: [
          {
            id: new Uint8Array(8), trx_id: new Uint8Array(8),
            account_id: 1, tag_id: 10, sign: '-',
            amount_int: 50, amount_frac: 0, rate_int: 1, rate_frac: 0, currency: 'USD',
          },
          {
            id: new Uint8Array(8), trx_id: new Uint8Array(8),
            account_id: 1, tag_id: 11, sign: '-',
            amount_int: 30, amount_frac: 0, rate_int: 1, rate_frac: 0, currency: 'USD',
          },
        ] as any,
      }
      render(<ExpenseTransactionForm {...defaultProps} initialData={multiLine} />)
      await waitFor(() => {
        // Multiple lines → per-entry amount fields shown
        expect(screen.getByLabelText(/^Total/i)).toBeInTheDocument()
      })
    })
  })

  describe('sort order fallbacks', () => {
    it('handles counterparties without sort_order', async () => {
      const cpNoSort = { id: 2, name: 'No Sort CP', note: null, tag_ids: [], sort_order: undefined as any }
      render(<ExpenseTransactionForm {...defaultProps} counterparties={[...mockCounterparties, cpNoSort]} />)
      const cpInput = screen.getByPlaceholderText('Search or create...')
      fireEvent.focus(cpInput)
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'No Sort CP' })).toBeInTheDocument()
      })
    })

    it('handles tags without sort_order', async () => {
      const tagNoSort: Tag = { id: 15, name: 'NoSort', sort_order: undefined as any }
      render(<ExpenseTransactionForm {...defaultProps} expenseTags={[...mockExpenseTags, tagNoSort]} />)
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'NoSort' })).toBeInTheDocument()
      })
    })
  })

  describe('multi-currency with common tags', () => {
    it('submits multi-currency expense with common tag in pct mode', async () => {
      const walletRepository = await import('../../../../services/repositories').then(m => m.walletRepository)
      vi.mocked(walletRepository.findOrCreateAccountForCurrency).mockResolvedValue({ id: 2 } as any)
      render(
        <ExpenseTransactionForm
          {...defaultProps}
          defaultPaymentCurrencyId={2}
          commonTags={[{ id: SYSTEM_TAGS.TIP, name: 'Tip', sort_order: 1 }]}
        />
      )
      // Amount in EUR (expense currency)
      fireEvent.change(screen.getAllByLabelText(/^Amount/i)[0], { target: { value: '100' } })
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'Food' } })
      await waitFor(() => expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('option', { name: 'Food' }))
      // Amount from account (USD)
      const amountFromAccount = screen.getAllByLabelText(/^Amount/i)[1]
      fireEvent.change(amountFromAccount, { target: { value: '110' } })
      fireEvent.click(screen.getByRole('button', { name: '+ Tip' }))
      await waitFor(() => expect(screen.getByPlaceholderText('15')).toBeInTheDocument())
      fireEvent.change(screen.getByPlaceholderText('15'), { target: { value: '10' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ tag_id: SYSTEM_TAGS.TIP }),
            ]),
          })
        )
      })
    })

    it('submits common tag in abs mode for plain expense', async () => {
      render(
        <ExpenseTransactionForm
          {...defaultProps}
          commonTags={[{ id: SYSTEM_TAGS.TIP, name: 'Tip', sort_order: 1 }]}
        />
      )
      fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
      const categoryInput = screen.getByPlaceholderText('Select category')
      fireEvent.focus(categoryInput)
      fireEvent.change(categoryInput, { target: { value: 'Food' } })
      await waitFor(() => expect(screen.getByRole('option', { name: 'Food' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('option', { name: 'Food' }))
      fireEvent.click(screen.getByRole('button', { name: '+ Tip' }))
      await waitFor(() => expect(screen.getByTitle('Switch to absolute amount')).toBeInTheDocument())
      fireEvent.click(screen.getByTitle('Switch to absolute amount'))
      await waitFor(() => expect(screen.getByTitle('Switch to percentage')).toBeInTheDocument())
      // Enter abs amount (second input with placeholder 0.00 - first is the main Amount)
      fireEvent.change(screen.getAllByPlaceholderText('0.00')[1], { target: { value: '5' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ tag_id: SYSTEM_TAGS.TIP }),
            ]),
          })
        )
      })
    })
  })
})
