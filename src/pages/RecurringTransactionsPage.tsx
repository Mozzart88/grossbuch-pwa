import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { RecurrenceOptionsFields } from '../components/transactions/RecurrenceOptionsFields'
import { ExpenseTransactionForm } from '../components/transactions/ExpenseTransactionForm'
import { IncomeTransactionForm } from '../components/transactions/IncomeTransactionForm'
import { draftToTransaction } from '../components/transactions/transactionFormShared'
import { Button, Card, DropdownMenu, Modal, Spinner, useToast } from '../components/ui'
import {
  recurringRepository,
  settingsRepository,
  walletRepository,
  tagRepository,
  counterpartyRepository,
  currencyRepository,
} from '../services/repositories'
import type { RecurringPlanHydration } from '../services/repositories'
import type {
  Counterparty,
  Currency,
  RecurringPlan,
  RecurringSchedule,
  RecurringUntilPolicy,
  Tag,
  TagContextOption,
  TransactionInput,
} from '../types'
import { blobToHex } from '../utils/blobUtils'
import { useLayoutContextSafe } from '../store/LayoutContext'
import type { AccountOption } from '../components/transactions/transactionFormShared'

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
  const layoutContext = useLayoutContextSafe()
  const [plans, setPlans] = useState<RecurringPlan[]>([])
  const [hydrations, setHydrations] = useState<Record<string, RecurringPlanHydration>>({})
  const [loading, setLoading] = useState(true)
  const [defaultNotifyDaysBefore, setDefaultNotifyDaysBefore] = useState(0)

  // Edit repetitions (schedule / end condition / lead time only)
  const [editingRepetitionsPlan, setEditingRepetitionsPlan] = useState<RecurringPlan | null>(null)
  const [editSchedule, setEditSchedule] = useState<RecurringSchedule>({ frequency: 'monthly', interval: 1 })
  const [editUntil, setEditUntil] = useState<RecurringUntilPolicy>({ type: 'never' })
  const [editNotifyDaysBefore, setEditNotifyDaysBefore] = useState<number | null>(null)
  const [savingRepetitions, setSavingRepetitions] = useState(false)

  // Edit transaction (amount / account / category / counterparty only)
  const [editingTransactionPlan, setEditingTransactionPlan] = useState<RecurringPlan | null>(null)
  const [formData, setFormData] = useState<{
    accounts: AccountOption[]
    currencies: Currency[]
    activeCurrencies: Currency[]
    incomeTags: Tag[]
    expenseTags: Tag[]
    incomeTagOptions: TagContextOption[]
    expenseTagOptions: TagContextOption[]
    commonTags: Tag[]
    counterparties: Counterparty[]
  } | null>(null)
  const [transactionDatetime, setTransactionDatetime] = useState(Date.now())

  const loadPlans = useCallback(async () => {
    try {
      const loadedPlans = await recurringRepository.findAll()
      setPlans(loadedPlans)
      const entries = await Promise.all(
        loadedPlans.map(async plan => [blobToHex(plan.id), await recurringRepository.hydrateDraft(plan.transaction_draft)] as const)
      )
      setHydrations(Object.fromEntries(entries))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPlans()
    void settingsRepository.get('recurring_default_notify_days_before').then(value => {
      setDefaultNotifyDaysBefore(Number(value ?? 0) || 0)
    })
  }, [loadPlans])

  useEffect(() => {
    const setPlusButtonConfig = layoutContext?.setPlusButtonConfig
    if (!setPlusButtonConfig) return
    setPlusButtonConfig({ to: '/add?recurring=1' })
    return () => setPlusButtonConfig(null)
  }, [layoutContext?.setPlusButtonConfig])

  const loadFormData = useCallback(async () => {
    const [wallets, incomeTagList, expenseTagList, incomeContextOptions, expenseContextOptions, cps, currencyList, usedCurrencies, commonTagList] = await Promise.all([
      walletRepository.findActive(),
      tagRepository.findIncomeTags(),
      tagRepository.findExpenseTags(),
      tagRepository.getContextOptions?.('income') ?? Promise.resolve([]),
      tagRepository.getContextOptions?.('expense') ?? Promise.resolve([]),
      counterpartyRepository.findAll(),
      currencyRepository.findAll(),
      currencyRepository.findUsedInAccounts(),
      tagRepository.findCommonTags(),
    ])

    const accounts: AccountOption[] = []
    for (const wallet of wallets) {
      if (wallet.accounts) {
        for (const acc of wallet.accounts) {
          const currency = currencyList.find(c => c.id === acc.currency_id)
          accounts.push({
            ...acc,
            walletName: wallet.name,
            walletIsDefault: wallet.is_default ?? false,
            currencyCode: currency?.code ?? '',
            currencySymbol: currency?.symbol ?? '',
            decimalPlaces: currency?.decimal_places ?? 2,
          })
        }
      }
    }

    setFormData({
      accounts,
      currencies: currencyList,
      activeCurrencies: usedCurrencies,
      incomeTags: incomeTagList,
      expenseTags: expenseTagList,
      incomeTagOptions: incomeContextOptions,
      expenseTagOptions: expenseContextOptions,
      commonTags: commonTagList,
      counterparties: cps,
    })
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

  const openEditRepetitions = (plan: RecurringPlan) => {
    setEditingRepetitionsPlan(plan)
    setEditSchedule(plan.schedule)
    setEditUntil(plan.until_policy)
    setEditNotifyDaysBefore(plan.notify_days_before)
  }

  const saveRepetitions = async () => {
    if (!editingRepetitionsPlan) return
    setSavingRepetitions(true)
    try {
      await recurringRepository.update(editingRepetitionsPlan.id, {
        schedule: editSchedule,
        until_policy: editUntil,
        notify_days_before: editNotifyDaysBefore,
      })
      showToast('Recurring plan updated', 'success')
      setEditingRepetitionsPlan(null)
      await loadPlans()
    } finally {
      setSavingRepetitions(false)
    }
  }

  const openEditTransaction = async (plan: RecurringPlan) => {
    if (!formData) await loadFormData()
    setTransactionDatetime(Date.now())
    setEditingTransactionPlan(plan)
  }

  const closeEditTransaction = () => setEditingTransactionPlan(null)

  const handleTransactionSaved = async (payload: TransactionInput, mode: 'expense' | 'income') => {
    if (!editingTransactionPlan) return true
    const paymentPin = await recurringRepository.derivePaymentPin(payload)
    await recurringRepository.update(editingTransactionPlan.id, {
      transaction_draft: payload,
      mode,
      payment_pin: paymentPin,
    })
    showToast('Recurring plan updated', 'success')
    setEditingTransactionPlan(null)
    await loadPlans()
    return true
  }

  const editingTransactionPrefill = editingTransactionPlan
    ? draftToTransaction(editingTransactionPlan.transaction_draft)
    : undefined

  return (
    <div>
      <PageHeader title="Recurring Transactions" showBack />
      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center p-8"><Spinner /></div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No recurring transactions</p>
        ) : plans.map(plan => {
          const hexId = blobToHex(plan.id)
          const hydration = hydrations[hexId]
          const walletCurrency = [hydration?.walletName, hydration?.currencyCode].filter(Boolean).join(':')
          return (
            <Card key={hexId} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {plan.next_due_date ?? 'complete'} · {plan.status}
                  </p>
                  <h2 className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {plan.mode.charAt(0).toUpperCase() + plan.mode.slice(1)}
                    {hydration?.categoryName ? ` · ${hydration.categoryName}` : ''}
                  </h2>
                  {hydration?.counterpartyName && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                      {hydration.counterpartyName}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                    {hydration?.currencySymbol ?? ''}{hydration?.amount.toFixed(hydration?.decimalPlaces ?? 2) ?? '—'}
                    {walletCurrency ? ` from ${walletCurrency}` : ''}
                  </p>
                </div>
                <DropdownMenu
                  items={[
                    { label: 'Edit repetitions', onClick: () => openEditRepetitions(plan) },
                    { label: 'Edit transaction', onClick: () => { void openEditTransaction(plan) } },
                    { label: plan.status === 'paused' ? 'Resume' : 'Pause', onClick: () => { void pauseResume(plan) } },
                    { label: 'Delete', onClick: () => { void deletePlan(plan) }, variant: 'danger' },
                  ]}
                />
              </div>
            </Card>
          )
        })}
      </div>

      <Modal isOpen={!!editingRepetitionsPlan} onClose={() => setEditingRepetitionsPlan(null)} title="Edit Repetitions">
        <div className="space-y-4">
          <RecurrenceOptionsFields
            schedule={editSchedule}
            until={editUntil}
            today={editingRepetitionsPlan?.next_due_date ?? todayDate()}
            onScheduleChange={setEditSchedule}
            onUntilChange={setEditUntil}
            notifyDaysBefore={editNotifyDaysBefore}
            onNotifyDaysBeforeChange={setEditNotifyDaysBefore}
            defaultNotifyDaysBefore={defaultNotifyDaysBefore}
          />

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditingRepetitionsPlan(null)} className="flex-1">
              Close
            </Button>
            <Button type="button" onClick={() => { void saveRepetitions() }} disabled={savingRepetitions} className="flex-1">
              {savingRepetitions ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!editingTransactionPlan} onClose={closeEditTransaction} title="Edit Transaction">
        {!formData ? (
          <div className="flex justify-center p-8"><Spinner /></div>
        ) : editingTransactionPlan?.mode === 'income' ? (
          <IncomeTransactionForm
            accounts={formData.accounts}
            incomeTags={formData.incomeTags}
            incomeTagOptions={formData.incomeTagOptions}
            counterparties={formData.counterparties}
            defaultAccountId={formData.accounts[0]?.id.toString() ?? ''}
            datetime={transactionDatetime}
            onDateTimeChange={setTransactionDatetime}
            initialData={editingTransactionPrefill}
            createFromInitialData
            onSubmit={() => {}}
            onCancel={closeEditTransaction}
            onBeforeCreate={(payload) => handleTransactionSaved(payload, 'income')}
          />
        ) : (
          <ExpenseTransactionForm
            accounts={formData.accounts}
            currencies={formData.currencies}
            activeCurrencies={formData.activeCurrencies}
            expenseTags={formData.expenseTags}
            expenseTagOptions={formData.expenseTagOptions}
            commonTags={formData.commonTags}
            counterparties={formData.counterparties}
            defaultAccountId={formData.accounts[0]?.id.toString() ?? ''}
            defaultPaymentCurrencyId={null}
            datetime={transactionDatetime}
            onDateTimeChange={setTransactionDatetime}
            initialData={editingTransactionPrefill}
            createFromInitialData
            onSubmit={() => {}}
            onCancel={closeEditTransaction}
            onBeforeCreate={(payload) => handleTransactionSaved(payload, 'expense')}
          />
        )}
      </Modal>
    </div>
  )
}
