import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Transaction, MonthSummary as MonthSummaryType } from '../../types'
import { transactionRepository, accountRepository, settingsRepository, currencyRepository } from '../../services/repositories'
import { getCurrentMonth, formatDate, groupByDate } from '../../utils/dateUtils'
import { MonthNavigator } from './MonthNavigator'
import { MonthSummary } from './MonthSummary'
import { TransactionItem } from './TransactionItem'
import { Spinner } from '../ui'

export function TransactionList() {
  const navigate = useNavigate()
  const [month, setMonth] = useState(getCurrentMonth())
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [summary, setSummary] = useState<MonthSummaryType>({ income: 0, expenses: 0, totalBalance: 0, displayCurrencySymbol: '$' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [month])

  const loadData = async () => {
    setLoading(true)
    try {
      // Get default currency for display
      const defaultCurrencyId = await settingsRepository.get('default_currency_id') ?? 1
      const currency = await currencyRepository.findById(defaultCurrencyId)
      const displayCurrencySymbol = currency?.symbol ?? '$'

      const [txns, monthSum, totalBalance] = await Promise.all([
        transactionRepository.findByMonth(month),
        transactionRepository.getMonthSummary(month),
        accountRepository.getTotalBalance(defaultCurrencyId),
      ])
      setTransactions(txns)
      setSummary({
        income: monthSum.income,
        expenses: monthSum.expenses,
        totalBalance,
        displayCurrencySymbol,
      })
    } catch (error) {
      console.error('Failed to load transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const groupedTransactions = groupByDate(transactions)

  return (
    <div className="flex flex-col h-full">
      <MonthNavigator month={month} onChange={setMonth} />
      <MonthSummary {...summary} />

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
                {txns.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    transaction={tx}
                    onClick={() => navigate(`/transaction/${tx.id}`)}
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
