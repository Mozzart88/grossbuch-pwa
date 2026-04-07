import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExchangeTransactionForm } from '../../../../components/transactions/ExchangeTransactionForm'
import type { Transaction } from '../../../../types'
import { SYSTEM_TAGS } from '../../../../types'

vi.mock('../../../../services/repositories', () => ({
  currencyRepository: {
    getRateForCurrency: vi.fn(),
    findSystem: vi.fn(),
    setExchangeRate: vi.fn(),
  },
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
  {
    id: 3,
    wallet_id: 3,
    currency_id: 1,
    balance_int: 100,
    balance_frac: 0,
    updated_at: 1704067200,
    walletName: 'Savings',
    walletIsDefault: false,
    currencyCode: 'USD',
    currencySymbol: '$',
    decimalPlaces: 2,
  },
]

const defaultProps = {
  accounts: mockAccounts as any,
  defaultAccountId: '1',
  onSubmit: vi.fn(),
  onCancel: vi.fn(),
}

describe('ExchangeTransactionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.getRateForCurrency.mockResolvedValue({ int: 1, frac: 0 })
    mockCurrencyRepository.findSystem.mockResolvedValue({ id: 1, code: 'USD' } as any)
    mockCurrencyRepository.setExchangeRate.mockResolvedValue(undefined)
    mockTransactionRepository.create.mockResolvedValue({} as any)
    mockTransactionRepository.update.mockResolvedValue({} as any)
  })

  it('renders amount, from account, to amount, and to account fields', () => {
    render(<ExchangeTransactionForm {...defaultProps} />)
    expect(document.getElementById('amount')).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')[0]).toBeInTheDocument()
    expect(document.getElementById('toAmount')).toBeInTheDocument()
    expect(screen.getAllByRole('combobox')[1]).toBeInTheDocument()
  })

  it('to account only shows accounts with different currency than source', () => {
    render(<ExchangeTransactionForm {...defaultProps} />)
    const toAccountSelect = screen.getAllByRole('combobox')[1]
    // Account 1 (USD, source) and Account 3 (USD) should be excluded; Account 2 (EUR) included
    expect(toAccountSelect.innerHTML).toContain('Bank')
    expect(toAccountSelect.innerHTML).not.toContain('Cash')
    expect(toAccountSelect.innerHTML).not.toContain('Savings')
  })

  it('shows effective rate when both amounts are filled', async () => {
    render(<ExchangeTransactionForm {...defaultProps} />)
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } })
    fireEvent.change(document.getElementById('amount')!, { target: { value: '100' } })
    fireEvent.change(document.getElementById('toAmount')!, { target: { value: '90' } })
    await waitFor(() => {
      expect(screen.getByText(/1 USD = 0\.900000 EUR/i)).toBeInTheDocument()
    })
  })

  it('does not show effective rate when amounts are empty', () => {
    render(<ExchangeTransactionForm {...defaultProps} />)
    expect(screen.queryByText(/Rate:/i)).not.toBeInTheDocument()
  })

  it('shows validation errors for missing destination amount', async () => {
    render(<ExchangeTransactionForm {...defaultProps} />)
    fireEvent.change(document.getElementById('amount')!, { target: { value: '100' } })
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(screen.getByText('Destination amount is required')).toBeInTheDocument()
    })
  })

  it('submits correct exchange payload', async () => {
    render(<ExchangeTransactionForm {...defaultProps} />)
    fireEvent.change(document.getElementById('amount')!, { target: { value: '100' } })
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } })
    fireEvent.change(document.getElementById('toAmount')!, { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ account_id: 1, sign: '-', amount_int: 100, tag_id: SYSTEM_TAGS.EXCHANGE }),
            expect.objectContaining({ account_id: 2, sign: '+', amount_int: 90, tag_id: SYSTEM_TAGS.EXCHANGE }),
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
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '-',
          amount_int: 200,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
        {
          id: new Uint8Array(8),
          trx_id: new Uint8Array(8),
          account_id: 2,
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '+',
          amount_int: 180,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
      ],
    }
    render(<ExchangeTransactionForm {...defaultProps} initialData={initialData} />)
    expect(document.getElementById('amount')).toHaveValue(200)
    expect(document.getElementById('toAmount')).toHaveValue(180)
  })

  it('allows changing account', () => {
    render(<ExchangeTransactionForm {...defaultProps} />)
    const accountSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(accountSelect, { target: { value: '2' } })
    expect(accountSelect).toHaveValue('2')
  })

  it('allows changing note', () => {
    render(<ExchangeTransactionForm {...defaultProps} />)
    const textarea = screen.getByPlaceholderText('Add notes...')
    fireEvent.change(textarea, { target: { value: 'exchange note' } })
    expect(textarea).toHaveValue('exchange note')
  })

  it('submits with note in payload', async () => {
    render(<ExchangeTransactionForm {...defaultProps} />)
    fireEvent.change(document.getElementById('amount')!, { target: { value: '100' } })
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } })
    fireEvent.change(document.getElementById('toAmount')!, { target: { value: '90' } })
    fireEvent.change(screen.getByPlaceholderText('Add notes...'), { target: { value: 'fx note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(mockTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ note: 'fx note' })
      )
    })
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
          tag_id: SYSTEM_TAGS.EXCHANGE,
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
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '+',
          amount_int: 90,
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
          amount_int: 2,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
      ],
    }
    render(<ExchangeTransactionForm {...defaultProps} initialData={initialData} />)
    await waitFor(() => {
      expect(screen.getByLabelText(/fee.*optional/i)).toHaveValue(2)
    })
  })

  it('allows changing datetime', () => {
    render(<ExchangeTransactionForm {...defaultProps} />)
    const dtInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement
    fireEvent.change(dtInput, { target: { value: '2024-01-15T10:30' } })
    expect(dtInput).toHaveValue('2024-01-15T10:30')
  })

  it('shows validation errors for missing account', async () => {
    render(<ExchangeTransactionForm {...defaultProps} defaultAccountId="" />)
    fireEvent.change(document.getElementById('amount')!, { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(screen.getByText('Account is required')).toBeInTheDocument()
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
          amount_int: 90,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        },
      ],
    }

    render(<ExchangeTransactionForm {...defaultProps} initialData={initialData} />)
    await waitFor(() => expect(document.getElementById('amount')).toHaveValue(100))
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() => {
      expect(mockTransactionRepository.update).toHaveBeenCalled()
      expect(mockTransactionRepository.create).not.toHaveBeenCalled()
    })
  })
})
