import type { Transaction } from '../../types'
import { formatCurrency } from '../../utils/formatters'
import { formatTime } from '../../utils/dateUtils'

interface TransactionItemProps {
  transaction: Transaction
  onClick: () => void
}

export function TransactionItem({ transaction, onClick }: TransactionItemProps) {
  const getAmountDisplay = () => {
    const symbol = transaction.currency_symbol || '$'

    switch (transaction.type) {
      case 'income':
        return {
          text: `+${formatCurrency(transaction.amount, symbol)}`,
          color: 'text-green-600 dark:text-green-400',
        }
      case 'expense':
        return {
          text: `-${formatCurrency(transaction.amount, symbol)}`,
          color: 'text-red-600 dark:text-red-400',
        }
      case 'transfer':
        return {
          text: formatCurrency(transaction.amount, symbol),
          color: 'text-blue-600 dark:text-blue-400',
        }
      case 'exchange':
        return {
          text: `${formatCurrency(transaction.amount, symbol)} → ${formatCurrency(transaction.to_amount || 0, transaction.to_currency_symbol || '$')}`,
          color: 'text-purple-600 dark:text-purple-400',
        }
    }
  }

  const getDescription = () => {
    switch (transaction.type) {
      case 'transfer':
        return `${transaction.account_name} → ${transaction.to_account_name}`
      case 'exchange':
        return `${transaction.account_name} → ${transaction.to_account_name}`
      default:
        return transaction.counterparty_name || transaction.category_name || ''
    }
  }

  const amount = getAmountDisplay()

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
    >
      {/* Icon */}
      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full text-lg">
        {transaction.type === 'transfer' && '↔️'}
        {transaction.type === 'exchange' && '💱'}
        {transaction.type !== 'transfer' && transaction.type !== 'exchange' && (transaction.category_icon || '📝')}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {transaction.type === 'transfer' || transaction.type === 'exchange'
            ? transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)
            : transaction.category_name || 'Uncategorized'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {getDescription()}
        </p>
      </div>

      {/* Amount and time */}
      <div className="flex-shrink-0 text-right">
        <p className={`text-sm font-semibold ${amount.color}`}>{amount.text}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{formatTime(transaction.date_time)}</p>
      </div>
    </button>
  )
}
