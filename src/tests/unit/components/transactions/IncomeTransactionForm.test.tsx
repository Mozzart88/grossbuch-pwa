import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { IncomeTransactionForm } from '../../../../components/transactions/IncomeTransactionForm'
import type { Tag, Counterparty, Currency, Account, Transaction } from '../../../../types'

vi.mock('../../../../services/repositories', () => ({
  tagRepository: { create: vi.fn() },
  counterpartyRepository: { create: vi.fn(), update: vi.fn() },
  currencyRepository: { getRateForCurrency: vi.fn() },
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
  {
    id: 2,
    wallet_id: 2,
    currency_id: 2,
    balance_int: 200,
    balance_frac: 0,
    updated_at: 1704067200,
    walletName: 'Bank',
    walletIsDefault: false,
    currencyCode: 'EUR',
    currencySymbol: '€',
    decimalPlaces: 2,
  },
]

const mockIncomeTags: Tag[] = [
  { id: 20, name: 'Salary', sort_order: 10 },
  { id: 21, name: 'Freelance', sort_order: 8 },
]

const mockCounterparties: Counterparty[] = [
  { id: 1, name: 'Company A', note: null, tag_ids: [20], sort_order: 5 },
]

const defaultProps = {
  accounts: mockAccounts as any,
  incomeTags: mockIncomeTags,
  counterparties: mockCounterparties,
  defaultAccountId: '1',
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
}

describe('IncomeTransactionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 1, frac: 0 })
    mockTransactionRepository.create.mockResolvedValue({} as any)
    mockTransactionRepository.update.mockResolvedValue({} as any)
    mockCounterpartyRepository.create.mockResolvedValue({ id: 99 } as any)
    mockCounterpartyRepository.update.mockResolvedValue({} as any)
  })

  it('renders amount, account, category, counterparty fields', () => {
    render(<IncomeTransactionForm {...defaultProps} />)
    expect(screen.getByLabelText(/^Amount/i)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /account/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/counterparty/i)).toBeInTheDocument()
  })

  it('defaults to the provided defaultAccountId', () => {
    render(<IncomeTransactionForm {...defaultProps} />)
    expect(screen.getByRole('combobox', { name: /account/i })).toHaveValue('1')
  })

  it('shows income tags in category dropdown', async () => {
    render(<IncomeTransactionForm {...defaultProps} />)
    const categoryInput = screen.getByLabelText(/category/i)
    fireEvent.focus(categoryInput)
    await waitFor(() => {
      mockIncomeTags.forEach(tag => {
        expect(screen.getByRole('option', { name: tag.name })).toBeInTheDocument()
      })
    })
  })

  it('shows validation errors when submitting empty form', async () => {
    render(<IncomeTransactionForm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(screen.getByText('Amount is required and must be positive')).toBeInTheDocument()
      expect(screen.getByText('Category is required')).toBeInTheDocument()
    })
  })

  it('submits correct payload for income transaction', async () => {
    render(<IncomeTransactionForm {...defaultProps} />)

    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '1500' } })

    const categoryInput = screen.getByLabelText(/category/i)
    fireEvent.focus(categoryInput)
    fireEvent.change(categoryInput, { target: { value: 'Salary' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Salary' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('option', { name: 'Salary' }))

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [expect.objectContaining({
            account_id: 1,
            tag_id: 20,
            sign: '+',
            amount_int: 1500,
            amount_frac: 0,
          })],
        })
      )
      expect(defaultProps.onSubmit).toHaveBeenCalled()
    })
  })

  it('populates fields from initialData', () => {
    const initialData: Transaction = {
      id: new Uint8Array(8),
      timestamp: 1704803400,
      note: 'monthly',
      counterparty_id: 1,
      lines: [{
        id: new Uint8Array(8),
        trx_id: new Uint8Array(8),
        account_id: 1,
        tag_id: 20,
        sign: '+',
        amount_int: 3000,
        amount_frac: 0,
        rate_int: 1,
        rate_frac: 0,
      }],
    }

    render(<IncomeTransactionForm {...defaultProps} initialData={initialData} />)

    expect(screen.getByLabelText(/^Amount/i)).toHaveValue(3000)
    expect(screen.getByDisplayValue(/monthly/i)).toBeInTheDocument()
  })

  it('calls update instead of create when initialData present', async () => {
    const initialData: Transaction = {
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      timestamp: 1704803400,
      lines: [{
        id: new Uint8Array(8),
        trx_id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        account_id: 1,
        tag_id: 20,
        sign: '+',
        amount_int: 500,
        amount_frac: 0,
        rate_int: 1,
        rate_frac: 0,
      }],
    }

    render(<IncomeTransactionForm {...defaultProps} initialData={initialData} />)
    await waitFor(() => expect(screen.getByLabelText(/^Amount/i)).toHaveValue(500))

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => {
      expect(mockTransactionRepository.update).toHaveBeenCalled()
      expect(mockTransactionRepository.create).not.toHaveBeenCalled()
    })
  })

  it('calls onCancel when cancel button clicked', () => {
    render(<IncomeTransactionForm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(defaultProps.onCancel).toHaveBeenCalled()
  })

  it('allows changing account', () => {
    render(<IncomeTransactionForm {...defaultProps} />)
    const accountSelect = screen.getByRole('combobox', { name: /account/i })
    fireEvent.change(accountSelect, { target: { value: '2' } })
    expect(accountSelect).toHaveValue('2')
  })

  it('allows changing note', () => {
    render(<IncomeTransactionForm {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('Add notes...')
    fireEvent.change(textarea, { target: { value: 'test note' } })
    expect(textarea).toHaveValue('test note')
  })

  it('allows selecting existing counterparty', async () => {
    render(<IncomeTransactionForm {...defaultProps} />)
    const cpInput = screen.getByPlaceholderText('Search or create...')
    fireEvent.focus(cpInput)
    fireEvent.change(cpInput, { target: { value: 'Company' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Company A' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('option', { name: 'Company A' }))
  })

  it('allows creating new counterparty', () => {
    render(<IncomeTransactionForm {...defaultProps} />)
    const cpInput = screen.getByPlaceholderText('Search or create...')
    fireEvent.focus(cpInput)
    fireEvent.change(cpInput, { target: { value: 'New Corp' } })
    // onCreateNew fires from LiveSearch when no option matches and user confirms
  })

  it('allows changing datetime', () => {
    render(<IncomeTransactionForm {...defaultProps} />)
    const dtInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    fireEvent.change(dtInput, { target: { value: '2024-06-01T09:00' } })
    expect(dtInput).toHaveValue('2024-06-01T09:00')
  })

  it('submits with note in payload', async () => {
    render(<IncomeTransactionForm {...defaultProps} />)

    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '500' } })

    const categoryInput = screen.getByLabelText(/category/i)
    fireEvent.focus(categoryInput)
    fireEvent.change(categoryInput, { target: { value: 'Salary' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Salary' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('option', { name: 'Salary' }))

    fireEvent.change(screen.getByPlaceholderText('Add notes...'), { target: { value: 'paycheck' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ note: 'paycheck' })
      )
    })
  })
})
