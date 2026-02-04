import { type TransactionLog } from '../../types'
import { formatCurrency } from '../../utils/formatters'
import { formatTime } from '../../utils/dateUtils'

interface TransactionItemProps {
  transaction: TransactionLog[]
  onClick: () => void
}

type transactionT = 'exchange' | 'transfer' | 'expense' | 'income'

function isTypeOf(trx: TransactionLog[], t: transactionT): boolean {
  return trx.some(l => {
    return l.tags.includes(t)
  })
}

// Detect multi-currency expense pattern: 2 exchange lines + 1 expense line
const isMultiCurrencyExpense = (trx: TransactionLog[]): boolean => {
  const exchangeLines = trx.filter(l => l.tags.includes('exchange'))
  const expenseLines = trx.filter(l =>
    l.amount < 0 &&
    !l.tags.includes('exchange') &&
    !l.tags.includes('transfer') &&
    !l.tags.includes('fee')
  )
  return exchangeLines.length === 2 && expenseLines.length === 1
}

const getTransactionType = (trx: TransactionLog[]): transactionT => {
  // Check for multi-currency expense first (exchange + expense pattern)
  if (isMultiCurrencyExpense(trx)) {
    return 'expense'
  }
  if (isTypeOf(trx, 'exchange')) {
    return 'exchange'
  }
  if (isTypeOf(trx, 'transfer')) {
    return 'transfer'
  }
  return trx[0].amount < 0 ? 'expense' : 'income'
}

const getDecimalPlaces = (p: number): number => {
  return Math.pow(10, p)
}

// Get the expense line for multi-currency expense transactions
const getExpenseLine = (trx: TransactionLog[]): TransactionLog | undefined => {
  return trx.find(l =>
    l.amount < 0 &&
    !l.tags.includes('exchange') &&
    !l.tags.includes('transfer') &&
    !l.tags.includes('fee')
  )
}

export function TransactionItem({ transaction, onClick }: TransactionItemProps) {
  const getAmountDisplay = () => {
    const transactionType = getTransactionType(transaction)

    // For multi-currency expense, show the expense amount in the expense currency
    if (transactionType === 'expense' && isMultiCurrencyExpense(transaction)) {
      const expenseLine = getExpenseLine(transaction)!
      const amount = Math.abs(expenseLine.amount) / getDecimalPlaces(expenseLine.decimal_places)
      return {
        text: formatCurrency(amount, expenseLine.symbol),
        color: 'text-gray-600 dark:text-gray-400',
      }
    }

    const symbol = transaction[0].symbol
    const decimalPlaces = transaction[0].decimal_places

    const amount = transaction.reduce((acc, l) => acc + l.amount, 0) / getDecimalPlaces(decimalPlaces)
    switch (transactionType) {
      case 'income':
        return {
          text: `${formatCurrency(amount, symbol)}`,
          color: 'text-green-600 dark:text-green-400',
        }
      case 'transfer':
        return {
          text: formatCurrency(transaction[0].amount / getDecimalPlaces(decimalPlaces), symbol),
          color: 'text-blue-600 dark:text-blue-400',
        }
      case 'exchange': {
        const from = transaction.find(l => l.amount < 0 && l.tags.includes('exchange'))!
        const to = transaction.find(l => l.amount >= 0 && l.tags.includes('exchange'))!
        return {
          text: `${formatCurrency(from.amount / getDecimalPlaces(from.decimal_places), from.symbol)} → ${formatCurrency(to.amount / getDecimalPlaces(to.decimal_places), to.symbol)}`,
          color: 'text-purple-600 dark:text-purple-400',
        }
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

    // For multi-currency expense, show counterparty or source wallet info
    if (transactionType === 'expense' && isMultiCurrencyExpense(transaction)) {
      const counterparty = transaction.find(l => l.counterparty)?.counterparty
      if (counterparty) {
        return counterparty
      }
      // Show source wallet (where money came from) with source currency
      const exchangeOut = transaction.find(l => l.amount < 0 && l.tags.includes('exchange'))!
      return `${exchangeOut.wallet}:${exchangeOut.symbol}`
    }

    const from = transaction.find(l => l.amount < 0 && l.tags === transactionType)!
    const to = transaction.find(l => l.amount >= 0 && l.tags === transactionType)!

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

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()

  const getTitle = () => {
    if (['transfer', 'exchange'].includes(transactionType)) {
      return capitalize(transactionType)
    }
    // For multi-currency expense, use the expense line's tags
    if (transactionType === 'expense' && isMultiCurrencyExpense(transaction)) {
      const expenseLine = getExpenseLine(transaction)!
      if (expenseLine.tags && expenseLine.tags.length > 0) {
        const tag = expenseLine.tags.split(',')[0]
        return capitalize(tag)
      }
    }
    if (transaction[0].tags && transaction[0].tags.length > 0) {
      const tag = transaction[0].tags.split(',')[0]
      return capitalize(tag)
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
      <div className="shrink-0 w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full text-lg">
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
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold ${amount.color}`}>{amount.text}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{formatTime(transaction[0].date_time)}</p>
      </div>
    </button>
  )
}
