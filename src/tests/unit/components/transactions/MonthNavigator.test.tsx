import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MonthNavigator } from '../../../../components/transactions/MonthNavigator'

describe('MonthNavigator', () => {
  const defaultProps = {
    month: '2025-01',
    onChange: vi.fn(),
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 0, 15)) // January 15, 2025
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('displays formatted month', () => {
    render(<MonthNavigator {...defaultProps} />)

    expect(screen.getByText(/January.*2025/)).toBeInTheDocument()
  })

  it('navigates to previous month', () => {
    const onChange = vi.fn()
    render(<MonthNavigator {...defaultProps} onChange={onChange} />)

    const prevButton = screen.getAllByRole('button')[0]
    fireEvent.click(prevButton)

    expect(onChange).toHaveBeenCalledWith('2024-12')
  })

  it('navigates to next month', () => {
    const onChange = vi.fn()
    render(<MonthNavigator month="2024-12" onChange={onChange} />)

    const nextButton = screen.getAllByRole('button')[2]
    fireEvent.click(nextButton)

    expect(onChange).toHaveBeenCalledWith('2025-01')
  })

  it('disables next button when at current month', () => {
    render(<MonthNavigator {...defaultProps} />)

    const nextButton = screen.getAllByRole('button')[2]
    expect(nextButton).toBeDisabled()
  })

  it('enables next button when not at current month', () => {
    render(<MonthNavigator month="2024-12" onChange={vi.fn()} />)

    const nextButton = screen.getAllByRole('button')[2]
    expect(nextButton).not.toBeDisabled()
  })

  it('navigates to current month when center button is clicked', () => {
    const onChange = vi.fn()
    render(<MonthNavigator month="2024-06" onChange={onChange} />)

    const centerButton = screen.getByText(/June.*2024/)
    fireEvent.click(centerButton)

    expect(onChange).toHaveBeenCalledWith('2025-01')
  })

  it('always enables previous button', () => {
    render(<MonthNavigator {...defaultProps} />)

    const prevButton = screen.getAllByRole('button')[0]
    expect(prevButton).not.toBeDisabled()
  })

  it('displays different months correctly', () => {
    const { rerender } = render(<MonthNavigator month="2025-06" onChange={vi.fn()} />)

    expect(screen.getByText(/June.*2025/)).toBeInTheDocument()

    rerender(<MonthNavigator month="2024-12" onChange={vi.fn()} />)

    expect(screen.getByText(/December.*2024/)).toBeInTheDocument()
  })

  it('handles year transitions correctly', () => {
    const onChange = vi.fn()
    render(<MonthNavigator month="2025-01" onChange={onChange} />)

    const prevButton = screen.getAllByRole('button')[0]
    fireEvent.click(prevButton)

    expect(onChange).toHaveBeenCalledWith('2024-12')
  })

  it('applies disabled styling when at current month', () => {
    render(<MonthNavigator {...defaultProps} />)

    const nextButton = screen.getAllByRole('button')[2]
    expect(nextButton.className).toContain('cursor-not-allowed')
  })

  it('applies active styling when not at current month', () => {
    render(<MonthNavigator month="2024-06" onChange={vi.fn()} />)

    const nextButton = screen.getAllByRole('button')[2]
    expect(nextButton.className).not.toContain('cursor-not-allowed')
  })
})
