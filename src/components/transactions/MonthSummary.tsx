import { useNavigate } from 'react-router-dom'
import { formatCurrency } from '../../utils/formatters'

interface MonthSummaryProps {
  income: number
  expenses: number
  totalBalance: number
  displayCurrencySymbol: string
  decimalPlaces?: number
  month?: string
  clickable?: boolean
}

export function MonthSummary({ income, expenses, totalBalance, displayCurrencySymbol, decimalPlaces = 2, month, clickable = false }: MonthSummaryProps) {
  const navigate = useNavigate()

  const handleClick = () => {
    if (clickable && month) {
      navigate(`/summaries?month=${month}`)
    }
  }

  return (
    <div
      className={`grid grid-cols-3 gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-900 ${
        clickable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors' : ''
      }`}
      onClick={handleClick}
    >
      <div className="text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Income</p>
        <p className="text-sm font-semibold text-green-600 dark:text-green-400">
          {formatCurrency(income, displayCurrencySymbol, decimalPlaces)}
        </p>
      </div>
      <div className="text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Expenses</p>
        <p className="text-sm font-semibold text-red-600 dark:text-red-400">
          {formatCurrency(expenses, displayCurrencySymbol, decimalPlaces)}
        </p>
      </div>
      <div className="text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Balance</p>
        <p className={`text-sm font-semibold ${totalBalance >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-red-600 dark:text-red-400'}`}>
          {formatCurrency(totalBalance, displayCurrencySymbol, decimalPlaces)}
        </p>
      </div>
    </div>
  )
}
