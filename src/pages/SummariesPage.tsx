import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { MonthNavigator } from '../components/transactions/MonthNavigator'
import { MonthSummary } from '../components/transactions/MonthSummary'
import { PageTabs, Card, Spinner } from '../components/ui'
import { transactionRepository, currencyRepository, accountRepository } from '../services/repositories'
import { getCurrentMonth } from '../utils/dateUtils'
import { formatCurrency } from '../utils/formatters'
import type {
  MonthSummary as MonthSummaryType,
  MonthlyTagSummary,
  MonthlyCounterpartySummary,
  MonthlyCategoryBreakdown,
} from '../types'

const TABS = [
  { id: 'tags', label: 'By Tags' },
  { id: 'counterparties', label: 'By Counterparties' },
  { id: 'income-expense', label: 'Income/Expense' },
]

export function SummariesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const monthParam = searchParams.get('month') || getCurrentMonth()
  const tabParam = searchParams.get('tab') || 'tags'

  const [month, setMonth] = useState(monthParam)
  const [activeTab, setActiveTab] = useState(tabParam)
  const [loading, setLoading] = useState(true)
  const [decimalPlaces, setDecimalPlaces] = useState(2)
  const [currencySymbol, setCurrencySymbol] = useState('$')

  const [summary, setSummary] = useState<MonthSummaryType>({
    income: 0,
    expenses: 0,
    totalBalance: 0,
    displayCurrencySymbol: '$',
  })

  const [tagsSummary, setTagsSummary] = useState<MonthlyTagSummary[]>([])
  const [counterpartiesSummary, setCounterpartiesSummary] = useState<MonthlyCounterpartySummary[]>([])
  const [categoryBreakdown, setCategoryBreakdown] = useState<MonthlyCategoryBreakdown[]>([])

  // Update URL when month or tab changes
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('month', month)
    params.set('tab', activeTab)
    setSearchParams(params, { replace: true })
  }, [month, activeTab, setSearchParams])

  // Load data when month changes
  useEffect(() => {
    loadData()
  }, [month])

  const loadData = async () => {
    setLoading(true)
    try {
      const defaultCurrency = await currencyRepository.findDefault()
      const symbol = defaultCurrency?.symbol ?? '$'
      const decimals = defaultCurrency?.decimal_places ?? 2

      setCurrencySymbol(symbol)
      setDecimalPlaces(decimals)

      const [monthSum, totalBalance, tags, counterparties, breakdown] = await Promise.all([
        transactionRepository.getMonthSummary(month),
        accountRepository.getTotalBalance(),
        transactionRepository.getMonthlyTagsSummary(month),
        transactionRepository.getMonthlyCounterpartiesSummary(month),
        transactionRepository.getMonthlyCategoryBreakdown(month),
      ])

      setSummary({
        income: monthSum.income / Math.pow(10, decimals),
        expenses: monthSum.expenses / Math.pow(10, decimals),
        totalBalance: totalBalance / Math.pow(10, decimals),
        displayCurrencySymbol: symbol,
      })

      // Convert amounts from integer to decimal
      setTagsSummary(tags.map(t => ({
        ...t,
        income: t.income / Math.pow(10, decimals),
        expense: t.expense / Math.pow(10, decimals),
        net: t.net / Math.pow(10, decimals),
      })))

      setCounterpartiesSummary(counterparties.map(c => ({
        ...c,
        income: c.income / Math.pow(10, decimals),
        expense: c.expense / Math.pow(10, decimals),
        net: c.net / Math.pow(10, decimals),
      })))

      setCategoryBreakdown(breakdown.map(b => ({
        ...b,
        amount: b.amount / Math.pow(10, decimals),
      })))
    } catch (error) {
      console.error('Failed to load summaries:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth)
  }

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId)
  }

  const incomeCategories = categoryBreakdown.filter(c => c.type === 'income')
  const expenseCategories = categoryBreakdown.filter(c => c.type === 'expense')

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Summaries" showBack />
      <MonthNavigator month={month} onChange={handleMonthChange} />
      <MonthSummary {...summary} decimalPlaces={decimalPlaces} />
      <PageTabs tabs={TABS} activeTab={activeTab} onChange={handleTabChange} />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {activeTab === 'tags' && (
            <>
              {tagsSummary.length === 0 ? (
                <EmptyState message="No transactions this month" />
              ) : (
                tagsSummary.map((tag) => (
                  <SummaryCard
                    key={tag.tag_id}
                    title={tag.tag}
                    income={tag.income}
                    expense={tag.expense}
                    net={tag.net}
                    currencySymbol={currencySymbol}
                    decimalPlaces={decimalPlaces}
                  />
                ))
              )}
            </>
          )}

          {activeTab === 'counterparties' && (
            <>
              {counterpartiesSummary.length === 0 ? (
                <EmptyState message="No transactions this month" />
              ) : (
                counterpartiesSummary.map((cp) => (
                  <SummaryCard
                    key={cp.counterparty_id}
                    title={cp.counterparty}
                    income={cp.income}
                    expense={cp.expense}
                    net={cp.net}
                    currencySymbol={currencySymbol}
                    decimalPlaces={decimalPlaces}
                  />
                ))
              )}
            </>
          )}

          {activeTab === 'income-expense' && (
            <>
              {incomeCategories.length === 0 && expenseCategories.length === 0 ? (
                <EmptyState message="No transactions this month" />
              ) : (
                <>
                  {/* Income Section */}
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">
                      Income ({formatCurrency(summary.income, currencySymbol, decimalPlaces)})
                    </h3>
                    {incomeCategories.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 px-1">No income this month</p>
                    ) : (
                      <div className="space-y-2">
                        {incomeCategories.map((cat) => (
                          <CategoryCard
                            key={`income-${cat.tag_id}`}
                            title={cat.tag}
                            amount={cat.amount}
                            total={summary.income}
                            currencySymbol={currencySymbol}
                            decimalPlaces={decimalPlaces}
                            type="income"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Expense Section */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">
                      Expenses ({formatCurrency(summary.expenses, currencySymbol, decimalPlaces)})
                    </h3>
                    {expenseCategories.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 px-1">No expenses this month</p>
                    ) : (
                      <div className="space-y-2">
                        {expenseCategories.map((cat) => (
                          <CategoryCard
                            key={`expense-${cat.tag_id}`}
                            title={cat.tag}
                            amount={cat.amount}
                            total={summary.expenses}
                            currencySymbol={currencySymbol}
                            decimalPlaces={decimalPlaces}
                            type="expense"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Empty state component
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
      <svg className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  )
}

// Summary card for tags and counterparties
interface SummaryCardProps {
  title: string
  income: number
  expense: number
  net: number
  currencySymbol: string
  decimalPlaces: number
}

function SummaryCard({ title, income, expense, net, currencySymbol, decimalPlaces }: SummaryCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-900 dark:text-gray-100">{title}</h4>
        <span className={`text-sm font-semibold ${net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {formatCurrency(net, currencySymbol, decimalPlaces)}
        </span>
      </div>
      {income > 0 && expense > 0 &&
        < div className="flex gap-4 text-sm">
          <div>
            <span className="text-gray-500 dark:text-gray-400">In: </span>
            <span className="text-green-600 dark:text-green-400">{formatCurrency(income, currencySymbol, decimalPlaces)}</span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Out: </span>
            <span className="text-red-600 dark:text-red-400">{formatCurrency(expense, currencySymbol, decimalPlaces)}</span>
          </div>
        </div>
      }
    </Card >
  )
}

// Category card for income/expense breakdown with progress bar
interface CategoryCardProps {
  title: string
  amount: number
  total: number
  currencySymbol: string
  decimalPlaces: number
  type: 'income' | 'expense'
}

function CategoryCard({ title, amount, total, currencySymbol, decimalPlaces, type }: CategoryCardProps) {
  const percentage = total > 0 ? (amount / total) * 100 : 0
  const barColor = type === 'income' ? 'bg-green-500' : 'bg-red-500'

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
        <span className={`text-sm font-semibold ${type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {formatCurrency(amount, currencySymbol, decimalPlaces)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full`} style={{ width: `${percentage}%` }} />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">
          {percentage.toFixed(0)}%
        </span>
      </div>
    </Card>
  )
}
