import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { MonthNavigator } from '../components/transactions/MonthNavigator'
import { MonthSummary } from '../components/transactions/MonthSummary'
import { PageTabs, Card, Spinner, DropdownMenu, Modal, Input, Select, Button, useToast } from '../components/ui'
import { transactionRepository, currencyRepository, accountRepository, budgetRepository, tagRepository } from '../services/repositories'
import { getCurrentMonth } from '../utils/dateUtils'
import { formatCurrency } from '../utils/formatters'
import type {
  MonthSummary as MonthSummaryType,
  MonthlyTagSummary,
  MonthlyCounterpartySummary,
  MonthlyCategoryBreakdown,
  Budget,
  BudgetInput,
  Tag,
} from '../types'
import { SYSTEM_TAGS } from '../types'

const TABS = [
  { id: 'income-expense', label: 'Income/Expense' },
  { id: 'tags', label: 'By Tags' },
  { id: 'counterparties', label: 'By Counterparties' },
]

export function SummariesPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const monthParam = searchParams.get('month') || getCurrentMonth()
  const tabParam = searchParams.get('tab') || 'income-expense'

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

  // Budget state
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [expenseTags, setExpenseTags] = useState<Tag[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [selectedTagId, setSelectedTagId] = useState<number | ''>('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetPeriod, setBudgetPeriod] = useState(getCurrentMonth()) // defaults to current month
  const [submitting, setSubmitting] = useState(false)

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

      const [monthSum, totalBalance, tags, counterparties, breakdown, monthBudgets, allExpenseTags] = await Promise.all([
        transactionRepository.getMonthSummary(month),
        accountRepository.getTotalBalance(),
        transactionRepository.getMonthlyTagsSummary(month),
        transactionRepository.getMonthlyCounterpartiesSummary(month),
        transactionRepository.getMonthlyCategoryBreakdown(month),
        budgetRepository.findByMonth(month),
        tagRepository.findExpenseTags(),
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

      setBudgets(monthBudgets)
      setExpenseTags(allExpenseTags.filter((t) => t.id > 10 && t.id !== SYSTEM_TAGS.ARCHIVED))
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

  // Navigation handlers for clicking cards
  const handleTagClick = useCallback((tagId: number) => {
    navigate(`/?month=${month}&tag=${tagId}`)
  }, [month, navigate])

  const handleCounterpartyClick = useCallback((counterpartyId: number) => {
    navigate(`/?month=${month}&counterparty=${counterpartyId}`)
  }, [month, navigate])

  const handleCategoryClick = useCallback((type: 'income' | 'expense', tagId?: number) => {
    const uri = `/?month=${month}&type=${type}${tagId === undefined ? '' : `&tag=${tagId}`}`
    navigate(uri)
  }, [month, navigate])

  // Budget helpers
  const getBudgetForTag = useCallback((tagId: number): Budget | undefined => {
    return budgets.find(b => b.tag_id === tagId)
  }, [budgets])

  const generateMonthOptions = (): { value: string; label: string }[] => {
    const options: { value: string; label: string }[] = []
    const now = new Date()
    // Generate current month + 12 months ahead
    for (let i = 0; i <= 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      options.push({ value, label })
    }
    return options
  }

  const parseAmount = (value: string): number => {
    return Math.round(parseFloat(value) * Math.pow(10, decimalPlaces))
  }

  const openBudgetModal = (tagId: number, suggestedAmount: number, existingBudget?: Budget) => {
    setSelectedTagId(tagId)
    if (existingBudget) {
      setEditingBudget(existingBudget)
      setBudgetAmount((existingBudget.amount / Math.pow(10, decimalPlaces)).toString())
      // Convert budget start timestamp to YYYY-MM format
      const budgetDate = new Date(existingBudget.start * 1000)
      setBudgetPeriod(`${budgetDate.getFullYear()}-${String(budgetDate.getMonth() + 1).padStart(2, '0')}`)
    } else {
      setEditingBudget(null)
      setBudgetAmount(suggestedAmount.toFixed(decimalPlaces))
      setBudgetPeriod(getCurrentMonth()) // Always default to current month for new budgets
    }
    setModalOpen(true)
  }

  const closeBudgetModal = () => {
    setModalOpen(false)
    setEditingBudget(null)
    setSelectedTagId('')
    setBudgetAmount('')
    setBudgetPeriod(getCurrentMonth())
  }

  const handleBudgetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedTagId === '' || !budgetAmount.trim()) return

    setSubmitting(true)
    try {
      const [year, mo] = budgetPeriod.split('-').map(Number)
      const startDate = new Date(year, mo - 1, 1)
      const endDate = new Date(year, mo, 1)

      const data: BudgetInput = {
        tag_id: selectedTagId as number,
        amount: parseAmount(budgetAmount),
        start: Math.floor(startDate.getTime() / 1000),
        end: Math.floor(endDate.getTime() / 1000),
      }

      if (editingBudget) {
        await budgetRepository.update(editingBudget.id, data)
        showToast('Budget updated', 'success')
      } else {
        await budgetRepository.create(data)
        showToast('Budget created', 'success')
      }

      closeBudgetModal()
      loadData()
    } catch (error) {
      console.error('Failed to save budget:', error)
      showToast(error instanceof Error ? error.message : 'Failed to save', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleBudgetDelete = async (budget: Budget) => {
    if (!confirm(`Delete budget for "${budget.tag}"? This cannot be undone.`)) return

    try {
      await budgetRepository.delete(budget.id)
      showToast('Budget deleted', 'success')
      loadData()
    } catch (error) {
      console.error('Failed to delete budget:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete', 'error')
    }
  }

  const incomeCategories = categoryBreakdown.filter(c => c.type === 'income')

  // Merge expense categories with budgets - show categories with budgets even if no expenses
  const expenseCategoriesFromBreakdown = categoryBreakdown.filter(c => c.type === 'expense')
  const expenseTagIds = new Set(expenseCategoriesFromBreakdown.map(c => c.tag_id))

  // Add budget categories that have no expenses this month
  const budgetOnlyCategories: MonthlyCategoryBreakdown[] = budgets
    .filter(b => !expenseTagIds.has(b.tag_id))
    .map(b => ({
      tag_id: b.tag_id,
      tag: b.tag || '',
      amount: 0,
      type: 'expense' as const,
    }))

  const expenseCategories = [...expenseCategoriesFromBreakdown, ...budgetOnlyCategories]

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
        <div className="flex-1 overflow-visible p-4 space-y-3">
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
                    onClick={() => handleTagClick(tag.tag_id)}
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
                    onClick={() => handleCounterpartyClick(cp.counterparty_id)}
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
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1"
                      onClick={() => handleCategoryClick('income')}
                    >
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
                            onClick={() => handleCategoryClick('income', cat.tag_id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Expense Section */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1"
                      onClick={() => handleCategoryClick('expense')}
                    >
                      Expenses ({formatCurrency(summary.expenses, currencySymbol, decimalPlaces)}{budgets.length > 0 ? '/' + formatCurrency(budgets.reduce((acc, b) => b.amount + acc, 0.0) / Math.pow(10, decimalPlaces), currencySymbol, decimalPlaces) : ''})
                    </h3>
                    {expenseCategories.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 px-1">No expenses this month</p>
                    ) : (
                      <div className="space-y-2">
                        {expenseCategories.map((cat) => {
                          const budget = getBudgetForTag(cat.tag_id)
                          return (
                            <CategoryCard
                              key={`expense-${cat.tag_id}`}
                              title={cat.tag}
                              amount={cat.amount}
                              total={summary.expenses}
                              currencySymbol={currencySymbol}
                              decimalPlaces={decimalPlaces}
                              type="expense"
                              onClick={() => handleCategoryClick('expense', cat.tag_id)}
                              budget={budget}
                              onSetBudget={() => openBudgetModal(cat.tag_id, cat.amount)}
                              onEditBudget={budget ? () => openBudgetModal(cat.tag_id, cat.amount, budget) : undefined}
                              onDeleteBudget={budget ? () => handleBudgetDelete(budget) : undefined}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Budget Modal */}
      <Modal isOpen={modalOpen} onClose={closeBudgetModal} title={editingBudget ? 'Edit Budget' : 'Set Budget'}>
        <form onSubmit={handleBudgetSubmit} className="space-y-4">
          <Select
            label="Category"
            value={selectedTagId.toString()}
            onChange={(e) => setSelectedTagId(e.target.value ? parseInt(e.target.value) : '')}
            required
            disabled={!!editingBudget || selectedTagId !== ''}
            placeholder="Select a category"
            options={expenseTags.map((tag) => ({
              value: tag.id,
              label: tag.name,
            }))}
          />

          <Input
            label={`Budget Amount (${currencySymbol})`}
            type="number"
            step="0.01"
            min="0"
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(e.target.value)}
            placeholder="500.00"
            required
          />

          <Select
            label="Budget Period"
            value={budgetPeriod}
            onChange={(e) => setBudgetPeriod(e.target.value)}
            required
            options={generateMonthOptions()}
          />

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeBudgetModal} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
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
  onClick: () => void
}

function SummaryCard({ title, income, expense, net, currencySymbol, decimalPlaces, onClick }: SummaryCardProps) {
  const clickableStyles = 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-800 transition-colors'

  return (
    <Card className={`p-4 ${clickableStyles}`} onClick={onClick}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-900 dark:text-gray-100">{title}</h4>
        <span className={`text-sm font-semibold ${net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {formatCurrency(net, currencySymbol, decimalPlaces)}
        </span>
      </div>
      {income > 0 && expense > 0 &&
        <div className="flex gap-4 text-sm">
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
    </Card>
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
  onClick: () => void
  budget?: Budget
  onSetBudget?: () => void
  onEditBudget?: () => void
  onDeleteBudget?: () => void
}

function CategoryCard({ title, amount, total, currencySymbol, decimalPlaces, type, onClick, budget, onSetBudget, onEditBudget, onDeleteBudget }: CategoryCardProps) {
  const clickableStyles = 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 active:bg-gray-100 dark:active:bg-gray-800 transition-colors'

  // Calculate progress based on whether we have a budget
  const hasBudget = budget && budget.amount > 0
  const budgetAmountDecimal = hasBudget ? budget.amount / Math.pow(10, decimalPlaces) : 0
  const budgetActualDecimal = hasBudget ? (budget.actual ?? 0) / Math.pow(10, decimalPlaces) : 0

  // Progress calculation
  let progress: number
  let barColor: string

  if (hasBudget) {
    // budgetAmountDecimal is guaranteed > 0 since hasBudget requires budget.amount > 0
    progress = Math.min(100, (budgetActualDecimal / budgetAmountDecimal) * 100)
    // Budget colors: green < 80%, yellow 80-100%, red > 100%
    if (progress >= 100) {
      barColor = 'bg-red-500'
    } else if (progress >= 80) {
      barColor = 'bg-yellow-500'
    } else {
      barColor = 'bg-green-500'
    }
  } else {
    // Default percentage of total behavior
    progress = total > 0 ? (amount / total) * 100 : 0
    barColor = type === 'income' ? 'bg-green-500' : 'bg-red-500'
  }

  // Build dropdown menu items for expense cards
  const dropdownItems = []
  if (type === 'expense') {
    if (budget) {
      if (onEditBudget) {
        dropdownItems.push({ label: 'Edit budget', onClick: onEditBudget })
      }
      if (onDeleteBudget) {
        dropdownItems.push({ label: 'Delete budget', onClick: onDeleteBudget, variant: 'danger' as const })
      }
    } else if (onSetBudget) {
      dropdownItems.push({ label: 'Set budget', onClick: onSetBudget })
    }
  }

  return (
    <Card className={`p-3 ${clickableStyles}`} onClick={onClick}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {hasBudget
              ? `${formatCurrency(budgetActualDecimal, currencySymbol, decimalPlaces)}/${formatCurrency(budgetAmountDecimal, currencySymbol, decimalPlaces)}`
              : formatCurrency(amount, currencySymbol, decimalPlaces)
            }
          </span>
          {dropdownItems.length > 0 && (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu items={dropdownItems} />
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all duration-300`} style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">
          {progress.toFixed(0)}%
        </span>
      </div>
    </Card>
  )
}
