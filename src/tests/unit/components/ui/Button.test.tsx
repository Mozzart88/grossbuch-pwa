import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '../../../../components/ui/Button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)

    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('renders as a button element', () => {
    render(<Button>Test</Button>)

    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  describe('variants', () => {
    it('applies primary variant styles by default', () => {
      render(<Button>Primary</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('bg-primary-600')
    })

    it('applies secondary variant styles', () => {
      render(<Button variant="secondary">Secondary</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('bg-gray-200')
    })

    it('applies danger variant styles', () => {
      render(<Button variant="danger">Danger</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('bg-red-600')
    })

    it('applies ghost variant styles', () => {
      render(<Button variant="ghost">Ghost</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('text-gray-700')
    })
  })

  describe('sizes', () => {
    it('applies md size by default', () => {
      render(<Button>Medium</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('px-4 py-2')
    })

    it('applies sm size', () => {
      render(<Button size="sm">Small</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('px-3 py-1.5')
    })

    it('applies lg size', () => {
      render(<Button size="lg">Large</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('px-6 py-3')
    })
  })

  describe('interactions', () => {
    it('handles click events', () => {
      const onClick = vi.fn()
      render(<Button onClick={onClick}>Click</Button>)

      fireEvent.click(screen.getByRole('button'))

      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('can be disabled', () => {
      const onClick = vi.fn()
      render(<Button disabled onClick={onClick}>Disabled</Button>)

      const button = screen.getByRole('button')
      fireEvent.click(button)

      expect(button).toBeDisabled()
      expect(onClick).not.toHaveBeenCalled()
    })

    it('applies disabled styles', () => {
      render(<Button disabled>Disabled</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('disabled:opacity-50')
    })
  })

  describe('custom props', () => {
    it('accepts custom className', () => {
      render(<Button className="custom-class">Custom</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('custom-class')
    })

    it('passes through HTML button attributes', () => {
      render(<Button type="submit" name="submit-btn">Submit</Button>)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('type', 'submit')
      expect(button).toHaveAttribute('name', 'submit-btn')
    })

    it('accepts data attributes', () => {
      render(<Button data-testid="my-button">Test</Button>)

      expect(screen.getByTestId('my-button')).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('includes base styles', () => {
      render(<Button>Base</Button>)

      const button = screen.getByRole('button')
      expect(button.className).toContain('inline-flex')
      expect(button.className).toContain('items-center')
      expect(button.className).toContain('justify-center')
      expect(button.className).toContain('rounded-lg')
    })

    it('combines variant, size, and custom className', () => {
      render(
        <Button variant="danger" size="lg" className="my-class">
          Combined
        </Button>
      )

      const button = screen.getByRole('button')
      expect(button.className).toContain('bg-red-600')
      expect(button.className).toContain('px-6 py-3')
      expect(button.className).toContain('my-class')
    })
  })
})
