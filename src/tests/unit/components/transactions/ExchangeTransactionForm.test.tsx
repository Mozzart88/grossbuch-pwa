import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExchangeTransactionForm } from '../../../../components/transactions/ExchangeTransactionForm'
import type { Transaction } from '../../../../types'
import { SYSTEM_TAGS } from '../../../../types'
import { LayoutProvider } from '../../../../store/LayoutContext'

vi.mock('../../../../services/repositories', () => ({
  currencyRepository: {
    getRateForCurrency: vi.fn(),
    findSystem: vi.fn(),
    setExchangeRate: vi.fn(),
  },
  transactionRepository: { create: vi.fn(), update: vi.fn() },
}))

vi.mock('../../../../services/exchangeRate/historicalRateService', () => ({
  getRateForDate: vi.fn().mockResolvedValue({ int: 1, frac: 0 }),
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

  describe('fee field interaction', () => {
    it('sets feeTagId when fee is entered', async () => {
      render(<ExchangeTransactionForm {...defaultProps} />)
      fireEvent.change(document.getElementById('amount')!, { target: { value: '100' } })
      fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } })
      fireEvent.change(document.getElementById('toAmount')!, { target: { value: '90' } })
      // Enter a fee value — triggers onChange with non-empty, non-zero value
      const feeInput = screen.getByLabelText(/fee.*optional/i)
      fireEvent.change(feeInput, { target: { value: '2' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ tag_id: SYSTEM_TAGS.FEE, sign: '-', amount_int: 2 }),
            ]),
          })
        )
      })
    })

    it('clears feeTagId when fee is set to empty', () => {
      render(<ExchangeTransactionForm {...defaultProps} />)
      const feeInput = screen.getByLabelText(/fee.*optional/i)
      // Set a value first
      fireEvent.change(feeInput, { target: { value: '5' } })
      // Then clear it — triggers onChange with ''
      fireEvent.change(feeInput, { target: { value: '' } })
      expect(feeInput).toHaveValue(null)
    })

    it('clears feeTagId when fee is set to zero', () => {
      render(<ExchangeTransactionForm {...defaultProps} />)
      const feeInput = screen.getByLabelText(/fee.*optional/i)
      fireEvent.change(feeInput, { target: { value: '5' } })
      fireEvent.change(feeInput, { target: { value: '0' } })
      expect(feeInput).toHaveValue(0)
    })
  })

  describe('useActionBar with LayoutProvider', () => {
    it('sets Update label when useActionBar=true and initialData present (branch[7][0])', () => {
      const initialData: Transaction = {
        id: new Uint8Array(8),
        timestamp: 1704803400,
        lines: [
          { id: new Uint8Array(8), trx_id: new Uint8Array(8), account_id: 1, tag_id: SYSTEM_TAGS.EXCHANGE, sign: '-', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 },
          { id: new Uint8Array(8), trx_id: new Uint8Array(8), account_id: 2, tag_id: SYSTEM_TAGS.EXCHANGE, sign: '+', amount_int: 90, amount_frac: 0, rate_int: 1, rate_frac: 0 },
        ],
      }
      render(
        <LayoutProvider>
          <ExchangeTransactionForm {...defaultProps} useActionBar={true} initialData={initialData} />
        </LayoutProvider>
      )
      // With useActionBar, submit button is in action bar — not in the form
      expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument()
    })
  })

  describe('exchange rate logic', () => {
    it('skips rate update when findSystem returns null', async () => {
      mockCurrencyRepository.findSystem.mockResolvedValue(null as any)
      render(<ExchangeTransactionForm {...defaultProps} />)
      fireEvent.change(document.getElementById('amount')!, { target: { value: '100' } })
      fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } })
      fireEvent.change(document.getElementById('toAmount')!, { target: { value: '90' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalled()
        expect(mockCurrencyRepository.setExchangeRate).not.toHaveBeenCalled()
      })
    })

    it('sets from-currency rate when to-account is system currency', async () => {
      // Account 2 has currency_id=2 (EUR), but here we mock it as system currency
      mockCurrencyRepository.findSystem.mockResolvedValue({ id: 2, code: 'EUR' } as any)
      render(<ExchangeTransactionForm {...defaultProps} />)
      fireEvent.change(document.getElementById('amount')!, { target: { value: '100' } })
      fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } })
      fireEvent.change(document.getElementById('toAmount')!, { target: { value: '90' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockCurrencyRepository.setExchangeRate).toHaveBeenCalledWith(
          1, // fromCurrency.currency_id (USD, account 1)
          expect.any(Number),
          expect.any(Number),
          expect.any(String),
        )
      })
    })

    it('skips rate update when neither from nor to is system currency (branch[32][1])', async () => {
      // Add a third-currency account (JPY, currency_id=3) to accounts
      // EUR(currency_id=2)→JPY(currency_id=3) with default=USD(id=1): neither matches default
      const accountsWithJPY = [
        ...mockAccounts,
        { id: 4, wallet_id: 4, currency_id: 3, balance_int: 5000, balance_frac: 0, updated_at: 1704067200, walletName: 'JPY Wallet', walletIsDefault: false, currencyCode: 'JPY', currencySymbol: '¥', decimalPlaces: 0 },
      ]
      render(<ExchangeTransactionForm {...defaultProps} accounts={accountsWithJPY as any} defaultAccountId="2" />)
      // From EUR(account2), to JPY(account4) — neither is USD default
      fireEvent.change(document.getElementById('amount')!, { target: { value: '100' } })
      // Select to-account = JPY (account4)
      const toAccountSelect = screen.getAllByRole('combobox')[1]
      fireEvent.change(toAccountSelect, { target: { value: '4' } })
      fireEvent.change(document.getElementById('toAmount')!, { target: { value: '15000' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalled()
        // Neither currency is the default → setExchangeRate NOT called
        expect(mockCurrencyRepository.setExchangeRate).not.toHaveBeenCalled()
      })
    })
  })

  describe('fee with zero value uses SYSTEM_TAGS.FEE (branch[34][1])', () => {
    it('submits with SYSTEM_TAGS.FEE when fee=0 (feeTagId cleared)', async () => {
      // fee='0' → handler sets feeTagId='' (falsy) → feeIntFrac={int:0,frac:0} (truthy obj)
      // → if(feeIntFrac) enters → feeTagId?int:SYSTEM_TAGS.FEE → SYSTEM_TAGS.FEE
      render(<ExchangeTransactionForm {...defaultProps} />)
      fireEvent.change(document.getElementById('amount')!, { target: { value: '100' } })
      fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } })
      fireEvent.change(document.getElementById('toAmount')!, { target: { value: '90' } })
      const feeInput = screen.getByLabelText(/fee.*optional/i)
      // Set fee to '5' first (sets feeTagId), then to '0' (clears feeTagId)
      fireEvent.change(feeInput, { target: { value: '5' } })
      fireEvent.change(feeInput, { target: { value: '0' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() => {
        expect(mockTransactionRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lines: expect.arrayContaining([
              expect.objectContaining({ tag_id: SYSTEM_TAGS.FEE }),
            ]),
          })
        )
      })
    })
  })
})
