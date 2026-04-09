import { useState, useEffect, useRef } from 'react'
import type { Transaction, TransactionLine } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { currencyRepository, transactionRepository } from '../../services/repositories'
import { Button, Select, DateTimeUI, ChevronIcon, AmountInput } from '../ui'
import { toDateTimeLocal } from '../../utils/dateUtils'
import { fromIntFrac, toIntFrac } from '../../utils/amount'
import { useLayoutContextSafe } from '../../store/LayoutContext'
import type { AccountOption } from './transactionFormShared'
import { getPlaceholder, toAmountIntFrac, toDateString, isDateInPast } from './transactionFormShared'
import { getRateForDate } from '../../services/exchangeRate/historicalRateService'

interface ExchangeTransactionFormProps {
  accounts: AccountOption[]
  defaultAccountId: string
  initialData?: Transaction
  onSubmit: () => void
  onCancel: () => void
  useActionBar?: boolean
}

export function ExchangeTransactionForm({
  accounts,
  defaultAccountId,
  initialData,
  onSubmit,
  onCancel,
  useActionBar = false,
}: ExchangeTransactionFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const layoutContext = useLayoutContextSafe()

  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(defaultAccountId)
  const [toAccountId, setToAccountId] = useState('')
  const [toAmount, setToAmount] = useState('')
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
    const fromAmt = fromIntFrac(fromLine.amount_int, fromLine.amount_frac)
    const toAmt = fromIntFrac(toLine.amount_int, toLine.amount_frac)
    setAmount(fromAmt.toString())
    setToAmount(toAmt.toString())
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
  const selectedToAccount = accounts.find(a => a.id.toString() === toAccountId)
  const decimalPlaces = selectedAccount?.decimalPlaces ?? 2
  const toDecimalPlaces = selectedToAccount?.decimalPlaces ?? 2

  const effectiveRate =
    amount && toAmount && parseFloat(amount) > 0 && parseFloat(toAmount) > 0
      ? (parseFloat(toAmount) / parseFloat(amount)).toFixed(6)
      : null
  const fromCurrencyCode = selectedAccount?.currencyCode ?? ''
  const toCurrencyCode = selectedToAccount?.currencyCode ?? ''

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
    if (!toAmount || parseFloat(toAmount) <= 0) {
      newErrors.toAmount = 'Destination amount is required'
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
      const toAmountIF = toAmountIntFrac(toAmount)
      const feeIntFrac = fee ? toAmountIntFrac(fee) : undefined

      const fromDisplay = parseFloat(amount) || 0
      const toDisplay = parseFloat(toAmount) || 0

      const fromCurrency = accounts.find(a => a.id.toString() === accountId)
      const toCurrency = accounts.find(a => a.id.toString() === toAccountId)

      let fromRateIF = { int: 1, frac: 0 }
      let toRateIF = { int: 1, frac: 0 }

      if (fromCurrency && toCurrency && fromDisplay > 0 && toDisplay > 0) {
        const txDateStr = toDateString(datetime)
        const isPast = isDateInPast(datetime)
        fromRateIF = isPast
          ? await getRateForDate(fromCurrency.currency_id, txDateStr)
          : await currencyRepository.getRateForCurrency(fromCurrency.currency_id)
        toRateIF = isPast
          ? await getRateForDate(toCurrency.currency_id, txDateStr)
          : await currencyRepository.getRateForCurrency(toCurrency.currency_id)

        const defaultCurrency = await currencyRepository.findSystem()
        if (defaultCurrency) {
          if (fromCurrency.currency_id === defaultCurrency.id) {
            const rateValue = toDisplay / fromDisplay
            toRateIF = toIntFrac(rateValue)
            await currencyRepository.setExchangeRate(toCurrency.currency_id, toRateIF.int, toRateIF.frac, txDateStr)
          } else if (toCurrency.currency_id === defaultCurrency.id) {
            const rateValue = fromDisplay / toDisplay
            fromRateIF = toIntFrac(rateValue)
            await currencyRepository.setExchangeRate(fromCurrency.currency_id, fromRateIF.int, fromRateIF.frac, txDateStr)
          }
        }
      }

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
            tag_id: SYSTEM_TAGS.EXCHANGE,
            sign: '-',
            amount_int: amountInt,
            amount_frac: amountFrac,
            rate_int: fromRateIF.int,
            rate_frac: fromRateIF.frac,
          },
          {
            account_id: parseInt(toAccountId),
            tag_id: SYSTEM_TAGS.EXCHANGE,
            sign: '+',
            amount_int: toAmountIF.int,
            amount_frac: toAmountIF.frac,
            rate_int: toRateIF.int,
            rate_frac: toRateIF.frac,
          },
        ]

      if (feeIntFrac) {
        lines.push({
          account_id: parseInt(accountId),
          tag_id: feeTagId ? parseInt(feeTagId) : SYSTEM_TAGS.FEE,
          sign: '-',
          amount_int: feeIntFrac.int,
          amount_frac: feeIntFrac.frac,
          rate_int: fromRateIF.int,
          rate_frac: fromRateIF.frac,
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

      {/* Row 1: from amount + from account */}
      <div className="grid grid-cols-2 gap-0 mb-2">
        <Select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={accounts.map((a) => ({
            value: a.id,
            label: `${a.walletName}:${a.currencyCode}`,
          }))}
          placeholder="Account"
          error={errors.accountId}
          className={`rounded-r-none py-3 font-semibold border-r-0`}
        />
        <AmountInput
          id="amount"
          isPositive
          value={amount}
          onChange={setAmount}
          placeholder={getPlaceholder(decimalPlaces)}
          error={errors.amount}
          className={`w-full px-3 py-3 font-semibold rounded-r-lg border border-l-0 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 ${errors.amount ? 'border-red-500' : ''} text-right`}
        />
      </div>

      <div
        className="flex justify-center mb-2"
      ><ChevronIcon rotate={90} /></div>

      {/* Row 2: to amount + to account */}
      <div className="grid grid-cols-2 gap-0">
        <Select
          value={toAccountId}
          onChange={(e) => setToAccountId(e.target.value)}
          options={accounts
            .filter(a => a.id !== selectedAccount?.id)
            .filter(a => a.currency_id !== selectedAccount?.currency_id)
            .map((a) => ({
              value: a.id,
              label: `${a.walletName}:${a.currencyCode}`,
            }))}
          placeholder="Account"
          error={errors.toAccountId}
          className={`rounded-r-none py-3 font-semibold border-r-0`}
        />
        <AmountInput
          id="toAmount"
          isPositive
          value={toAmount}
          onChange={setToAmount}
          placeholder={getPlaceholder(toDecimalPlaces)}
          error={errors.toAmount}
          className={`w-full px-3 py-3 font-semibold rounded-r-lg border border-l-0 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 ${errors.toAmount ? 'border-red-500' : ''} text-right`}
        />
      </div>

      {/* Effective rate */}
      {effectiveRate && (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Rate: 1 {fromCurrencyCode} = {effectiveRate} {toCurrencyCode}
        </p>
      )}

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
        onChange={(v: string) => {
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
