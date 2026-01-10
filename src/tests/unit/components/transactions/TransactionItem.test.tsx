import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TransactionItem } from '../../../../components/transactions/TransactionItem'
import type { Transaction } from '../../../../types'

describe('TransactionItem', () => {
  const baseTransaction: Transaction = {
    id: 1,
    type: 'expense',
    amount: 50,
    currency_id: 1,
    account_id: 1,
    category_id: 1,
    counterparty_id: null,
    to_account_id: null,
    to_amount: null,
    to_currency_id: null,
    exchange_rate: null,
    date_time: '2025-01-09 14:30:00',
    notes: null,
    created_at: '2025-01-09 14:30:00',
    updated_at: '2025-01-09 14:30:00',
    category_name: 'Food',
    category_icon: '🍔',
    account_name: 'Cash',
    currency_symbol: '$',
  }

  it('renders expense transaction', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={baseTransaction} onClick={onClick} />)

    expect(screen.getAllByText('Food').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('-$50.00')).toBeInTheDocument()
  })

  it('renders income transaction', () => {
    const incomeTransaction: Transaction = {
      ...baseTransaction,
      type: 'income',
      amount: 1000,
      category_name: 'Salary',
      category_icon: '💰',
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={incomeTransaction} onClick={onClick} />)

    expect(screen.getAllByText('Salary').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('+$1,000.00')).toBeInTheDocument()
  })

  it('renders transfer transaction', () => {
    const transferTransaction: Transaction = {
      ...baseTransaction,
      type: 'transfer',
      to_account_id: 2,
      to_account_name: 'Bank',
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={transferTransaction} onClick={onClick} />)

    expect(screen.getByText('Transfer')).toBeInTheDocument()
    expect(screen.getByText('Cash → Bank')).toBeInTheDocument()
  })

  it('renders exchange transaction', () => {
    const exchangeTransaction: Transaction = {
      ...baseTransaction,
      type: 'exchange',
      to_account_id: 2,
      to_account_name: 'EUR Wallet',
      to_amount: 45,
      to_currency_id: 2,
      to_currency_symbol: '€',
      exchange_rate: 0.9,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

    expect(screen.getByText('Exchange')).toBeInTheDocument()
    expect(screen.getByText('Cash → EUR Wallet')).toBeInTheDocument()
    expect(screen.getByText(/\$50\.00.*→.*€45\.00/)).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={baseTransaction} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('displays category icon for expense', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={baseTransaction} onClick={onClick} />)

    expect(screen.getByText('🍔')).toBeInTheDocument()
  })

  it('displays transfer icon', () => {
    const transferTransaction: Transaction = {
      ...baseTransaction,
      type: 'transfer',
      to_account_id: 2,
      to_account_name: 'Bank',
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={transferTransaction} onClick={onClick} />)

    expect(screen.getByText('↔️')).toBeInTheDocument()
  })

  it('displays exchange icon', () => {
    const exchangeTransaction: Transaction = {
      ...baseTransaction,
      type: 'exchange',
      to_account_id: 2,
      to_account_name: 'EUR Wallet',
      to_amount: 45,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

    expect(screen.getByText('💱')).toBeInTheDocument()
  })

  it('displays time', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={baseTransaction} onClick={onClick} />)

    expect(screen.getByText('14:30')).toBeInTheDocument()
  })

  it('displays counterparty when available', () => {
    const withCounterparty: Transaction = {
      ...baseTransaction,
      counterparty_id: 1,
      counterparty_name: 'Supermarket',
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={withCounterparty} onClick={onClick} />)

    expect(screen.getByText('Supermarket')).toBeInTheDocument()
  })

  it('falls back to category name when no counterparty', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={baseTransaction} onClick={onClick} />)

    // Category name appears in the description
    expect(screen.getAllByText('Food').length).toBeGreaterThanOrEqual(1)
  })

  it('uses default currency symbol when not provided', () => {
    const noSymbol: Transaction = {
      ...baseTransaction,
      currency_symbol: undefined,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={noSymbol} onClick={onClick} />)

    expect(screen.getByText(/-\$50\.00/)).toBeInTheDocument()
  })

  it('applies green color for income', () => {
    const incomeTransaction: Transaction = {
      ...baseTransaction,
      type: 'income',
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={incomeTransaction} onClick={onClick} />)

    const amount = screen.getByText(/\+\$50\.00/)
    expect(amount.className).toContain('text-green-600')
  })

  it('applies red color for expense', () => {
    const onClick = vi.fn()
    render(<TransactionItem transaction={baseTransaction} onClick={onClick} />)

    const amount = screen.getByText(/-\$50\.00/)
    expect(amount.className).toContain('text-red-600')
  })

  it('applies blue color for transfer', () => {
    const transferTransaction: Transaction = {
      ...baseTransaction,
      type: 'transfer',
      to_account_id: 2,
      to_account_name: 'Bank',
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={transferTransaction} onClick={onClick} />)

    const amount = screen.getByText(/\$50\.00/)
    expect(amount.className).toContain('text-blue-600')
  })

  it('applies purple color for exchange', () => {
    const exchangeTransaction: Transaction = {
      ...baseTransaction,
      type: 'exchange',
      to_account_id: 2,
      to_amount: 45,
      to_currency_symbol: '€',
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={exchangeTransaction} onClick={onClick} />)

    const amount = screen.getByText(/\$50\.00.*→.*€45\.00/)
    expect(amount.className).toContain('text-purple-600')
  })

  it('shows default icon when category has no icon', () => {
    const noIcon: Transaction = {
      ...baseTransaction,
      category_icon: undefined,
    }
    const onClick = vi.fn()
    render(<TransactionItem transaction={noIcon} onClick={onClick} />)

    expect(screen.getByText('📝')).toBeInTheDocument()
  })
})
