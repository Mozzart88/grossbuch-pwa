import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TabBar } from '../../../../components/ui/TabBar'
import { LayoutProvider, useLayoutContext } from '../../../../store/LayoutContext'
import { useEffect } from 'react'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('TabBar', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  const renderWithRouter = (initialRoute = '/') => {
    return render(
      <MemoryRouter initialEntries={[initialRoute]}>
        <LayoutProvider>
          <TabBar />
        </LayoutProvider>
      </MemoryRouter>
    )
  }

  const renderWithoutProvider = (initialRoute = '/') => {
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

    it('renders Wallets tab', () => {
      renderWithRouter()

      expect(screen.getByText('Wallets')).toBeInTheDocument()
    })

    it('does not render Settings tab', () => {
      renderWithRouter()

      expect(screen.queryByText('Settings')).not.toBeInTheDocument()
    })

    it('renders Add button', () => {
      renderWithRouter()

      const addButton = screen.getByRole('button', { name: /add/i })
      expect(addButton).toBeInTheDocument()
    })

    it('renders 2 navigation links and 1 button', () => {
      renderWithRouter()

      const links = screen.getAllByRole('link')
      expect(links).toHaveLength(2)

      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(1)
    })
  })

  describe('Navigation links', () => {
    it('links to transactions page', () => {
      renderWithRouter()

      const transactionsLink = screen.getByRole('link', { name: /transactions/i })
      expect(transactionsLink).toHaveAttribute('href', '/')
    })

    it('links to accounts/wallets page', () => {
      renderWithRouter()

      const walletsLink = screen.getByRole('link', { name: /wallets/i })
      expect(walletsLink).toHaveAttribute('href', '/settings/accounts')
    })
  })

  describe('Active state', () => {
    it('applies active styles to transactions when on home route', () => {
      renderWithRouter('/')

      const transactionsLink = screen.getByRole('link', { name: /transactions/i })
      expect(transactionsLink.className).toContain('text-primary-600')
    })

    it('applies active styles to wallets when on accounts route', () => {
      renderWithRouter('/settings/accounts')

      const walletsLink = screen.getByRole('link', { name: /wallets/i })
      expect(walletsLink.className).toContain('text-primary-600')
    })

    it('applies inactive styles to transactions when on accounts route', () => {
      renderWithRouter('/settings/accounts')

      const transactionsLink = screen.getByRole('link', { name: /transactions/i })
      expect(transactionsLink.className).toContain('text-gray-500')
    })

    it('applies inactive styles to wallets when on home route', () => {
      renderWithRouter('/')

      const walletsLink = screen.getByRole('link', { name: /wallets/i })
      expect(walletsLink.className).toContain('text-gray-500')
    })
  })

  describe('Primary button styling', () => {
    it('Add button has white text color', () => {
      renderWithRouter()

      const addButton = screen.getByRole('button', { name: /add/i })
      expect(addButton.className).toContain('text-white')
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

    it('has z-40 z-index', () => {
      const { container } = renderWithRouter()

      const nav = container.querySelector('nav')
      expect(nav?.className).toContain('z-40')
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
      expect(screen.getByText('Wallets')).toBeInTheDocument()
    })

    it('Add button has aria-label', () => {
      renderWithRouter()

      const addButton = screen.getByRole('button', { name: /add/i })
      expect(addButton).toHaveAttribute('aria-label', 'Add')
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

  describe('Plus button behavior', () => {
    it('navigates to /add by default when no config', () => {
      renderWithRouter()

      const addButton = screen.getByRole('button', { name: /add/i })
      fireEvent.click(addButton)

      expect(mockNavigate).toHaveBeenCalledWith('/add')
    })

    it('works without LayoutProvider', () => {
      renderWithoutProvider()

      const addButton = screen.getByRole('button', { name: /add/i })
      fireEvent.click(addButton)

      expect(mockNavigate).toHaveBeenCalledWith('/add')
    })

    it('calls onClick when plusButtonConfig has onClick', () => {
      const onClick = vi.fn()

      const TestSetup = () => {
        const { setPlusButtonConfig } = useLayoutContext()
        useEffect(() => {
          setPlusButtonConfig({ onClick })
        }, [setPlusButtonConfig])
        return null
      }

      render(
        <MemoryRouter>
          <LayoutProvider>
            <TestSetup />
            <TabBar />
          </LayoutProvider>
        </MemoryRouter>
      )

      const addButton = screen.getByRole('button', { name: /add/i })
      fireEvent.click(addButton)

      expect(onClick).toHaveBeenCalled()
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('navigates to custom route when plusButtonConfig has to', () => {
      const TestSetup = () => {
        const { setPlusButtonConfig } = useLayoutContext()
        useEffect(() => {
          setPlusButtonConfig({ to: '/add?type=exchange' })
        }, [setPlusButtonConfig])
        return null
      }

      render(
        <MemoryRouter>
          <LayoutProvider>
            <TestSetup />
            <TabBar />
          </LayoutProvider>
        </MemoryRouter>
      )

      const addButton = screen.getByRole('button', { name: /add/i })
      fireEvent.click(addButton)

      expect(mockNavigate).toHaveBeenCalledWith('/add?type=exchange')
    })

    it('prefers onClick over to when both are set', () => {
      const onClick = vi.fn()

      const TestSetup = () => {
        const { setPlusButtonConfig } = useLayoutContext()
        useEffect(() => {
          setPlusButtonConfig({ onClick, to: '/add?type=exchange' })
        }, [setPlusButtonConfig])
        return null
      }

      render(
        <MemoryRouter>
          <LayoutProvider>
            <TestSetup />
            <TabBar />
          </LayoutProvider>
        </MemoryRouter>
      )

      const addButton = screen.getByRole('button', { name: /add/i })
      fireEvent.click(addButton)

      expect(onClick).toHaveBeenCalled()
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })
})
