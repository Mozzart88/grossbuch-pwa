import { useState, useEffect, useRef } from 'react'
import type { Transaction, TransactionLine } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { currencyRepository, transactionRepository } from '../../services/repositories'
import { Button, SelectUI, DateTimeUI, ChevronIcon, AmountInput, Badge } from '../ui'
import { toDateTimeLocal } from '../../utils/dateUtils'
import { fromIntFrac } from '../../utils/amount'
import { useLayoutContextSafe } from '../../store/LayoutContext'
import type { AccountOption, AccountSelectUIOption, SubmitOptions } from './transactionFormShared'
import { getPlaceholder, toAmountIntFrac, toDateString, isDateInPast, toAccountSelectUIOptions } from './transactionFormShared'
import { getRateForDate } from '../../services/exchangeRate/historicalRateService'

interface TransferTransactionFormProps {
  accounts: AccountOption[]
  defaultAccountId: string
  initialData?: Transaction
  createFromInitialData?: boolean
  onSubmit: (options?: SubmitOptions) => void
  onCancel: () => void
  useActionBar?: boolean
  showAddAnother?: boolean
}

const renderAccountOption = (option: AccountSelectUIOption) => (
  <span className="inline-flex items-center">
    <span>{option.label}</span>
    {option.accountTypeLabel && <Badge variant="secondary">{option.accountTypeLabel}</Badge>}
  </span>
)

const renderAccountSelectedBadge = (option: AccountSelectUIOption) =>
  option.accountTypeLabel ? <Badge variant="secondary" className="ml-0">{option.accountTypeLabel}</Badge> : null

export function TransferTransactionForm({
  accounts,
  defaultAccountId,
  initialData,
  createFromInitialData = false,
  onSubmit,
  onCancel,
  useActionBar = false,
  showAddAnother = false,
}: TransferTransactionFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const layoutContext = useLayoutContextSafe()

  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(defaultAccountId)
  const [toAccountId, setToAccountId] = useState('')
  const [fee, setFee] = useState('')
  const [feeTagId, setFeeTagId] = useState('')
  const [note, setNote] = useState('')
  const [datetime, setDateTime] = useState(Date.now())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [addAnother, setAddAnother] = useState(false)
  const isEditing = !!initialData && !createFromInitialData

  // Populate from initial data
  useEffect(() => {
    if (!initialData || !initialData.lines || initialData.lines.length === 0) return
    const lines = initialData.lines as TransactionLine[]
    setDateTime(new Date(initialData.timestamp * 1000).getTime())
    const fromLine = lines.find(l => l.sign === '-')!
    const toLine = lines.find(l => l.sign === '+')!
    const feeLine = lines.find(l => l.tag_id === SYSTEM_TAGS.FEE)
    setAccountId(fromLine.account_id.toString())
    setToAccountId(toLine.account_id.toString())
    setNote(initialData.note || '')
    setAmount(fromIntFrac(fromLine.amount_int, fromLine.amount_frac).toString())
    if (feeLine) {
      setFee(fromIntFrac(feeLine.amount_int, feeLine.amount_frac).toString())
      setFeeTagId(feeLine.tag_id.toString())
    }
  }, [initialData])

  // Action bar setup
  useEffect(() => {
    const setActionBarConfig = layoutContext?.setActionBarConfig
    if (!useActionBar || !setActionBarConfig) return
    setActionBarConfig({
      primaryLabel: isEditing ? 'Update' : 'Submit',
      primaryAction: () => { formRef.current?.requestSubmit() },
      cancelAction: onCancel,
      loading: submitting,
      disabled: submitting,
    })
    return () => { setActionBarConfig(null) }
  }, [useActionBar, layoutContext?.setActionBarConfig, isEditing, onCancel, submitting])

  const selectedAccount = accounts.find(a => a.id.toString() === accountId)
  const decimalPlaces = selectedAccount?.decimalPlaces ?? 2
  const accountOptions = toAccountSelectUIOptions(accounts)
  const toAccountOptions = toAccountSelectUIOptions(accounts
    .filter(a => a.id !== selectedAccount?.id)
    .filter(a => a.currency_id === selectedAccount?.currency_id))

  const resetEntryFields = () => {
    setAmount('')
    setNote('')
    setErrors({})
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!amount || parseFloat(amount) <= 0) {
      newErrors.amount = 'Amount is required and must be positive'
    }
    if (!accountId) {
      newErrors.accountId = 'Account is required'
    }
    if (!toAccountId) {
      newErrors.toAccountId = 'Destination account is required'
    }
    if (fee && parseFloat(fee) < 0) {
      newErrors.fee = 'Fee cannot be negative'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const { int: amountInt, frac: amountFrac } = toAmountIntFrac(amount)
      const feeIntFrac = fee ? toAmountIntFrac(fee) : undefined
      const accountCurrencyId = accounts.find(a => a.id.toString() === accountId)!.currency_id
      const accountRateData = isDateInPast(datetime)
        ? await getRateForDate(accountCurrencyId, toDateString(datetime))
        : await currencyRepository.getRateForCurrency(accountCurrencyId)

      const lines: {
        account_id: number
        tag_id: number
        sign: '+' | '-'
        amount_int: number
        amount_frac: number
        rate_int: number
        rate_frac: number
      }[] = [
          {
            account_id: parseInt(accountId),
            tag_id: SYSTEM_TAGS.TRANSFER,
            sign: '-',
            amount_int: amountInt,
            amount_frac: amountFrac,
            rate_int: accountRateData.int,
            rate_frac: accountRateData.frac,
          },
          {
            account_id: parseInt(toAccountId),
            tag_id: SYSTEM_TAGS.TRANSFER,
            sign: '+',
            amount_int: amountInt,
            amount_frac: amountFrac,
            rate_int: accountRateData.int,
            rate_frac: accountRateData.frac,
          },
        ]

      if (feeIntFrac) {
        lines.push({
          account_id: parseInt(accountId),
          tag_id: feeTagId ? parseInt(feeTagId) : SYSTEM_TAGS.FEE,
          sign: '-',
          amount_int: feeIntFrac.int,
          amount_frac: feeIntFrac.frac,
          rate_int: accountRateData.int,
          rate_frac: accountRateData.frac,
        })
      }

      const payload = {
        timestamp: Math.floor(datetime / 1000),
        note: note || undefined,
        lines,
      }

      if (isEditing && initialData) {
        await transactionRepository.update(initialData.id, payload)
      } else {
        await transactionRepository.create(payload)
      }
      const shouldAddAnother = showAddAnother && addAnother && !isEditing
      onSubmit({ addAnother: shouldAddAnother })
      if (shouldAddAnother) resetEntryFields()
    } catch (error) {
      console.error('Failed to save transaction:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">

      {/* Amount */}
      <AmountInput
        id="amount"
        isPositive
        value={amount}
        onChange={setAmount}
        placeholder={getPlaceholder(decimalPlaces)}
        error={errors.amount}
        className={`w-full px-3 py-3 text-xl font-semibold rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 ${errors.amount ? 'border-red-500' : ''} text-right`}
      />

      {/* From > To account row */}
      <div className="flex justify-between gap-2">
        <div className="grow">
          <SelectUI
            value={accountId}
            onChange={(value) => setAccountId(`${value}`)}
            options={accountOptions}
            renderOption={(option) => renderAccountOption(option as AccountSelectUIOption)}
            renderSelectedBadge={(option) => renderAccountSelectedBadge(option as AccountSelectUIOption)}
            placeholder="From"
            error={errors.accountId}
          />
        </div>
        <div className="grow-0 flex items-center justify-center ">
          <ChevronIcon />
        </div>
        <div
          className="grow"
        >
          <SelectUI
            value={toAccountId}
            onChange={(value) => setToAccountId(`${value}`)}
            options={toAccountOptions}
            renderOption={(option) => renderAccountOption(option as AccountSelectUIOption)}
            renderSelectedBadge={(option) => renderAccountSelectedBadge(option as AccountSelectUIOption)}
            placeholder="To"
            error={errors.toAccountId}
          />
        </div>
      </div>

      {/* Date/Time */}
      <DateTimeUI
        type="datetime-local"
        onChange={e => setDateTime(new Date(e.target.value).getTime())}
        value={toDateTimeLocal(new Date(datetime))}
      />

      {/* Fee */}
      <AmountInput
        id="fee"
        isPositive
        label={`Fee (optional)${selectedAccount ? ` (${selectedAccount.currencySymbol})` : ''}`}
        value={fee}
        onChange={(v) => {
          if (v === '' || v === '0') setFeeTagId('')
          else setFeeTagId(SYSTEM_TAGS.FEE.toString())
          setFee(v)
        }}
        placeholder="0.00"
        error={errors.fee}
        className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 ${errors.fee ? 'border-red-500' : ''}`}
      />

      {/* Notes */}
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

      {/* Actions */}
      {showAddAnother && !isEditing && (
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={addAnother}
            onChange={(e) => setAddAnother(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Add another
        </label>
      )}

      {!useActionBar && (
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="flex-1">
            {submitting ? 'Saving...' : (isEditing ? 'Update' : 'Add')}
          </Button>
        </div>
      )}
    </form>
  )
}
