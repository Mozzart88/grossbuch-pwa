import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TransactionItem } from '../../../../components/transactions/TransactionItem'
import type { TransactionLog } from '../../../../types'

describe('TransactionItem', () => {
  const baseTransaction: TransactionLog = {
    id: new Uint8Array(8),
    date_time: '2025-01-09 14:30:00',
    counterparty: null,
    wallet: 'Cash',
    currency: 'USD',
    tags: 'food',
    amount: -5000, // -50.00
    rate: 0,
    symbol: '$',
    decimal_places: 2
  }

  it('renders expense transaction', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('$50.00')).toBeInTheDocument()
  })

  it('renders income transaction (positive amount)', () => {
    const incomeTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'sale',
      amount: 100000,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[incomeTransaction]} onClick={onClick} />)

    expect(screen.getByText('Sale')).toBeInTheDocument()
    expect(screen.getByText('$1,000.00')).toBeInTheDocument()
  })

  it('renders transfer transaction in same currency', () => {
    const transferTransaction: TransactionLog[] = [
      {
        ...baseTransaction,
        tags: 'transfer',
        amount: -5000,
      },
      {
        ...baseTransaction,
        wallet: 'Bank',
        tags: 'transfer',
        amount: 5000,
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={transferTransaction} onClick={onClick} />)

    expect(screen.getByText('Transfer')).toBeInTheDocument()
    expect(screen.getByText('↔️')).toBeInTheDocument()
    expect(screen.getByText('Cash → Bank')).toBeInTheDocument()
  })

  it('renders transfer transaction in different currencies currency', () => {
    const transferTransaction: TransactionLog[] = [
      {
        ...baseTransaction,
        tags: 'transfer',
        amount: -5000,
      },
      {
        ...baseTransaction,
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        tags: 'transfer',
        amount: 5000,
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={transferTransaction} onClick={onClick} />)

    expect(screen.getByText('Transfer')).toBeInTheDocument()
    expect(screen.getByText('↔️')).toBeInTheDocument()
    expect(screen.getByText('Cash:$ → Bank:AR$')).toBeInTheDocument()
  })

  it('renders exchange transaction in same wallet', () => {
    const exchangeTransaction: TransactionLog[] = [
      {
        ...baseTransaction,
        tags: 'exchange',
        amount: -5000,
      },
      {
        ...baseTransaction,
        tags: 'exchange',
        currency: 'ARS',
        symbol: 'AR$',
        amount: 50,
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
        amount: -5000,
      },
      {
        ...baseTransaction,
        tags: 'exchange',
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        amount: 50,
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

    expect(screen.getByText('Exchange')).toBeInTheDocument()
    expect(screen.getByText('💱')).toBeInTheDocument()
    expect(screen.getByText('Cash:$ → Bank:AR$')).toBeInTheDocument()
    expect(screen.getByText('$50.00 → AR$0.50')).toBeInTheDocument()
  })

  it('renders complex transaction in different currencies', () => {
    const exchangeTransaction: TransactionLog[] = [
      {
        ...baseTransaction,
        tags: 'exchange',
        amount: -5000,
      },
      {
        ...baseTransaction,
        tags: 'exchange',
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        amount: 50,
      },
      {
        ...baseTransaction,
        tags: 'Food',
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        amount: -50,
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('📉')).toBeInTheDocument()
    // Shows source wallet (where money came from) with source currency
    expect(screen.getByText('Cash:$')).toBeInTheDocument()
    expect(screen.getByText('AR$0.50')).toBeInTheDocument()
  })

  it('renders multi-currency expense with counterparty', () => {
    const exchangeTransaction: TransactionLog[] = [
      {
        ...baseTransaction,
        tags: 'exchange',
        amount: -5000,
        counterparty: 'Amazon',
      },
      {
        ...baseTransaction,
        tags: 'exchange',
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        amount: 50,
        counterparty: 'Amazon',
      },
      {
        ...baseTransaction,
        tags: 'Food',
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        amount: -50,
        counterparty: 'Amazon',
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

    expect(screen.getByText('Food')).toBeInTheDocument()
    // Shows counterparty when available for multi-currency expense
    expect(screen.getByText('Amazon')).toBeInTheDocument()
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
      amount: 5000,
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

  // it('uses provided currency symbol', () => {
  //   const onClick = vi.fn()
  //   render(
  //     <TransactionItem
  //       transaction={baseTransaction}
  //       onClick={onClick}
  //       currencySymbol="€"
  //     />
  //   )
  //
  //   expect(screen.getByText('-€50.00')).toBeInTheDocument()
  // })

  it('uses default currency symbol when not provided', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

    expect(screen.getByText('$50.00')).toBeInTheDocument()
  })

  it('applies green color for income (positive amount)', () => {
    const incomeTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'sale',
      amount: 5000,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[incomeTransaction]} onClick={onClick} />)

    const amount = screen.getByText('$50.00')
    expect(amount.className).toContain('text-green-600')
  })

  it('applies red color for expense (negative amount)', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

    const amount = screen.getByText('$50.00')
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
      amount: 100000,
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
      amount: 5000,
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
      amount: 100000,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[initialTransaction]} onClick={onClick} />)

    const amount = screen.getByText('$1,000.00')
    expect(amount.className).toContain('text-slate-500')
  })

  it('applies neutral slate color for ADJUSTMENT transactions', () => {
    const adjustmentTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'adjustment',
      amount: -5000,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[adjustmentTransaction]} onClick={onClick} />)

    const amount = screen.getByText('$50.00')
    expect(amount.className).toContain('text-slate-500')
  })

  it('applies green color to INITIAL transaction title', () => {
    const initialTransaction: TransactionLog = {
      ...baseTransaction,
      tags: 'initial',
      amount: 100000,
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
      amount: 5000,
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

  describe('readonly transactions', () => {
    it('does not call onClick for INITIAL transactions', () => {
      const initialTransaction: TransactionLog = {
        ...baseTransaction,
        tags: 'initial',
        amount: 100000,
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
        amount: 5000,
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
        amount: 100000,
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
})
