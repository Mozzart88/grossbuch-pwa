import { useState, useEffect } from 'react'
import type { TransactionView, MonthSummary as MonthSummaryType } from '../../types'
import { transactionRepository, accountRepository, currencyRepository } from '../../services/repositories'
import { getCurrentMonth, formatDate } from '../../utils/dateUtils'
import { MonthNavigator } from './MonthNavigator'
import { MonthSummary } from './MonthSummary'
import { TransactionItem } from './TransactionItem'
import { Spinner } from '../ui'

// Helper to convert blob ID to string for navigation
function blobToHex(blob: Uint8Array): string {
  return Array.from(blob)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Group transactions by date
function groupByDate(transactions: TransactionView[]): Map<string, TransactionView[]> {
  const groups = new Map<string, TransactionView[]>()

  for (const tx of transactions) {
    // Extract date part from datetime string
    const date = tx.created_at.split(' ')[0]
    if (!groups.has(date)) {
      groups.set(date, [])
    }
    groups.get(date)!.push(tx)
  }

  return groups
}

export function TransactionList() {
  const [month, setMonth] = useState(getCurrentMonth())
  const [transactions, setTransactions] = useState<TransactionView[]>([])
  const [summary, setSummary] = useState<MonthSummaryType>({
    income: 0,
    expenses: 0,
    totalBalance: 0,
    displayCurrencySymbol: '$'
  })
  const [decimalPlaces, setDecimalPlaces] = useState(2)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [month])

  const loadData = async () => {
    setLoading(true)
    try {
      // Get default currency for display
      const defaultCurrency = await currencyRepository.findDefault()
      const displayCurrencySymbol = defaultCurrency?.symbol ?? '$'
      const decimals = defaultCurrency?.decimal_places ?? 2

      const [txns, monthSum, totalBalance] = await Promise.all([
        transactionRepository.findByMonth(month),
        transactionRepository.getMonthSummary(month),
        accountRepository.getTotalBalance(),
      ])

      setTransactions(txns)
      setDecimalPlaces(decimals)
      setSummary({
        income: monthSum.income / Math.pow(10, decimals),
        expenses: monthSum.expenses / Math.pow(10, decimals),
        totalBalance: totalBalance.actual / Math.pow(10, decimals),
        displayCurrencySymbol,
      })
    } catch (error) {
      console.error('Failed to load transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTransactionClick = (tx: TransactionView) => {
    // Convert blob ID to hex string for URL
    const hexId = blobToHex(tx.id)
    // For now just log - navigation to edit would need the hex ID
    console.log('Transaction clicked:', hexId)
  }

  const groupedTransactions = groupByDate(transactions)

  return (
    <div className="flex flex-col h-full">
      <MonthNavigator month={month} onChange={setMonth} />
      <MonthSummary {...summary} decimalPlaces={decimalPlaces} />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner />
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-8">
          <svg className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-center">No transactions this month</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Tap the + button to add one
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {Array.from(groupedTransactions.entries()).map(([date, txns]) => (
            <div key={date}>
              <div className="sticky top-0 px-4 py-2 bg-gray-100 dark:bg-gray-900 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {formatDate(date)}
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {txns.map((tx, index) => (
                  <TransactionItem
                    key={`${blobToHex(tx.id)}-${index}`}
                    transaction={tx}
                    onClick={() => handleTransactionClick(tx)}
                    decimalPlaces={decimalPlaces}
                    currencySymbol={summary.displayCurrencySymbol}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
