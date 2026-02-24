import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NavDrawer } from '../../../../components/layout/NavDrawer'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('NavDrawer', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  const renderDrawer = (isOpen: boolean, onClose = vi.fn()) => {
    return render(
      <MemoryRouter>
        <NavDrawer isOpen={isOpen} onClose={onClose} />
      </MemoryRouter>
    )
  }

  describe('Visibility', () => {
    it('panel is off-screen (translate-x-full) when closed', () => {
      const { container } = renderDrawer(false)

      const panel = container.querySelector('[role="dialog"]')
      expect(panel?.className).toContain('translate-x-full')
    })

    it('panel is visible (translate-x-0) when open', () => {
      const { container } = renderDrawer(true)

      const panel = container.querySelector('[role="dialog"]')
      expect(panel?.className).toContain('translate-x-0')
    })

    it('overlay is hidden when closed', () => {
      const { container } = renderDrawer(false)

      const overlay = container.querySelector('.bg-black\\/50')
      expect(overlay?.className).toContain('opacity-0')
    })

    it('overlay is visible when open', () => {
      const { container } = renderDrawer(true)

      // The overlay has opacity-100 when open (the one with bg-black/50)
      const overlay = container.querySelector('.bg-black\\/50')
      expect(overlay?.className).toContain('opacity-100')
    })

    it('wrapper is pointer-events-none when closed', () => {
      const { container } = renderDrawer(false)

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.className).toContain('pointer-events-none')
    })

    it('wrapper does not have pointer-events-none when open', () => {
      const { container } = renderDrawer(true)

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.className).not.toContain('pointer-events-none')
    })
  })

  describe('Nav links', () => {
    it('renders Tags link', () => {
      renderDrawer(true)

      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    it('renders Counterparties link', () => {
      renderDrawer(true)

      expect(screen.getByText('Counterparties')).toBeInTheDocument()
    })

    it('renders Exchanges link', () => {
      renderDrawer(true)

      expect(screen.getByText('Exchanges')).toBeInTheDocument()
    })

    it('renders Settings link', () => {
      renderDrawer(true)

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('navigates to tags and closes drawer on Tags click', () => {
      const onClose = vi.fn()
      renderDrawer(true, onClose)

      fireEvent.click(screen.getByText('Tags'))

      expect(mockNavigate).toHaveBeenCalledWith('/settings/tags')
      expect(onClose).toHaveBeenCalled()
    })

    it('navigates to counterparties and closes drawer on Counterparties click', () => {
      const onClose = vi.fn()
      renderDrawer(true, onClose)

      fireEvent.click(screen.getByText('Counterparties'))

      expect(mockNavigate).toHaveBeenCalledWith('/settings/counterparties')
      expect(onClose).toHaveBeenCalled()
    })

    it('navigates to exchange-rates and closes drawer on Exchanges click', () => {
      const onClose = vi.fn()
      renderDrawer(true, onClose)

      fireEvent.click(screen.getByText('Exchanges'))

      expect(mockNavigate).toHaveBeenCalledWith('/settings/exchange-rates')
      expect(onClose).toHaveBeenCalled()
    })

    it('navigates to settings and closes drawer on Settings click', () => {
      const onClose = vi.fn()
      renderDrawer(true, onClose)

      fireEvent.click(screen.getByText('Settings'))

      expect(mockNavigate).toHaveBeenCalledWith('/settings')
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('Close interactions', () => {
    it('calls onClose when overlay is clicked', () => {
      const onClose = vi.fn()
      const { container } = renderDrawer(true, onClose)

      const overlay = container.querySelector('.bg-black\\/50') as HTMLElement
      fireEvent.click(overlay)

      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn()
      renderDrawer(true, onClose)

      const closeButton = screen.getByRole('button', { name: /close menu/i })
      fireEvent.click(closeButton)

      expect(onClose).toHaveBeenCalled()
    })

    it('close button has aria-label', () => {
      renderDrawer(true)

      const closeButton = screen.getByRole('button', { name: /close menu/i })
      expect(closeButton).toHaveAttribute('aria-label', 'Close menu')
    })
  })

  describe('Accessibility', () => {
    it('panel has role="dialog"', () => {
      renderDrawer(true)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('panel has aria-modal', () => {
      renderDrawer(true)

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })

    it('panel has aria-label', () => {
      renderDrawer(true)

      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-label', 'Navigation menu')
    })

    it('wrapper is aria-hidden when closed', () => {
      const { container } = renderDrawer(false)

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper).toHaveAttribute('aria-hidden', 'true')
    })

    it('wrapper is not aria-hidden when open', () => {
      const { container } = renderDrawer(true)

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper).toHaveAttribute('aria-hidden', 'false')
    })
  })
})
