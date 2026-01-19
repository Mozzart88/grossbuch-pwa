import { useState, useEffect } from 'react'
import type { TransactionLog, MonthSummary as MonthSummaryType } from '../../types'
import { transactionRepository, accountRepository, currencyRepository } from '../../services/repositories'
import { getCurrentMonth, formatDate } from '../../utils/dateUtils'
import { MonthNavigator } from './MonthNavigator'
import { MonthSummary } from './MonthSummary'
import { TransactionItem } from './TransactionItem'
import { Spinner } from '../ui'
import { useNavigate } from 'react-router-dom'

// Helper to convert blob ID to string for navigation
function blobToHex(blob: Uint8Array): string {
  return Array.from(blob)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Group transactions by date
function groupByDate(transactions: TransactionLog[]): Map<string, Map<string, TransactionLog[]>> {
  const groups = new Map<string, Map<string, TransactionLog[]>>()

  for (const tx of transactions) {
    // Extract date part from datetime string
    const date = tx.date_time.split(' ')[0]
    if (!groups.has(date)) {
      groups.set(date, new Map<string, TransactionLog[]>)
    }
    const hexId = blobToHex(tx.id)
    if (!groups.get(date)!.has(hexId)) {
      groups.get(date)!.set(hexId, [])
    }
    groups.get(date)!.get(hexId)!.push(tx)
  }

  return groups
}

// Chevron icon that rotates based on expanded state
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : 'rotate-0'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

export function TransactionList() {
  const navigate = useNavigate()
  const [month, setMonth] = useState(getCurrentMonth())
  const [transactions, setTransactions] = useState<TransactionLog[]>([])
  const [summary, setSummary] = useState<MonthSummaryType>({
    income: 0,
    expenses: 0,
    totalBalance: 0,
    displayCurrencySymbol: '$'
  })
  const [decimalPlaces, setDecimalPlaces] = useState(2)
  const [loading, setLoading] = useState(true)
  const [daySummaries, setDaySummaries] = useState<Map<string, number>>(new Map())
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => {
    // Initialize with today's date expanded
    const today = new Date().toISOString().slice(0, 10)
    return new Set([today])
  })

  const toggleDate = (date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev)
      if (next.has(date)) {
        next.delete(date)
      } else {
        next.add(date)
      }
      return next
    })
  }

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
        totalBalance: totalBalance / Math.pow(10, decimals),
        displayCurrencySymbol,
      })

      // Get unique dates and fetch day summaries
      const dates = [...new Set(txns.map(tx => tx.date_time.split(' ')[0]))]
      const summaries = await Promise.all(
        dates.map(async (date) => {
          const net = await transactionRepository.getDaySummary(date)
          return [date, net / Math.pow(10, decimals)] as const
        })
      )
      setDaySummaries(new Map(summaries))
    } catch (error) {
      console.error('Failed to load transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTransactionClick = (hexId: string) => {
    navigate(`/transaction/${hexId}`)
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
          {Array.from(groupedTransactions.entries()).map(([date, txns]) => {
            const daySummary = daySummaries.get(date) ?? 0
            const isExpanded = expandedDates.has(date)

            return (
              <div key={date}>
                <div
                  className="sticky top-0 px-4 py-2 bg-gray-100 dark:bg-gray-900 flex items-center justify-between cursor-pointer"
                  onClick={() => toggleDate(date)}
                >
                  <div className="flex items-center gap-2">
                    <ChevronIcon expanded={isExpanded} />
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {formatDate(date)}
                    </span>
                  </div>
                  <span className={`text-sm font-medium ${daySummary > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {daySummary > 0 ? '+' : ''}{Math.abs(daySummary).toFixed(decimalPlaces)}
                  </span>
                </div>
                {isExpanded && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {Array.from(txns.entries()).map(([hexId, trxs], index) => (
                      <TransactionItem
                        key={`${hexId}-${index}`}
                        transaction={trxs}
                        onClick={() => handleTransactionClick(hexId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
