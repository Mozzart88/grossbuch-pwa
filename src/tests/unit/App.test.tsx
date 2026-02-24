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
  AccountTransactionsPage: () => <div data-testid="account-transactions-page">Account Transactions</div>,
  TagsPage: () => <div data-testid="tags-page">Tags</div>,
  CounterpartiesPage: () => <div data-testid="counterparties-page">Counterparties</div>,
  CurrenciesPage: () => <div data-testid="currencies-page">Currencies</div>,
  ExchangeRatesPage: () => <div data-testid="exchange-rates-page">Exchange Rates</div>,
  ExportPage: () => <div data-testid="export-page">Export</div>,
  ImportPage: () => <div data-testid="import-page">Import</div>,
  DownloadPage: () => <div data-testid="download-page">Export</div>,
  BudgetsPage: () => <div data-testid="budgets-page">Budgets</div>,
  SummariesPage: () => <div data-testid="summaries-page">Summaries</div>,
  PinSetupPage: () => <div data-testid="pin-setup-page">PIN Setup</div>,
  PinLoginPage: () => <div data-testid="pin-login-page">PIN Login</div>,
  ChangePinPage: () => <div data-testid="change-pin-page">Change PIN</div>,
  MigrationPage: () => <div data-testid="migration-page">Migration</div>,
  InstallPage: () => <div data-testid="install-page">Install</div>,
  SharePage: () => <div data-testid="share-page">Share</div>,
  LinkedDevicesPage: () => <div data-testid="linked-devices-page">LinkedDevices</div>,
  OnboardingPage: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="onboarding-page">
      <button onClick={onComplete}>Complete Onboarding</button>
    </div>
  ),
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
  setDatabaseReady: vi.fn(),
  setDatabaseError: vi.fn(),
  runDatabaseMigrations: vi.fn(),
  reset: vi.fn(),
}

vi.mock('../../store/DatabaseContext', () => ({
  DatabaseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDatabase: () => mockDatabaseState,
}))

// Mock auth context with configurable state
let mockAuthState = {
  status: 'authenticated' as const,
  failedAttempts: 0,
  error: null as string | null,
  setupPin: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  changePin: vi.fn(),
  wipeAndReset: vi.fn(),
  clearError: vi.fn(),
  isFirstSetup: false,
  clearFirstSetup: vi.fn(),
}

vi.mock('../../store/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockAuthState,
}))

// Mock installation hook - default to installed
vi.mock('../../hooks/useInstallation', () => ({
  useInstallation: () => ({
    isInstalled: true,
    isIOS: false,
    canPromptInstall: false,
    promptInstall: vi.fn(),
  }),
}))

// Mock installation registration hook
vi.mock('../../hooks/useInstallationRegistration', () => ({
  useInstallationRegistration: vi.fn(),
}))

// Mock settingsRepository so SyncProvider doesn't touch the DB
vi.mock('../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  },
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
      setDatabaseReady: vi.fn(),
      setDatabaseError: vi.fn(),
      runDatabaseMigrations: vi.fn(),
      reset: vi.fn(),
    }
    mockAuthState = {
      status: 'authenticated',
      failedAttempts: 0,
      error: null,
      setupPin: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      changePin: vi.fn(),
      wipeAndReset: vi.fn(),
      clearError: vi.fn(),
      isFirstSetup: false,
      clearFirstSetup: vi.fn(),
    }
  })

  describe('Auth states', () => {
    it('shows loading spinner when checking auth', () => {
      mockAuthState.status = 'checking'

      const { container } = render(<App />)

      expect(container.querySelector('.animate-spin')).toBeTruthy()
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('shows PIN setup page for first time users', () => {
      mockAuthState.status = 'first_time_setup'

      render(<App />)

      expect(screen.getByTestId('pin-setup-page')).toBeInTheDocument()
    })

    it('shows PIN login page when authentication is needed', () => {
      mockAuthState.status = 'needs_auth'

      render(<App />)

      expect(screen.getByTestId('pin-login-page')).toBeInTheDocument()
    })
  })

  describe('Database error state', () => {
    it('shows error message when database has error', () => {
      mockDatabaseState = { ...mockDatabaseState, isReady: false, error: 'Failed to initialize database' }

      render(<App />)

      expect(screen.getByText('Database Error')).toBeInTheDocument()
      expect(screen.getByText('Failed to initialize database')).toBeInTheDocument()
    })

    it('shows browser support message on error', () => {
      mockDatabaseState = { ...mockDatabaseState, isReady: false, error: 'OPFS not supported' }

      render(<App />)

      expect(screen.getByText(/Make sure you're using a modern browser with OPFS support/)).toBeInTheDocument()
    })

    it('shows error icon on database error', () => {
      mockDatabaseState = { ...mockDatabaseState, isReady: false, error: 'Some error' }

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

  describe('OnboardingPage gate', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('renders OnboardingPage when isFirstSetup=true and no share link', () => {
      mockAuthState.isFirstSetup = true
      mockDatabaseState = { isReady: true, error: null }

      render(<App />)

      expect(screen.getByTestId('onboarding-page')).toBeInTheDocument()
      expect(screen.queryByTestId('transactions-page')).not.toBeInTheDocument()
    })

    it('skips OnboardingPage when isFirstSetup=false', () => {
      mockAuthState.isFirstSetup = false
      mockDatabaseState = { isReady: true, error: null }

      render(<App />)

      expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument()
      expect(screen.getByTestId('transactions-page')).toBeInTheDocument()
    })

    it('skips OnboardingPage when share link is present in localStorage', () => {
      localStorage.setItem('gb_shared_uuid', 'some-uuid')
      mockAuthState.isFirstSetup = true
      mockDatabaseState = { isReady: true, error: null }

      render(<App />)

      expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument()
      expect(screen.getByTestId('transactions-page')).toBeInTheDocument()
    })
  })
})
