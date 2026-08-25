import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Spinner } from '../components/ui'
import { goalRepository } from '../services/repositories'
import type { Goal } from '../types'
import { GoalTransactionList } from '../components/goals/GoalTransactionList'
import { hexToBlob } from '../utils/blobUtils'
import { useLayoutContextSafe } from '../store/LayoutContext'

export function GoalTransactionsPage() {
  const { goalId: goalIdHex } = useParams<{ goalId: string }>()
  const navigate = useNavigate()
  const layoutContext = useLayoutContextSafe()
  const [goal, setGoal] = useState<Goal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  }, [loadGoal])

  useEffect(() => {
    const setPlusButtonConfig = layoutContext?.setPlusButtonConfig
    if (!setPlusButtonConfig || !goalIdHex) return
    setPlusButtonConfig({ onClick: () => navigate(`/goals/${goalIdHex}/put-take`) })
    return () => { setPlusButtonConfig(null) }
  }, [layoutContext?.setPlusButtonConfig, goalIdHex, navigate])

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
        <PageHeader title="Transactions" showBack />
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400 p-8">
          <p>{error || 'Goal not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={`${goal.name} - Transactions`} showBack />
      <div className="flex-1 overflow-auto">
        <GoalTransactionList goalId={goalIdHex ?? ''} accountIds={(goal.accounts ?? []).map(a => a.id)} emptyMessage="No Put/Take activity yet" />
      </div>
    </div>
  )
}
