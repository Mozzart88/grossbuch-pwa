import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { SettingsPage } from '../../../pages/SettingsPage'

// Mock ThemeContext
const mockSetTheme = vi.fn()
vi.mock('../../../store/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: mockSetTheme,
  }),
}))

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderPage = () => {
    return render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    )
  }

  describe('Header', () => {
    it('renders page title', () => {
      renderPage()

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
  })

  describe('Theme selector', () => {
    it('renders Appearance section', () => {
      renderPage()

      expect(screen.getByText('Appearance')).toBeInTheDocument()
    })

    it('renders Light theme button', () => {
      renderPage()

      expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument()
    })

    it('renders Dark theme button', () => {
      renderPage()

      expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument()
    })

    it('renders System theme button', () => {
      renderPage()

      expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument()
    })

    it('sets light theme when Light clicked', () => {
      renderPage()

      const lightButton = screen.getByRole('button', { name: 'Light' })
      fireEvent.click(lightButton)

      expect(mockSetTheme).toHaveBeenCalledWith('light')
    })

    it('sets dark theme when Dark clicked', () => {
      renderPage()

      const darkButton = screen.getByRole('button', { name: 'Dark' })
      fireEvent.click(darkButton)

      expect(mockSetTheme).toHaveBeenCalledWith('dark')
    })

    it('sets system theme when System clicked', () => {
      renderPage()

      const systemButton = screen.getByRole('button', { name: 'System' })
      fireEvent.click(systemButton)

      expect(mockSetTheme).toHaveBeenCalledWith('system')
    })
  })

  describe('Settings links', () => {
    it('renders Accounts link', () => {
      renderPage()

      expect(screen.getByText('Accounts')).toBeInTheDocument()
      expect(screen.getByText('Manage your accounts and balances')).toBeInTheDocument()
    })

    it('renders Categories link', () => {
      renderPage()

      expect(screen.getByText('Categories')).toBeInTheDocument()
      expect(screen.getByText('Organize your transactions')).toBeInTheDocument()
    })

    it('renders Counterparties link', () => {
      renderPage()

      expect(screen.getByText('Counterparties')).toBeInTheDocument()
      expect(screen.getByText('Track who you transact with')).toBeInTheDocument()
    })

    it('renders Currencies link', () => {
      renderPage()

      expect(screen.getByText('Currencies')).toBeInTheDocument()
      expect(screen.getByText('Manage currency options')).toBeInTheDocument()
    })

    it('renders Export Data link', () => {
      renderPage()

      expect(screen.getByText('Export Data')).toBeInTheDocument()
      expect(screen.getByText('Export transactions to CSV')).toBeInTheDocument()
    })

    it('links to accounts page', () => {
      renderPage()

      const accountsLink = screen.getByRole('link', { name: /Accounts/i })
      expect(accountsLink).toHaveAttribute('href', '/settings/accounts')
    })

    it('links to categories page', () => {
      renderPage()

      const categoriesLink = screen.getByRole('link', { name: /Categories/i })
      expect(categoriesLink).toHaveAttribute('href', '/settings/categories')
    })

    it('links to counterparties page', () => {
      renderPage()

      const counterpartiesLink = screen.getByRole('link', { name: /Counterparties/i })
      expect(counterpartiesLink).toHaveAttribute('href', '/settings/counterparties')
    })

    it('links to currencies page', () => {
      renderPage()

      const currenciesLink = screen.getByRole('link', { name: /Currencies/i })
      expect(currenciesLink).toHaveAttribute('href', '/settings/currencies')
    })

    it('links to export page', () => {
      renderPage()

      const exportLink = screen.getByRole('link', { name: /Export Data/i })
      expect(exportLink).toHaveAttribute('href', '/settings/export')
    })
  })

  describe('Icons', () => {
    it('renders account icon', () => {
      renderPage()

      expect(screen.getByText('🏦')).toBeInTheDocument()
    })

    it('renders categories icon', () => {
      renderPage()

      expect(screen.getByText('📁')).toBeInTheDocument()
    })

    it('renders counterparties icon', () => {
      renderPage()

      expect(screen.getByText('👥')).toBeInTheDocument()
    })

    it('renders currencies icon', () => {
      renderPage()

      expect(screen.getByText('💱')).toBeInTheDocument()
    })

    it('renders export icon', () => {
      renderPage()

      expect(screen.getByText('📤')).toBeInTheDocument()
    })
  })

  describe('App info', () => {
    it('renders app version', () => {
      renderPage()

      expect(screen.getByText('GrossBuch v1.0.0')).toBeInTheDocument()
    })

    it('renders data storage info', () => {
      renderPage()

      expect(screen.getByText('All data stored locally on your device')).toBeInTheDocument()
    })
  })

  describe('Theme highlighting', () => {
    it('applies active styles to current theme', () => {
      renderPage()

      // System is the mocked current theme
      const systemButton = screen.getByRole('button', { name: 'System' })
      expect(systemButton.className).toContain('bg-primary-100')
    })
  })
})
