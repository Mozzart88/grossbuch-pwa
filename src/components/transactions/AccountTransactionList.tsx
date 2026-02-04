import { useState, useEffect, useCallback, useMemo } from 'react'
import type { TransactionLog, Account } from '../../types'
import { transactionRepository } from '../../services/repositories'
import { getCurrentMonth, formatDate } from '../../utils/dateUtils'
import { formatCurrency } from '../../utils/formatters'
import { MonthNavigator } from './MonthNavigator'
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
    const date = tx.date_time.split(' ')[0]
    if (!groups.has(date)) {
      groups.set(date, new Map<string, TransactionLog[]>())
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

interface AccountTransactionListProps {
  account: Account
  initialMonth?: string
  onMonthChange?: (month: string) => void
}

export function AccountTransactionList({ account, initialMonth, onMonthChange }: AccountTransactionListProps) {
  const navigate = useNavigate()
  const [month, setMonth] = useState(initialMonth || getCurrentMonth())
  const [transactions, setTransactions] = useState<TransactionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [daySummaries, setDaySummaries] = useState<Map<string, number>>(new Map())
  const [runningBalances, setRunningBalances] = useState<Map<string, number>>(new Map())
  const [startOfMonthBalance, setStartOfMonthBalance] = useState(0)
  const [endOfMonthBalance, setEndOfMonthBalance] = useState(0)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => {
    const today = new Date().toISOString().slice(0, 10)
    return new Set([today])
  })

  const decimalPlaces = account.decimal_places ?? 2
  const symbol = account.symbol ?? '$'
  const divisor = useMemo(() => Math.pow(10, decimalPlaces), [decimalPlaces])
  const isCurrentMonth = month === getCurrentMonth()

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

  const handleMonthChange = useCallback((newMonth: string) => {
    setMonth(newMonth)
    onMonthChange?.(newMonth)
  }, [onMonthChange])

  // Sync month state with initialMonth prop (for browser back/forward navigation)
  useEffect(() => {
    if (initialMonth && initialMonth !== month) {
      setMonth(initialMonth)
    }
  }, [initialMonth])

  useEffect(() => {
    loadData()
  }, [month, account.id])

  const loadData = async () => {
    setLoading(true)
    try {
      const txns = await transactionRepository.findByAccountAndMonth(account.id, month)
      setTransactions(txns)

      // Get unique dates and fetch day summaries
      const dates = [...new Set(txns.map(tx => tx.date_time.split(' ')[0]))].sort().reverse()
      const summaries = await Promise.all(
        dates.map(async (date) => {
          const net = await transactionRepository.getAccountDaySummary(account.id, date)
          return [date, net] as const
        })
      )
      setDaySummaries(new Map(summaries))

      // Calculate monthly net change (sum of all day summaries)
      const monthlyNet = summaries.reduce((acc, [, net]) => acc + net, 0)

      // Calculate end of month balance
      // For current month: endOfMonth = account.balance
      // For previous months: endOfMonth = account.balance + (sum of transactions after this month)
      const currentMonth = getCurrentMonth()
      let calculatedEndOfMonth: number
      if (month === currentMonth) {
        calculatedEndOfMonth = account.balance
      } else {
        const transactionsAfterMonth = await transactionRepository.getAccountTransactionsAfterMonth(account.id, month)
        calculatedEndOfMonth = account.balance - transactionsAfterMonth
      }

      // Calculate start of month balance
      const calculatedStartOfMonth = calculatedEndOfMonth - monthlyNet

      setEndOfMonthBalance(calculatedEndOfMonth)
      setStartOfMonthBalance(calculatedStartOfMonth)

      // Calculate running balances working backwards from end of month balance
      const sortedDates = [...dates].sort().reverse() // newest first
      const balances = new Map<string, number>()
      let runningBalance = calculatedEndOfMonth

      for (const date of sortedDates) {
        // The running balance shown is the balance at END of this day
        balances.set(date, runningBalance)
        // Subtract this day's net to get previous day's ending balance
        const dayNet = summaries.find(([d]) => d === date)?.[1] ?? 0
        runningBalance -= dayNet
      }
      setRunningBalances(balances)
    } catch (error) {
      console.error('Failed to load account transactions:', error)
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
      <MonthNavigator month={month} onChange={handleMonthChange} />

      {/* Account balance header - shows start and end of month */}
      <div className="px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 dark:text-gray-400">Start of month:</span>
            <span className={`text-base font-semibold ${startOfMonthBalance / divisor >= 0 ? 'text-gray-700 dark:text-gray-300' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrency(startOfMonthBalance / divisor, symbol)}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isCurrentMonth ? 'Current:' : 'End of month:'}
            </span>
            <span className={`text-base font-semibold ${endOfMonthBalance / divisor >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {formatCurrency(endOfMonthBalance / divisor, symbol)}
            </span>
          </div>
        </div>
      </div>

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
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {Array.from(groupedTransactions.entries()).map(([date, txns]) => {
            const daySummary = (daySummaries.get(date) ?? 0) / divisor
            const runningBalance = (runningBalances.get(date) ?? 0) / divisor
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
                  <div className="flex items-center gap-4">
                    {/* Day balance (net change) */}
                    <span className={`text-sm font-medium ${daySummary > 0 ? 'text-green-600 dark:text-green-400' : daySummary < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
                      {daySummary > 0 ? '+' : daySummary < 0 ? '-' : ''}{formatCurrency(Math.abs(daySummary), symbol)}
                    </span>
                    {/* Running balance (account balance at end of day) */}
                    <span className={`text-sm font-semibold ${runningBalance >= 0 ? 'text-gray-700 dark:text-gray-300' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(runningBalance, symbol)}
                    </span>
                  </div>
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
