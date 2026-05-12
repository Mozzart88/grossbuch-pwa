import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { TransactionForm } from '../components/transactions'
import type { SubmitOptions } from '../components/transactions/transactionFormShared'

type TransactionMode = 'expense' | 'income' | 'transfer' | 'exchange'

export function AddTransactionPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Get initial mode from query parameter (?type=exchange)
  const typeParam = searchParams.get('type')
  const initialMode = (['expense', 'income', 'transfer', 'exchange'].includes(typeParam || '')
    ? typeParam as TransactionMode
    : undefined)

  const handleSubmit = (options?: SubmitOptions) => {
    if (options?.addAnother) return
    navigate(-1)
  }

  const handleCancel = useCallback(() => {
    navigate(-1)
  }, [navigate])

  return (
    <div>
      <PageHeader title="Add Transaction" showBack />
      <div className="p-4 pb-24">
        <TransactionForm
          initialMode={initialMode}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          useActionBar
          showAddAnother
        />
      </div>
    </div>
  )
}
