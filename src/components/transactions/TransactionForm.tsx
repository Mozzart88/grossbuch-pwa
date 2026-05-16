import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { NotificationTransactionMode, RecurringSchedule, RecurringUntilPolicy, Tag, TagContextOption, Counterparty, Currency, Transaction, TransactionInput, TransactionLine } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { walletRepository, tagRepository, counterpartyRepository, currencyRepository, recurringRepository } from '../../services/repositories'
import type { TransactionMode, AccountOption, SubmitOptions } from './transactionFormShared'
import { IncomeTransactionForm } from './IncomeTransactionForm'
import { ExpenseTransactionForm } from './ExpenseTransactionForm'
import { TransferTransactionForm } from './TransferTransactionForm'
import { ExchangeTransactionForm } from './ExchangeTransactionForm'
import { RecurrenceOptionsFields } from './RecurrenceOptionsFields'
import { Button, Modal, useToast } from '../ui'

interface TransactionFormProps {
  initialData?: Transaction
  initialDraft?: TransactionInput
  initialMode?: TransactionMode
  onSubmit: (options?: SubmitOptions) => void
  onCancel: () => void
  useActionBar?: boolean
  showAddAnother?: boolean
  onRecurrenceActionChange?: (action: ReactNode | null) => void
}

const isMultiCurrencyExpense = (lines: TransactionLine[]): boolean => {
  const exchangeLines = lines.filter(l => l.tag_id === SYSTEM_TAGS.EXCHANGE)
  const expenseLines = lines.filter(l =>
    l.sign === '-' &&
    l.tag_id !== SYSTEM_TAGS.EXCHANGE &&
    l.tag_id !== SYSTEM_TAGS.TRANSFER &&
    l.tag_id !== SYSTEM_TAGS.FEE
  )
  return exchangeLines.length === 2 && expenseLines.length >= 1
}

function draftToTransaction(draft: TransactionInput): Transaction {
  const trxId = new Uint8Array(8)
  return {
    id: trxId,
    timestamp: draft.timestamp ?? Math.floor(Date.now() / 1000),
    counterparty_id: draft.counterparty_id ?? null,
    note: draft.note ?? null,
    lines: draft.lines.map((line, index) => ({
      id: new Uint8Array([index + 1, 0, 0, 0, 0, 0, 0, 0]),
      trx_id: trxId,
      ...line,
    })),
  }
}

export function TransactionForm({ initialData, initialDraft, initialMode, onSubmit, onCancel, useActionBar = false, showAddAnother = false, onRecurrenceActionChange }: TransactionFormProps) {
  const { showToast } = useToast()
  const prefillData = useMemo(
    () => initialData ?? (initialDraft ? draftToTransaction(initialDraft) : undefined),
    [initialData, initialDraft]
  )
  const createFromInitialData = !initialData && !!initialDraft
  const [mode, setMode] = useState<TransactionMode>(initialMode || 'expense')
  const [loading, setLoading] = useState(true)

  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [activeCurrencies, setActiveCurrencies] = useState<Currency[]>([])
  const [incomeTags, setIncomeTags] = useState<Tag[]>([])
  const [expenseTags, setExpenseTags] = useState<Tag[]>([])
  const [incomeTagOptions, setIncomeTagOptions] = useState<TagContextOption[]>([])
  const [expenseTagOptions, setExpenseTagOptions] = useState<TagContextOption[]>([])
  const [commonTags, setCommonTags] = useState<Tag[]>([])
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [defaultAccountId, setDefaultAccountId] = useState('')
  const [defaultPaymentCurrencyId, setDefaultPaymentCurrencyId] = useState<number | null>(null)
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false)
  const [recurrenceModalOpen, setRecurrenceModalOpen] = useState(false)
  const [recurrenceEnabledBeforeOpen, setRecurrenceEnabledBeforeOpen] = useState(false)
  const [recurrenceSaving, setRecurrenceSaving] = useState(false)
  const [pendingRecurring, setPendingRecurring] = useState<{ payload: TransactionInput; mode: NotificationTransactionMode } | null>(null)
  const [schedule, setSchedule] = useState<RecurringSchedule>({ frequency: 'monthly', interval: 1 })
  const [until, setUntil] = useState<RecurringUntilPolicy>({ type: 'never' })
  const [firstAction, setFirstAction] = useState<'plan-only' | 'add-now'>('plan-only')

  // Detect mode from initialData (does not need accounts/currencies)
  useEffect(() => {
    if (!prefillData || !prefillData.lines || prefillData.lines.length === 0) return
    const lines = prefillData.lines as TransactionLine[]
    if (isMultiCurrencyExpense(lines)) {
      setMode('expense')
    } else if (lines.some(l => l.tag_id === SYSTEM_TAGS.TRANSFER)) {
      setMode('transfer')
    } else if (lines.some(l => l.tag_id === SYSTEM_TAGS.EXCHANGE)) {
      setMode('exchange')
    } else if (lines[0].sign === '+') {
      setMode('income')
    } else {
      setMode('expense')
    }
  }, [prefillData])

  const loadData = useCallback(async () => {
    try {
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

      setCurrencies(currencyList)
      setActiveCurrencies(usedCurrencies)
      setIncomeTags(incomeTagList)
      setExpenseTags(expenseTagList)
      setIncomeTagOptions(incomeContextOptions)
      setExpenseTagOptions(expenseContextOptions)
      setCounterparties(cps)
      setCommonTags(commonTagList)

      const accountOptions: AccountOption[] = []
      for (const wallet of wallets) {
        if (wallet.accounts) {
          for (const acc of wallet.accounts) {
            const currency = currencyList.find(c => c.id === acc.currency_id)
            accountOptions.push({
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
      setAccounts(accountOptions)

      // Compute defaults for sub-forms (only when not editing)
      if (!initialData && !initialDraft) {
        if (accountOptions.length > 0) {
          const defaultAcc = accountOptions.find(a => a.walletIsDefault && a.is_default)
            || accountOptions.find(a => a.is_default)
            || accountOptions[0]
          setDefaultAccountId(defaultAcc.id.toString())
        }
        const paymentDefault = currencyList.find(c => c.is_payment_default)
        if (paymentDefault) setDefaultPaymentCurrencyId(paymentDefault.id)
      }
    } catch (error) {
      console.error('Failed to load form data:', error)
    } finally {
      setLoading(false)
    }
  }, [initialData, initialDraft])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const recurrenceAction = useMemo(() => {
    if (initialData) return null

    return (
      <button
        type="button"
        onClick={() => {
          setRecurrenceEnabled(enabled => !enabled)
        }}
        className={`p-2 hover:text-gray-900 dark:hover:text-gray-100 ${recurrenceEnabled
          ? 'text-primary-600 dark:text-primary-400'
          : 'text-gray-400 dark:text-gray-500'
        }`}
        aria-label="Recurring transaction"
        title="Recurring transaction"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.178 8.822c-1.17-1.17-3.066-1.17-4.236 0L12 10.764l-1.942-1.942a2.995 2.995 0 0 0-4.236 0 2.995 2.995 0 0 0 0 4.236 2.995 2.995 0 0 0 4.236 0L12 11.116l1.942 1.942a2.995 2.995 0 0 0 4.236 0 2.995 2.995 0 0 0 0-4.236Z" />
        </svg>
      </button>
    )
  }, [initialData, recurrenceEnabled])

  useEffect(() => {
    onRecurrenceActionChange?.(recurrenceAction)
    return () => onRecurrenceActionChange?.(null)
  }, [onRecurrenceActionChange, recurrenceAction])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div role="status" className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-primary-600" />
      </div>
    )
  }

  const getPayloadDate = (payload: TransactionInput): string => {
    const date = new Date((payload.timestamp ?? Math.floor(Date.now() / 1000)) * 1000)
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
  }

  const today = getPayloadDate({ lines: [] })

  const handleBeforeCreate = async (payload: TransactionInput, submitMode: NotificationTransactionMode): Promise<boolean> => {
    const payloadDate = getPayloadDate(payload)
    if (!recurrenceEnabled && payloadDate <= today) return false
    setPendingRecurring({ payload, mode: submitMode })
    setRecurrenceEnabledBeforeOpen(recurrenceEnabled)
    setRecurrenceEnabled(true)
    setFirstAction(payloadDate === today ? 'plan-only' : 'plan-only')
    setRecurrenceModalOpen(true)
    return true
  }

  const closeRecurrenceModal = () => {
    setPendingRecurring(null)
    setRecurrenceEnabled(recurrenceEnabledBeforeOpen)
    setRecurrenceModalOpen(false)
  }

  const keepRecurrenceSettings = () => {
    setRecurrenceEnabled(true)
    setRecurrenceModalOpen(false)
  }

  const saveRecurringPlan = async () => {
    if (!pendingRecurring) {
      setRecurrenceModalOpen(false)
      return
    }
    setRecurrenceSaving(true)
    try {
      const startDate = getPayloadDate(pendingRecurring.payload)
      await recurringRepository.createPlanFromTransaction(
        {
          schedule,
          transaction_draft: pendingRecurring.payload,
          mode: pendingRecurring.mode,
          start_date: startDate,
          until_policy: until,
        },
        startDate < today ? 'add-past' : startDate === today ? firstAction : 'plan-only'
      )
      showToast('Recurring plan saved', 'success')
      setRecurrenceModalOpen(false)
      setPendingRecurring(null)
      onSubmit()
    } catch (error) {
      console.error('Failed to save recurring plan:', error)
      showToast('Failed to save recurring plan', 'error')
    } finally {
      setRecurrenceSaving(false)
    }
  }

  const sharedProps = { initialData: prefillData, createFromInitialData, onSubmit, onCancel, useActionBar, showAddAnother, onBeforeCreate: handleBeforeCreate }
  const incomeAccounts = initialData ? accounts : accounts.filter(a => (a.account_type ?? 'plain') === 'plain')
  const expenseAccounts = initialData ? accounts : accounts.filter(a => (a.account_type ?? 'plain') !== 'savings')
  const getDefaultFor = (list: AccountOption[]) => {
    const defaultAcc = list.find(a => a.id.toString() === defaultAccountId)
      || list.find(a => a.walletIsDefault && a.is_default)
      || list.find(a => a.is_default)
      || list[0]
    return defaultAcc?.id.toString() ?? ''
  }

  return (
    <div className="space-y-4">
      {/* Transaction Type */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        {(['expense', 'income', 'transfer', 'exchange'] as TransactionMode[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setMode(t)}
            className={`py-2 text-sm font-medium rounded-md transition-colors ${mode === t
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {mode === 'income' && (
        <IncomeTransactionForm
          {...sharedProps}
          accounts={incomeAccounts}
          incomeTags={incomeTags}
          incomeTagOptions={incomeTagOptions}
          counterparties={counterparties}
          defaultAccountId={getDefaultFor(incomeAccounts)}
        />
      )}
      {mode === 'expense' && (
        <ExpenseTransactionForm
          {...sharedProps}
          accounts={expenseAccounts}
          currencies={currencies}
          activeCurrencies={activeCurrencies}
          expenseTags={expenseTags}
          expenseTagOptions={expenseTagOptions}
          commonTags={commonTags}
          counterparties={counterparties}
          defaultAccountId={getDefaultFor(expenseAccounts)}
          defaultPaymentCurrencyId={defaultPaymentCurrencyId}
        />
      )}
      {mode === 'transfer' && (
        <TransferTransactionForm
          {...sharedProps}
          accounts={accounts}
          defaultAccountId={defaultAccountId}
        />
      )}
      {mode === 'exchange' && (
        <ExchangeTransactionForm
          {...sharedProps}
          accounts={accounts}
          defaultAccountId={defaultAccountId}
        />
      )}

      <Modal
        isOpen={recurrenceModalOpen}
        onClose={closeRecurrenceModal}
        title="Recurring Transaction"
      >
        <div className="space-y-4">
          <RecurrenceOptionsFields
            schedule={schedule}
            until={until}
            today={today}
            onScheduleChange={setSchedule}
            onUntilChange={setUntil}
          />

          {pendingRecurring && getPayloadDate(pendingRecurring.payload) === today && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={firstAction === 'add-now'}
                onChange={(event) => setFirstAction(event.target.checked ? 'add-now' : 'plan-only')}
              />
              Add the first transaction now
            </label>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeRecurrenceModal}
              disabled={recurrenceSaving}
              className="flex-1"
            >
              Close
            </Button>
            {!pendingRecurring && (
              <Button type="button" onClick={keepRecurrenceSettings} className="flex-1">
                Save
              </Button>
            )}
            {pendingRecurring && (
              <Button type="button" onClick={saveRecurringPlan} disabled={recurrenceSaving} className="flex-1">
                {recurrenceSaving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
