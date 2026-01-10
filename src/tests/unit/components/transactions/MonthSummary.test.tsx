import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MonthSummary } from '../../../../components/transactions/MonthSummary'

describe('MonthSummary', () => {
  const defaultProps = {
    income: 1000,
    expenses: 500,
    totalBalance: 1500,
    displayCurrencySymbol: '$',
  }

  it('displays income amount with plus sign', () => {
    render(<MonthSummary {...defaultProps} />)

    expect(screen.getByText('+$1,000.00')).toBeInTheDocument()
  })

  it('displays expenses amount with minus sign', () => {
    render(<MonthSummary {...defaultProps} />)

    expect(screen.getByText('-$500.00')).toBeInTheDocument()
  })

  it('displays total balance', () => {
    render(<MonthSummary {...defaultProps} />)

    expect(screen.getByText('$1,500.00')).toBeInTheDocument()
  })

  it('displays labels', () => {
    render(<MonthSummary {...defaultProps} />)

    expect(screen.getByText('Income')).toBeInTheDocument()
    expect(screen.getByText('Expenses')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('applies green color to income', () => {
    render(<MonthSummary {...defaultProps} />)

    const incomeAmount = screen.getByText('+$1,000.00')
    expect(incomeAmount.className).toContain('text-green-600')
  })

  it('applies red color to expenses', () => {
    render(<MonthSummary {...defaultProps} />)

    const expensesAmount = screen.getByText('-$500.00')
    expect(expensesAmount.className).toContain('text-red-600')
  })

  it('applies neutral color to positive total balance', () => {
    render(<MonthSummary {...defaultProps} />)

    const totalAmount = screen.getByText('$1,500.00')
    expect(totalAmount.className).toContain('text-gray-900')
  })

  it('applies red color to negative total balance', () => {
    // Use different value to avoid conflict with expense display
    render(<MonthSummary income={1000} expenses={500} totalBalance={-200} displayCurrencySymbol="$" />)

    const totalAmount = screen.getByText('-$200.00')
    expect(totalAmount.className).toContain('text-red-600')
  })

  it('handles zero values', () => {
    render(
      <MonthSummary
        income={0}
        expenses={0}
        totalBalance={0}
        displayCurrencySymbol="$"
      />
    )

    expect(screen.getByText('+$0.00')).toBeInTheDocument()
    expect(screen.getByText('-$0.00')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('uses different currency symbols', () => {
    render(<MonthSummary {...defaultProps} displayCurrencySymbol="€" />)

    expect(screen.getByText('+€1,000.00')).toBeInTheDocument()
    expect(screen.getByText('-€500.00')).toBeInTheDocument()
    expect(screen.getByText('€1,500.00')).toBeInTheDocument()
  })

  it('handles large numbers', () => {
    render(
      <MonthSummary
        income={1000000}
        expenses={500000}
        totalBalance={500000}
        displayCurrencySymbol="$"
      />
    )

    expect(screen.getByText('+$1,000,000.00')).toBeInTheDocument()
  })

  it('uses grid layout with 3 columns', () => {
    const { container } = render(<MonthSummary {...defaultProps} />)

    const grid = container.querySelector('.grid-cols-3')
    expect(grid).toBeInTheDocument()
  })
})
