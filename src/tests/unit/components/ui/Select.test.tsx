import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Select } from '../../../../components/ui/Select'

const defaultOptions = [
  { value: '1', label: 'Option 1' },
  { value: '2', label: 'Option 2' },
  { value: '3', label: 'Option 3' },
]

describe('Select', () => {
  it('renders select element', () => {
    render(<Select options={defaultOptions} />)

    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders all options', () => {
    render(<Select options={defaultOptions} />)

    expect(screen.getByText('Option 1')).toBeInTheDocument()
    expect(screen.getByText('Option 2')).toBeInTheDocument()
    expect(screen.getByText('Option 3')).toBeInTheDocument()
  })

  describe('label', () => {
    it('renders label when provided', () => {
      render(<Select options={defaultOptions} label="Country" />)

      expect(screen.getByText('Country')).toBeInTheDocument()
    })

    it('associates label with select', () => {
      render(<Select options={defaultOptions} label="Country" />)

      const select = screen.getByRole('combobox')
      const label = screen.getByText('Country')

      expect(label).toHaveAttribute('for', 'country')
      expect(select).toHaveAttribute('id', 'country')
    })

    it('uses provided id over generated one', () => {
      render(<Select options={defaultOptions} label="Country" id="custom-id" />)

      const select = screen.getByRole('combobox')
      expect(select).toHaveAttribute('id', 'custom-id')
    })
  })

  describe('placeholder', () => {
    it('renders placeholder option when provided', () => {
      render(<Select options={defaultOptions} placeholder="Select an option" />)

      expect(screen.getByText('Select an option')).toBeInTheDocument()
    })

    it('placeholder option is disabled', () => {
      render(<Select options={defaultOptions} placeholder="Select an option" />)

      const placeholder = screen.getByText('Select an option')
      expect(placeholder).toHaveAttribute('disabled')
    })

    it('placeholder has empty value', () => {
      render(<Select options={defaultOptions} placeholder="Select an option" />)

      const placeholder = screen.getByText('Select an option')
      expect(placeholder).toHaveValue('')
    })
  })

  describe('error', () => {
    it('displays error message', () => {
      render(<Select options={defaultOptions} error="Please select an option" />)

      expect(screen.getByText('Please select an option')).toBeInTheDocument()
    })

    it('applies error styles', () => {
      render(<Select options={defaultOptions} error="Error" />)

      const select = screen.getByRole('combobox')
      expect(select.className).toContain('border-red-500')
    })
  })

  describe('interactions', () => {
    it('handles value changes', () => {
      const onChange = vi.fn()
      render(<Select options={defaultOptions} onChange={onChange} />)

      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: '2' } })

      expect(onChange).toHaveBeenCalled()
    })

    it('displays selected value', () => {
      render(<Select options={defaultOptions} value="2" onChange={() => {}} />)

      const select = screen.getByRole('combobox')
      expect(select).toHaveValue('2')
    })
  })

  describe('HTML attributes', () => {
    it('accepts disabled state', () => {
      render(<Select options={defaultOptions} disabled />)

      expect(screen.getByRole('combobox')).toBeDisabled()
    })

    it('accepts required attribute', () => {
      render(<Select options={defaultOptions} required />)

      expect(screen.getByRole('combobox')).toBeRequired()
    })

    it('accepts name attribute', () => {
      render(<Select options={defaultOptions} name="country" />)

      expect(screen.getByRole('combobox')).toHaveAttribute('name', 'country')
    })
  })

  describe('option values', () => {
    it('handles numeric option values', () => {
      const numericOptions = [
        { value: 1, label: 'One' },
        { value: 2, label: 'Two' },
      ]
      render(<Select options={numericOptions} />)

      expect(screen.getByText('One')).toHaveValue('1')
      expect(screen.getByText('Two')).toHaveValue('2')
    })

    it('uses value as key', () => {
      render(<Select options={defaultOptions} />)

      const options = screen.getAllByRole('option')
      expect(options.length).toBe(3)
    })
  })

  describe('styling', () => {
    it('applies base styles', () => {
      render(<Select options={defaultOptions} />)

      const select = screen.getByRole('combobox')
      expect(select.className).toContain('w-full')
      expect(select.className).toContain('rounded-lg')
      expect(select.className).toContain('border')
    })

    it('accepts custom className', () => {
      render(<Select options={defaultOptions} className="my-custom-class" />)

      const select = screen.getByRole('combobox')
      expect(select.className).toContain('my-custom-class')
    })

    it('includes dark mode styles', () => {
      render(<Select options={defaultOptions} />)

      const select = screen.getByRole('combobox')
      expect(select.className).toContain('dark:bg-gray-800')
    })
  })
})
