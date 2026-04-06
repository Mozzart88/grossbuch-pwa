import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { TransferTransactionForm } from '../../../../components/transactions/TransferTransactionForm'
import type { Transaction } from '../../../../types'
import { SYSTEM_TAGS } from '../../../../types'

vi.mock('../../../../services/repositories', () => ({
  currencyRepository: { getRateForCurrency: vi.fn() },
  transactionRepository: { create: vi.fn(), update: vi.fn() },
}))

import { currencyRepository, transactionRepository } from '../../../../services/repositories'

const mockTransactionRepository = vi.mocked(transactionRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)

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
    currency_id: 1,
    balance_int: 200,
    balance_frac: 0,
    updated_at: 1704067200,
    walletName: 'Savings',
    walletIsDefault: false,
    currencyCode: 'USD',
    currencySymbol: '$',
    decimalPlaces: 2,
  },
  {
    id: 3,
    wallet_id: 3,
    currency_id: 2,
    balance_int: 100,
    balance_frac: 0,
    updated_at: 1704067200,
    walletName: 'Bank',
    walletIsDefault: false,
    currencyCode: 'EUR',
    currencySymbol: '€',
    decimalPlaces: 2,
  },
]

const defaultProps = {
  accounts: mockAccounts as any,
  defaultAccountId: '1',
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
}

describe('TransferTransactionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 1, frac: 0 })
    mockTransactionRepository.create.mockResolvedValue({} as any)
    mockTransactionRepository.update.mockResolvedValue({} as any)
  })

  it('renders amount, account, to-account, fee fields', () => {
    render(<TransferTransactionForm {...defaultProps} />)
    expect(screen.getByLabelText(/^Amount/i)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /^account$/i })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /to account/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/fee.*optional/i)).toBeInTheDocument()
  })

  it('to-account only shows accounts with the same currency as source', async () => {
    render(<TransferTransactionForm {...defaultProps} />)
    const toAccountSelect = screen.getByRole('combobox', { name: /to account/i })
    const options = within(toAccountSelect).getAllByRole('option') as HTMLOptionElement[]
    const valueOptions = options.filter(o => o.value !== '')
    // Account 2 (USD) should appear, account 3 (EUR) should not, account 1 (source) excluded
    expect(valueOptions.some(o => o.value === '2')).toBe(true)
    expect(valueOptions.some(o => o.value === '3')).toBe(false)
    expect(valueOptions.some(o => o.value === '1')).toBe(false)
  })

  it('shows validation errors when submitting empty form', async () => {
    render(<TransferTransactionForm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(screen.getByText('Amount is required and must be positive')).toBeInTheDocument()
      expect(screen.getByText('Destination account is required')).toBeInTheDocument()
    })
  })

  it('shows fee validation error for negative fee', async () => {
    render(<TransferTransactionForm {...defaultProps} />)
    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
    fireEvent.change(screen.getByRole('combobox', { name: /to account/i }), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/fee.*optional/i), { target: { value: '-5' } })
    const form = screen.getByRole('button', { name: 'Add' }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText('Fee cannot be negative')).toBeInTheDocument()
    })
  })

  it('submits correct transfer payload', async () => {
    render(<TransferTransactionForm {...defaultProps} />)
    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '250' } })
    fireEvent.change(screen.getByRole('combobox', { name: /to account/i }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ account_id: 1, sign: '-', amount_int: 250, tag_id: SYSTEM_TAGS.TRANSFER }),
            expect.objectContaining({ account_id: 2, sign: '+', amount_int: 250, tag_id: SYSTEM_TAGS.TRANSFER }),
          ]),
        })
      )
    })
  })

  it('includes fee line when fee is set', async () => {
    render(<TransferTransactionForm {...defaultProps} />)
    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
    fireEvent.change(screen.getByRole('combobox', { name: /to account/i }), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/fee.*optional/i), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ account_id: 1, sign: '-', amount_int: 2, tag_id: SYSTEM_TAGS.FEE }),
          ]),
        })
      )
    })
  })

  it('populates fields from initialData', () => {
    const initialData: Transaction = {
      id: new Uint8Array(8),
      timestamp: 1704803400,
      lines: [
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 1,
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '-',
          amount_int: 75,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 2,
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '+',
          amount_int: 75,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
      ],
    }
    render(<TransferTransactionForm {...defaultProps} initialData={initialData} />)
    expect(screen.getByLabelText(/^Amount/i)).toHaveValue(75)
  })

  it('allows changing account', () => {
    render(<TransferTransactionForm {...defaultProps} />)
    const accountSelect = screen.getByRole('combobox', { name: /^account$/i })
    fireEvent.change(accountSelect, { target: { value: '2' } })
    expect(accountSelect).toHaveValue('2')
  })

  it('allows changing note', () => {
    render(<TransferTransactionForm {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('Add notes...')
    fireEvent.change(textarea, { target: { value: 'transfer note' } })
    expect(textarea).toHaveValue('transfer note')
  })

  it('submits with note in payload', async () => {
    render(<TransferTransactionForm {...defaultProps} />)
    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
    fireEvent.change(screen.getByRole('combobox', { name: /to account/i }), { target: { value: '2' } })
    fireEvent.change(screen.getByPlaceholderText('Add notes...'), { target: { value: 'my note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ note: 'my note' })
      )
    })
  })

  it('clears feeTagId when fee input cleared', () => {
    render(<TransferTransactionForm {...defaultProps} />)
    const feeInput = screen.getByLabelText(/fee.*optional/i)
    fireEvent.change(feeInput, { target: { value: '5' } })
    fireEvent.change(feeInput, { target: { value: '' } })
    expect(feeInput).toHaveValue(null)
  })

  it('clears feeTagId when fee set to zero', () => {
    render(<TransferTransactionForm {...defaultProps} />)
    const feeInput = screen.getByLabelText(/fee.*optional/i)
    fireEvent.change(feeInput, { target: { value: '5' } })
    fireEvent.change(feeInput, { target: { value: '0' } })
    expect(feeInput).toHaveValue(0)
  })

  it('populates fee from initialData with fee line', async () => {
    const initialData: Transaction = {
      id: new Uint8Array(8),
      timestamp: 1704803400,
      lines: [
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 1,
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '-',
          amount_int: 100,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 2,
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '+',
          amount_int: 100,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 1,
          tag_id: SYSTEM_TAGS.FEE,
          sign: '-',
          amount_int: 3,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
      ],
    }
    render(<TransferTransactionForm {...defaultProps} initialData={initialData} />)
    await waitFor(() => {
      expect(screen.getByLabelText(/fee.*optional/i)).toHaveValue(3)
    })
  })

  it('allows changing datetime', () => {
    render(<TransferTransactionForm {...defaultProps} />)
    const dtInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    fireEvent.change(dtInput, { target: { value: '2024-01-15T10:30' } })
    expect(dtInput).toHaveValue('2024-01-15T10:30')
  })

  it('shows account required error when account cleared', async () => {
    render(<TransferTransactionForm {...defaultProps} />)
    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
    fireEvent.change(screen.getByRole('combobox', { name: /to account/i }), { target: { value: '2' } })
    fireEvent.change(screen.getByRole('combobox', { name: /^account$/i }), { target: { value: '' } })
    const form = screen.getByRole('button', { name: 'Add' }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText('Account is required')).toBeInTheDocument()
    })
  })

  it('submits with zero fee (covers feeTagId empty branch)', async () => {
    render(<TransferTransactionForm {...defaultProps} />)
    fireEvent.change(screen.getByLabelText(/^Amount/i), { target: { value: '100' } })
    fireEvent.change(screen.getByRole('combobox', { name: /to account/i }), { target: { value: '2' } })
    // Set fee to 5 first (sets feeTagId), then clear to '0' (clears feeTagId)
    const feeInput = screen.getByLabelText(/fee.*optional/i)
    fireEvent.change(feeInput, { target: { value: '5' } })
    fireEvent.change(feeInput, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalled()
    })
  })

  it('calls update instead of create when initialData present', async () => {
    const initialData: Transaction = {
      id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      timestamp: 1704803400,
      lines: [
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          account_id: 1,
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '-',
          amount_int: 50,
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
          amount_int: 50,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
      ],
    }

    render(<TransferTransactionForm {...defaultProps} initialData={initialData} />)
    await waitFor(() => expect(screen.getByLabelText(/^Amount/i)).toHaveValue(50))
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => {
      expect(mockTransactionRepository.update).toHaveBeenCalled()
      expect(mockTransactionRepository.create).not.toHaveBeenCalled()
    })
  })
})
