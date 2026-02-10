import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

// Mock repositories
vi.mock('../../../services/repositories', () => ({
  currencyRepository: {
    findAll: vi.fn(),
    setDefault: vi.fn(),
  },
  settingsRepository: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(),
  },
}))

import { currencyRepository, settingsRepository } from '../../../services/repositories'

const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockSettingsRepository = vi.mocked(settingsRepository)

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.findAll.mockResolvedValue([
      { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_default: true },
      { id: 2, code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2 },
    ])
    mockCurrencyRepository.setDefault.mockResolvedValue(undefined)
    mockSettingsRepository.get.mockResolvedValue(null)
    mockSettingsRepository.set.mockResolvedValue(undefined)
    mockSettingsRepository.delete.mockResolvedValue(undefined)
    mockSettingsRepository.getAll.mockResolvedValue({})
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
      expect(screen.getByText('Manage your wallets and accounts')).toBeInTheDocument()
    })

    it('renders Tags link', () => {
      renderPage()

      expect(screen.getByText('Tags')).toBeInTheDocument()
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

    it('renders Import Data link', () => {
      renderPage()

      expect(screen.getByText('Import Data')).toBeInTheDocument()
      expect(screen.getByText('Import transactions from CSV')).toBeInTheDocument()
    })

    it('renders Download DB link', () => {
      renderPage()

      expect(screen.getByText('Download DB')).toBeInTheDocument()
      expect(screen.getByText('Download Raw Sqlite DB')).toBeInTheDocument()
    })

    it('does not render Budgets link (moved to Summaries page)', () => {
      renderPage()

      expect(screen.queryByText('Budgets')).not.toBeInTheDocument()
      expect(screen.queryByText('Manage your budgets')).not.toBeInTheDocument()
    })


    it('links to accounts page', () => {
      renderPage()

      const accountsLink = screen.getByRole('link', { name: /Accounts/i })
      expect(accountsLink).toHaveAttribute('href', '/settings/accounts')
    })

    it('links to tags page', () => {
      renderPage()

      const tagsLink = screen.getByRole('link', { name: /Tags/i })
      expect(tagsLink).toHaveAttribute('href', '/settings/tags')
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

    it('links to import page', () => {
      renderPage()

      const importLink = screen.getByRole('link', { name: /Import Data/i })
      expect(importLink).toHaveAttribute('href', '/settings/import')
    })

    it('links to download page', () => {
      renderPage()

      const downloadLink = screen.getByRole('link', { name: /Download DB/i })
      expect(downloadLink).toHaveAttribute('href', '/settings/download')
    })
  })

  describe('Icons', () => {
    it('renders account icon', () => {
      renderPage()

      expect(screen.getByText('🏦')).toBeInTheDocument()
    })

    it('renders tags icon', () => {
      renderPage()

      expect(screen.getByText('🏷️')).toBeInTheDocument()
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

    it('renders import icon', () => {
      renderPage()

      expect(screen.getByText('📥')).toBeInTheDocument()
    })

    it('renders download icon', () => {
      renderPage()

      expect(screen.getByText('🗄️')).toBeInTheDocument()
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

  describe('Defaults section', () => {
    it('renders Defaults section', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Defaults')).toBeInTheDocument()
      })
    })

    it('renders Display Currency selector', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Display Currency')).toBeInTheDocument()
      })
    })

    it('renders Payment Currency selector', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Payment Currency')).toBeInTheDocument()
      })
    })

    it('changes display currency when selected', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Display Currency')).toBeInTheDocument()
      })

      const displayCurrencySelect = screen.getByRole('combobox', { name: /display currency/i })
      fireEvent.change(displayCurrencySelect, { target: { value: '2' } })

      await waitFor(() => {
        expect(mockCurrencyRepository.setDefault).toHaveBeenCalledWith(2)
      })
    })

    it('changes payment currency when selected', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Payment Currency')).toBeInTheDocument()
      })

      const paymentCurrencySelect = screen.getByRole('combobox', { name: /payment currency/i })
      fireEvent.change(paymentCurrencySelect, { target: { value: '2' } })

      await waitFor(() => {
        expect(mockSettingsRepository.set).toHaveBeenCalledWith('default_payment_currency_id', 2)
      })
    })

    it('deletes payment currency when "Same as account" selected', async () => {
      mockSettingsRepository.getAll.mockResolvedValueOnce({ default_payment_currency_id: 2 })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Payment Currency')).toBeInTheDocument()
      })

      const paymentCurrencySelect = screen.getByRole('combobox', { name: /payment currency/i })
      fireEvent.change(paymentCurrencySelect, { target: { value: '' } })

      await waitFor(() => {
        expect(mockSettingsRepository.delete).toHaveBeenCalledWith('default_payment_currency_id')
      })
    })

    it('shows helper text for payment currency', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText(/Payment currency pre-selects/)).toBeInTheDocument()
      })
    })

    it('handles error when loading settings', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockCurrencyRepository.findAll.mockRejectedValueOnce(new Error('Load failed'))

      renderPage()

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load settings:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })

    it('handles error when setting display currency', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockCurrencyRepository.setDefault.mockRejectedValueOnce(new Error('Set failed'))

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Display Currency')).toBeInTheDocument()
      })

      const displayCurrencySelect = screen.getByRole('combobox', { name: /display currency/i })
      fireEvent.change(displayCurrencySelect, { target: { value: '2' } })

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to set default currency:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })

    it('handles error when setting payment currency', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSettingsRepository.set.mockRejectedValueOnce(new Error('Set failed'))

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Payment Currency')).toBeInTheDocument()
      })

      const paymentCurrencySelect = screen.getByRole('combobox', { name: /payment currency/i })
      fireEvent.change(paymentCurrencySelect, { target: { value: '2' } })

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to set payment currency:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })
  })
})
