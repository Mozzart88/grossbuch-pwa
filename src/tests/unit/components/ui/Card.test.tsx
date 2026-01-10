import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from '../../../../components/ui/Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>)

    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('renders as a div element', () => {
    render(<Card data-testid="card">Content</Card>)

    const card = screen.getByTestId('card')
    expect(card.tagName).toBe('DIV')
  })

  describe('styling', () => {
    it('applies base background styles', () => {
      render(<Card data-testid="card">Content</Card>)

      const card = screen.getByTestId('card')
      expect(card.className).toContain('bg-white')
    })

    it('applies dark mode styles', () => {
      render(<Card data-testid="card">Content</Card>)

      const card = screen.getByTestId('card')
      expect(card.className).toContain('dark:bg-gray-800')
    })

    it('applies rounded corners', () => {
      render(<Card data-testid="card">Content</Card>)

      const card = screen.getByTestId('card')
      expect(card.className).toContain('rounded-xl')
    })

    it('applies shadow', () => {
      render(<Card data-testid="card">Content</Card>)

      const card = screen.getByTestId('card')
      expect(card.className).toContain('shadow-sm')
    })

    it('applies border', () => {
      render(<Card data-testid="card">Content</Card>)

      const card = screen.getByTestId('card')
      expect(card.className).toContain('border')
    })
  })

  describe('custom props', () => {
    it('accepts custom className', () => {
      render(<Card className="my-custom-class">Content</Card>)

      expect(screen.getByText('Content').className).toContain('my-custom-class')
    })

    it('merges custom className with base styles', () => {
      render(
        <Card className="p-4" data-testid="card">
          Content
        </Card>
      )

      const card = screen.getByTestId('card')
      expect(card.className).toContain('bg-white')
      expect(card.className).toContain('p-4')
    })

    it('passes through HTML div attributes', () => {
      render(
        <Card data-testid="card" id="my-card" title="Card title">
          Content
        </Card>
      )

      const card = screen.getByTestId('card')
      expect(card).toHaveAttribute('id', 'my-card')
      expect(card).toHaveAttribute('title', 'Card title')
    })

    it('passes through event handlers', () => {
      const onClick = vi.fn()
      render(
        <Card onClick={onClick} data-testid="card">
          Content
        </Card>
      )

      const card = screen.getByTestId('card')
      card.click()

      expect(onClick).toHaveBeenCalled()
    })
  })

  describe('nested content', () => {
    it('renders nested elements', () => {
      render(
        <Card>
          <h2>Title</h2>
          <p>Description</p>
        </Card>
      )

      expect(screen.getByText('Title')).toBeInTheDocument()
      expect(screen.getByText('Description')).toBeInTheDocument()
    })

    it('renders nested components', () => {
      const NestedComponent = () => <span>Nested</span>

      render(
        <Card>
          <NestedComponent />
        </Card>
      )

      expect(screen.getByText('Nested')).toBeInTheDocument()
    })
  })
})
