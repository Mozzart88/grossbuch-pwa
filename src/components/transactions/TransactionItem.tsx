import type { TransactionView } from '../../types'
import { formatTime } from '../../utils/dateUtils'

interface TransactionItemProps {
  transaction: TransactionView
  onClick: () => void
  decimalPlaces?: number
  currencySymbol?: string
}

export function TransactionItem({
  transaction,
  onClick,
  decimalPlaces = 2,
  currencySymbol = '$'
}: TransactionItemProps) {
  // Format amount for display (stored as integer)
  const formatAmount = (amount: number) => {
    const displayAmount = Math.abs(amount) / Math.pow(10, decimalPlaces)
    return displayAmount.toFixed(decimalPlaces)
  }

  const getAmountDisplay = () => {
    const amount = transaction.actual_amount
    const isPositive = amount > 0

    if (isPositive) {
      return {
        text: `+${currencySymbol}${formatAmount(amount)}`,
        color: 'text-green-600 dark:text-green-400',
      }
    } else {
      return {
        text: `-${currencySymbol}${formatAmount(amount)}`,
        color: 'text-red-600 dark:text-red-400',
      }
    }
  }

  const getDescription = () => {
    if (transaction.counterparty) {
      return transaction.counterparty
    }
    return transaction.wallet
  }

  // Determine transaction type from tags
  const getTransactionType = () => {
    const tags = transaction.tags?.toLowerCase() || ''
    if (tags.includes('transfer')) return 'transfer'
    if (tags.includes('exchange')) return 'exchange'
    return transaction.actual_amount > 0 ? 'income' : 'expense'
  }

  const getIcon = () => {
    const type = getTransactionType()
    switch (type) {
      case 'transfer':
        return '↔️'
      case 'exchange':
        return '💱'
      default:
        return transaction.actual_amount > 0 ? '📈' : '📉'
    }
  }

  const amount = getAmountDisplay()
  const type = getTransactionType()

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
    >
      {/* Icon */}
      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full text-lg">
        {getIcon()}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {type === 'transfer' || type === 'exchange'
            ? type.charAt(0).toUpperCase() + type.slice(1)
            : transaction.tags || 'Uncategorized'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {getDescription()}
        </p>
      </div>

      {/* Amount and time */}
      <div className="flex-shrink-0 text-right">
        <p className={`text-sm font-semibold ${amount.color}`}>{amount.text}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {formatTime(transaction.created_at)}
        </p>
      </div>
    </button>
  )
}
