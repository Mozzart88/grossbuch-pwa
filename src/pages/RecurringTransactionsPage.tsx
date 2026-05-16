import { useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { RecurrenceOptionsFields } from '../components/transactions/RecurrenceOptionsFields'
import { Button, Card, Modal, Spinner, useToast } from '../components/ui'
import { recurringRepository } from '../services/repositories'
import type { RecurringPlan, RecurringSchedule, RecurringUntilPolicy } from '../types'
import { blobToHex } from '../utils/blobUtils'

function describePlan(plan: RecurringPlan): string {
  const every = plan.schedule.interval === 1 ? '' : ` every ${plan.schedule.interval}`
  return `${plan.schedule.frequency}${every}`
}

function todayDate(): string {
  const date = new Date()
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function RecurringTransactionsPage() {
  const { showToast } = useToast()
  const [plans, setPlans] = useState<RecurringPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPlan, setEditingPlan] = useState<RecurringPlan | null>(null)
  const [editSchedule, setEditSchedule] = useState<RecurringSchedule>({ frequency: 'monthly', interval: 1 })
  const [editUntil, setEditUntil] = useState<RecurringUntilPolicy>({ type: 'never' })

  const loadPlans = async () => {
    try {
      setPlans(await recurringRepository.findAll())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPlans()
  }, [])

  const pauseResume = async (plan: RecurringPlan) => {
    if (plan.status === 'paused') {
      await recurringRepository.resume(plan.id)
    } else {
      await recurringRepository.pause(plan.id)
    }
    await loadPlans()
  }

  const deletePlan = async (plan: RecurringPlan) => {
    await recurringRepository.delete(plan.id)
    showToast('Recurring plan deleted', 'success')
    await loadPlans()
  }

  const openEdit = (plan: RecurringPlan) => {
    setEditingPlan(plan)
    setEditSchedule(plan.schedule)
    setEditUntil(plan.until_policy)
  }

  const saveEdit = async () => {
    if (!editingPlan) return
    await recurringRepository.update(editingPlan.id, {
      schedule: editSchedule,
      until_policy: editUntil,
    })
    showToast('Recurring plan updated', 'success')
    setEditingPlan(null)
    await loadPlans()
  }

  return (
    <div>
      <PageHeader title="Recurring Transactions" showBack />
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center p-8"><Spinner /></div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No recurring transactions</p>
        ) : plans.map(plan => (
          <Card key={blobToHex(plan.id)} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {plan.mode.charAt(0).toUpperCase() + plan.mode.slice(1)}
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {describePlan(plan)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Next: {plan.next_due_date ?? 'complete'} · Status: {plan.status}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(plan)}>
                  Edit
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => { void pauseResume(plan) }}>
                  {plan.status === 'paused' ? 'Resume' : 'Pause'}
                </Button>
                <Button type="button" size="sm" variant="danger" onClick={() => { void deletePlan(plan) }}>
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={!!editingPlan} onClose={() => setEditingPlan(null)} title="Edit Recurrence">
        <div className="space-y-4">
          <RecurrenceOptionsFields
            schedule={editSchedule}
            until={editUntil}
            today={editingPlan?.next_due_date ?? todayDate()}
            onScheduleChange={setEditSchedule}
            onUntilChange={setEditUntil}
          />

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditingPlan(null)} className="flex-1">
              Close
            </Button>
            <Button type="button" onClick={() => { void saveEdit() }} className="flex-1">
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
