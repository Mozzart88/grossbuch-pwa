import { useState, useEffect, useRef } from 'react'
import type { Transaction, TransactionLine } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { currencyRepository, transactionRepository } from '../../services/repositories'
import { Button, Select, DateTimeUI, ChevronIcon } from '../ui'
import { toDateTimeLocal } from '../../utils/dateUtils'
import { fromIntFrac } from '../../utils/amount'
import { useLayoutContextSafe } from '../../store/LayoutContext'
import type { AccountOption } from './transactionFormShared'
import { getStep, getPlaceholder, toAmountIntFrac, toDateString, isDateInPast } from './transactionFormShared'
import { getRateForDate } from '../../services/exchangeRate/historicalRateService'

interface TransferTransactionFormProps {
  accounts: AccountOption[]
  defaultAccountId: string
  initialData?: Transaction
  onSubmit: () => void
  onCancel: () => void
  useActionBar?: boolean
}

export function TransferTransactionForm({
  accounts,
  defaultAccountId,
  initialData,
  onSubmit,
  onCancel,
  useActionBar = false,
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
      primaryLabel: initialData ? 'Update' : 'Submit',
      primaryAction: () => { formRef.current?.requestSubmit() },
      cancelAction: onCancel,
      loading: submitting,
      disabled: submitting,
    })
    return () => { setActionBarConfig(null) }
  }, [useActionBar, layoutContext?.setActionBarConfig, initialData, onCancel, submitting])

  const selectedAccount = accounts.find(a => a.id.toString() === accountId)
  const decimalPlaces = selectedAccount?.decimalPlaces ?? 2

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

  const handleSubmit = async (e: React.FormEvent) => {
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

      if (initialData) {
        await transactionRepository.update(initialData.id, payload)
      } else {
        await transactionRepository.create(payload)
      }
      onSubmit()
    } catch (error) {
      console.error('Failed to save transaction:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">

      {/* Amount */}
      <div className="space-y-1">
        <input
          id="amount"
          type="number"
          step={getStep(decimalPlaces)}
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={getPlaceholder(decimalPlaces)}
          className={`w-full px-3 py-3 text-xl font-semibold rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none ${errors.amount ? 'border-red-500' : ''} text-right`}
        />
        {errors.amount && <p className="text-sm text-red-600">{errors.amount}</p>}
      </div>

      {/* From > To account row */}
      <div className="flex justify-between gap-2">
        <div className="grow">
          <Select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={accounts.map((a) => ({
              value: a.id,
              label: `${a.walletName}:${a.currencyCode}`,
            }))}
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
          <Select
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            options={accounts
              .filter(a => a.id !== selectedAccount?.id)
              .filter(a => a.currency_id === selectedAccount?.currency_id)
              .map((a) => ({
                value: a.id,
                label: `${a.walletName}:${a.currencyCode}`,
              }))}
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
      <div className="space-y-1">
        <label htmlFor="fee" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Fee (optional) {selectedAccount && `(${selectedAccount.currencySymbol})`}
        </label>
        <input
          id="fee"
          type="number"
          step={getStep(decimalPlaces)}
          min="0"
          value={fee}
          onChange={(e) => {
            if (e.target.value === '' || e.target.value === '0') setFeeTagId('')
            else setFeeTagId(SYSTEM_TAGS.FEE.toString())
            setFee(e.target.value)
          }}
          placeholder="0.00"
          className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.fee ? 'border-red-500' : ''}`}
        />
        {errors.fee && <p className="text-sm text-red-600">{errors.fee}</p>}
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Notes (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Add notes..."
        />
      </div>

      {/* Actions */}
      {!useActionBar && (
        <div className="flex gap-3 pt-4">
          <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={submitting} className="flex-1">
            {submitting ? 'Saving...' : (initialData ? 'Update' : 'Add')}
          </Button>
        </div>
      )}
    </form>
  )
}
