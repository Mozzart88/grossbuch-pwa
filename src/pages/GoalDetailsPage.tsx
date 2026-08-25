import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Input, AmountInput, Spinner, useToast, DropdownMenu, Badge } from '../components/ui'
import type { DropdownMenuItem } from '../components/ui'
import { goalRepository } from '../services/repositories'
import type { Goal } from '../types'
import { fromIntFrac, toIntFrac } from '../utils/amount'
import { formatCurrency, formatCurrencyValue } from '../utils/formatters'
import { renderGoalNote } from '../components/goals/goalNoteMarkdown'
import { GoalTransactionList } from '../components/goals/GoalTransactionList'
import { hexToBlob, blobToHex } from '../utils/blobUtils'
import { useDataRefresh } from '../hooks/useDataRefresh'
import { useLayoutContextSafe } from '../store/LayoutContext'

const RECENT_TRANSACTIONS_LIMIT = 5

export function GoalDetailsPage() {
  const { goalId: goalIdHex } = useParams<{ goalId: string }>()
  const navigate = useNavigate()
  const dataVersion = useDataRefresh()
  const { showToast } = useToast()
  const layoutContext = useLayoutContextSafe()
  const formRef = useRef<HTMLFormElement>(null)

  const [goal, setGoal] = useState<Goal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null)

  const loadGoal = useCallback(async () => {
    if (!goalIdHex) {
      setError('Goal ID is required')
      setLoading(false)
      return
    }
    try {
      const g = await goalRepository.findById(hexToBlob(goalIdHex))
      if (!g) {
        setError('Goal not found')
        return
      }
      setGoal(g)
    } catch (err) {
      console.error('Failed to load goal:', err)
      setError('Failed to load goal')
    } finally {
      setLoading(false)
    }
  }, [goalIdHex])

  useEffect(() => {
    void loadGoal()
  }, [loadGoal, dataVersion])

  const startEditing = () => {
    if (!goal) return
    const nameValue = goal.name
    const targetAmountValue = fromIntFrac(goal.target_int, goal.target_frac).toString()
    const dueDateValue = goal.due_date ?? ''
    const noteValue = goal.note ?? ''
    setName(nameValue)
    setTargetAmount(targetAmountValue)
    setDueDate(dueDateValue)
    setNote(noteValue)
    setInitialSnapshot(JSON.stringify({
      name: nameValue, targetAmount: targetAmountValue, dueDate: dueDateValue, note: noteValue,
    }))
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
    setInitialSnapshot(null)
  }

  const hasChanges = useMemo(() => {
    if (initialSnapshot === null) return false
    return JSON.stringify({ name, targetAmount, dueDate, note }) !== initialSnapshot
  }, [initialSnapshot, name, targetAmount, dueDate, note])

  const handleSave = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!goal || !name.trim() || !targetAmount.trim()) return

    setSubmitting(true)
    try {
      const { int: target_int, frac: target_frac } = toIntFrac(parseFloat(targetAmount))
      await goalRepository.update(goal.id, {
        name: name.trim(),
        target_int,
        target_frac,
        due_date: dueDate || null,
      })
      await goalRepository.updateNote(goal.id, note)
      showToast('Goal updated', 'success')
      setEditing(false)
      setInitialSnapshot(null)
      await loadGoal()
    } catch (err) {
      console.error('Failed to save goal:', err)
      showToast(err instanceof Error ? err.message : 'Failed to save goal', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAchieve = async () => {
    if (!goal) return
    try {
      await goalRepository.achieve(goal.id)
      showToast('Goal achieved!', 'success')
      void loadGoal()
    } catch (err) {
      console.error('Failed to achieve goal:', err)
      showToast(err instanceof Error ? err.message : 'Failed to achieve goal', 'error')
    }
  }

  const handleUnachieve = async () => {
    if (!goal) return
    try {
      await goalRepository.unachieve(goal.id)
      showToast('Goal moved back to active', 'success')
      void loadGoal()
    } catch (err) {
      console.error('Failed to unachieve goal:', err)
      showToast(err instanceof Error ? err.message : 'Failed to unachieve goal', 'error')
    }
  }

  const handleArchive = async () => {
    if (!goal) return
    try {
      await goalRepository.archive(goal.id)
      showToast('Goal archived', 'success')
      void loadGoal()
    } catch (err) {
      console.error('Failed to archive goal:', err)
      showToast(err instanceof Error ? err.message : 'Failed to archive goal', 'error')
    }
  }

  const handleUnarchive = async () => {
    if (!goal) return
    try {
      await goalRepository.unarchive(goal.id)
      showToast('Goal unarchived', 'success')
      void loadGoal()
    } catch (err) {
      console.error('Failed to unarchive goal:', err)
      showToast(err instanceof Error ? err.message : 'Failed to unarchive goal', 'error')
    }
  }

  const handleDelete = async () => {
    if (!goal) return
    if (!confirm(`Permanently delete "${goal.name}"? This deletes its accounts and every transaction that touched them, including Put/Take entries visible in any savings account's own history. This cannot be undone.`)) return
    try {
      await goalRepository.remove(goal.id)
      showToast('Goal deleted', 'success')
      navigate('/goals')
    } catch (err) {
      console.error('Failed to delete goal:', err)
      showToast(err instanceof Error ? err.message : 'Failed to delete goal', 'error')
    }
  }

  useEffect(() => {
    const setActionBarConfig = layoutContext?.setActionBarConfig
    if (!setActionBarConfig) return
    if (!editing) return
    setActionBarConfig({
      primaryLabel: 'Save',
      primaryAction: () => { formRef.current?.requestSubmit() },
      cancelAction: cancelEditing,
      loading: submitting,
      disabled: submitting || !hasChanges,
    })
    return () => { setActionBarConfig(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, layoutContext?.setActionBarConfig, submitting, hasChanges])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  if (error || !goal) {
    return (
      <div>
        <PageHeader title="Goal" showBack />
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400 p-8">
          <p>{error || 'Goal not found'}</p>
        </div>
      </div>
    )
  }

  const target = fromIntFrac(goal.target_int, goal.target_frac)
  const progress = target > 0 ? Math.min(100, (goal.balance / target) * 100) : 0
  const accountIds = (goal.accounts ?? []).map(a => a.id)
  const hexId = blobToHex(goal.id)

  const kebabItems: DropdownMenuItem[] = [
    { label: 'Edit', onClick: startEditing },
    goal.is_achieved
      ? { label: 'Unachieve', onClick: () => void handleUnachieve() }
      : { label: 'Achieve', onClick: () => void handleAchieve() },
    goal.is_archived
      ? { label: 'Unarchive', onClick: () => void handleUnarchive() }
      : { label: 'Archive', onClick: () => void handleArchive() },
    { label: 'Delete', onClick: () => void handleDelete(), variant: 'danger' },
  ]

  return (
    <div>
      <PageHeader
        title={goal.name}
        showBack
        rightAction={!editing ? <DropdownMenu items={kebabItems} /> : undefined}
      />

      <div className="p-4 space-y-4 pb-24">
        {editing ? (
          <form ref={formRef} onSubmit={handleSave} className="space-y-4">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
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
            <div className="space-y-1">
              <label htmlFor="goal-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Note (optional)</label>
              <textarea
                id="goal-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none"
                placeholder="Bold with **text**, italics with *text*, lists with - item, links autodetect"
              />
            </div>
          </form>
        ) : (
          <>
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
                <span className="text-lg font-semibold">
                  {formatCurrencyValue(goal.balance, goal.symbol, goal.decimal_places)}
                  <span className="text-gray-400 dark:text-gray-500 font-normal"> / {formatCurrency(goal.target_int, goal.target_frac, goal.symbol, goal.decimal_places)}</span>
                </span>
                {goal.due_date && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">Due {goal.due_date}</span>
                )}
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${progress >= 75 ? 'bg-green-500' : progress >= 50 ? 'bg-yellow-500' : 'bg-orange-500'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <Button onClick={() => navigate(`/goals/${hexId}/put-take`)} className="w-full">
                Put / Take
              </Button>
            </Card>

            <Card>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 p-4 pb-2">Accounts</p>
              <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                {(goal.accounts ?? []).map(acc => (
                  <div
                    key={acc.id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/accounts/${acc.id}/transactions`)}
                  >
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {acc.currency}
                      {acc.is_default ? <Badge>Default</Badge> : ''}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {formatCurrency(acc.balance_int, acc.balance_frac, acc.symbol ?? '', acc.decimal_places ?? 2)}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Note</p>
              {goal.note ? renderGoalNote(goal.note) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  No note yet. <button type="button" className="underline" onClick={startEditing}>Add one</button>.
                </p>
              )}
            </Card>

            <Card>
              <div className="p-4 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Recent Activity</p>
                <button
                  type="button"
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                  onClick={() => navigate(`/goals/${hexId}/transactions`)}
                >
                  Show all
                </button>
              </div>
              <GoalTransactionList goalId={hexId} accountIds={accountIds} limit={RECENT_TRANSACTIONS_LIMIT} emptyMessage="No Put/Take activity yet" />
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
