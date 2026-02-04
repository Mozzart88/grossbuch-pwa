import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { DatabaseProvider, useDatabase } from './store/DatabaseContext'
import { AuthProvider, useAuth } from './store/AuthContext'
import { ThemeProvider } from './store/ThemeContext'
import { LayoutProvider } from './store/LayoutContext'
import { ToastProvider, Spinner } from './components/ui'
import { useExchangeRateSync } from './hooks/useExchangeRateSync'
import { AppLayout } from './components/layout/AppLayout'
import {
  TransactionsPage,
  AddTransactionPage,
  EditTransactionPage,
  SettingsPage,
  AccountsPage,
  AccountTransactionsPage,
  // CategoriesPage,
  CounterpartiesPage,
  CurrenciesPage,
  ExchangeRatesPage,
  ExportPage,
  DownloadPage,
  TagsPage,
  BudgetsPage,
  SummariesPage,
  PinSetupPage,
  PinLoginPage,
  ChangePinPage,
  MigrationPage,
} from './pages'

function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()

  // Checking auth status
  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-4">
        <Spinner size="lg" />
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    )
  }

  // First time setup
  if (status === 'first_time_setup') {
    return <PinSetupPage />
  }

  // Needs migration (unencrypted database detected)
  if (status === 'needs_migration') {
    return <MigrationPage />
  }

  // Needs authentication or auth failed
  if (status === 'needs_auth' || status === 'auth_failed') {
    return <PinLoginPage />
  }

  // Authenticated - show app
  return <>{children}</>
}

function AppContent() {
  const { isReady, error } = useDatabase()

  // Background sync exchange rates when app opens
  useExchangeRateSync({ enabled: isReady })

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="text-red-600 dark:text-red-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Database Error</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          Make sure you're using a modern browser with OPFS support.
        </p>
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Spinner size="lg" />
        <p className="text-gray-500 dark:text-gray-400">Loading database...</p>
      </div>
    )
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<TransactionsPage />} />
        <Route path="/add" element={<AddTransactionPage />} />
        <Route path="/transaction/:id" element={<EditTransactionPage />} />
        <Route path="/summaries" element={<SummariesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/accounts" element={<AccountsPage />} />
        <Route path="/accounts/:accountId/transactions" element={<AccountTransactionsPage />} />
        <Route path="/settings/counterparties" element={<CounterpartiesPage />} />
        <Route path="/settings/currencies" element={<CurrenciesPage />} />
        <Route path="/settings/exchange-rates" element={<ExchangeRatesPage />} />
        <Route path="/settings/export" element={<ExportPage />} />
        <Route path="/settings/download" element={<DownloadPage />} />
        <Route path="/settings/tags" element={<TagsPage />} />
        <Route path="/settings/budgets" element={<BudgetsPage />} />
        <Route path="/settings/security" element={<ChangePinPage />} />
      </Routes>
    </AppLayout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <DatabaseProvider>
            <AuthProvider>
              <AuthGate>
                <LayoutProvider>
                  <AppContent />
                </LayoutProvider>
              </AuthGate>
            </AuthProvider>
          </DatabaseProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
