import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Spinner, useToast } from '../components/ui'
import { goalRepository, walletRepository, currencyRepository, transactionRepository } from '../services/repositories'
import type { Goal, Transaction } from '../types'
import type { AccountOption } from '../components/transactions/transactionFormShared'
import { GoalPutTakeForm } from '../components/goals/GoalPutTakeForm'
import type { PutTakeMode } from '../components/goals/GoalPutTakeForm'
import { hexToBlob } from '../utils/blobUtils'

export function GoalPutTakePage() {
  const { goalId, trxId } = useParams<{ goalId: string; trxId?: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [goal, setGoal] = useState<Goal | null>(null)
  const [savingsAccounts, setSavingsAccounts] = useState<AccountOption[]>([])
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!trxId
  const modeFromParams: PutTakeMode = searchParams.get('mode') === 'take' ? 'take' : 'put'
  const setMode = (next: PutTakeMode) => setSearchParams({ mode: next }, { replace: true })

  const loadData = useCallback(async () => {
    if (!goalId) {
      setError('Goal ID is required')
      setLoading(false)
      return
    }
    try {
      const [g, wallets, currencies] = await Promise.all([
        goalRepository.findById(hexToBlob(goalId)),
        walletRepository.findActive(),
        currencyRepository.findAll(),
      ])
      if (!g) {
        setError('Goal not found')
        return
      }
      setGoal(g)

      const options: AccountOption[] = []
      for (const wallet of wallets) {
        for (const acc of wallet.accounts ?? []) {
          if ((acc.account_type ?? 'plain') !== 'savings') continue
          const currency = currencies.find(c => c.id === acc.currency_id)
          options.push({
            ...acc,
            walletName: wallet.name,
            walletIsDefault: wallet.is_default ?? false,
            currencyCode: currency?.code ?? '',
            currencySymbol: currency?.symbol ?? '',
            decimalPlaces: currency?.decimal_places ?? 2,
          })
        }
      }
      setSavingsAccounts(options)

      if (trxId) {
        const trx = await transactionRepository.findById(hexToBlob(trxId))
        if (!trx) {
          setError('Transaction not found')
          return
        }
        setEditingTransaction(trx)
      }
    } catch (err) {
      console.error('Failed to load Put/Take data:', err)
      setError('Failed to load goal')
    } finally {
      setLoading(false)
    }
  }, [goalId, trxId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleDone = () => navigate(-1)

  const handleDelete = async () => {
    if (!trxId || !confirm('Are you sure you want to delete this entry?')) return
    setDeleting(true)
    try {
      await transactionRepository.delete(hexToBlob(trxId))
      showToast('Entry deleted', 'success')
      navigate(-1)
    } catch (err) {
      console.error('Failed to delete Put/Take:', err)
      showToast(err instanceof Error ? err.message : 'Failed to delete entry', 'error')
    } finally {
      setDeleting(false)
    }
  }

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
        <PageHeader title="Put / Take" showBack />
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400 p-8">
          <p>{error || 'Goal not found'}</p>
        </div>
      </div>
    )
  }

  // Mode is locked once an entry exists — derived from the goal-side leg's
  // sign, never chosen in the edit path (design.md Decision 16 edit scope).
  const goalAccountIds = new Set((goal.accounts ?? []).map(a => a.id))
  const editingGoalLine = editingTransaction?.lines?.find(l => goalAccountIds.has(l.account_id))
  const editingCounterpartyLine = editingTransaction?.lines?.find(l => !goalAccountIds.has(l.account_id))
  const mode: PutTakeMode = isEditing
    ? (editingGoalLine?.sign === '+' ? 'put' : 'take')
    : modeFromParams

  const initialData = isEditing && editingTransaction && editingCounterpartyLine
    ? {
      counterpartyAccountId: editingCounterpartyLine.account_id,
      amount_int: editingGoalLine?.amount_int ?? 0,
      amount_frac: editingGoalLine?.amount_frac ?? 0,
      timestamp: editingTransaction.timestamp,
      note: editingTransaction.note ?? '',
    }
    : undefined

  return (
    <div>
      <PageHeader
        title={goal.name}
        showBack
        rightAction={isEditing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="text-red-600 dark:text-red-400"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        ) : undefined}
      />
      <div className="p-4 pb-24 space-y-4">
        {!isEditing && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
            {(['put', 'take'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`py-2 text-sm font-medium rounded-md transition-colors ${mode === m
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                {m === 'put' ? 'Put' : 'Take'}
              </button>
            ))}
          </div>
        )}

        <GoalPutTakeForm
          goal={goal}
          mode={mode}
          savingsAccounts={savingsAccounts}
          editingTrxId={isEditing ? hexToBlob(trxId!) : undefined}
          initialData={initialData}
          onSubmit={handleDone}
          onCancel={handleDone}
          useActionBar
        />
      </div>
    </div>
  )
}
