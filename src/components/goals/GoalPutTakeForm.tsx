import { useState, useEffect, useMemo, useRef } from 'react'
import { Button, SelectUI, DateTimeUI, AmountInput, useToast } from '../ui'
import { currencyRepository, goalRepository } from '../../services/repositories'
import type { Goal } from '../../types'
import type { AccountOption } from '../transactions/transactionFormShared'
import { getPlaceholder, toAmountIntFrac, toDateString, isDateInPast } from '../transactions/transactionFormShared'
import { getRateForDate } from '../../services/exchangeRate/historicalRateService'
import { toDateTimeLocal } from '../../utils/dateUtils'
import { formatAmount } from '../../utils/formatters'
import { fromIntFrac } from '../../utils/amount'
import { useLayoutContextSafe } from '../../store/LayoutContext'

export type PutTakeMode = 'put' | 'take'

export interface GoalPutTakeInitialData {
  counterpartyAccountId: number
  amount_int: number
  amount_frac: number
  timestamp: number
  note: string
}

interface GoalPutTakeFormProps {
  goal: Goal
  mode: PutTakeMode
  savingsAccounts: AccountOption[]
  onSubmit: () => void
  onCancel: () => void
  // When set, the form edits this existing Put/Take in place instead of
  // creating a new one — mode is locked (see design.md Decision 16 edit scope).
  editingTrxId?: Uint8Array
  initialData?: GoalPutTakeInitialData
  useActionBar?: boolean
}

const formatCounterpartyLabel = (account: AccountOption): string => {
  const balance = formatAmount(account.balance_int, account.balance_frac, account.decimalPlaces)
  return `${account.walletName}:${account.currencyCode} (${balance})`
}

export function GoalPutTakeForm({ goal, mode, savingsAccounts, onSubmit, onCancel, editingTrxId, initialData, useActionBar = false }: GoalPutTakeFormProps) {
  const { showToast } = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const layoutContext = useLayoutContextSafe()
  const goalAccounts = goal.accounts ?? []
  const goalCurrencyIds = new Set(goalAccounts.map(a => a.currency_id))
  const isEditing = !!editingTrxId

  // Put accepts a savings account in any currency (a matching goal account is
  // reused or created); Take only accepts a currency the goal already has an
  // account in — see design.md Decision 10.
  const eligibleCounterparties = mode === 'take'
    ? savingsAccounts.filter(a => goalCurrencyIds.has(a.currency_id))
    : savingsAccounts

  const [counterpartyAccountId, setCounterpartyAccountId] = useState(
    () => initialData ? String(initialData.counterpartyAccountId) : ''
  )
  const [amount, setAmount] = useState(
    () => initialData ? fromIntFrac(initialData.amount_int, initialData.amount_frac).toString() : ''
  )
  const [datetime, setDatetime] = useState(() => initialData ? initialData.timestamp * 1000 : Date.now())
  const [note, setNote] = useState(() => initialData?.note ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [initialSnapshot] = useState<string | null>(() => initialData ? JSON.stringify({
    counterpartyAccountId: String(initialData.counterpartyAccountId),
    amount: fromIntFrac(initialData.amount_int, initialData.amount_frac).toString(),
    datetime: initialData.timestamp * 1000,
    note: initialData.note,
  }) : null)

  const selectedCounterparty = eligibleCounterparties.find(a => a.id.toString() === counterpartyAccountId)
  const matchedGoalAccount = selectedCounterparty
    ? goalAccounts.find(a => a.currency_id === selectedCounterparty.currency_id)
    : undefined
  const decimalPlaces = selectedCounterparty?.decimalPlaces ?? goalAccounts[0]?.decimal_places ?? 2

  const hasChanges = useMemo(() => {
    if (!isEditing) return true
    if (initialSnapshot === null) return false
    return JSON.stringify({ counterpartyAccountId, amount, datetime, note }) !== initialSnapshot
  }, [isEditing, initialSnapshot, counterpartyAccountId, amount, datetime, note])

  useEffect(() => {
    const setActionBarConfig = layoutContext?.setActionBarConfig
    if (!useActionBar || !setActionBarConfig) return
    setActionBarConfig({
      primaryLabel: isEditing ? 'Save' : mode === 'put' ? 'Put' : 'Take',
      primaryAction: () => { formRef.current?.requestSubmit() },
      cancelAction: onCancel,
      loading: submitting,
      disabled: submitting || (isEditing && !hasChanges),
    })
    return () => { setActionBarConfig(null) }
  }, [useActionBar, layoutContext?.setActionBarConfig, isEditing, mode, onCancel, submitting, hasChanges])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!amount || parseFloat(amount) <= 0) newErrors.amount = 'Amount is required and must be positive'
    if (!counterpartyAccountId) newErrors.counterpartyAccountId = 'A savings account is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!validate() || !selectedCounterparty) return

    setSubmitting(true)
    try {
      const { int: amountInt, frac: amountFrac } = toAmountIntFrac(amount)
      const rate = isDateInPast(datetime)
        ? await getRateForDate(selectedCounterparty.currency_id, toDateString(datetime))
        : await currencyRepository.getRateForCurrency(selectedCounterparty.currency_id)

      const payload = {
        goalId: goal.id,
        counterpartyAccountId: selectedCounterparty.id,
        amount_int: amountInt,
        amount_frac: amountFrac,
        rate_int: rate.int,
        rate_frac: rate.frac,
        timestamp: Math.floor(datetime / 1000),
        note: note || undefined,
      }
      if (editingTrxId) {
        await goalRepository.updatePutTake(editingTrxId, payload)
      } else {
        await goalRepository[mode](payload)
      }
      onSubmit()
    } catch (error) {
      console.error(`Failed to ${mode} goal funds:`, error)
      showToast(error instanceof Error ? error.message : `Failed to ${mode === 'put' ? 'put' : 'take'} funds`, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="w-28 shrink-0 space-y-1">
          <label
            htmlFor="amount"
            className={`block text-xs font-medium truncate ${matchedGoalAccount ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}
          >
            {matchedGoalAccount
              ? `Amount (${matchedGoalAccount.symbol ?? matchedGoalAccount.currency}): ${formatAmount(matchedGoalAccount.balance_int, matchedGoalAccount.balance_frac, matchedGoalAccount.decimal_places)}`
              : 'Amount'}
          </label>
          <AmountInput
            id="amount"
            isPositive
            value={amount}
            onChange={setAmount}
            placeholder={getPlaceholder(decimalPlaces)}
            error={errors.amount}
            className="w-full px-3 py-3 text-lg font-semibold rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 text-right"
          />
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0 mt-8">
          {mode === 'put' ? 'from' : 'to'}
        </span>
        <div className="flex-1 min-w-0">
          <SelectUI
            value={counterpartyAccountId}
            onChange={(value) => setCounterpartyAccountId(`${value}`)}
            options={eligibleCounterparties.map(a => ({ value: a.id, label: formatCounterpartyLabel(a) }))}
            placeholder={mode === 'put' ? 'Savings account' : 'Savings account'}
            error={errors.counterpartyAccountId}
          />
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Only savings accounts can be used here.
      </p>

      {selectedCounterparty && mode === 'put' && !matchedGoalAccount && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          A new {selectedCounterparty.currencyCode} account will be added to this goal.
        </p>
      )}

      <DateTimeUI
        type="datetime-local"
        onChange={e => setDatetime(new Date(e.target.value).getTime())}
        value={toDateTimeLocal(new Date(datetime))}
      />

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Notes (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none"
          placeholder="Add notes..."
        />
      </div>

      {!useActionBar && (
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || (isEditing && !hasChanges)} className="flex-1">
            {submitting ? 'Saving...' : isEditing ? 'Save' : mode === 'put' ? 'Put' : 'Take'}
          </Button>
        </div>
      )}
    </form>
  )
}
