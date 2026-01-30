import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { DateTimeUI } from '../../../../components/ui/DateTimeUI'

describe('DateTimeUI', () => {
  const getInput = (container: HTMLElement) =>
    container.querySelector('input') as HTMLInputElement

  describe('rendering', () => {
    it('renders with type="date"', () => {
      const { container } = render(<DateTimeUI type="date" />)

      const input = getInput(container)
      expect(input).toHaveAttribute('type', 'date')
    })

    it('renders with type="time"', () => {
      const { container } = render(<DateTimeUI type="time" />)

      const input = getInput(container)
      expect(input).toHaveAttribute('type', 'time')
    })

    it('renders with type="datetime-local"', () => {
      const { container } = render(<DateTimeUI type="datetime-local" />)

      const input = getInput(container)
      expect(input).toHaveAttribute('type', 'datetime-local')
    })

    it('applies default classes', () => {
      const { container } = render(<DateTimeUI type="date" />)

      const input = getInput(container)
      expect(input).toHaveClass('appearance-none')
      expect(input).toHaveClass('min-w-0')
    })

    it('merges custom className with defaults', () => {
      const { container } = render(<DateTimeUI type="date" className="custom-class" />)

      const input = getInput(container)
      expect(input).toHaveClass('appearance-none')
      expect(input).toHaveClass('min-w-0')
      expect(input).toHaveClass('custom-class')
    })
  })

  describe('props passthrough', () => {
    it('passes id prop to input', () => {
      const { container } = render(<DateTimeUI type="date" id="test-date" />)

      const input = getInput(container)
      expect(input).toHaveAttribute('id', 'test-date')
    })

    it('passes value prop to input', () => {
      const { container } = render(<DateTimeUI type="date" value="2024-01-15" onChange={() => {}} />)

      const input = getInput(container)
      expect(input.value).toBe('2024-01-15')
    })

    it('passes placeholder prop to input', () => {
      const { container } = render(<DateTimeUI type="date" placeholder="Select date" />)

      const input = getInput(container)
      expect(input).toHaveAttribute('placeholder', 'Select date')
    })

    it('passes disabled prop to input', () => {
      const { container } = render(<DateTimeUI type="date" disabled />)

      const input = getInput(container)
      expect(input).toBeDisabled()
    })

    it('passes required prop to input', () => {
      const { container } = render(<DateTimeUI type="date" required />)

      const input = getInput(container)
      expect(input).toBeRequired()
    })

    it('renders label when provided', () => {
      render(<DateTimeUI type="date" label="Select Date" />)

      expect(screen.getByText('Select Date')).toBeInTheDocument()
    })
  })

  describe('interaction', () => {
    it('calls onChange when value changes', () => {
      const handleChange = vi.fn()
      const { container } = render(<DateTimeUI type="date" onChange={handleChange} />)

      const input = getInput(container)
      fireEvent.change(input, { target: { value: '2024-06-15' } })

      expect(handleChange).toHaveBeenCalledTimes(1)
    })

    it('calls onFocus when focused', () => {
      const handleFocus = vi.fn()
      const { container } = render(<DateTimeUI type="date" onFocus={handleFocus} />)

      const input = getInput(container)
      fireEvent.focus(input)

      expect(handleFocus).toHaveBeenCalledTimes(1)
    })

    it('calls onBlur when blurred', () => {
      const handleBlur = vi.fn()
      const { container } = render(<DateTimeUI type="date" onBlur={handleBlur} />)

      const input = getInput(container)
      fireEvent.blur(input)

      expect(handleBlur).toHaveBeenCalledTimes(1)
    })
  })

  describe('datetime-local specifics', () => {
    it('accepts datetime-local format value', () => {
      const { container } = render(
        <DateTimeUI
          type="datetime-local"
          value="2024-01-15T14:30"
          onChange={() => {}}
        />
      )

      const input = getInput(container)
      expect(input.value).toBe('2024-01-15T14:30')
    })
  })

  describe('time specifics', () => {
    it('accepts time format value', () => {
      const { container } = render(<DateTimeUI type="time" value="14:30" onChange={() => {}} />)

      const input = getInput(container)
      expect(input.value).toBe('14:30')
    })
  })
})
