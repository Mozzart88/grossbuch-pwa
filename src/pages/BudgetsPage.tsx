import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Modal, Input, Select, Spinner, useToast } from '../components/ui'
import { budgetRepository, tagRepository, currencyRepository } from '../services/repositories'
import type { Budget, BudgetInput, Tag, Currency } from '../types'
import { fromIntFrac, toIntFrac } from '../utils/amount'
import { SYSTEM_TAGS } from '../types'
import { useDataRefresh } from '../hooks/useDataRefresh'

export function BudgetsPage() {
  const { showToast } = useToast()
  const dataVersion = useDataRefresh()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [expenseTags, setExpenseTags] = useState<Tag[]>([])
  const [defaultCurrency, setDefaultCurrency] = useState<Currency | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)

  // Form state
  const [tagId, setTagId] = useState<number | ''>('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Current month for filtering
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  useEffect(() => {
    loadData()
  }, [currentMonth, dataVersion])

  const loadData = async () => {
    try {
      const [budgetsData, tags, currency] = await Promise.all([
        budgetRepository.findByMonth(currentMonth),
        tagRepository.findExpenseTags(),
        currencyRepository.findSystem(),
      ])
      setBudgets(budgetsData)
      setExpenseTags(tags.filter((t) => t.id > 10 && t.id !== SYSTEM_TAGS.ARCHIVED))
      setDefaultCurrency(currency)
    } catch (error) {
      console.error('Failed to load budgets:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatBudgetAmount = (value: number): string => {
    const decimal = defaultCurrency?.decimal_places ?? 2
    const symbol = defaultCurrency?.symbol ?? '$'
    return `${symbol}${Math.abs(value).toFixed(decimal)}`
  }

  const parseAmountToIntFrac = (value: string): { int: number; frac: number } => {
    const parsed = parseFloat(value)
    if (isNaN(parsed)) return { int: 0, frac: 0 }
    return toIntFrac(Math.abs(parsed))
  }

  const getMonthLabel = (month: string): string => {
    const [year, m] = month.split('-')
    const date = new Date(parseInt(year), parseInt(m) - 1, 1)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const navigateMonth = (delta: number) => {
    const [year, month] = currentMonth.split('-').map(Number)
    const date = new Date(year, month - 1 + delta, 1)
    setCurrentMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    )
  }

  const openModal = (budget?: Budget) => {
    if (budget) {
      setEditingBudget(budget)
      setTagId(budget.tag_id)
      setAmount(fromIntFrac(budget.amount_int, budget.amount_frac).toString())
    } else {
      setEditingBudget(null)
      setTagId('')
      setAmount('')
    }
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingBudget(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (tagId === '' || !amount.trim()) return

    setSubmitting(true)
    try {
      const [year, month] = currentMonth.split('-').map(Number)
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 1)

      const { int: amount_int, frac: amount_frac } = parseAmountToIntFrac(amount)
      const data: BudgetInput = {
        tag_id: tagId as number,
        amount_int,
        amount_frac,
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

      closeModal()
      loadData()
    } catch (error) {
      console.error('Failed to save budget:', error)
      showToast(error instanceof Error ? error.message : 'Failed to save', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (budget: Budget) => {
    const { canDelete, reason } = await budgetRepository.canDelete(budget.id)

    if (!canDelete) {
      showToast(`Cannot delete: ${reason}`, 'error')
      return
    }

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

  const getProgress = (budget: Budget): number => {
    const budgetAmount = fromIntFrac(budget.amount_int, budget.amount_frac)
    if (budgetAmount === 0) return budget.actual && budget.actual > 0 ? 100 : 0
    if (!budget.actual) return 0
    return Math.min(100, (budget.actual / budgetAmount) * 100)
  }

  const getProgressColor = (percent: number): string => {
    if (percent >= 100) return 'bg-red-500'
    if (percent >= 80) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Budgets"
        showBack
        rightAction={
          <Button size="sm" onClick={() => openModal()}>
            Add
          </Button>
        }
      />

      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => navigateMonth(-1)}
          className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {getMonthLabel(currentMonth)}
        </span>
        <button
          onClick={() => navigateMonth(1)}
          className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {budgets.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="text-gray-400 dark:text-gray-500 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              No budgets for {getMonthLabel(currentMonth)}
            </p>
            <Button size="sm" onClick={() => openModal()}>
              Create Budget
            </Button>
          </Card>
        ) : (
          <div className="mb-4 space-y-4">
            <div
              className="sticky top-0 px-4 py-2 bg-gray-100 dark:bg-gray-900 flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Total Budget
                </span>
              </div>
              <span className={`text-sm font-medium text-gray-400`}>
                {formatBudgetAmount(budgets.reduce((acc, b) => (b.actual ?? 0) + acc, 0.0)) + '/' + formatBudgetAmount(budgets.reduce((acc, b) => fromIntFrac(b.amount_int, b.amount_frac) + acc, 0.0))}
              </span>
            </div>
            {budgets.map((budget) => {
              const progress = getProgress(budget)
              return (
                <Card key={Array.from(budget.id).join('-')} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
                      {budget.tag}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openModal(budget)}
                        className="text-xs text-primary-600 dark:text-primary-400"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(budget)}
                        className="text-xs text-red-600 dark:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2"
                  >
                    <div
                      className={`absolute inset-y-0 left-0 ${getProgressColor(progress)} transition-all duration-300`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-400">
                      {formatBudgetAmount(budget.actual ?? 0)} spent
                    </span>
                    <span className="text-gray-900 dark:text-gray-100 font-medium">
                      {formatBudgetAmount(fromIntFrac(budget.amount_int, budget.amount_frac))} limit
                    </span>
                  </div>

                  {progress >= 100 && (
                    <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                      ⚠️ Over budget by {formatBudgetAmount((budget.actual ?? 0) - fromIntFrac(budget.amount_int, budget.amount_frac))}
                    </div>
                  )}
                </Card>
              )
            })
            }
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editingBudget ? 'Edit Budget' : 'Add Budget'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Category"
            value={tagId.toString()}
            onChange={(e) => setTagId(e.target.value ? parseInt(e.target.value) : '')}
            required
            disabled={!!editingBudget}
            placeholder="Select a category"
            options={expenseTags.map((tag) => ({
              value: tag.id,
              label: tag.name,
            }))}
          />

          <Input
            label={`Amount (${defaultCurrency?.symbol ?? '$'})`}
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="500.00"
            required
          />

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Budget period: {getMonthLabel(currentMonth)}
          </p>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">
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
