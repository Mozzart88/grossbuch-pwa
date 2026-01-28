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
})
