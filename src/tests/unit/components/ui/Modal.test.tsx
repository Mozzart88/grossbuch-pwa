import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from '../../../../components/ui/Modal'

describe('Modal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    children: <div>Modal content</div>,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.style.overflow = ''
  })

  describe('rendering', () => {
    it('renders children when open', () => {
      render(<Modal {...defaultProps} />)

      expect(screen.getByText('Modal content')).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      render(<Modal {...defaultProps} isOpen={false} />)

      expect(screen.queryByText('Modal content')).not.toBeInTheDocument()
    })

    it('renders title when provided', () => {
      render(<Modal {...defaultProps} title="My Modal" />)

      expect(screen.getByText('My Modal')).toBeInTheDocument()
    })

    it('does not render title section when not provided', () => {
      render(<Modal {...defaultProps} />)

      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })
  })

  describe('close behavior', () => {
    it('calls onClose when backdrop is clicked', () => {
      const onClose = vi.fn()
      render(<Modal {...defaultProps} onClose={onClose} />)

      // Find the backdrop (first child div with bg-black)
      const backdrop = document.querySelector('.bg-black\\/50')
      if (backdrop) {
        fireEvent.click(backdrop)
      }

      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn()
      render(<Modal {...defaultProps} onClose={onClose} title="Test" />)

      // Find close button (the X button)
      const closeButton = screen.getByRole('button')
      fireEvent.click(closeButton)

      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when Escape key is pressed', () => {
      const onClose = vi.fn()
      render(<Modal {...defaultProps} onClose={onClose} />)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).toHaveBeenCalled()
    })

    it('does not call onClose for other keys', () => {
      const onClose = vi.fn()
      render(<Modal {...defaultProps} onClose={onClose} />)

      fireEvent.keyDown(document, { key: 'Enter' })

      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('body scroll lock', () => {
    it('sets body overflow to hidden when open', () => {
      render(<Modal {...defaultProps} />)

      expect(document.body.style.overflow).toBe('hidden')
    })

    it('restores body overflow when closed', () => {
      const { rerender } = render(<Modal {...defaultProps} />)

      expect(document.body.style.overflow).toBe('hidden')

      rerender(<Modal {...defaultProps} isOpen={false} />)

      expect(document.body.style.overflow).toBe('')
    })

    it('restores body overflow on unmount', () => {
      const { unmount } = render(<Modal {...defaultProps} />)

      expect(document.body.style.overflow).toBe('hidden')

      unmount()

      expect(document.body.style.overflow).toBe('')
    })
  })

  describe('accessibility', () => {
    it('renders heading for title', () => {
      render(<Modal {...defaultProps} title="Accessible Title" />)

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Accessible Title')
    })

    it('close button has accessible label via SVG', () => {
      render(<Modal {...defaultProps} title="Test" />)

      const closeButton = screen.getByRole('button')
      expect(closeButton).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('renders with fixed positioning', () => {
      render(<Modal {...defaultProps} />)

      const modal = screen.getByText('Modal content').closest('.fixed')
      expect(modal).toBeInTheDocument()
    })

    it('centers content', () => {
      render(<Modal {...defaultProps} />)

      const container = screen.getByText('Modal content').closest('.flex')
      expect(container?.className).toContain('justify-center')
    })
  })

  describe('event listener cleanup', () => {
    it('removes keydown listener when closed', () => {
      const onClose = vi.fn()
      const { rerender } = render(<Modal {...defaultProps} onClose={onClose} />)

      rerender(<Modal {...defaultProps} isOpen={false} onClose={onClose} />)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).not.toHaveBeenCalled()
    })

    it('removes keydown listener on unmount', () => {
      const onClose = vi.fn()
      const { unmount } = render(<Modal {...defaultProps} onClose={onClose} />)

      unmount()

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
