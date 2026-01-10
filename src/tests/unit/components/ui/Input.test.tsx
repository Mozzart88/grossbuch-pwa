import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Input } from '../../../../components/ui/Input'

describe('Input', () => {
  it('renders input element', () => {
    render(<Input />)

    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  describe('label', () => {
    it('renders label when provided', () => {
      render(<Input label="Email" />)

      expect(screen.getByText('Email')).toBeInTheDocument()
    })

    it('associates label with input', () => {
      render(<Input label="Email" />)

      const input = screen.getByRole('textbox')
      const label = screen.getByText('Email')

      expect(label).toHaveAttribute('for', 'email')
      expect(input).toHaveAttribute('id', 'email')
    })

    it('generates id from label text', () => {
      render(<Input label="Full Name" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('id', 'full-name')
    })

    it('uses provided id over generated one', () => {
      render(<Input label="Email" id="custom-id" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('id', 'custom-id')
    })
  })

  describe('error', () => {
    it('displays error message', () => {
      render(<Input error="This field is required" />)

      expect(screen.getByText('This field is required')).toBeInTheDocument()
    })

    it('applies error styles', () => {
      render(<Input error="Error" />)

      const input = screen.getByRole('textbox')
      expect(input.className).toContain('border-red-500')
    })

    it('does not show error when not provided', () => {
      render(<Input />)

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('interactions', () => {
    it('handles value changes', () => {
      const onChange = vi.fn()
      render(<Input onChange={onChange} />)

      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'test' } })

      expect(onChange).toHaveBeenCalled()
    })

    it('handles focus', () => {
      const onFocus = vi.fn()
      render(<Input onFocus={onFocus} />)

      fireEvent.focus(screen.getByRole('textbox'))

      expect(onFocus).toHaveBeenCalled()
    })

    it('handles blur', () => {
      const onBlur = vi.fn()
      render(<Input onBlur={onBlur} />)

      fireEvent.blur(screen.getByRole('textbox'))

      expect(onBlur).toHaveBeenCalled()
    })
  })

  describe('HTML attributes', () => {
    it('accepts type attribute', () => {
      const { container } = render(<Input type="password" />)

      const input = container.querySelector('input')
      expect(input).toHaveAttribute('type', 'password')
    })

    it('accepts placeholder', () => {
      render(<Input placeholder="Enter text" />)

      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
    })

    it('accepts disabled state', () => {
      render(<Input disabled />)

      expect(screen.getByRole('textbox')).toBeDisabled()
    })

    it('accepts required attribute', () => {
      render(<Input required />)

      expect(screen.getByRole('textbox')).toBeRequired()
    })

    it('accepts value', () => {
      render(<Input value="test value" onChange={() => {}} />)

      expect(screen.getByRole('textbox')).toHaveValue('test value')
    })

    it('accepts name attribute', () => {
      render(<Input name="email" />)

      expect(screen.getByRole('textbox')).toHaveAttribute('name', 'email')
    })
  })

  describe('styling', () => {
    it('applies base styles', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      expect(input.className).toContain('w-full')
      expect(input.className).toContain('rounded-lg')
      expect(input.className).toContain('border')
    })

    it('accepts custom className', () => {
      render(<Input className="my-custom-class" />)

      const input = screen.getByRole('textbox')
      expect(input.className).toContain('my-custom-class')
    })

    it('includes dark mode styles', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      expect(input.className).toContain('dark:bg-gray-800')
    })
  })
})
