import { type TransactionView } from '../../types'
import { formatCurrency } from '../../utils/formatters'
import { formatTime } from '../../utils/dateUtils'

interface TransactionItemProps {
  transaction: TransactionView[]
  onClick: () => void
}

type transactionT = 'exchange' | 'transfer' | 'expense' | 'income'

function isTypeOf(trx: TransactionView[], t: transactionT): boolean {
  return trx.some(l => {
    return l.tags.includes(t)
  })
}

const getTransactionType = (trx: TransactionView[]): transactionT => {
  if (isTypeOf(trx, 'exchange')) {
    return 'exchange'
  }
  if (isTypeOf(trx, 'transfer')) {
    return 'transfer'
  }
  return trx[0].real_amount < 0 ? 'expense' : 'income'
}

const getDecimalPlaces = (p: number): number => {
  return Math.pow(10, p)
}

export function TransactionItem({ transaction, onClick }: TransactionItemProps) {
  const getAmountDisplay = () => {
    const symbol = transaction[0].symbol
    const decimalPlaces = transaction[0].decimal_places

    const amount = transaction.reduce((acc, l) => acc + l.real_amount, 0) / getDecimalPlaces(decimalPlaces)
    switch (getTransactionType(transaction)) {
      case 'income':
        return {
          text: `${formatCurrency(amount, symbol)}`,
          color: 'text-green-600 dark:text-green-400',
        }
      case 'transfer':
        return {
          text: formatCurrency(transaction[0].real_amount / getDecimalPlaces(decimalPlaces), symbol),
          color: 'text-blue-600 dark:text-blue-400',
        }
      case 'exchange':
        const from = transaction.find(l => l.real_amount < 0 && l.tags.includes('exchange'))!
        const to = transaction.find(l => l.real_amount >= 0 && l.tags.includes('exchange'))!
        return {
          text: `${formatCurrency(from.real_amount / getDecimalPlaces(from.decimal_places), from.symbol)} → ${formatCurrency(to.real_amount / getDecimalPlaces(to.decimal_places), to.symbol)}`,
          color: 'text-purple-600 dark:text-purple-400',
        }
      default:
        return {
          text: `${formatCurrency(amount, symbol)}`,
          color: 'text-gray-600 dark:text-gray-400',
        }
    }
  }

  const getDescription = () => {
    const transactionType = getTransactionType(transaction)
    const from = transaction.find(l => l.real_amount < 0 && l.tags === transactionType)!
    const to = transaction.find(l => l.real_amount >= 0 && l.tags === transactionType)!

    switch (transactionType) {
      case 'transfer':
        if (from.currency == to.currency)
          return `${from.wallet} → ${to.wallet}`
        return `${from.wallet}:${from.symbol} → ${to.wallet}:${to.symbol}`
      case 'exchange':
        if (from.wallet === to.wallet)
          return `${from.currency} → ${to.currency}`
        return `${from.wallet}:${from.symbol} → ${to.wallet}:${to.symbol}`
      default:
        return transaction.find(l => l.counterparty)?.counterparty
          || transaction[0].wallet
    }
  }

  const getIcon = () => {
    switch (transactionType) {
      case 'transfer': return '↔️'
      case 'exchange': return '💱'
      case 'income': return '📈'
      case 'expense': return '📉'
      default: return '📝'
    }
  }

  const getTitle = () => {
    if (['transfer', 'exchange'].includes(transactionType)) {
      return transactionType[0].toUpperCase() + transactionType.slice(1)
    }
    if (transaction[0].tags.length > 0) {
      return transaction[0].tags[0]?.toUpperCase() + transaction[0].tags?.slice(1)
    }
    return 'Uncategorized'
  }

  const amount = getAmountDisplay()
  const transactionType = getTransactionType(transaction)

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
          {getTitle()}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {getDescription()}
        </p>
      </div>

      {/* Amount and time */}
      <div className="flex-shrink-0 text-right">
        <p className={`text-sm font-semibold ${amount.color}`}>{amount.text}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{formatTime(transaction[0].created_at)}</p>
      </div>
    </button>
  )
}
