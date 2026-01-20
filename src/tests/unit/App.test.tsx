import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import App from '../../App'

// Mock all page components
vi.mock('../../pages', () => ({
  TransactionsPage: () => <div data-testid="transactions-page">Transactions</div>,
  AddTransactionPage: () => <div data-testid="add-transaction-page">Add Transaction</div>,
  EditTransactionPage: () => <div data-testid="edit-transaction-page">Edit Transaction</div>,
  SettingsPage: () => <div data-testid="settings-page">Settings</div>,
  AccountsPage: () => <div data-testid="accounts-page">Accounts</div>,
  TagsPage: () => <div data-testid="tags-page">Tags</div>,
  CounterpartiesPage: () => <div data-testid="counterparties-page">Counterparties</div>,
  CurrenciesPage: () => <div data-testid="currencies-page">Currencies</div>,
  ExchangeRatesPage: () => <div data-testid="exchange-rates-page">Exchange Rates</div>,
  ExportPage: () => <div data-testid="export-page">Export</div>,
  DownloadPage: () => <div data-testid="download-page">Export</div>,
  BudgetsPage: () => <div data-testid="budgets-page">Budgets</div>,
  SummariesPage: () => <div data-testid="summaries-page">Summaries</div>,
}))

// Mock TabBar
vi.mock('../../components/ui', async () => {
  const actual = await vi.importActual('../../components/ui')
  return {
    ...actual,
    TabBar: () => <nav data-testid="tab-bar">TabBar</nav>,
  }
})

// Mock database context with configurable state
let mockDatabaseState = {
  isReady: true,
  error: null as string | null,
}

vi.mock('../../store/DatabaseContext', () => ({
  DatabaseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDatabase: () => mockDatabaseState,
}))

// Mock theme context
vi.mock('../../store/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}))

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDatabaseState = {
      isReady: true,
      error: null,
    }
  })

  describe('Loading state', () => {
    it('shows loading spinner when database not ready', () => {
      mockDatabaseState = { isReady: false, error: null }

      const { container } = render(<App />)

      expect(container.querySelector('.animate-spin')).toBeTruthy()
      expect(screen.getByText('Loading database...')).toBeInTheDocument()
    })
  })

  describe('Error state', () => {
    it('shows error message when database has error', () => {
      mockDatabaseState = { isReady: false, error: 'Failed to initialize database' }

      render(<App />)

      expect(screen.getByText('Database Error')).toBeInTheDocument()
      expect(screen.getByText('Failed to initialize database')).toBeInTheDocument()
    })

    it('shows browser support message on error', () => {
      mockDatabaseState = { isReady: false, error: 'OPFS not supported' }

      render(<App />)

      expect(screen.getByText(/Make sure you're using a modern browser with OPFS support/)).toBeInTheDocument()
    })

    it('shows error icon on database error', () => {
      mockDatabaseState = { isReady: false, error: 'Some error' }

      const { container } = render(<App />)

      expect(container.querySelector('svg')).toBeInTheDocument()
    })
  })

  describe('Ready state', () => {
    it('renders app layout when database is ready', () => {
      mockDatabaseState = { isReady: true, error: null }

      render(<App />)

      expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
    })

    it('renders transactions page by default', () => {
      mockDatabaseState = { isReady: true, error: null }

      render(<App />)

      expect(screen.getByTestId('transactions-page')).toBeInTheDocument()
    })
  })

  describe('Routing', () => {
    it('provides routing context', () => {
      mockDatabaseState = { isReady: true, error: null }

      // Should not throw error about missing router
      expect(() => render(<App />)).not.toThrow()
    })
  })

  describe('Providers', () => {
    it('wraps content in required providers', () => {
      mockDatabaseState = { isReady: true, error: null }

      // Should render without errors, indicating all providers are present
      render(<App />)

      expect(screen.getByTestId('transactions-page')).toBeInTheDocument()
    })
  })
})
