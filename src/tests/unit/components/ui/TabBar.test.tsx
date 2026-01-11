import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { TabBar } from '../../../../components/ui/TabBar'

describe('TabBar', () => {
  const renderWithRouter = (initialRoute = '/') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <TabBar />
      </MemoryRouter>
    )
  }

  describe('Tab rendering', () => {
    it('renders navigation element', () => {
      renderWithRouter()

      expect(screen.getByRole('navigation')).toBeInTheDocument()
    })

    it('renders Transactions tab', () => {
      renderWithRouter()

      expect(screen.getByText('Transactions')).toBeInTheDocument()
    })

    it('renders Settings tab', () => {
      renderWithRouter()

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('renders Add button', () => {
      const { container } = renderWithRouter()

      // Add button is primary and has special styling (no label, just icon)
      const addLink = container.querySelector('a[href="/add"]')
      expect(addLink).toBeInTheDocument()
    })

    it('renders 3 navigation links', () => {
      renderWithRouter()

      const links = screen.getAllByRole('link')
      expect(links).toHaveLength(3)
    })
  })

  describe('Navigation links', () => {
    it('links to transactions page', () => {
      renderWithRouter()

      const transactionsLink = screen.getByRole('link', { name: /transactions/i })
      expect(transactionsLink).toHaveAttribute('href', '/')
    })

    it('links to add page', () => {
      const { container } = renderWithRouter()

      const addLink = container.querySelector('a[href="/add"]')
      expect(addLink).toBeInTheDocument()
    })

    it('links to settings page', () => {
      renderWithRouter()

      const settingsLink = screen.getByRole('link', { name: /settings/i })
      expect(settingsLink).toHaveAttribute('href', '/settings')
    })
  })

  describe('Active state', () => {
    it('applies active styles to transactions when on home route', () => {
      renderWithRouter('/')

      const transactionsLink = screen.getByRole('link', { name: /transactions/i })
      expect(transactionsLink.className).toContain('text-primary-600')
    })

    it('applies active styles to settings when on settings route', () => {
      renderWithRouter('/settings')

      const settingsLink = screen.getByRole('link', { name: /settings/i })
      expect(settingsLink.className).toContain('text-primary-600')
    })

    it('applies inactive styles to transactions when on settings route', () => {
      renderWithRouter('/settings')

      const transactionsLink = screen.getByRole('link', { name: /transactions/i })
      expect(transactionsLink.className).toContain('text-gray-500')
    })
  })

  describe('Primary button styling', () => {
    it('Add button has primary styling with white text', () => {
      const { container } = renderWithRouter()

      const addLink = container.querySelector('a[href="/add"]')
      expect(addLink?.className).toContain('text-white')
    })

    it('Add button contains circular primary button', () => {
      const { container } = renderWithRouter()

      const primaryButton = container.querySelector('.bg-primary-600.rounded-full')
      expect(primaryButton).toBeInTheDocument()
    })
  })

  describe('SVG icons', () => {
    it('renders SVG icons for each tab', () => {
      const { container } = renderWithRouter()

      const svgs = container.querySelectorAll('svg')
      expect(svgs.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Fixed positioning', () => {
    it('has fixed positioning at bottom', () => {
      const { container } = renderWithRouter()

      const nav = container.querySelector('nav')
      expect(nav?.className).toContain('fixed')
      expect(nav?.className).toContain('bottom-0')
    })
  })

  describe('Layout', () => {
    it('uses flex layout with justify-around', () => {
      const { container } = renderWithRouter()

      const flexContainer = container.querySelector('.flex.items-center.justify-around')
      expect(flexContainer).toBeInTheDocument()
    })

    it('has fixed height container', () => {
      const { container } = renderWithRouter()

      const heightContainer = container.querySelector('.h-16')
      expect(heightContainer).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('uses semantic navigation element', () => {
      renderWithRouter()

      expect(screen.getByRole('navigation')).toBeInTheDocument()
    })

    it('all tabs have accessible text', () => {
      renderWithRouter()

      expect(screen.getByText('Transactions')).toBeInTheDocument()
      expect(screen.getByText('Settings')).toBeInTheDocument()
      // Add button doesn't show label but has svg
    })
  })

  describe('Dark mode support', () => {
    it('has dark mode classes', () => {
      const { container } = renderWithRouter()

      const nav = container.querySelector('nav')
      expect(nav?.className).toContain('dark:bg-gray-800')
      expect(nav?.className).toContain('dark:border-gray-700')
    })
  })
})
