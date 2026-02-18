import type { ReactNode } from 'react'
import { type TransactionLog } from '../../types'
import { formatCurrencyValue } from '../../utils/formatters'
import { fromIntFrac } from '../../utils/amount'
import { formatTime } from '../../utils/dateUtils'

interface TransactionItemProps {
  transaction: TransactionLog[]
  onClick: () => void
}

type transactionT = 'exchange' | 'transfer' | 'expense' | 'income' | 'initial' | 'adjustment'

/** Get the signed float amount from a TransactionLog line */
function getSignedAmount(l: TransactionLog): number {
  const abs = fromIntFrac(l.amount_int, l.amount_frac)
  return l.sign === '-' ? -abs : abs
}

function isTypeOf(trx: TransactionLog[], t: transactionT): boolean {
  return trx.some(l => {
    return l.tags.includes(t)
  })
}

// Detect multi-currency expense pattern: 2 exchange lines + 1 expense line
const isMultiCurrencyExpense = (trx: TransactionLog[]): boolean => {
  const exchangeLines = trx.filter(l => l.tags.includes('exchange'))
  const expenseLines = trx.filter(l =>
    getSignedAmount(l) < 0 &&
    l.tags !== 'exchange' &&
    l.tags !== 'transfer' &&
    l.tags.match(/^fee[s]?$/i) === null
  )
  return exchangeLines.length === 2 && expenseLines.length > 0
}

const getTransactionType = (trx: TransactionLog[]): transactionT => {
  // Check for INITIAL and ADJUSTMENT first (special system transactions)
  if (isTypeOf(trx, 'initial')) {
    return 'initial'
  }
  if (isTypeOf(trx, 'adjustment')) {
    return 'adjustment'
  }
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
  return getSignedAmount(trx[0]) < 0 ? 'expense' : 'income'
}

// Get the expense line for multi-currency expense transactions
const getExpenseLine = (trx: TransactionLog[]): TransactionLog | undefined => {
  return trx.find(l =>
    getSignedAmount(l) < 0 &&
    l.tags !== 'exchange' &&
    l.tags !== 'transfer' &&
    l.tags.match(/^fee[s]?$/i) === null
  )
}

export function TransactionItem({ transaction, onClick }: TransactionItemProps) {
  const getAmountDisplay = () => {
    const transactionType = getTransactionType(transaction)

    // For multi-currency expense, show the expense amount in the expense currency
    if (transactionType === 'expense' && isMultiCurrencyExpense(transaction)) {
      const expenseLine = getExpenseLine(transaction)!
      const amount = fromIntFrac(expenseLine.amount_int, expenseLine.amount_frac)
      return {
        text: formatCurrencyValue(amount, expenseLine.symbol),
        color: 'text-gray-600 dark:text-gray-400',
      }
    }

    const symbol = transaction[0].symbol
    const amount = transaction.reduce((acc, l) => acc + getSignedAmount(l), 0)
    switch (transactionType) {
      case 'income':
        return {
          text: formatCurrencyValue(amount, symbol),
          color: 'text-green-600 dark:text-green-400',
        }
      case 'transfer':
        return {
          text: formatCurrencyValue(getSignedAmount(transaction[0]), symbol),
          color: 'text-blue-600 dark:text-blue-400',
        }
      case 'exchange': {
        const from = transaction.find(l => getSignedAmount(l) < 0 && l.tags.includes('exchange'))!
        const to = transaction.find(l => getSignedAmount(l) >= 0 && l.tags.includes('exchange'))!
        return {
          text: `${formatCurrencyValue(getSignedAmount(from), from.symbol)} → ${formatCurrencyValue(getSignedAmount(to), to.symbol)}`,
          color: 'text-purple-600 dark:text-purple-400',
        }
      }
      case 'initial':
      case 'adjustment':
        return {
          text: formatCurrencyValue(amount, symbol),
          color: 'text-slate-500 dark:text-slate-400',
        }
      default:
        return {
          text: formatCurrencyValue(amount, symbol),
          color: 'text-gray-600 dark:text-gray-400',
        }
    }
  }

  // Helper to wrap text in a colored span when wallet has a color configured.
  const getColoredText = (text: string, color: string | null): ReactNode => {
    if (color) {
      return <span style={{ color }}>{text}</span>
    }
    return text
  }

  const getDescription = (): ReactNode => {
    // For multi-currency expense, show counterparty or source wallet info
    if (transactionType === 'expense' && isMultiCurrencyExpense(transaction)) {
      const line = transaction.find(l => l.counterparty)
      if (line?.counterparty) {
        return getColoredText(line.counterparty, line.wallet_color)
      }
      // Show source wallet (where money came from) with source currency
      const exchangeOut = transaction.find(l => getSignedAmount(l) < 0 && l.tags.includes('exchange'))!
      return <>{getColoredText(`${exchangeOut.wallet}:${exchangeOut.symbol}`, exchangeOut.wallet_color)}</>
    }

    const from = transaction.find(l => getSignedAmount(l) < 0 && l.tags === transactionType)!
    const to = transaction.find(l => getSignedAmount(l) >= 0 && l.tags === transactionType)!

    switch (transactionType) {
      case 'transfer':
        if (from.currency == to.currency)
          return <>{getColoredText(from.wallet, from.wallet_color)} → {getColoredText(to.wallet, to.wallet_color)}</>
        return <>{getColoredText(`${from.wallet}:${from.symbol}`, from.wallet_color)} → {getColoredText(`${to.wallet}:${to.symbol}`, to.wallet_color)}</>
      case 'exchange':
        if (from.wallet === to.wallet)
          return <>{getColoredText(from.currency, from.wallet_color)} → {getColoredText(to.currency, to.wallet_color)}</>
        return <>{getColoredText(`${from.wallet}:${from.symbol}`, from.wallet_color)} → {getColoredText(`${to.wallet}:${to.symbol}`, to.wallet_color)}</>
      default: {
        const line = transaction.find(l => l.counterparty)
        if (line?.counterparty) {
          return getColoredText(line.counterparty, line.wallet_color)
        }
        return getColoredText(transaction[0].wallet, transaction[0].wallet_color)
      }
    }
  }

  const getIcon = () => {
    switch (transactionType) {
      case 'transfer': return '↔️'
      case 'exchange': return '💱'
      case 'income': return '📈'
      case 'expense': return '📉'
      case 'initial': return '🏦'
      case 'adjustment': return '⚖️'
      default: return '📝'
    }
  }

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()

  const getTitleColor = () => {
    if (transactionType === 'initial') {
      return 'text-green-600 dark:text-green-400'
    }
    if (transactionType === 'adjustment') {
      return 'text-yellow-600 dark:text-yellow-400'
    }
    return 'text-gray-900 dark:text-gray-100'
  }

  const getTitle = () => {
    if (transactionType === 'initial') {
      return 'Initial Balance'
    }
    if (transactionType === 'adjustment') {
      return 'Adjustment'
    }
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
  const isReadOnly = transactionType === 'initial' || transactionType === 'adjustment'

  return (
    <div
      onClick={isReadOnly ? undefined : onClick}
      role={isReadOnly ? undefined : 'button'}
      tabIndex={isReadOnly ? undefined : 0}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${isReadOnly
        ? 'cursor-default'
        : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'
        }`}
    >
      {/* Icon */}
      <div className="shrink-0 w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full text-lg">
        {getIcon()}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${getTitleColor()}`}>
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
    </div>
  )
}
