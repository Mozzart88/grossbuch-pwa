import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PinInput } from '../../../../components/auth/PinInput'

describe('PinInput', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Helper to get the input element (password type doesn't have role textbox)
  const getInput = () => document.querySelector('input') as HTMLInputElement

  describe('rendering', () => {
    it('renders input element', () => {
      render(<PinInput {...defaultProps} />)
      expect(getInput()).toBeInTheDocument()
    })

    it('renders label when provided', () => {
      render(<PinInput {...defaultProps} label="Enter PIN" />)
      expect(screen.getByText('Enter PIN')).toBeInTheDocument()
    })

    it('renders error when provided', () => {
      render(<PinInput {...defaultProps} error="Invalid PIN" />)
      expect(screen.getByText('Invalid PIN')).toBeInTheDocument()
    })

    it('renders show/hide toggle by default', () => {
      render(<PinInput {...defaultProps} />)
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('hides toggle when showToggle is false', () => {
      render(<PinInput {...defaultProps} showToggle={false} />)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('input behavior', () => {
    it('displays value', () => {
      render(<PinInput {...defaultProps} value="abc123" />)
      expect(getInput()).toHaveValue('abc123')
    })

    it('calls onChange when typing', () => {
      const onChange = vi.fn()
      render(<PinInput {...defaultProps} onChange={onChange} />)

      fireEvent.change(getInput(), { target: { value: 'test' } })

      expect(onChange).toHaveBeenCalledWith('test')
    })

    it('filters out non-alphanumeric characters', () => {
      const onChange = vi.fn()
      render(<PinInput {...defaultProps} onChange={onChange} />)

      fireEvent.change(getInput(), { target: { value: 'abc!@#123' } })

      expect(onChange).toHaveBeenCalledWith('abc123')
    })

    it('allows only alphanumeric characters', () => {
      const onChange = vi.fn()
      render(<PinInput {...defaultProps} onChange={onChange} />)

      fireEvent.change(getInput(), { target: { value: 'Test123' } })

      expect(onChange).toHaveBeenCalledWith('Test123')
    })

    it('renders as password type by default', () => {
      render(<PinInput {...defaultProps} />)
      expect(getInput()).toHaveAttribute('type', 'password')
    })
  })

  describe('show/hide toggle', () => {
    it('toggles input type when clicked', () => {
      render(<PinInput {...defaultProps} />)
      const input = getInput()
      const toggleButton = screen.getByRole('button')

      expect(input).toHaveAttribute('type', 'password')

      fireEvent.click(toggleButton)
      expect(input).toHaveAttribute('type', 'text')

      fireEvent.click(toggleButton)
      expect(input).toHaveAttribute('type', 'password')
    })
  })

  describe('submit behavior', () => {
    it('calls onSubmit when Enter pressed with valid length', () => {
      const onSubmit = vi.fn()
      render(
        <PinInput
          {...defaultProps}
          value="123456"
          onSubmit={onSubmit}
          minLength={6}
        />
      )

      fireEvent.keyDown(getInput(), { key: 'Enter' })

      expect(onSubmit).toHaveBeenCalled()
    })

    it('does not call onSubmit when Enter pressed with invalid length', () => {
      const onSubmit = vi.fn()
      render(
        <PinInput
          {...defaultProps}
          value="123"
          onSubmit={onSubmit}
          minLength={6}
        />
      )

      fireEvent.keyDown(getInput(), { key: 'Enter' })

      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('does not call onSubmit for other keys', () => {
      const onSubmit = vi.fn()
      render(
        <PinInput
          {...defaultProps}
          value="123456"
          onSubmit={onSubmit}
          minLength={6}
        />
      )

      fireEvent.keyDown(getInput(), { key: 'a' })

      expect(onSubmit).not.toHaveBeenCalled()
    })
  })

  describe('validation feedback', () => {
    it('shows characters needed when below minimum', () => {
      render(<PinInput {...defaultProps} value="123" minLength={6} />)
      expect(screen.getByText('3 more characters needed')).toBeInTheDocument()
    })

    it('shows valid message when at minimum length', () => {
      render(<PinInput {...defaultProps} value="123456" minLength={6} />)
      expect(screen.getByText('PIN is valid')).toBeInTheDocument()
    })

    it('shows character count', () => {
      render(<PinInput {...defaultProps} value="123" minLength={6} />)
      expect(screen.getByText('3/6+')).toBeInTheDocument()
    })

    it('does not show count when error is present', () => {
      render(<PinInput {...defaultProps} value="123" minLength={6} error="Error" />)
      expect(screen.queryByText('3/6+')).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('associates label with input', () => {
      render(<PinInput {...defaultProps} label="PIN Code" id="pin-input" />)
      expect(getInput()).toHaveAttribute('id', 'pin-input')
    })

    it('generates id from label when not provided', () => {
      render(<PinInput {...defaultProps} label="My PIN" />)
      expect(getInput()).toHaveAttribute('id', 'my-pin')
    })

    it('has autocomplete off', () => {
      render(<PinInput {...defaultProps} />)
      expect(getInput()).toHaveAttribute('autocomplete', 'off')
    })

    it('has spellcheck disabled', () => {
      render(<PinInput {...defaultProps} />)
      expect(getInput()).toHaveAttribute('spellcheck', 'false')
    })
  })

  describe('disabled state', () => {
    it('disables input when disabled prop is true', () => {
      render(<PinInput {...defaultProps} disabled />)
      expect(getInput()).toBeDisabled()
    })
  })

  describe('error styling', () => {
    it('has error styling when error is present', () => {
      render(<PinInput {...defaultProps} error="Error" />)
      expect(getInput().className).toContain('border-red-500')
    })

    it('does not have error styling when no error', () => {
      render(<PinInput {...defaultProps} />)
      expect(getInput().className).not.toContain('border-red-500')
    })
  })
})
