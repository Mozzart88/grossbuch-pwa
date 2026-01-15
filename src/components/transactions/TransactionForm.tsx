import { useState, useEffect } from 'react'
import type { Account, Tag, Counterparty, Transaction, TransactionLine, TransactionInput } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { walletRepository, tagRepository, counterpartyRepository, transactionRepository, currencyRepository } from '../../services/repositories'
import { Button, Input, Select } from '../ui'
import { toDateTimeLocal } from '../../utils/dateUtils'

type TransactionMode = 'expense' | 'income' | 'transfer' | 'exchange'

interface TransactionFormProps {
  initialData?: Transaction
  onSubmit: () => void
  onCancel: () => void
}

// Extended account with display info
interface AccountOption extends Account {
  walletName: string
  currencyCode: string
  currencySymbol: string
  decimalPlaces: number
}

export function TransactionForm({ initialData, onSubmit, onCancel }: TransactionFormProps) {
  const [mode, setMode] = useState<TransactionMode>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [tagId, setTagId] = useState('')
  const [counterpartyId, setCounterpartyId] = useState('')
  const [counterpartyName, setCounterpartyName] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')
  const [fee, setFee] = useState('')
  const [feeTagId, setFeeTagId] = useState(SYSTEM_TAGS.FEE.toString())
  const [note, setNote] = useState('')
  const [exchangeMode, setExchangeMode] = useState<'amounts' | 'rate'>('amounts')
  const [datetime, setDateTime] = useState(Date.now())

  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [incomeTags, setIncomeTags] = useState<Tag[]>([])
  const [expenseTags, setExpenseTags] = useState<Tag[]>([])
  const [feeTags, setFeeTags] = useState<Tag[]>([])
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (initialData && accounts.length > 0) {
      populateFromInitialData()
    }
  }, [initialData, accounts])

  const populateFromInitialData = () => {
    if (!initialData || !initialData.lines || initialData.lines.length === 0) return
    setDateTime(new Date(initialData.created_at * 1000).getTime())

    const lines = initialData.lines as TransactionLine[]
    const firstLine = lines[0]

    // Detect mode
    let detectedMode: TransactionMode = 'expense'
    if (lines.some((l: TransactionLine) => l.tag_id === SYSTEM_TAGS.TRANSFER)) {
      detectedMode = 'transfer'
    } else if (lines.some((l: TransactionLine) => l.tag_id === SYSTEM_TAGS.EXCHANGE)) {
      detectedMode = 'exchange'
    } else if (firstLine.sign === '+') {
      detectedMode = 'income'
    }

    setMode(detectedMode)

    if (detectedMode === 'income' || detectedMode === 'expense') {
      setAccountId(firstLine.account_id.toString())
      setTagId(firstLine.tag_id.toString())
      setNote(firstLine.note || '')

      const acc = accounts.find(a => a.id === firstLine.account_id)
      const dp = acc?.decimalPlaces ?? 2
      setAmount((firstLine.real_amount / Math.pow(10, dp)).toString())

      if (initialData.counterparty_id) {
        setCounterpartyId(initialData.counterparty_id.toString())
      }
    } else if (detectedMode === 'transfer' || detectedMode === 'exchange') {
      const fromLine = lines.find((l: TransactionLine) => l.sign === '-')!
      const toLine = lines.find((l: TransactionLine) => l.sign === '+')!
      const feeLine = lines.find((l: TransactionLine) => l.tag_id === SYSTEM_TAGS.FEE || (l.tag_id !== fromLine.tag_id && l.sign === '-'))

      setAccountId(fromLine.account_id.toString())
      setToAccountId(toLine.account_id.toString())
      setNote(fromLine.note || (initialData.lines as TransactionLine[]).find((l: TransactionLine) => l.note)?.note || '')

      const fromAcc = accounts.find(a => a.id === fromLine.account_id)
      const fromDp = fromAcc?.decimalPlaces ?? 2
      setAmount((fromLine.real_amount / Math.pow(10, fromDp)).toString())

      const toAcc = accounts.find(a => a.id === toLine.account_id)
      const toDp = toAcc?.decimalPlaces ?? 2
      setToAmount((toLine.real_amount / Math.pow(10, toDp)).toString())

      if (feeLine) {
        setFee((feeLine.real_amount / Math.pow(10, fromDp)).toString())
        setFeeTagId(feeLine.tag_id.toString())
      }

      if (detectedMode === 'exchange') {
        const rate = toLine.real_amount / fromLine.real_amount
        setExchangeRate(rate.toFixed(6))
      }
    }
  }

  const loadData = async () => {
    try {
      const [wallets, incomeTags, expenseTags, allFeeTags, cps, currencies] = await Promise.all([
        walletRepository.findActive(),
        tagRepository.findIncomeTags(),
        tagRepository.findExpenseTags(),
        tagRepository.findExpenseTags(), // Fee tags are expense-type
        counterpartyRepository.findAll(),
        currencyRepository.findAll(),
      ])

      setDateTime(Date.now())
      // Build account options with wallet/currency info
      const accountOptions: AccountOption[] = []
      for (const wallet of wallets) {
        if (wallet.accounts) {
          for (const acc of wallet.accounts) {
            const currency = currencies.find(c => c.id === acc.currency_id)
            accountOptions.push({
              ...acc,
              walletName: wallet.name,
              currencyCode: currency?.code ?? '',
              currencySymbol: currency?.symbol ?? '',
              decimalPlaces: currency?.decimal_places ?? 2,
            })
          }
        }
      }

      setAccounts(accountOptions)
      setIncomeTags(incomeTags)
      setExpenseTags(expenseTags)
      setFeeTags(allFeeTags)
      setCounterparties(cps)

      // Set default account only if not editing
      if (!initialData && accountOptions.length > 0) {
        const defaultAcc = accountOptions.find(a => a.is_default) || accountOptions[0]
        setAccountId(defaultAcc.id.toString())
      }
    } catch (error) {
      console.error('Failed to load form data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter tags based on mode
  const filteredTags = mode === 'income' ? incomeTags : mode === 'expense' ? expenseTags : []

  const selectedAccount = accounts.find(a => a.id.toString() === accountId)
  const selectedToAccount = accounts.find(a => a.id.toString() === toAccountId)
  const decimalPlaces = selectedAccount?.decimalPlaces ?? 2
  const toDecimalPlaces = selectedToAccount?.decimalPlaces ?? 2

  // Calculate step and placeholder based on decimal places
  const getStep = (decimals: number) => (1 / Math.pow(10, decimals)).toFixed(decimals)
  const getPlaceholder = (decimals: number) => '0.' + '0'.repeat(decimals)

  // Format balance for display
  const formatBalance = (balance: number, decimals: number) => {
    return (balance / Math.pow(10, decimals)).toFixed(decimals)
  }

  // Convert display amount to integer
  const toIntegerAmount = (displayAmount: string, decimals: number): number => {
    const parsed = parseFloat(displayAmount) || 0
    return Math.round(parsed * Math.pow(10, decimals))
  }

  // Handle exchange rate calculation
  useEffect(() => {
    if (mode === 'exchange' && exchangeMode === 'rate' && amount && exchangeRate) {
      const calculated = parseFloat(amount) * parseFloat(exchangeRate)
      setToAmount(calculated.toFixed(toDecimalPlaces))
    }
  }, [amount, exchangeRate, exchangeMode, mode, toDecimalPlaces])

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!amount || parseFloat(amount) <= 0) {
      newErrors.amount = 'Amount is required and must be positive'
    }
    if (!accountId) {
      newErrors.accountId = 'Account is required'
    }
    if ((mode === 'income' || mode === 'expense') && !tagId) {
      newErrors.tagId = 'Category is required'
    }
    if ((mode === 'transfer' || mode === 'exchange') && !toAccountId) {
      newErrors.toAccountId = 'Destination account is required'
    }
    if (mode === 'transfer' && accountId === toAccountId) {
      newErrors.toAccountId = 'Cannot transfer to the same account'
    }
    if (mode === 'exchange') {
      if (!toAmount || parseFloat(toAmount) <= 0) {
        newErrors.toAmount = 'Destination amount is required'
      }
      if (selectedAccount?.currency_id === selectedToAccount?.currency_id) {
        newErrors.toAccountId = 'Exchange requires different currencies'
      }
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
      const intAmount = toIntegerAmount(amount, decimalPlaces)
      const intFee = fee ? toIntegerAmount(fee, decimalPlaces) : undefined

      const payload: TransactionInput = {
        counterparty_id: counterpartyId ? parseInt(counterpartyId) : undefined,
        counterparty_name: counterpartyName || undefined,
        created_at: Math.floor(datetime / 1000),
        lines: []
      }
      if (mode === 'income' || mode === 'expense') {
        const sign = mode === 'income' ? '+' : '-' as const
        payload.lines.push(
          {
            account_id: parseInt(accountId),
            tag_id: parseInt(tagId),
            sign,
            real_amount: intAmount,
            actual_amount: intAmount,
            note: note || undefined,
          },
        )
      } else if (mode === 'transfer') {
        payload.lines.push(
          {
            account_id: parseInt(accountId),
            tag_id: SYSTEM_TAGS.TRANSFER,
            sign: '-' as const,
            real_amount: intAmount,
            actual_amount: intAmount,
            note: note || undefined,
          })
        payload.lines.push({
          account_id: parseInt(toAccountId),
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '+' as const,
          real_amount: intAmount,
          actual_amount: intAmount,
        })

        if (intFee) {
          payload.lines.push({
            account_id: parseInt(accountId),
            tag_id: feeTagId ? parseInt(feeTagId) : SYSTEM_TAGS.FEE,
            sign: '-' as const,
            real_amount: intFee,
            actual_amount: intFee,
          })
        }
      } else if (mode === 'exchange') {
        const intToAmount = toIntegerAmount(toAmount, toDecimalPlaces)
        payload.lines.push(
          {
            account_id: parseInt(accountId),
            tag_id: SYSTEM_TAGS.EXCHANGE,
            sign: '-' as const,
            real_amount: intAmount,
            actual_amount: intAmount,
            note: note || undefined,
          })
        payload.lines.push({
          account_id: parseInt(toAccountId),
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '+' as const,
          real_amount: intToAmount,
          actual_amount: intToAmount,
        })
        // Store exchange rate if provided
        if (exchangeRate && selectedAccount) {
          const rateInt = toIntegerAmount(exchangeRate, decimalPlaces)
          await currencyRepository.setExchangeRate(selectedAccount.currency_id, rateInt)
        }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div role="status" className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-primary-600" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      {/* Amount */}
      <div className="space-y-1">
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Amount {selectedAccount && `(${selectedAccount.currencySymbol})`}
        </label>
        <input
          id="amount"
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
          label: `${a.walletName} - ${a.currencyCode} (${a.currencySymbol}${formatBalance(a.real_balance, a.decimalPlaces)})`,
        }))}
        placeholder="Select account"
        error={errors.accountId}
      />

      {/* Category/Tag (for income/expense) */}
      {(mode === 'income' || mode === 'expense') && (
        <Select
          label="Category"
          value={tagId}
          onChange={(e) => setTagId(e.target.value)}
          options={filteredTags.map((t) => ({
            value: t.id,
            label: t.name,
          }))}
          placeholder="Select category"
          error={errors.tagId}
        />
      )}

      {/* Counterparty (for income/expense, optional) */}
      {(mode === 'income' || mode === 'expense') && (
        <>
          <Select
            label="Counterparty (optional)"
            value={counterpartyId}
            onChange={(e) => {
              setCounterpartyId(e.target.value)
              if (e.target.value) setCounterpartyName('')
            }}
            options={[
              { value: '', label: 'None / New' },
              ...counterparties.map((cp) => ({
                value: cp.id,
                label: cp.name,
              })),
            ]}
          />
          {!counterpartyId && (
            <Input
              label="Or enter new counterparty"
              value={counterpartyName}
              onChange={(e) => setCounterpartyName(e.target.value)}
              placeholder="New counterparty name"
            />
          )}
        </>
      )}

      {/* To Account (for transfer/exchange) */}
      {(mode === 'transfer' || mode === 'exchange') && (
        <Select
          label="To Account"
          value={toAccountId}
          onChange={(e) => setToAccountId(e.target.value)}
          options={accounts
            .filter((a) => mode === 'transfer' ? a.currency_id === selectedAccount?.currency_id : true)
            .map((a) => ({
              value: a.id,
              label: `${a.walletName} - ${a.currencyCode} (${a.currencySymbol}${formatBalance(a.real_balance, a.decimalPlaces)})`,
            }))}
          placeholder="Select destination account"
          error={errors.toAccountId}
        />
      )}

      {/* Fee (for transfer/exchange) */}
      {(mode === 'transfer' || mode === 'exchange') && (
        <div className="space-y-2">
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
              onChange={(e) => setFee(e.target.value)}
              placeholder="0.00"
              className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.fee ? 'border-red-500' : ''}`}
            />
            {errors.fee && <p className="text-sm text-red-600">{errors.fee}</p>}
          </div>
          {fee && parseFloat(fee) > 0 && (
            <Select
              label="Fee Category"
              value={feeTagId}
              onChange={(e) => setFeeTagId(e.target.value)}
              options={feeTags.map((t) => ({
                value: t.id,
                label: t.name,
              }))}
            />
          )}
        </div>
      )}

      {/* Exchange specific fields */}
      {mode === 'exchange' && (
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
            <label htmlFor="toAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Receive Amount {selectedToAccount && `(${selectedToAccount.currencySymbol})`}
            </label>
            <input
              id="toAmount"
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

      <Input
        type='datetime-local'
        onChange={e => {
          setDateTime(new Date(e.target.value).getTime())
        }}
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
      <div className="flex gap-3 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={submitting} className="flex-1">
          {submitting ? 'Saving...' : (initialData ? 'Update' : 'Add')}
        </Button>
      </div>
    </form>
  )
}
