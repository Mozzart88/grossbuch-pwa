import { Link } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui'
import { useTheme } from '../store/ThemeContext'

const settingsLinks = [
  { to: '/settings/accounts', label: 'Accounts', icon: '🏦', description: 'Manage your wallets and accounts' },
  { to: '/settings/tags', label: 'Tags', icon: '🏷️', description: 'Organize your transactions' },
  { to: '/settings/counterparties', label: 'Counterparties', icon: '👥', description: 'Track who you transact with' },
  { to: '/settings/currencies', label: 'Currencies', icon: '💱', description: 'Manage currency options' },
  { to: '/settings/exchange-rates', label: 'Exchange Rates', icon: '📈', description: 'Set currency exchange rates' },
  { to: '/settings/export', label: 'Export Data', icon: '📤', description: 'Export transactions to CSV' },
  { to: '/settings/download', label: 'Download DB', icon: '🗄️', description: 'Download Raw Sqlite DB' },
  { to: '/settings/budgets', label: 'Budgets', icon: '💰', description: 'Manage your budgets' },
  { to: '/settings/security', label: 'Security', icon: '🔒', description: 'Change PIN and security settings' },
]

export function SettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="p-4 space-y-4">
        {/* Theme selector */}
        <Card className="p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Appearance</h3>
          <div className="grid grid-cols-3 gap-2">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${theme === t
                  ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </Card>

        {/* Settings links */}
        <Card className="divide-y divide-gray-200 dark:divide-gray-700">
          {settingsLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <span className="text-2xl">{link.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{link.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{link.description}</p>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </Card>

        {/* App info */}
        <div className="text-center text-xs text-gray-400 dark:text-gray-500 pt-4">
          <p>GrossBuch v1.0.0</p>
          <p>All data stored locally on your device</p>
        </div>
      </div>
    </div>
  )
}
