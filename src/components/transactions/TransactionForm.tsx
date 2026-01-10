import { useState, useEffect } from 'react'
import type { Transaction, TransactionInput, TransactionType, Account, Category, Counterparty } from '../../types'
import { accountRepository, categoryRepository, counterpartyRepository } from '../../services/repositories'
import { Button, Input, Select } from '../ui'
import { toDateTimeLocal, fromDateTimeLocal } from '../../utils/dateUtils'

interface TransactionFormProps {
  transaction?: Transaction
  onSubmit: (data: TransactionInput) => Promise<void>
  onCancel: () => void
}

export function TransactionForm({ transaction, onSubmit, onCancel }: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>(transaction?.type || 'expense')
  const [amount, setAmount] = useState(transaction?.amount?.toString() || '')
  const [accountId, setAccountId] = useState(transaction?.account_id?.toString() || '')
  const [categoryId, setCategoryId] = useState(transaction?.category_id?.toString() || '')
  const [counterpartyId, setCounterpartyId] = useState(transaction?.counterparty_id?.toString() || '')
  const [toAccountId, setToAccountId] = useState(transaction?.to_account_id?.toString() || '')
  const [toAmount, setToAmount] = useState(transaction?.to_amount?.toString() || '')
  const [exchangeRate, setExchangeRate] = useState(transaction?.exchange_rate?.toString() || '')
  const [dateTime, setDateTime] = useState(toDateTimeLocal(transaction?.date_time || new Date()))
  const [notes, setNotes] = useState(transaction?.notes || '')
  const [exchangeMode, setExchangeMode] = useState<'amounts' | 'rate'>('amounts')

  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [accs, cats, cps] = await Promise.all([
        accountRepository.findAll(),
        categoryRepository.findAll(),
        counterpartyRepository.findAll(),
      ])
      setAccounts(accs)
      setCategories(cats)
      setCounterparties(cps)

      // Set default account if not editing
      if (!transaction && accs.length > 0) {
        setAccountId(accs[0].id.toString())
      }
    } catch (error) {
      console.error('Failed to load form data:', error)
    } finally {
      setLoading(false)
    }
  }

  const selectedAccount = accounts.find((a) => a.id.toString() === accountId)
  const selectedToAccount = accounts.find((a) => a.id.toString() === toAccountId)
  const currencyId = selectedAccount?.currency_id
  const toCurrencyId = selectedToAccount?.currency_id

  // Get decimal places for amount inputs
  const decimalPlaces = selectedAccount?.currency_decimal_places ?? 2
  const toDecimalPlaces = selectedToAccount?.currency_decimal_places ?? 2

  // Calculate step and placeholder based on decimal places
  const getStep = (decimals: number) => (1 / Math.pow(10, decimals)).toFixed(decimals)
  const getPlaceholder = (decimals: number) => '0.' + '0'.repeat(decimals)

  // Format balance for display
  const formatBalance = (balance: number | undefined, decimals: number) => {
    return (balance ?? 0).toFixed(decimals)
  }

  // Filter categories by transaction type
  const filteredCategories = categories.filter((c) => {
    if (type === 'income') return c.type === 'income' || c.type === 'both'
    if (type === 'expense') return c.type === 'expense' || c.type === 'both'
    return false
  })

  // Filter counterparties by selected category
  const filteredCounterparties = categoryId
    ? counterparties.filter((cp) => !cp.category_ids?.length || cp.category_ids.includes(parseInt(categoryId)))
    : counterparties

  // Handle exchange rate calculation
  useEffect(() => {
    if (type === 'exchange' && exchangeMode === 'rate' && amount && exchangeRate) {
      const calculated = parseFloat(amount) * parseFloat(exchangeRate)
      setToAmount(calculated.toFixed(toDecimalPlaces))
    }
  }, [amount, exchangeRate, exchangeMode, type, toDecimalPlaces])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!amount || parseFloat(amount) <= 0) {
      newErrors.amount = 'Amount is required and must be positive'
    }
    if (!accountId) {
      newErrors.accountId = 'Account is required'
    }
    if ((type === 'income' || type === 'expense') && !categoryId) {
      newErrors.categoryId = 'Category is required'
    }
    if ((type === 'transfer' || type === 'exchange') && !toAccountId) {
      newErrors.toAccountId = 'Destination account is required'
    }
    if (type === 'transfer' && accountId === toAccountId) {
      newErrors.toAccountId = 'Cannot transfer to the same account'
    }
    if (type === 'exchange') {
      if (!toAmount || parseFloat(toAmount) <= 0) {
        newErrors.toAmount = 'Destination amount is required'
      }
      if (currencyId === toCurrencyId) {
        newErrors.toAccountId = 'Exchange requires different currencies'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      const data: TransactionInput = {
        type,
        amount: parseFloat(amount),
        currency_id: currencyId!,
        account_id: parseInt(accountId),
        date_time: fromDateTimeLocal(dateTime),
        notes: notes || undefined,
      }

      if (type === 'income' || type === 'expense') {
        data.category_id = parseInt(categoryId)
        if (counterpartyId) {
          data.counterparty_id = parseInt(counterpartyId)
        }
      }

      if (type === 'transfer') {
        data.to_account_id = parseInt(toAccountId)
      }

      if (type === 'exchange') {
        data.to_account_id = parseInt(toAccountId)
        data.to_amount = parseFloat(toAmount)
        data.to_currency_id = toCurrencyId
        if (exchangeRate) {
          data.exchange_rate = parseFloat(exchangeRate)
        }
      }

      await onSubmit(data)
    } catch (error) {
      console.error('Failed to save transaction:', error)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-primary-600" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Transaction Type */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        {(['expense', 'income', 'transfer', 'exchange'] as TransactionType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`py-2 text-sm font-medium rounded-md transition-colors ${
              type === t
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Amount {selectedAccount && `(${selectedAccount.currency_symbol})`}
        </label>
        <input
          type="number"
          step={getStep(decimalPlaces)}
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={getPlaceholder(decimalPlaces)}
          className={`w-full px-3 py-3 text-2xl font-semibold rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.amount ? 'border-red-500' : ''}`}
        />
        {errors.amount && <p className="text-sm text-red-600">{errors.amount}</p>}
      </div>

      {/* Account */}
      <Select
        label="Account"
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        options={accounts.map((a) => ({
          value: a.id,
          label: `${a.name} (${a.currency_symbol}${formatBalance(a.current_balance, a.currency_decimal_places ?? 2)})`,
        }))}
        placeholder="Select account"
        error={errors.accountId}
      />

      {/* Category (for income/expense) */}
      {(type === 'income' || type === 'expense') && (
        <Select
          label="Category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          options={filteredCategories.map((c) => ({
            value: c.id,
            label: `${c.icon || ''} ${c.name}`,
          }))}
          placeholder="Select category"
          error={errors.categoryId}
        />
      )}

      {/* Counterparty (for income/expense, optional) */}
      {(type === 'income' || type === 'expense') && (
        <Select
          label="Counterparty (optional)"
          value={counterpartyId}
          onChange={(e) => setCounterpartyId(e.target.value)}
          options={[
            { value: '', label: 'None' },
            ...filteredCounterparties.map((cp) => ({
              value: cp.id,
              label: cp.name,
            })),
          ]}
        />
      )}

      {/* To Account (for transfer/exchange) */}
      {(type === 'transfer' || type === 'exchange') && (
        <Select
          label="To Account"
          value={toAccountId}
          onChange={(e) => setToAccountId(e.target.value)}
          options={accounts
            .filter((a) => type === 'transfer' ? a.currency_id === currencyId : true)
            .map((a) => ({
              value: a.id,
              label: `${a.name} (${a.currency_symbol}${formatBalance(a.current_balance, a.currency_decimal_places ?? 2)})`,
            }))}
          placeholder="Select destination account"
          error={errors.toAccountId}
        />
      )}

      {/* Exchange specific fields */}
      {type === 'exchange' && (
        <>
          {/* Exchange mode toggle */}
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setExchangeMode('amounts')}
              className={`px-3 py-1 rounded ${exchangeMode === 'amounts' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400'}`}
            >
              Enter amounts
            </button>
            <button
              type="button"
              onClick={() => setExchangeMode('rate')}
              className={`px-3 py-1 rounded ${exchangeMode === 'rate' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300' : 'text-gray-600 dark:text-gray-400'}`}
            >
              Enter rate
            </button>
          </div>

          {exchangeMode === 'rate' && (
            <Input
              label="Exchange Rate"
              type="number"
              step="0.000001"
              min="0"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(e.target.value)}
              placeholder="1.00"
            />
          )}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Receive Amount {selectedToAccount && `(${selectedToAccount.currency_symbol})`}
            </label>
            <input
              type="number"
              step={getStep(toDecimalPlaces)}
              min="0"
              value={toAmount}
              onChange={(e) => setToAmount(e.target.value)}
              disabled={exchangeMode === 'rate'}
              placeholder={getPlaceholder(toDecimalPlaces)}
              className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 dark:disabled:bg-gray-900 ${errors.toAmount ? 'border-red-500' : ''}`}
            />
            {errors.toAmount && <p className="text-sm text-red-600">{errors.toAmount}</p>}
          </div>
        </>
      )}

      {/* Date/Time */}
      <Input
        label="Date & Time"
        type="datetime-local"
        value={dateTime}
        onChange={(e) => setDateTime(e.target.value)}
      />

      {/* Notes */}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Add notes..."
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={submitting} className="flex-1">
          {submitting ? 'Saving...' : transaction ? 'Update' : 'Add'}
        </Button>
      </div>
    </form>
  )
}
