import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TransactionItem } from '../../../../components/transactions/TransactionItem'
import { formatCurrencyValue } from '../../../../utils/formatters'
import type { TransactionLog } from '../../../../types'

describe('TransactionItem', () => {
  const baseTransaction: TransactionLog = {
    id: new Uint8Array(8),
    date_time: '2025-01-09 14:30:00',
    counterparty: null,
    wallet: 'Cash',
    wallet_color: null,
    currency: 'USD',
    tags: 'food',
    sign: '-',
    amount_int: 50,
    amount_frac: 0,
    rate_int: 1,
    rate_frac: 0,
    symbol: '$',
    decimal_places: 2,
    tag_is_common: 0,
  }

  it('renders expense transaction', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText(formatCurrencyValue(50, '$'))).toBeInTheDocument()
  })

  it('renders income transaction (positive amount)', () => {
    const incomeTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'sale',
      sign: '+',
      amount_int: 1000,
      amount_frac: 0,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[incomeTransaction]} onClick={onClick} />)

    expect(screen.getByText('Sale')).toBeInTheDocument()
    expect(screen.getByText(formatCurrencyValue(1000, '$'))).toBeInTheDocument()
  })

  it('renders transfer transaction in same currency', () => {
    const transferTransaction: TransactionLog[] = [
      {
        ...baseTransaction,
        tags: 'transfer',
        sign: '-',
        amount_int: 50,
        amount_frac: 0,
      },
      {
        ...baseTransaction,
        wallet: 'Bank',
        tags: 'transfer',
        sign: '+',
        amount_int: 50,
        amount_frac: 0,
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={transferTransaction} onClick={onClick} />)

    expect(screen.getByText('Transfer')).toBeInTheDocument()
    expect(screen.getByText('↔️')).toBeInTheDocument()
    expect(screen.getByText('Cash → Bank')).toBeInTheDocument()
  })

  it('renders transfer transaction in different currencies currency', () => {
    // this test case should not be exists in real live - transfer in different currencies = exchange
    const transferTransaction: TransactionLog[] = [
      {
        ...baseTransaction,
        tags: 'transfer',
        sign: '-',
        amount_int: 50,
        amount_frac: 0,
      },
      {
        ...baseTransaction,
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        tags: 'transfer',
        sign: '+',
        amount_int: 50,
        amount_frac: 0,
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={transferTransaction} onClick={onClick} />)

    expect(screen.getByText('Transfer')).toBeInTheDocument()
    expect(screen.getByText('↔️')).toBeInTheDocument()
    // Check description contains both wallet:symbol pairs
    const description = screen.getByText((_, element) => {
      return element?.textContent === 'Cash:$ → Bank:AR$'
    })
    expect(description).toBeInTheDocument()
  })

  it('renders exchange transaction in same wallet', () => {
    const exchangeTransaction: TransactionLog[] = [
      {
        ...baseTransaction,
        tags: 'exchange',
        sign: '-',
        amount_int: 50,
        amount_frac: 0,
      },
      {
        ...baseTransaction,
        tags: 'exchange',
        currency: 'ARS',
        symbol: 'AR$',
        sign: '+',
        amount_int: 0,
        amount_frac: 5e17, // 0.50
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

    expect(screen.getByText('Exchange')).toBeInTheDocument()
    expect(screen.getByText('💱')).toBeInTheDocument()
    expect(screen.getByText('USD → ARS')).toBeInTheDocument()
  })

  it('renders exchange transaction in different wallets', () => {
    const exchangeTransaction: TransactionLog[] = [
      {
        ...baseTransaction,
        tags: 'exchange',
        sign: '-',
        amount_int: 50,
        amount_frac: 0,
      },
      {
        ...baseTransaction,
        tags: 'exchange',
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        sign: '+',
        amount_int: 0,
        amount_frac: 5e17, // 0.50
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

    expect(screen.getByText('Exchange')).toBeInTheDocument()
    expect(screen.getByText('💱')).toBeInTheDocument()
    // Check description contains both wallet:symbol pairs
    const description = screen.getByText((_, element) => {
      return element?.textContent === 'Cash:$ → Bank:AR$'
    })
    expect(description).toBeInTheDocument()
    expect(screen.getByText(`${formatCurrencyValue(50, '$')} → ${formatCurrencyValue(0.5, 'AR$')}`)).toBeInTheDocument()
  })

  it('renders multi-currency expense', () => {
    const transaction: TransactionLog[] = [
      {
        ...baseTransaction,
        tags: 'exchange',
        sign: '-',
        amount_int: 50,
        amount_frac: 0,
      },
      {
        ...baseTransaction,
        tags: 'exchange',
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        sign: '+',
        amount_int: 0,
        amount_frac: 5e17, // 0.50
      },
      {
        ...baseTransaction,
        tags: 'Food',
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        sign: '-',
        amount_int: 0,
        amount_frac: 5e17, // 0.50
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={transaction} onClick={onClick} />)

    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('📉')).toBeInTheDocument()
    // Shows source wallet (where money came from) with source currency
    expect(screen.getByText('Cash:$')).toBeInTheDocument()
    expect(screen.getByText(formatCurrencyValue(0.5, 'AR$'))).toBeInTheDocument()
  })

  describe('multi-currency transactions edge-cases', () => {
    const transaction: TransactionLog[] = []
    beforeEach(() => {
      transaction.splice(0)
      transaction
        .push(
          {
            ...baseTransaction,
            tags: 'exchange',
            sign: '-',
            amount_int: 50,
            amount_frac: 0,
          },
          {
            ...baseTransaction,
            tags: 'exchange',
            wallet: 'Bank',
            currency: 'ARS',
            symbol: 'AR$',
            sign: '+',
            amount_int: 0,
            amount_frac: 5e17, // 0.50
          })
    })

    it('should render transaction with Coffee tag', () => {
      transaction.push(
        {
          ...baseTransaction,
          tags: 'Coffee',
          wallet: 'Bank',
          currency: 'ARS',
          symbol: 'AR$',
          sign: '-',
          amount_int: 0,
          amount_frac: 5e17, // 0.50
        })

      const onClick = vi.fn()
      render(<TransactionItem transaction={transaction} onClick={onClick} />)

      expect(screen.getByText('Coffee')).toBeInTheDocument()
      expect(screen.getByText('📉')).toBeInTheDocument()
      // Shows source wallet (where money came from) with source currency
      expect(screen.getByText('Cash:$')).toBeInTheDocument()
      expect(screen.getByText(formatCurrencyValue(0.5, 'AR$'))).toBeInTheDocument()
    })

    it('should render transaction with Fee tag as exchange', () => {
      transaction.push(
        {
          ...baseTransaction,
          tags: 'Fee',
          wallet: 'Bank',
          currency: 'ARS',
          symbol: 'AR$',
          sign: '-',
          amount_int: 0,
          amount_frac: 5e17, // 0.50
        })

      const onClick = vi.fn()
      render(<TransactionItem transaction={transaction} onClick={onClick} />)

      expect(screen.getByText('Exchange')).toBeInTheDocument()
      expect(screen.getByText('💱')).toBeInTheDocument()
    })

    it('transactions order should not matters for expense', () => {
      transaction.push(
        {
          ...baseTransaction,
          tags: 'Coffee',
          wallet: 'Bank',
          currency: 'ARS',
          symbol: 'AR$',
          sign: '-',
          amount_int: 0,
          amount_frac: 5e17, // 0.50
        })
      transaction.reverse()

      const onClick = vi.fn()
      render(<TransactionItem transaction={transaction} onClick={onClick} />)

      expect(screen.getByText('Coffee')).toBeInTheDocument()
      expect(screen.getByText('📉')).toBeInTheDocument()
      // Shows source wallet (where money came from) with source currency
      expect(screen.getByText('Cash:$')).toBeInTheDocument()
      expect(screen.getByText(formatCurrencyValue(0.5, 'AR$'))).toBeInTheDocument()
    })

    it('transactions order should not matters for exchange', () => {
      transaction.push(
        {
          ...baseTransaction,
          tags: 'Fee',
          wallet: 'Bank',
          currency: 'ARS',
          symbol: 'AR$',
          sign: '-',
          amount_int: 0,
          amount_frac: 5e17, // 0.50
        })
      transaction.reverse()

      const onClick = vi.fn()
      render(<TransactionItem transaction={transaction} onClick={onClick} />)

      expect(screen.getByText('Exchange')).toBeInTheDocument()
      expect(screen.getByText('💱')).toBeInTheDocument()
    })
  })

  it('renders multi-currency expense with counterparty', () => {
    const exchangeTransaction: TransactionLog[] = [
      {
        ...baseTransaction,
        tags: 'exchange',
        sign: '-',
        amount_int: 50,
        amount_frac: 0,
        counterparty: 'Amazon',
      },
      {
        ...baseTransaction,
        tags: 'exchange',
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        sign: '+',
        amount_int: 0,
        amount_frac: 5e17, // 0.50
        counterparty: 'Amazon',
      },
      {
        ...baseTransaction,
        tags: 'Food',
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        sign: '-',
        amount_int: 0,
        amount_frac: 5e17, // 0.50
        counterparty: 'Amazon',
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

    expect(screen.getByText('Food')).toBeInTheDocument()
    // Shows counterparty when available for multi-currency expense
    expect(screen.getByText('Amazon')).toBeInTheDocument()
  })

  it('sums all sub-entries for multi-currency multi-sub-entry expense', () => {
    const transaction: TransactionLog[] = [
      { ...baseTransaction, tags: 'food', wallet: 'Bank', currency: 'USD', symbol: '$', sign: '-', amount_int: 10, amount_frac: 0, tag_is_common: 0 },
      { ...baseTransaction, tags: 'exchange', sign: '-', amount_int: 12, amount_frac: 0 },
      { ...baseTransaction, tags: 'exchange', wallet: 'Bank', currency: 'USD', symbol: '$', sign: '+', amount_int: 12, amount_frac: 0 },
      { ...baseTransaction, tags: 'house', wallet: 'Bank', currency: 'USD', symbol: '$', sign: '-', amount_int: 2, amount_frac: 0, tag_is_common: 0 },
    ]
    render(<TransactionItem transaction={transaction} onClick={vi.fn()} />)

    expect(screen.getByText(formatCurrencyValue(12, '$'))).toBeInTheDocument()
    expect(screen.getByText('Food, House')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('displays income icon for positive amounts', () => {
    const incomeTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'sale',
      sign: '+',
      amount_int: 50,
      amount_frac: 0,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[incomeTransaction]} onClick={onClick} />)

    expect(screen.getByText('📈')).toBeInTheDocument()
  })

  it('displays time', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

    expect(screen.getByText('14:30')).toBeInTheDocument()
  })

  it('displays counterparty when available', () => {
    const withCounterparty: TransactionLog = {
      ...baseTransaction,
      counterparty: 'Supermarket',
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[withCounterparty]} onClick={onClick} />)

    expect(screen.getByText('Supermarket')).toBeInTheDocument()
  })

  it('falls back to wallet name when no counterparty', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

    // Wallet name appears in the description
    expect(screen.getByText('Cash')).toBeInTheDocument()
  })

  it('uses default currency symbol when not provided', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

    expect(screen.getByText(formatCurrencyValue(50, '$'))).toBeInTheDocument()
  })

  it('applies green color for income (positive amount)', () => {
    const incomeTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'sale',
      sign: '+',
      amount_int: 50,
      amount_frac: 0,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[incomeTransaction]} onClick={onClick} />)

    const amount = screen.getByText(formatCurrencyValue(50, '$'))
    expect(amount.className).toContain('text-green-600')
  })

  it('applies red color for expense (negative amount)', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

    const amount = screen.getByText(formatCurrencyValue(50, '$'))
    expect(amount.className).toContain('text-gray-600')
  })

  it.skip('formats amount with custom decimal places', () => {
    const onClick = vi.fn()
    render(
      <TransactionItem
        transaction={[baseTransaction]}
        onClick={onClick}
      />
    )

    expect(screen.getByText('$0.5000')).toBeInTheDocument()
  })

  it('shows tags in primary display', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

    expect(screen.getAllByText('Food').length > 0).toBeTruthy()
  })

  it('handles missing tags', () => {
    const noTags: TransactionLog = {
      ...baseTransaction,
      tags: '',
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[noTags]} onClick={onClick} />)

    // Should show "Uncategorized" for empty tags
    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
  })

  it('renders INITIAL transaction with bank icon', () => {
    const initialTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'initial',
      sign: '+',
      amount_int: 1000,
      amount_frac: 0,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[initialTransaction]} onClick={onClick} />)

    expect(screen.getByText('Initial Balance')).toBeInTheDocument()
    expect(screen.getByText('🏦')).toBeInTheDocument()
  })

  it('renders ADJUSTMENT transaction with balance icon', () => {
    const adjustmentTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'adjustment',
      sign: '+',
      amount_int: 50,
      amount_frac: 0,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[adjustmentTransaction]} onClick={onClick} />)

    expect(screen.getByText('Adjustment')).toBeInTheDocument()
    expect(screen.getByText('⚖️')).toBeInTheDocument()
  })

  it('applies neutral slate color for INITIAL transactions', () => {
    const initialTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'initial',
      sign: '+',
      amount_int: 1000,
      amount_frac: 0,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[initialTransaction]} onClick={onClick} />)

    const amount = screen.getByText(formatCurrencyValue(1000, '$'))
    expect(amount.className).toContain('text-slate-500')
  })

  it('applies neutral slate color for ADJUSTMENT transactions', () => {
    const adjustmentTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'adjustment',
      sign: '-',
      amount_int: 50,
      amount_frac: 0,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[adjustmentTransaction]} onClick={onClick} />)

    const amount = screen.getByText(formatCurrencyValue(50, '$'))
    expect(amount.className).toContain('text-slate-500')
  })

  it('applies green color to INITIAL transaction title', () => {
    const initialTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'initial',
      sign: '+',
      amount_int: 1000,
      amount_frac: 0,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[initialTransaction]} onClick={onClick} />)

    const title = screen.getByText('Initial Balance')
    expect(title.className).toContain('text-green-600')
  })

  it('applies yellow color to ADJUSTMENT transaction title', () => {
    const adjustmentTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'adjustment',
      sign: '+',
      amount_int: 50,
      amount_frac: 0,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[adjustmentTransaction]} onClick={onClick} />)

    const title = screen.getByText('Adjustment')
    expect(title.className).toContain('text-yellow-600')
  })

  it('applies default gray color to regular transaction title', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

    const title = screen.getByText('Food')
    expect(title.className).toContain('text-gray-900')
  })

  describe('wallet color in description', () => {
    it('renders wallet name with color when wallet_color is set', () => {
      const coloredTransaction: TransactionLog = {
        ...baseTransaction,
        wallet_color: '#FF5733',
      }
      const onClick = vi.fn()
      render(<TransactionItem transaction={[coloredTransaction]} onClick={onClick} />)

      const walletText = screen.getByText('Cash')
      expect(walletText).toHaveStyle({ color: '#FF5733' })
    })

    it('renders wallet name without style when wallet_color is null', () => {
      const onClick = vi.fn()
      render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

      const walletText = screen.getByText('Cash')
      expect(walletText).not.toHaveStyle({ color: expect.any(String) })
    })

    it('renders transfer with both wallets colored independently', () => {
      const transferTransaction: TransactionLog[] = [
        {
          ...baseTransaction,
          tags: 'transfer',
          wallet_color: '#FF5733',
          sign: '-',
          amount_int: 50,
          amount_frac: 0,
        },
        {
          ...baseTransaction,
          wallet: 'Bank',
          wallet_color: '#3498DB',
          tags: 'transfer',
          sign: '+',
          amount_int: 50,
          amount_frac: 0,
        },
      ]
      const onClick = vi.fn()
      render(<TransactionItem transaction={transferTransaction} onClick={onClick} />)

      const cashText = screen.getByText('Cash')
      const bankText = screen.getByText('Bank')
      expect(cashText).toHaveStyle({ color: '#FF5733' })
      expect(bankText).toHaveStyle({ color: '#3498DB' })
    })

    it('renders transfer with mixed colors (one null, one set)', () => {
      const transferTransaction: TransactionLog[] = [
        {
          ...baseTransaction,
          tags: 'transfer',
          wallet_color: '#FF5733',
          sign: '-',
          amount_int: 50,
          amount_frac: 0,
        },
        {
          ...baseTransaction,
          wallet: 'Bank',
          wallet_color: null,
          tags: 'transfer',
          sign: '+',
          amount_int: 50,
          amount_frac: 0,
        },
      ]
      const onClick = vi.fn()
      render(<TransactionItem transaction={transferTransaction} onClick={onClick} />)

      // Cash should have a colored span
      const cashText = screen.getByText('Cash')
      expect(cashText).toHaveStyle({ color: '#FF5733' })
      expect(cashText.tagName).toBe('SPAN')

      // Bank has no color, so it's a text node in parent (not wrapped in span)
      // Verify description contains "Bank" but as plain text
      const descriptionLine = screen.getByText((_, element) => {
        return element?.textContent === 'Cash → Bank'
      })
      expect(descriptionLine).toBeInTheDocument()
    })

    it('renders counterparty with wallet color', () => {
      const withCounterparty: TransactionLog = {
        ...baseTransaction,
        counterparty: 'Amazon',
        wallet_color: '#FF5733',
      }
      const onClick = vi.fn()
      render(<TransactionItem transaction={[withCounterparty]} onClick={onClick} />)

      const counterpartyText = screen.getByText('Amazon')
      expect(counterpartyText).toHaveStyle({ color: '#FF5733' })
    })

    it('renders counterparty without style when wallet_color is null', () => {
      const withCounterparty: TransactionLog = {
        ...baseTransaction,
        counterparty: 'Supermarket',
      }
      const onClick = vi.fn()
      render(<TransactionItem transaction={[withCounterparty]} onClick={onClick} />)

      const counterpartyText = screen.getByText('Supermarket')
      expect(counterpartyText).not.toHaveStyle({ color: expect.any(String) })
    })

    it('renders same-wallet exchange with currency names colored', () => {
      const exchangeTransaction: TransactionLog[] = [
        {
          ...baseTransaction,
          tags: 'exchange',
          wallet_color: '#FF5733',
          sign: '-',
          amount_int: 50,
          amount_frac: 0,
        },
        {
          ...baseTransaction,
          tags: 'exchange',
          wallet_color: '#FF5733',
          currency: 'ARS',
          symbol: 'AR$',
          sign: '+',
          amount_int: 0,
          amount_frac: 5e17, // 0.50
        },
      ]
      const onClick = vi.fn()
      render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

      const usdText = screen.getByText('USD')
      const arsText = screen.getByText('ARS')
      expect(usdText).toHaveStyle({ color: '#FF5733' })
      expect(arsText).toHaveStyle({ color: '#FF5733' })
    })

    it('renders multi-currency expense counterparty with wallet color', () => {
      const exchangeTransaction: TransactionLog[] = [
        {
          ...baseTransaction,
          tags: 'exchange',
          wallet_color: '#FF5733',
          sign: '-',
          amount_int: 50,
          amount_frac: 0,
          counterparty: 'Amazon',
        },
        {
          ...baseTransaction,
          tags: 'exchange',
          wallet: 'Bank',
          wallet_color: '#3498DB',
          currency: 'ARS',
          symbol: 'AR$',
          sign: '+',
          amount_int: 0,
          amount_frac: 5e17, // 0.50
          counterparty: 'Amazon',
        },
        {
          ...baseTransaction,
          tags: 'Food',
          wallet: 'Bank',
          wallet_color: '#3498DB',
          currency: 'ARS',
          symbol: 'AR$',
          sign: '-',
          amount_int: 0,
          amount_frac: 5e17, // 0.50
          counterparty: 'Amazon',
        },
      ]
      const onClick = vi.fn()
      render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

      const counterpartyText = screen.getByText('Amazon')
      // Counterparty uses the first line's wallet color that has the counterparty
      expect(counterpartyText).toHaveStyle({ color: '#FF5733' })
    })
  })

  describe('readonly transactions', () => {
    it('does not call onClick for INITIAL transactions', () => {
      const initialTransaction: TransactionLog = {
        ...baseTransaction,
        tags: 'initial',
        sign: '+',
        amount_int: 1000,
        amount_frac: 0,
      }
      const onClick = vi.fn()
      render(<TransactionItem transaction={[initialTransaction]} onClick={onClick} />)

      // Initial transactions should not have button role
      expect(screen.queryByRole('button')).toBeNull()

      // Click should not trigger onClick
      const item = screen.getByText('Initial Balance').closest('div[class*="w-full"]')
      fireEvent.click(item!)

      expect(onClick).not.toHaveBeenCalled()
    })

    it('does not call onClick for ADJUSTMENT transactions', () => {
      const adjustmentTransaction: TransactionLog = {
        ...baseTransaction,
        tags: 'adjustment',
        sign: '+',
        amount_int: 50,
        amount_frac: 0,
      }
      const onClick = vi.fn()
      render(<TransactionItem transaction={[adjustmentTransaction]} onClick={onClick} />)

      // Adjustment transactions should not have button role
      expect(screen.queryByRole('button')).toBeNull()

      // Click should not trigger onClick
      const item = screen.getByText('Adjustment').closest('div[class*="w-full"]')
      fireEvent.click(item!)

      expect(onClick).not.toHaveBeenCalled()
    })

    it('has cursor-default class for INITIAL transactions', () => {
      const initialTransaction: TransactionLog = {
        ...baseTransaction,
        tags: 'initial',
        sign: '+',
        amount_int: 1000,
        amount_frac: 0,
      }
      const onClick = vi.fn()
      render(<TransactionItem transaction={[initialTransaction]} onClick={onClick} />)

      const item = screen.getByText('Initial Balance').closest('div[class*="w-full"]')
      expect(item?.className).toContain('cursor-default')
      expect(item?.className).not.toContain('cursor-pointer')
    })

    it('has cursor-pointer class for regular transactions', () => {
      const onClick = vi.fn()
      render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

      const item = screen.getByRole('button')
      expect(item?.className).toContain('cursor-pointer')
      expect(item?.className).not.toContain('cursor-default')
    })
  })

  describe('add-on-only transactions (tag_is_common = 1)', () => {
    it('shows add-on tag name for single expense with only Tips tag', () => {
      const transaction: TransactionLog = {
        ...baseTransaction,
        tags: 'Tips',
        sign: '-',
        tag_is_common: 1,
      }
      render(<TransactionItem transaction={[transaction]} onClick={vi.fn()} />)
      expect(screen.getByText('Tips')).toBeInTheDocument()
      expect(screen.queryByText('Uncategorized')).not.toBeInTheDocument()
    })

    it('shows add-on tag name for single expense with only VAT tag', () => {
      const transaction: TransactionLog = {
        ...baseTransaction,
        tags: 'VAT',
        sign: '-',
        tag_is_common: 1,
      }
      render(<TransactionItem transaction={[transaction]} onClick={vi.fn()} />)
      expect(screen.getByText('Vat')).toBeInTheDocument()
      expect(screen.queryByText('Uncategorized')).not.toBeInTheDocument()
    })

    it('shows add-on tag name for single income with only Tips tag', () => {
      const transaction: TransactionLog = {
        ...baseTransaction,
        tags: 'Tips',
        sign: '+',
        tag_is_common: 1,
      }
      render(<TransactionItem transaction={[transaction]} onClick={vi.fn()} />)
      expect(screen.getByText('Tips')).toBeInTheDocument()
      expect(screen.queryByText('Uncategorized')).not.toBeInTheDocument()
    })

    it('shows primary tag when expense has both primary and add-on tags', () => {
      const transactions: TransactionLog[] = [
        { ...baseTransaction, tags: 'Food', sign: '-', tag_is_common: 0, amount_int: 40 },
        { ...baseTransaction, tags: 'Tips', sign: '-', tag_is_common: 1, amount_int: 10 },
      ]
      render(<TransactionItem transaction={transactions} onClick={vi.fn()} />)
      expect(screen.getByText('Food')).toBeInTheDocument()
      expect(screen.queryByText('Tips')).not.toBeInTheDocument()
      expect(screen.queryByText('Uncategorized')).not.toBeInTheDocument()
    })

    it('shows add-on tag for multi-currency expense with only Tips add-on', () => {
      const transactions: TransactionLog[] = [
        { ...baseTransaction, tags: 'exchange', sign: '-', amount_int: 50, tag_is_common: 0 },
        { ...baseTransaction, tags: 'exchange', wallet: 'Bank', currency: 'ARS', symbol: 'AR$', sign: '+', amount_int: 0, amount_frac: 5e17, tag_is_common: 0 },
        { ...baseTransaction, tags: 'Tips', wallet: 'Bank', currency: 'ARS', symbol: 'AR$', sign: '-', amount_int: 0, amount_frac: 5e17, tag_is_common: 1 },
      ]
      render(<TransactionItem transaction={transactions} onClick={vi.fn()} />)
      expect(screen.getByText('Tips')).toBeInTheDocument()
      expect(screen.queryByText('Uncategorized')).not.toBeInTheDocument()
    })

    it('shows primary tag for multi-currency expense with primary and Tips add-on', () => {
      const transactions: TransactionLog[] = [
        { ...baseTransaction, tags: 'exchange', sign: '-', amount_int: 50, tag_is_common: 0 },
        { ...baseTransaction, tags: 'exchange', wallet: 'Bank', currency: 'ARS', symbol: 'AR$', sign: '+', amount_int: 0, amount_frac: 5e17, tag_is_common: 0 },
        { ...baseTransaction, tags: 'Food', wallet: 'Bank', currency: 'ARS', symbol: 'AR$', sign: '-', amount_int: 0, amount_frac: 4e17, tag_is_common: 0 },
        { ...baseTransaction, tags: 'Tips', wallet: 'Bank', currency: 'ARS', symbol: 'AR$', sign: '-', amount_int: 0, amount_frac: 1e17, tag_is_common: 1 },
      ]
      render(<TransactionItem transaction={transactions} onClick={vi.fn()} />)
      expect(screen.getByText('Food')).toBeInTheDocument()
      expect(screen.queryByText('Tips')).not.toBeInTheDocument()
      expect(screen.queryByText('Uncategorized')).not.toBeInTheDocument()
    })
  })

  it('renders expense tag name when tag_is_common is absent (regression: trx_log view missing column)', () => {
    const { tag_is_common: _, ...withoutTagIsCommon } = baseTransaction
    const transaction = withoutTagIsCommon as TransactionLog
    render(<TransactionItem transaction={[transaction]} onClick={vi.fn()} />)
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.queryByText('Uncategorized')).not.toBeInTheDocument()
  })
})
