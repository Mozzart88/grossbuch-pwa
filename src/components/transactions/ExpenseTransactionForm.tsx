import { useState, useEffect, useMemo, useRef } from 'react'
import type { Tag, Counterparty, Transaction, TransactionLine, Currency } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { tagRepository, counterpartyRepository, currencyRepository, walletRepository, transactionRepository } from '../../services/repositories'
import { Button, Select, LiveSearch, DateTimeUI, Modal, Badge, AmountInput } from '../ui'
import type { LiveSearchOption } from '../ui'
import { toDateTimeLocal } from '../../utils/dateUtils'
import { fromIntFrac } from '../../utils/amount'
import { useLayoutContextSafe } from '../../store/LayoutContext'
import type { AccountOption } from './transactionFormShared'
import { getPlaceholder, formatBalance, toAmountIntFrac, toDateString, isDateInPast } from './transactionFormShared'
import { getRateForDate } from '../../services/exchangeRate/historicalRateService'

interface SubEntry {
  id: string
  tagId: string
  newTagName: string
  newTagType: 'expense' | 'income' | 'both'
  amount: string
}

interface CommonEntry {
  tagId: number
  tagName: string
  isIncome: boolean
  amtType: 'pct' | 'abs'
  pct: string
  abs: string
}

interface CurrencyOption extends LiveSearchOption {
  isCrypto?: boolean
}

interface ExpenseTransactionFormProps {
  accounts: AccountOption[]
  currencies: Currency[]
  activeCurrencies: Currency[]
  expenseTags: Tag[]
  commonTags: Tag[]
  counterparties: Counterparty[]
  defaultAccountId: string
  defaultPaymentCurrencyId: number | null
  initialData?: Transaction
  onSubmit: () => void
  onCancel: () => void
  useActionBar?: boolean
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

export function ExpenseTransactionForm({
  accounts,
  currencies,
  activeCurrencies,
  expenseTags,
  commonTags,
  counterparties,
  defaultAccountId,
  defaultPaymentCurrencyId,
  initialData,
  onSubmit,
  onCancel,
  useActionBar = false,
}: ExpenseTransactionFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const layoutContext = useLayoutContextSafe()

  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(defaultAccountId)
  const [paymentCurrencyId, setPaymentCurrencyId] = useState<number | null>(defaultPaymentCurrencyId)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [counterpartyId, setCounterpartyId] = useState('')
  const [counterpartyName, setCounterpartyName] = useState('')

  const [newTagType, setNewTagType] = useState<'expense' | 'income' | 'both'>('expense')
  const [showTagModal, setShowTagModal] = useState(false)
  const [modalTargetEntryId, setModalTargetEntryId] = useState<string>('main')
  const [note, setNote] = useState('')
  const [datetime, setDateTime] = useState(Date.now())
  const [subEntries, setSubEntries] = useState<SubEntry[]>([
    { id: 'sub-1', tagId: '', newTagName: '', newTagType: 'expense', amount: '' },
  ])
  const [activeCommons, setActiveCommons] = useState<CommonEntry[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Populate from initial data
  useEffect(() => {
    if (!initialData || !initialData.lines || initialData.lines.length === 0) return
    const lines = initialData.lines as TransactionLine[]
    setDateTime(new Date(initialData.timestamp * 1000).getTime())
    setNote(initialData.note || '')
    if (initialData.counterparty_id) setCounterpartyId(initialData.counterparty_id.toString())

    if (isMultiCurrencyExpense(lines)) {
      const exchangeOut = lines.find(l => l.tag_id === SYSTEM_TAGS.EXCHANGE && l.sign === '-')!
      const expenseLines = lines.filter(l =>
        l.tag_id !== SYSTEM_TAGS.EXCHANGE &&
        l.tag_id !== SYSTEM_TAGS.TRANSFER &&
        l.sign === '-' &&
        !l.is_common
      )
      const commonLines = lines.filter(l => l.is_common)

      setAccountId(exchangeOut.account_id.toString())
      setPaymentAmount(fromIntFrac(exchangeOut.amount_int, exchangeOut.amount_frac).toString())

      const targetCurrency = currencies.find(c => c.code === expenseLines[0]?.currency)
      if (targetCurrency) setPaymentCurrencyId(targetCurrency.id)

      if (expenseLines.length === 1) {
        setAmount(fromIntFrac(expenseLines[0].amount_int, expenseLines[0].amount_frac).toString())
      }
      setSubEntries(expenseLines.map((l, i) => ({
        id: `sub-${i + 1}`,
        tagId: l.tag_id.toString(),
        newTagName: '',
        newTagType: 'expense' as const,
        amount: fromIntFrac(l.amount_int, l.amount_frac).toString(),
      })))

      if (commonLines.length > 0) {
        const baseAmt = expenseLines.reduce((s, l) => s + fromIntFrac(l.amount_int, l.amount_frac), 0)
        setActiveCommons(commonLines.map(l => {
          const commonAmt = fromIntFrac(l.amount_int, l.amount_frac)
          const computedPct = baseAmt > 0 ? (commonAmt / baseAmt) * 100 : 0
          const pctStr = computedPct > 0 ? String(computedPct.toFixed(2).replace(/\.?0+$/, '')) : ''
          return {
            tagId: l.tag_id,
            tagName: l.tag || '',
            isIncome: l.sign === '+',
            amtType: 'pct' as const,
            pct: pctStr,
            abs: '',
          }
        }))
      }
      return
    }

    // Plain expense
    const plainLines = lines.filter((l: TransactionLine) => !l.is_common)
    const commonLines = lines.filter((l: TransactionLine) => l.is_common)
    const firstPlainLine = plainLines[0] || lines[0]

    setAccountId(firstPlainLine.account_id.toString())
    const acc = accounts.find(a => a.id === firstPlainLine.account_id)
    if (acc) setPaymentCurrencyId(acc.currency_id)

    if (plainLines.length > 0) {
      setSubEntries(plainLines.map((l: TransactionLine, i: number) => ({
        id: `sub-${i + 1}`,
        tagId: l.tag_id.toString(),
        newTagName: '',
        newTagType: 'expense' as const,
        amount: fromIntFrac(l.amount_int, l.amount_frac).toString(),
      })))
      if (plainLines.length === 1) {
        setAmount(fromIntFrac(plainLines[0].amount_int, plainLines[0].amount_frac).toString())
      }
    }

    if (commonLines.length > 0) {
      const baseAmt = plainLines.reduce((s: number, l: TransactionLine) => s + fromIntFrac(l.amount_int, l.amount_frac), 0)
      setActiveCommons(commonLines.map((l: TransactionLine) => {
        const commonAmt = fromIntFrac(l.amount_int, l.amount_frac)
        const computedPct = baseAmt > 0 ? (commonAmt / baseAmt) * 100 : 0
        const pctStr = computedPct > 0 ? String(computedPct.toFixed(2).replace(/\.?0+$/, '')) : ''
        return {
          tagId: l.tag_id,
          tagName: l.tag || '',
          isIncome: l.sign === '+',
          amtType: 'pct' as const,
          pct: pctStr,
          abs: '',
        }
      }))
    }
  }, [initialData, accounts, currencies])

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
  const paymentCurrency = currencies.find(c => c.id === paymentCurrencyId)
  const paymentCurrencyDecimalPlaces = paymentCurrency?.decimal_places ?? 2
  const paymentCurrencyDiffers = paymentCurrencyId != null && paymentCurrencyId !== selectedAccount?.currency_id

  // Multi-tag computed values
  const isExpenseMainEditable = subEntries.length === 1 && activeCommons.every(c => c.amtType === 'pct')
  const expensePlainBase = !isExpenseMainEditable
    ? subEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
    : parseFloat(amount) || 0
  const expensePctExtras = activeCommons
    .filter(c => c.amtType === 'pct')
    .reduce((s, c) => {
      const extra = expensePlainBase * (parseFloat(c.pct) || 0) / 100
      return s + (c.isIncome ? -extra : extra)
    }, 0)
  const expenseAbsExtras = activeCommons
    .filter(c => c.amtType === 'abs')
    .reduce((s, c) => {
      const extra = parseFloat(c.abs) || 0
      return s + (c.isIncome ? -extra : extra)
    }, 0)
  const expenseComputedTotal = expensePlainBase + expenseAbsExtras + expensePctExtras
  const expenseDisplayAmount = !isExpenseMainEditable
    ? expenseComputedTotal.toFixed(selectedAccount?.decimalPlaces ?? 2)
    : amount

  // Currency options for LiveSearch
  const sortedCurrencyOptions = useMemo(() => {
    const usedIds = new Set<number>()
    const result: CurrencyOption[] = []
    const addCurrency = (currency: Currency) => {
      if (usedIds.has(currency.id)) return
      usedIds.add(currency.id)
      result.push({
        value: currency.id,
        label: `${currency.code} - ${currency.name}`,
        isCrypto: currency.is_crypto,
      })
    }
    const defaultPaymentCurrency = currencies.find(c => c.id === paymentCurrencyId)
    if (defaultPaymentCurrency) addCurrency(defaultPaymentCurrency)
    const accountCurrency = currencies.find(c => c.id === selectedAccount?.currency_id)
    if (accountCurrency) addCurrency(accountCurrency)
    activeCurrencies.forEach(addCurrency)
    currencies.filter(c => c.is_fiat).forEach(addCurrency)
    currencies.filter(c => c.is_crypto).forEach(addCurrency)
    currencies.forEach(addCurrency)
    return result
  }, [currencies, activeCurrencies, selectedAccount?.currency_id, paymentCurrencyId])

  // Tags sorted by counterparty affinity
  const sortedTagsOptions = (() => {
    const cId = counterpartyId ? parseInt(counterpartyId) : 0
    const res: { value: number, label: string }[] = []
    if (cId) {
      const cp = counterparties.find(c => c.id === cId)
      expenseTags
        .filter(t => cp?.tag_ids?.includes(t.id))
        .toSorted((a, b) => (b.sort_order || 0) - (a.sort_order || 0))
        .forEach(t => res.push({ value: t.id, label: t.name }))
    }
    expenseTags
      .toSorted((a, b) => (b.sort_order || 0) - (a.sort_order || 0))
      .forEach(t => { if (!res.find(r => r.value === t.id)) res.push({ value: t.id, label: t.name }) })
    return res
  })()

  const sortedCounterpartiesOptions = (() => {
    const tId = subEntries[0]?.tagId ? parseInt(subEntries[0].tagId) : 0
    const res: { value: number, label: string }[] = []
    if (tId) {
      counterparties
        .filter(c => c.tag_ids?.includes(tId))
        .toSorted((a, b) => b.sort_order - a.sort_order)
        .forEach(c => res.push({ value: c.id, label: c.name }))
    }
    counterparties
      .toSorted((a, b) => b.sort_order - a.sort_order)
      .forEach(c => { if (!res.find(r => r.value === c.id)) res.push({ value: c.id, label: c.name }) })
    return res
  })()

  // Sub-entry handlers
  const addSubEntry = () => {
    setSubEntries(prev => [
      ...prev,
      { id: `sub-${Date.now()}`, tagId: '', newTagName: '', newTagType: 'expense', amount: '' },
    ])
  }
  const removeSubEntry = (id: string) => {
    setSubEntries(prev => prev.filter(e => e.id !== id))
  }
  const updateSubEntry = (id: string, updates: Partial<SubEntry>) => {
    setSubEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
  }

  // Common tag handlers
  const toggleCommonTag = (tag: Tag) => {
    setActiveCommons(prev => {
      const exists = prev.find(c => c.tagId === tag.id)
      if (exists) return prev.filter(c => c.tagId !== tag.id)
      return [...prev, {
        tagId: tag.id,
        tagName: tag.name,
        isIncome: tag.id === SYSTEM_TAGS.DISCOUNT,
        amtType: 'pct' as const,
        pct: '',
        abs: '',
      }]
    })
  }
  const toggleCommonAmtType = (tagId: number) => {
    const currentEntry = activeCommons.find(c => c.tagId === tagId)
    if (currentEntry?.amtType === 'pct') {
      const wasSimple = subEntries.length === 1 && activeCommons.every(c => c.amtType === 'pct')
      if (wasSimple && amount) {
        setSubEntries(prev => [{ ...prev[0], amount }])
      }
    }
    setActiveCommons(prev => prev.map(c =>
      c.tagId === tagId ? { ...c, amtType: c.amtType === 'pct' ? 'abs' : 'pct' } : c
    ))
  }
  const updateCommonEntry = (tagId: number, updates: Partial<CommonEntry>) => {
    setActiveCommons(prev => prev.map(c => c.tagId === tagId ? { ...c, ...updates } : c))
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (isExpenseMainEditable) {
      if (!amount || parseFloat(amount) <= 0) {
        newErrors.amount = 'Amount is required and must be positive'
      }
    } else {
      if (expensePlainBase <= 0) {
        newErrors.amount = 'At least one sub-amount is required'
      }
    }
    if (!subEntries.some(e => e.tagId || e.newTagName)) {
      newErrors.tagId = 'Category is required'
    }
    if (!accountId) {
      newErrors.accountId = 'Account is required'
    }
    if (paymentCurrencyDiffers && (!paymentAmount || parseFloat(paymentAmount) <= 0)) {
      newErrors.paymentAmount = 'Amount in account currency is required'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      // Resolve sub-entry tag IDs (create new tags if pending)
      const resolvedSubTagIds: Record<string, number> = {}
      for (const entry of subEntries) {
        if (entry.newTagName && !entry.tagId) {
          const newTag = await tagRepository.create({
            name: entry.newTagName.trim(),
            parent_ids: [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.EXPENSE],
          })
          resolvedSubTagIds[entry.id] = newTag.id
        } else if (entry.tagId) {
          resolvedSubTagIds[entry.id] = parseInt(entry.tagId)
        }
      }

      const accountCurrencyId = accounts.find(a => a.id.toString() === accountId)!.currency_id
      const accountRateData = isDateInPast(datetime)
        ? await getRateForDate(accountCurrencyId, toDateString(datetime))
        : await currencyRepository.getRateForCurrency(accountCurrencyId)
      const primaryTagIdsForCp = Object.values(resolvedSubTagIds).filter(id => id > 0)

      let finalCounterpartyId = counterpartyId ? parseInt(counterpartyId) : 0
      if (counterpartyName && !counterpartyId) {
        finalCounterpartyId = (await counterpartyRepository.create({
          name: counterpartyName,
          tag_ids: primaryTagIdsForCp,
        })).id
      } else if (finalCounterpartyId) {
        const existingTagIds = counterparties.find(c => c.id === finalCounterpartyId)?.tag_ids || []
        await counterpartyRepository.update(finalCounterpartyId, {
          tag_ids: [...new Set([...existingTagIds, ...primaryTagIdsForCp])],
        })
      }

      const lines: {
        account_id: number
        tag_id: number
        sign: '+' | '-'
        amount_int: number
        amount_frac: number
        rate_int: number
        rate_frac: number
        is_common?: boolean
      }[] = []

      if (paymentCurrencyDiffers && paymentCurrencyId) {
        const targetAccount = await walletRepository.findOrCreateAccountForCurrency(
          accounts.find(a => a.id.toString() === accountId)!.wallet_id,
          paymentCurrencyId
        )
        const targetRateData = isDateInPast(datetime)
          ? await getRateForDate(paymentCurrencyId, toDateString(datetime))
          : await currencyRepository.getRateForCurrency(paymentCurrencyId)
        const sourceAmountIF = toAmountIntFrac(paymentAmount)
        const totalPaymentStr = isExpenseMainEditable
          ? amount
          : expenseComputedTotal.toFixed(paymentCurrencyDecimalPlaces)
        const targetTotalAmountIF = toAmountIntFrac(totalPaymentStr)

        lines.push({
          account_id: parseInt(accountId),
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '-',
          amount_int: sourceAmountIF.int,
          amount_frac: sourceAmountIF.frac,
          rate_int: accountRateData.int,
          rate_frac: accountRateData.frac,
        })
        lines.push({
          account_id: targetAccount.id,
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '+',
          amount_int: targetTotalAmountIF.int,
          amount_frac: targetTotalAmountIF.frac,
          rate_int: targetRateData.int,
          rate_frac: targetRateData.frac,
        })
        for (const entry of subEntries) {
          const subTagId = resolvedSubTagIds[entry.id] || 0
          const subAmountStr = isExpenseMainEditable ? amount : entry.amount
          const subAmountIF = toAmountIntFrac(subAmountStr)
          lines.push({
            account_id: targetAccount.id,
            tag_id: subTagId,
            sign: '-',
            amount_int: subAmountIF.int,
            amount_frac: subAmountIF.frac,
            rate_int: targetRateData.int,
            rate_frac: targetRateData.frac,
          })
        }
        const pctBase = isExpenseMainEditable
          ? (parseFloat(amount) || 0)
          : subEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
        for (const common of activeCommons) {
          const commonAmtNum = common.amtType === 'pct'
            ? pctBase * (parseFloat(common.pct) || 0) / 100
            : parseFloat(common.abs) || 0
          const commonIF = toAmountIntFrac(commonAmtNum.toFixed(paymentCurrencyDecimalPlaces))
          lines.push({
            account_id: targetAccount.id,
            tag_id: common.tagId,
            sign: common.isIncome ? '+' : '-',
            amount_int: commonIF.int,
            amount_frac: commonIF.frac,
            rate_int: targetRateData.int,
            rate_frac: targetRateData.frac,
          })
        }
      } else {
        const accId = parseInt(accountId)
        for (const entry of subEntries) {
          const subTagId = resolvedSubTagIds[entry.id] || 0
          const subAmountStr = isExpenseMainEditable ? amount : entry.amount
          const subAmountIF = toAmountIntFrac(subAmountStr)
          lines.push({
            account_id: accId,
            tag_id: subTagId,
            sign: '-',
            amount_int: subAmountIF.int,
            amount_frac: subAmountIF.frac,
            rate_int: accountRateData.int,
            rate_frac: accountRateData.frac,
          })
        }
        const pctBase = isExpenseMainEditable
          ? (parseFloat(amount) || 0)
          : subEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
        for (const common of activeCommons) {
          const commonAmtNum = common.amtType === 'pct'
            ? pctBase * (parseFloat(common.pct) || 0) / 100
            : parseFloat(common.abs) || 0
          const commonIF = toAmountIntFrac(commonAmtNum.toFixed(decimalPlaces))
          lines.push({
            account_id: accId,
            tag_id: common.tagId,
            sign: common.isIncome ? '+' : '-',
            amount_int: commonIF.int,
            amount_frac: commonIF.frac,
            rate_int: accountRateData.int,
            rate_frac: accountRateData.frac,
          })
        }
      }

      const payload = {
        counterparty_id: finalCounterpartyId || undefined,
        counterparty_name: counterpartyName || undefined,
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
      {/* Amount + currency picker */}
      <div className="space-y-1">
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {!isExpenseMainEditable ? 'Total' : 'Amount'}{' '}
          {paymentCurrency ? `(${paymentCurrency.symbol})` : selectedAccount && `(${selectedAccount.currencySymbol})`}
        </label>
        <div className="flex flex-row gap-0">
          <div className="flex-1 min-w-0">
            <AmountInput
              id="amount"
              isPositive
              value={expenseDisplayAmount}
              readOnly={!isExpenseMainEditable}
              onChange={(v) => setAmount(v)}
              placeholder={getPlaceholder(paymentCurrencyDiffers ? paymentCurrencyDecimalPlaces : decimalPlaces)}
              className={`w-full px-3 py-3 text-xl font-semibold rounded-l-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 ${!isExpenseMainEditable ? 'bg-gray-50 dark:bg-gray-900 cursor-default' : ''} ${errors.amount ? 'border-red-500' : ''}`}
            />
          </div>
          <div className="flex-none w-24">
            <LiveSearch
              options={sortedCurrencyOptions}
              value={paymentCurrencyId || selectedAccount?.currency_id || ''}
              onChange={(value) => setPaymentCurrencyId(value ? Number(value) : null)}
              placeholder="CUR"
              getDisplayValue={(opt) => opt.label.split(' - ')[0]}
              inputClassName="py-3 text-xl font-semibold rounded-l-none rounded-r-lg text-center"
              dropdownClassName="min-w-max right-0"
              renderOption={(opt) => (
                <span className="flex items-center gap-2">
                  {opt.label}
                  {(opt as CurrencyOption).isCrypto ? (
                    <Badge variant="secondary">crypto</Badge>
                  ) : ''}
                </span>
              )}
            />
          </div>
        </div>
        {errors.amount && <p className="text-sm text-red-600">{errors.amount}</p>}
      </div>

      {/* Payment Amount (when expense currency differs from account) */}
      {paymentCurrencyDiffers && (
        <div className="space-y-1">
          <AmountInput
            id="paymentAmount"
            isPositive
            label={`Amount from account${selectedAccount?.currencySymbol ? ` (${selectedAccount.currencySymbol})` : ''}`}
            value={paymentAmount}
            onChange={setPaymentAmount}
            placeholder={getPlaceholder(decimalPlaces)}
            error={errors.paymentAmount}
            className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 ${errors.paymentAmount ? 'border-red-500' : ''}`}
          />
          {(() => {
            const displayPaymentTotal = !isExpenseMainEditable
              ? expenseComputedTotal
              : parseFloat(amount) || 0
            return displayPaymentTotal > 0 && parseFloat(paymentAmount) > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Rate: 1 {selectedAccount?.currencyCode} = {(displayPaymentTotal / parseFloat(paymentAmount)).toFixed(4)} {paymentCurrency?.code}
              </p>
            )
          })()}
        </div>
      )}

      {/* Account */}
      <Select
        label="Account"
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        options={accounts.map((a) => ({
          value: a.id,
          label: `${a.walletName} - ${a.currencyCode} (${a.currencySymbol}${formatBalance(a.balance_int, a.balance_frac, a.decimalPlaces)})`,
        }))}
        placeholder="Select account"
        error={errors.accountId}
      />

      {/* Categories (multi-sub-entry) */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {subEntries.length > 1 ? 'Categories' : 'Category'}
        </label>
        {errors.tagId && <p className="text-sm text-red-600">{errors.tagId}</p>}

        {subEntries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <LiveSearch
                value={entry.tagId}
                onChange={(v) => updateSubEntry(entry.id, { tagId: `${v}`, newTagName: '' })}
                options={sortedTagsOptions}
                placeholder="Select category"
                onCreateNew={(name) => {
                  updateSubEntry(entry.id, { newTagName: name, tagId: '' })
                  setModalTargetEntryId(entry.id)
                  setNewTagType('expense')
                  setShowTagModal(true)
                }}
                pendingNewValue={entry.newTagName}
              />
            </div>
            {!isExpenseMainEditable && (
              <AmountInput
                isPositive
                value={entry.amount}
                onChange={(v) => updateSubEntry(entry.id, { amount: v })}
                placeholder={getPlaceholder(decimalPlaces)}
                className="w-28 px-2 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 text-right"
              />
            )}
            {subEntries.length > 1 && (
              <button
                type="button"
                onClick={() => removeSubEntry(entry.id)}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                aria-label="Remove category"
              >
                ×
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addSubEntry}
          className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
        >
          + Add category
        </button>

        {/* Common add-on tags */}
        {commonTags.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Add-ons:</p>
            <div className="flex flex-wrap gap-2">
              {commonTags.map(tag => {
                const isActive = activeCommons.some(c => c.tagId === tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleCommonTag(tag)}
                    className={`px-3 py-1 text-sm rounded-full border transition-colors ${isActive
                      ? 'bg-primary-100 border-primary-400 text-primary-700 dark:bg-primary-900/30 dark:border-primary-600 dark:text-primary-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                  >
                    {isActive ? `${tag.name} ✓` : `+ ${tag.name}`}
                  </button>
                )
              })}
            </div>
            {activeCommons.map(entry => (
              <div key={entry.tagId} className="flex items-center gap-2">
                <span className={`text-sm w-20 shrink-0 ${entry.isIncome ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                  {entry.tagName}:
                </span>
                <button
                  type="button"
                  onClick={() => toggleCommonAmtType(entry.tagId)}
                  title={entry.amtType === 'pct' ? 'Switch to absolute amount' : 'Switch to percentage'}
                  className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-primary-400 transition-colors shrink-0 font-mono"
                >
                  {entry.amtType === 'pct' ? '%' : (paymentCurrencyDiffers ? paymentCurrency?.symbol : selectedAccount?.currencySymbol) || '$'}
                </button>
                <AmountInput
                  isPositive
                  value={entry.amtType === 'pct' ? entry.pct : entry.abs}
                  onChange={(v) => updateCommonEntry(entry.tagId,
                    entry.amtType === 'pct' ? { pct: v } : { abs: v }
                  )}
                  placeholder={entry.amtType === 'pct' ? '15' : getPlaceholder(paymentCurrencyDiffers ? paymentCurrencyDecimalPlaces : decimalPlaces)}
                  className="flex-1 min-w-0 px-2 py-1 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 text-sm"
                />
                {entry.amtType === 'pct' && expensePlainBase > 0 && (parseFloat(entry.pct) || 0) > 0 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    = {paymentCurrencyDiffers ? paymentCurrency?.symbol : selectedAccount?.currencySymbol}{(expensePlainBase * (parseFloat(entry.pct) || 0) / 100).toFixed(paymentCurrencyDiffers ? paymentCurrencyDecimalPlaces : decimalPlaces)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Counterparty */}
      <LiveSearch
        label="Counterparty (optional)"
        options={sortedCounterpartiesOptions}
        value={counterpartyId}
        onChange={(val) => { setCounterpartyId(val.toString()); setCounterpartyName('') }}
        onCreateNew={(name) => { setCounterpartyId(''); setCounterpartyName(name) }}
        placeholder="Search or create..."
        pendingNewValue={counterpartyName}
      />

      {/* Date/Time */}
      <DateTimeUI
        type="datetime-local"
        onChange={e => setDateTime(new Date(e.target.value).getTime())}
        value={toDateTimeLocal(new Date(datetime))}
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

      {/* New Tag Type Modal */}
      <Modal isOpen={showTagModal} onClose={() => setShowTagModal(false)} title="New Category">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Create "{subEntries.find(e => e.id === modalTargetEntryId)?.newTagName}" as:
          </p>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
            <div className="flex gap-2">
              {(['expense', 'income', 'both'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewTagType(t)}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${newTagType === t
                    ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowTagModal(false)
                updateSubEntry(modalTargetEntryId, { newTagName: '', tagId: '' })
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowTagModal(false)
                updateSubEntry(modalTargetEntryId, { newTagType })
              }}
              className="flex-1"
            >
              OK
            </Button>
          </div>
        </div>
      </Modal>
    </form>
  )
}
