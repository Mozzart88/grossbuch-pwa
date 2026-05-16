import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { TransactionForm } from '../components/transactions'
import { Spinner, useToast } from '../components/ui'
import { notificationRepository } from '../services/repositories'
import type { TransactionInput, TransactionNotificationPayload } from '../types'
import type { SubmitOptions } from '../components/transactions/transactionFormShared'

type TransactionMode = 'expense' | 'income' | 'transfer' | 'exchange'

export function AddTransactionPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showToast } = useToast()
  const [notificationDraft, setNotificationDraft] = useState<TransactionInput | undefined>()
  const [notificationMode, setNotificationMode] = useState<TransactionMode | undefined>()
  const [loadingNotification, setLoadingNotification] = useState(false)
  const [recurrenceAction, setRecurrenceAction] = useState<ReactNode | null>(null)

  // Get initial mode from query parameter (?type=exchange)
  const typeParam = searchParams.get('type')
  const notificationId = searchParams.get('notification')
  const initialMode = (['expense', 'income', 'transfer', 'exchange'].includes(typeParam || '')
    ? typeParam as TransactionMode
    : notificationMode)

  useEffect(() => {
    async function loadNotification() {
      if (!notificationId) return
      setLoadingNotification(true)
      try {
        const notification = await notificationRepository.findByHexId(notificationId)
        if (!notification || notification.type !== 'transaction') {
          showToast('Notification not found', 'error')
          return
        }
        const payload = notification.payload as TransactionNotificationPayload
        await notificationRepository.markReaded(notification.id)
        setNotificationMode(payload.mode)
        setNotificationDraft(payload.draft)
      } catch (error) {
        console.error('Failed to load notification draft:', error)
        showToast('Failed to load notification', 'error')
      } finally {
        setLoadingNotification(false)
      }
    }
    void loadNotification()
  }, [notificationId, showToast])

  const handleSubmit = (options?: SubmitOptions) => {
    if (notificationId) {
      void notificationRepository.deleteByHexId(notificationId)
    }
    if (options?.addAnother) return
    navigate(-1)
  }

  const handleCancel = useCallback(() => {
    navigate(-1)
  }, [navigate])

  if (loadingNotification) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Add Transaction" showBack rightAction={recurrenceAction} />
      <div className="p-4 pb-24">
        <TransactionForm
          initialMode={initialMode}
          initialDraft={notificationDraft}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          useActionBar
          showAddAnother
          onRecurrenceActionChange={setRecurrenceAction}
        />
      </div>
    </div>
  )
}
