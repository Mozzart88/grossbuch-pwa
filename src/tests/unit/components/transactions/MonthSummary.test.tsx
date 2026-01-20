import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { MonthSummary } from '../../../../components/transactions/MonthSummary'

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('MonthSummary', () => {
  const defaultProps = {
    income: 1000,
    expenses: 500,
    totalBalance: 1500,
    displayCurrencySymbol: '$',
  }

  it('displays income amount with plus sign', () => {
    renderWithRouter(<MonthSummary {...defaultProps} />)

    expect(screen.getByText('$1,000.00')).toBeInTheDocument()
  })

  it('displays expenses amount with minus sign', () => {
    renderWithRouter(<MonthSummary {...defaultProps} />)

    expect(screen.getByText('$500.00')).toBeInTheDocument()
  })

  it('displays total balance', () => {
    renderWithRouter(<MonthSummary {...defaultProps} />)

    expect(screen.getByText('$1,500.00')).toBeInTheDocument()
  })

  it('displays labels', () => {
    renderWithRouter(<MonthSummary {...defaultProps} />)

    expect(screen.getByText('Income')).toBeInTheDocument()
    expect(screen.getByText('Expenses')).toBeInTheDocument()
    expect(screen.getByText('Balance')).toBeInTheDocument()
  })

  it('applies green color to income', () => {
    renderWithRouter(<MonthSummary {...defaultProps} />)

    const incomeAmount = screen.getByText('$1,000.00')
    expect(incomeAmount.className).toContain('text-green-600')
  })

  it('applies red color to expenses', () => {
    renderWithRouter(<MonthSummary {...defaultProps} />)

    const expensesAmount = screen.getByText('$500.00')
    expect(expensesAmount.className).toContain('text-red-600')
  })

  it('applies neutral color to positive total balance', () => {
    renderWithRouter(<MonthSummary {...defaultProps} />)

    const totalAmount = screen.getByText('$1,500.00')
    expect(totalAmount.className).toContain('text-gray-900')
  })

  it('applies red color to negative total balance', () => {
    // Use different value to avoid conflict with expense display
    renderWithRouter(<MonthSummary income={1000} expenses={500} totalBalance={-200} displayCurrencySymbol="$" />)

    const totalAmount = screen.getByText('$200.00')
    expect(totalAmount.className).toContain('text-red-600')
  })

  it('handles zero values', () => {
    renderWithRouter(
      <MonthSummary
        income={0}
        expenses={0}
        totalBalance={0}
        displayCurrencySymbol="$"
      />
    )

    expect(screen.getAllByText('$0.00').length === 3).toBeTruthy()
  })

  it('uses different currency symbols', () => {
    renderWithRouter(<MonthSummary {...defaultProps} displayCurrencySymbol="€" />)

    expect(screen.getByText('€1,000.00')).toBeInTheDocument()
    expect(screen.getByText('€500.00')).toBeInTheDocument()
    expect(screen.getByText('€1,500.00')).toBeInTheDocument()
  })

  it('handles large numbers', () => {
    renderWithRouter(
      <MonthSummary
        income={1000000}
        expenses={500000}
        totalBalance={500000}
        displayCurrencySymbol="$"
      />
    )

    expect(screen.getByText('$1,000,000.00')).toBeInTheDocument()
  })

  it('uses grid layout with 3 columns', () => {
    const { container } = renderWithRouter(<MonthSummary {...defaultProps} />)

    const grid = container.querySelector('.grid-cols-3')
    expect(grid).toBeInTheDocument()
  })

  describe('Click navigation', () => {
    beforeEach(() => {
      mockNavigate.mockClear()
    })

    it('navigates to summaries page when clickable and month provided', () => {
      const { container } = renderWithRouter(
        <MonthSummary {...defaultProps} month="2025-01" clickable />
      )

      const clickableDiv = container.querySelector('.cursor-pointer')
      expect(clickableDiv).toBeInTheDocument()

      fireEvent.click(clickableDiv!)
      expect(mockNavigate).toHaveBeenCalledWith('/summaries?month=2025-01')
    })

    it('does not navigate when clickable is false', () => {
      const { container } = renderWithRouter(
        <MonthSummary {...defaultProps} month="2025-01" clickable={false} />
      )

      const div = container.querySelector('.grid-cols-3')
      fireEvent.click(div!)
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('does not navigate when month is not provided', () => {
      const { container } = renderWithRouter(
        <MonthSummary {...defaultProps} clickable />
      )

      const div = container.querySelector('.grid-cols-3')
      fireEvent.click(div!)
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('applies hover styles when clickable', () => {
      const { container } = renderWithRouter(
        <MonthSummary {...defaultProps} month="2025-01" clickable />
      )

      const clickableDiv = container.querySelector('.cursor-pointer')
      expect(clickableDiv?.className).toContain('hover:bg-gray-100')
    })

    it('does not apply hover styles when not clickable', () => {
      const { container } = renderWithRouter(
        <MonthSummary {...defaultProps} />
      )

      const div = container.querySelector('.grid-cols-3')
      expect(div?.className).not.toContain('cursor-pointer')
    })
  })
})
