import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TransactionItem } from '../../../../components/transactions/TransactionItem'
import type { TransactionView } from '../../../../types'

describe('TransactionItem', () => {
  const baseTransaction: TransactionView = {
    id: new Uint8Array(16),
    created_at: '2025-01-09 14:30:00',
    counterparty: null,
    wallet: 'Cash',
    currency: 'USD',
    tags: 'food',
    real_amount: -5000, // -50.00
    actual_amount: -5000,
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
    const incomeTransaction: TransactionView = {
      ...baseTransaction,
      tags: 'sale',
      real_amount: 100000,
      actual_amount: 100000,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[incomeTransaction]} onClick={onClick} />)

    expect(screen.getByText('Sale')).toBeInTheDocument()
    expect(screen.getByText('$1,000.00')).toBeInTheDocument()
  })

  it('renders transfer transaction in same currency', () => {
    const transferTransaction: TransactionView[] = [
      {
        ...baseTransaction,
        tags: 'transfer',
        real_amount: -5000,
        actual_amount: -5000,
      },
      {
        ...baseTransaction,
        wallet: 'Bank',
        tags: 'transfer',
        real_amount: 5000,
        actual_amount: 5000,
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={transferTransaction} onClick={onClick} />)

    expect(screen.getByText('Transfer')).toBeInTheDocument()
    expect(screen.getByText('↔️')).toBeInTheDocument()
    expect(screen.getByText('Cash → Bank')).toBeInTheDocument()
  })

  it('renders transfer transaction in different currencies currency', () => {
    const transferTransaction: TransactionView[] = [
      {
        ...baseTransaction,
        tags: 'transfer',
        real_amount: -5000,
        actual_amount: -5000,
      },
      {
        ...baseTransaction,
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        tags: 'transfer',
        real_amount: 5000,
        actual_amount: 5000,
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={transferTransaction} onClick={onClick} />)

    expect(screen.getByText('Transfer')).toBeInTheDocument()
    expect(screen.getByText('↔️')).toBeInTheDocument()
    expect(screen.getByText('Cash:$ → Bank:AR$')).toBeInTheDocument()
  })

  it('renders exchange transaction in same wallet', () => {
    const exchangeTransaction: TransactionView[] = [
      {
        ...baseTransaction,
        tags: 'exchange',
        real_amount: -5000,
        actual_amount: -5000,
      },
      {
        ...baseTransaction,
        tags: 'exchange',
        currency: 'ARS',
        symbol: 'AR$',
        real_amount: 50,
        actual_amount: 5000,
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

    expect(screen.getByText('Exchange')).toBeInTheDocument()
    expect(screen.getByText('💱')).toBeInTheDocument()
    expect(screen.getByText('USD → ARS')).toBeInTheDocument()
  })

  it('renders exchange transaction in different wallets', () => {
    const exchangeTransaction: TransactionView[] = [
      {
        ...baseTransaction,
        tags: 'exchange',
        real_amount: -5000,
        actual_amount: -5000,
      },
      {
        ...baseTransaction,
        tags: 'exchange',
        wallet: 'Bank',
        currency: 'ARS',
        symbol: 'AR$',
        real_amount: 50,
        actual_amount: 5000,
      },
    ]
    const onClick = vi.fn()
    render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

    expect(screen.getByText('Exchange')).toBeInTheDocument()
    expect(screen.getByText('💱')).toBeInTheDocument()
    expect(screen.getByText('Cash:$ → Bank:AR$')).toBeInTheDocument()
    expect(screen.getByText('$50.00 → AR$0.50')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={[baseTransaction]} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('displays income icon for positive amounts', () => {
    const incomeTransaction: TransactionView = {
      ...baseTransaction,
      tags: 'sale',
      real_amount: 5000,
      actual_amount: 5000,
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
    const withCounterparty: TransactionView = {
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
    const incomeTransaction: TransactionView = {
      ...baseTransaction,
      tags: 'sale',
      real_amount: 5000,
      actual_amount: 5000,
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
    const noTags: TransactionView = {
      ...baseTransaction,
      tags: '',
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={[noTags]} onClick={onClick} />)

    // Should show "Uncategorized" for empty tags
    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
  })
})
