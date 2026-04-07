import { useState, useEffect, useRef } from 'react'
import type { Tag, Counterparty, Transaction, TransactionLine } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { tagRepository, counterpartyRepository, currencyRepository, transactionRepository } from '../../services/repositories'
import { Button, Select, LiveSearch, DateTimeUI, Modal, AmountInput } from '../ui'
import { toDateTimeLocal } from '../../utils/dateUtils'
import { fromIntFrac } from '../../utils/amount'
import { useLayoutContextSafe } from '../../store/LayoutContext'
import type { AccountOption } from './transactionFormShared'
import { getPlaceholder, formatBalance, toAmountIntFrac, toDateString, isDateInPast } from './transactionFormShared'
import { getRateForDate } from '../../services/exchangeRate/historicalRateService'

interface IncomeTransactionFormProps {
  accounts: AccountOption[]
  incomeTags: Tag[]
  counterparties: Counterparty[]
  defaultAccountId: string
  initialData?: Transaction
  onSubmit: () => void
  onCancel: () => void
  useActionBar?: boolean
}

export function IncomeTransactionForm({
  accounts,
  incomeTags,
  counterparties,
  defaultAccountId,
  initialData,
  onSubmit,
  onCancel,
  useActionBar = false,
}: IncomeTransactionFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const layoutContext = useLayoutContextSafe()

  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(defaultAccountId)
  const [tagId, setTagId] = useState('')
  const [counterpartyId, setCounterpartyId] = useState('')
  const [counterpartyName, setCounterpartyName] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagType, setNewTagType] = useState<'expense' | 'income' | 'both'>('income')
  const [showTagModal, setShowTagModal] = useState(false)
  const [note, setNote] = useState('')
  const [datetime, setDateTime] = useState(Date.now())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  // Populate from initial data
  useEffect(() => {
    if (!initialData || !initialData.lines || initialData.lines.length === 0) return
    const lines = initialData.lines as TransactionLine[]
    const firstLine = lines[0]
    setDateTime(new Date(initialData.timestamp * 1000).getTime())
    setAccountId(firstLine.account_id.toString())
    setTagId(firstLine.tag_id.toString())
    setNote(initialData.note || '')
    setAmount(fromIntFrac(firstLine.amount_int, firstLine.amount_frac).toString())
    if (initialData.counterparty_id) {
      setCounterpartyId(initialData.counterparty_id.toString())
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

  // Tags sorted by counterparty affinity
  const sortedTagsOptions = (() => {
    const cId = counterpartyId ? parseInt(counterpartyId) : 0
    const res: { value: number, label: string }[] = []
    if (cId) {
      const cp = counterparties.find(c => c.id === cId)
      incomeTags
        .filter(t => cp?.tag_ids?.includes(t.id))
        .toSorted((a, b) => (b.sort_order || 0) - (a.sort_order || 0))
        .forEach(t => res.push({ value: t.id, label: t.name }))
    }
    incomeTags
      .toSorted((a, b) => (b.sort_order || 0) - (a.sort_order || 0))
      .forEach(t => { if (!res.find(r => r.value === t.id)) res.push({ value: t.id, label: t.name }) })
    return res
  })()

  const sortedCounterpartiesOptions = (() => {
    const tId = tagId ? parseInt(tagId) : 0
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

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!amount || parseFloat(amount) <= 0) {
      newErrors.amount = 'Amount is required and must be positive'
    }
    if (!tagId && !newTagName) {
      newErrors.tagId = 'Category is required'
    }
    if (!accountId) {
      newErrors.accountId = 'Account is required'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      let finalTagId = tagId
      if (newTagName && !tagId) {
        const parent_ids: number[] = [SYSTEM_TAGS.DEFAULT]
        if (newTagType === 'expense' || newTagType === 'both') parent_ids.push(SYSTEM_TAGS.EXPENSE)
        if (newTagType === 'income' || newTagType === 'both') parent_ids.push(SYSTEM_TAGS.INCOME)
        const newTag = await tagRepository.create({ name: newTagName.trim(), parent_ids })
        finalTagId = newTag.id.toString()
      }

      const { int: amountInt, frac: amountFrac } = toAmountIntFrac(amount)
      const accountCurrencyId = accounts.find(a => a.id.toString() === accountId)!.currency_id
      const accountRateData = isDateInPast(datetime)
        ? await getRateForDate(accountCurrencyId, toDateString(datetime))
        : await currencyRepository.getRateForCurrency(accountCurrencyId)

      let finalCounterpartyId = counterpartyId ? parseInt(counterpartyId) : 0
      const tagIdNum = parseInt(finalTagId)
      if (counterpartyName && !counterpartyId) {
        finalCounterpartyId = (await counterpartyRepository.create({
          name: counterpartyName,
          tag_ids: [tagIdNum].filter(id => id > 0),
        })).id
      } else if (finalCounterpartyId) {
        const existingTagIds = counterparties.find(c => c.id === finalCounterpartyId)?.tag_ids || []
        await counterpartyRepository.update(finalCounterpartyId, {
          tag_ids: [...new Set([...existingTagIds, ...[tagIdNum].filter(id => id > 0)])],
        })
      }

      const payload = {
        counterparty_id: finalCounterpartyId || undefined,
        counterparty_name: counterpartyName || undefined,
        timestamp: Math.floor(datetime / 1000),
        note: note || undefined,
        lines: [{
          account_id: parseInt(accountId),
          tag_id: parseInt(finalTagId),
          sign: '+' as const,
          amount_int: amountInt,
          amount_frac: amountFrac,
          rate_int: accountRateData.int,
          rate_frac: accountRateData.frac,
        }],
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
      <AmountInput
        id="amount"
        isPositive
        label={`Amount${selectedAccount ? ` (${selectedAccount.currencySymbol})` : ''}`}
        value={amount}
        onChange={setAmount}
        placeholder={getPlaceholder(decimalPlaces)}
        error={errors.amount}
        className={`w-full px-3 py-3 text-xl font-semibold rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 ${errors.amount ? 'border-red-500' : ''}`}
      />

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

      {/* Category */}
      <div className="space-y-1">
        <LiveSearch
          label="Category"
          value={tagId}
          onChange={(v) => { setTagId(`${v}`); setNewTagName('') }}
          options={sortedTagsOptions}
          placeholder="Select category"
          error={errors.tagId}
          onCreateNew={(name) => {
            setNewTagName(name)
            setNewTagType('income')
            setShowTagModal(true)
          }}
          pendingNewValue={newTagName}
        />
        {newTagName && (
          <p className="text-sm text-primary-600 dark:text-primary-400">
            New category: "{newTagName}" ({newTagType})
          </p>
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

      {/* New Tag Type Modal */}
      <Modal isOpen={showTagModal} onClose={() => setShowTagModal(false)} title="New Category">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Create "{newTagName}" as:
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
              onClick={() => { setShowTagModal(false); setNewTagName('') }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => { setShowTagModal(false); setTagId('') }}
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
