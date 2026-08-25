import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Card, Modal, Input, AmountInput, Select, useToast, Spinner,
} from '../components/ui'
import { goalRepository, currencyRepository } from '../services/repositories'
import type { Goal, Currency } from '../types'
import { toIntFrac, fromIntFrac } from '../utils/amount'
import { formatCurrency, formatCurrencyValue } from '../utils/formatters'
import { computeSuggestedContribution } from '../utils/goalContribution'
import { useLayoutContextSafe } from '../store/LayoutContext'
import { useDataRefresh } from '../hooks/useDataRefresh'
import { blobToHex } from '../utils/blobUtils'

const GOAL_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#06B6D4', '#84CC16']

interface GoalCardProps {
  goal: Goal
  onOpenDetails: (goal: Goal) => void
}

function GoalCard({ goal, onOpenDetails }: GoalCardProps) {
  const target = fromIntFrac(goal.target_int, goal.target_frac)
  const progress = target > 0 ? Math.min(100, (goal.balance / target) * 100) : 0
  const barColor = progress >= 75 ? 'bg-green-500' : progress >= 50 ? 'bg-yellow-500' : 'bg-orange-500'
  const suggestedContribution = computeSuggestedContribution(target, goal.balance, goal.due_date)

  return (
    <Card
      className="p-4 cursor-pointer"
      data-goal-card
      style={{ borderLeft: goal.color ? `4px solid ${goal.color}` : undefined }}
      onClick={() => onOpenDetails(goal)}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-gray-900 dark:text-gray-100">{goal.name}</p>
      </div>
      <div className="flex items-center justify-between mb-1 text-sm text-gray-700 dark:text-gray-300">
        <span>
          {formatCurrencyValue(goal.balance, goal.symbol, goal.decimal_places)}
          {' / '}
          {formatCurrency(goal.target_int, goal.target_frac, goal.symbol, goal.decimal_places)}
        </span>
        {goal.due_date && (
          <span className="text-xs text-gray-500 dark:text-gray-400">Due {goal.due_date}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all duration-300`} style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">{progress.toFixed(0)}%</span>
      </div>
      {suggestedContribution !== null && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Contribute {formatCurrencyValue(suggestedContribution, goal.symbol, goal.decimal_places)}/mo to hit this by {goal.due_date}
        </p>
      )}
    </Card>
  )
}

export function GoalsPage() {
  const navigate = useNavigate()
  const layoutContext = useLayoutContextSafe()
  const dataVersion = useDataRefresh()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [activeGoals, setActiveGoals] = useState<Goal[]>([])
  const [achievedGoals, setAchievedGoals] = useState<Goal[]>([])
  const [archivedGoals, setArchivedGoals] = useState<Goal[]>([])
  const [showAchieved, setShowAchieved] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [currencies, setCurrencies] = useState<Currency[]>([])

  const [goalModalOpen, setGoalModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(GOAL_COLORS[0])
  const [currencyId, setCurrencyId] = useState('')
  const [initialBalance, setInitialBalance] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [active, achieved, archived, currencyList] = await Promise.all([
        goalRepository.findActive(),
        goalRepository.findAchieved(),
        goalRepository.findArchived(),
        currencyRepository.findAll(),
      ])
      setActiveGoals(active)
      setAchievedGoals(achieved)
      setArchivedGoals(archived)
      setCurrencies(currencyList)
    } catch (error) {
      console.error('Failed to load goals:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData, dataVersion])

  // Derived at render time (not baked into openCreateModal's closure) so the
  // plus-button — wired once via a layout-context callback — can't capture a
  // stale default from before `currencies` finished loading.
  const effectiveCurrencyId = currencyId || (currencies[0] ? String(currencies[0].id) : '')

  const openCreateModal = useCallback(() => {
    setName('')
    setColor(GOAL_COLORS[0])
    setCurrencyId('')
    setInitialBalance('')
    setTargetAmount('')
    setDueDate('')
    setGoalModalOpen(true)
  }, [])

  useEffect(() => {
    const setPlusButtonConfig = layoutContext?.setPlusButtonConfig
    if (!setPlusButtonConfig) return
    setPlusButtonConfig({ onClick: openCreateModal })
    return () => { setPlusButtonConfig(null) }
  }, [layoutContext?.setPlusButtonConfig, openCreateModal])

  const closeGoalModal = () => {
    setGoalModalOpen(false)
  }

  // Creation only — editing an existing goal now lives entirely on
  // GoalDetailsPage's own management kebab (design.md Decision 14).
  const handleGoalSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!targetAmount.trim()) return

    setSubmitting(true)
    try {
      const { int: target_int, frac: target_frac } = toIntFrac(parseFloat(targetAmount))
      if (!name.trim() || !effectiveCurrencyId) {
        throw new Error('Name and currency are required')
      }
      await goalRepository.create({
        name: name.trim(),
        color: color || undefined,
        currency_id: parseInt(effectiveCurrencyId),
        initial_balance: initialBalance.trim() ? parseFloat(initialBalance) : undefined,
        target_int,
        target_frac,
        due_date: dueDate || null,
      })
      showToast('Goal created', 'success')

      closeGoalModal()
      void loadData()
    } catch (error) {
      console.error('Failed to save goal:', error)
      showToast(error instanceof Error ? error.message : 'Failed to save goal', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const openDetails = (goal: Goal) => navigate(`/goals/${blobToHex(goal.id)}`)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {activeGoals.length === 0 && achievedGoals.length === 0 && archivedGoals.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>No goals yet</p>
          <p className="text-sm mt-1">Add your first goal to start tracking progress</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeGoals.map(goal => (
            <GoalCard key={blobToHex(goal.id)} goal={goal} onOpenDetails={openDetails} />
          ))}
        </div>
      )}

      {achievedGoals.length > 0 && (
        <div>
          <button
            type="button"
            className="w-full text-left px-1 py-2 text-sm font-medium text-gray-500 dark:text-gray-400"
            onClick={() => setShowAchieved(v => !v)}
          >
            Achieved ({achievedGoals.length}) {showAchieved ? '▲' : '▼'}
          </button>
          {showAchieved && (
            <div className="space-y-3">
              {achievedGoals.map(goal => (
                <GoalCard key={blobToHex(goal.id)} goal={goal} onOpenDetails={openDetails} />
              ))}
            </div>
          )}
        </div>
      )}

      {archivedGoals.length > 0 && (
        <div>
          <button
            type="button"
            className="w-full text-left px-1 py-2 text-sm font-medium text-gray-500 dark:text-gray-400"
            onClick={() => setShowArchived(v => !v)}
          >
            Archived ({archivedGoals.length}) {showArchived ? '▲' : '▼'}
          </button>
          {showArchived && (
            <div className="space-y-3">
              {archivedGoals.map(goal => (
                <GoalCard key={blobToHex(goal.id)} goal={goal} onOpenDetails={openDetails} />
              ))}
            </div>
          )}
        </div>
      )}

      <Modal isOpen={goalModalOpen} onClose={closeGoalModal} title="Add Goal">
        <form onSubmit={handleGoalSubmit} className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Emergency Fund"
            required
          />

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Color</label>
            <div className="flex flex-wrap gap-2">
              {GOAL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${color === c
                    ? 'border-gray-900 dark:border-white scale-110'
                    : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <Select
            label="Currency"
            value={effectiveCurrencyId}
            onChange={(e) => setCurrencyId(e.target.value)}
            options={currencies.map(c => ({ value: c.id, label: `${c.code} - ${c.name}` }))}
            placeholder="Select currency"
            required
          />
          <AmountInput
            label="Initial Balance"
            isPositive
            placeholder="0.00"
            value={initialBalance}
            onChange={setInitialBalance}
          />

          <AmountInput
            label="Target Amount"
            isPositive
            required
            placeholder="0.00"
            value={targetAmount}
            onChange={setTargetAmount}
          />
          <Input
            label="Due Date (optional)"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeGoalModal} className="flex-1">
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
