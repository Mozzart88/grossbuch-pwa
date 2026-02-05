import { useState, useEffect, useMemo, useRef } from 'react'
import type { Account, Tag, Counterparty, Transaction, TransactionLine, TransactionInput, Currency } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { walletRepository, tagRepository, counterpartyRepository, transactionRepository, currencyRepository, settingsRepository } from '../../services/repositories'
import { Button, Input, Select, LiveSearch, DateTimeUI, Modal, Badge } from '../ui'
import type { LiveSearchOption } from '../ui'
import { toDateTimeLocal } from '../../utils/dateUtils'
import { useLayoutContextSafe } from '../../store/LayoutContext'

type TransactionMode = 'expense' | 'income' | 'transfer' | 'exchange'

interface TransactionFormProps {
  initialData?: Transaction
  initialMode?: TransactionMode
  onSubmit: () => void
  onCancel: () => void
  useActionBar?: boolean
}

// Extended account with display info
interface AccountOption extends Account {
  walletName: string
  walletIsDefault: boolean
  currencyCode: string
  currencySymbol: string
  decimalPlaces: number
}

// Extended currency option for LiveSearch with crypto flag
interface CurrencyOption extends LiveSearchOption {
  isCrypto?: boolean
}

export function TransactionForm({ initialData, initialMode, onSubmit, onCancel, useActionBar = false }: TransactionFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const layoutContext = useLayoutContextSafe()
  const [mode, setMode] = useState<TransactionMode>(initialMode || 'expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [tagId, setTagId] = useState('')
  const [counterpartyId, setCounterpartyId] = useState('')
  const [counterpartyName, setCounterpartyName] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagType, setNewTagType] = useState<'expense' | 'income' | 'both'>('expense')
  const [showTagModal, setShowTagModal] = useState(false)
  const [toAccountId, setToAccountId] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')
  const [fee, setFee] = useState('')
  const [feeTagId, setFeeTagId] = useState(SYSTEM_TAGS.FEE.toString())
  const [note, setNote] = useState('')
  const [exchangeMode, setExchangeMode] = useState<'amounts' | 'rate'>('amounts')
  const [datetime, setDateTime] = useState(Date.now())

  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [activeCurrencies, setActiveCurrencies] = useState<Currency[]>([])
  const [paymentCurrencyId, setPaymentCurrencyId] = useState<number | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [incomeTags, setIncomeTags] = useState<Tag[]>([])
  const [expenseTags, setExpenseTags] = useState<Tag[]>([])
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (initialData && accounts.length > 0 && currencies.length > 0) {
      populateFromInitialData()
    }
  }, [initialData, accounts, currencies])

  // Set up action bar when useActionBar is true
  useEffect(() => {
    const setActionBarConfig = layoutContext?.setActionBarConfig
    if (!useActionBar || !setActionBarConfig) return

    setActionBarConfig({
      primaryLabel: initialData ? 'Update' : 'Submit',
      primaryAction: () => {
        formRef.current?.requestSubmit()
      },
      cancelAction: onCancel,
      loading: submitting,
      disabled: submitting,
    })

    // Cleanup on unmount
    return () => {
      setActionBarConfig(null)
    }
  }, [useActionBar, layoutContext?.setActionBarConfig, initialData, onCancel, submitting])

  // Detect if this is a multi-currency expense pattern (exchange + expense)
  const isMultiCurrencyExpense = (lines: TransactionLine[]): boolean => {
    const exchangeLines = lines.filter(l => l.tag_id === SYSTEM_TAGS.EXCHANGE)
    const expenseLines = lines.filter(l =>
      l.sign === '-' &&
      l.tag_id !== SYSTEM_TAGS.EXCHANGE &&
      l.tag_id !== SYSTEM_TAGS.TRANSFER &&
      l.tag_id !== SYSTEM_TAGS.FEE
    )
    return exchangeLines.length === 2 && expenseLines.length === 1
  }

  const populateFromInitialData = () => {
    if (!initialData || !initialData.lines || initialData.lines.length === 0) return
    setDateTime(new Date(initialData.timestamp * 1000).getTime())

    const lines = initialData.lines as TransactionLine[]
    const firstLine = lines[0]

    // Check for multi-currency expense first
    if (isMultiCurrencyExpense(lines)) {
      setMode('expense')

      const exchangeOut = lines.find(l => l.tag_id === SYSTEM_TAGS.EXCHANGE && l.sign === '-')!
      const expenseLine = lines.find(l =>
        l.tag_id !== SYSTEM_TAGS.EXCHANGE &&
        l.tag_id !== SYSTEM_TAGS.TRANSFER &&
        l.sign === '-'
      )!

      // Source account (where money came from)
      setAccountId(exchangeOut.account_id.toString())
      const sourceAcc = accounts.find(a => a.id === exchangeOut.account_id)
      const sourceDp = sourceAcc?.decimalPlaces ?? 2
      setPaymentAmount((exchangeOut.amount / Math.pow(10, sourceDp)).toString())

      // Payment currency (expense currency)
      const targetCurrency = currencies.find(c => c.code === expenseLine.currency)
      if (targetCurrency) {
        setPaymentCurrencyId(targetCurrency.id)
      }
      const targetDp = targetCurrency?.decimal_places ?? 2
      setAmount((expenseLine.amount / Math.pow(10, targetDp)).toString())

      setTagId(expenseLine.tag_id.toString())
      setNote(expenseLine.note || '')

      if (initialData.counterparty_id) {
        setCounterpartyId(initialData.counterparty_id.toString())
      }
      return
    }

    // Detect mode for other transaction types
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
      setAmount((firstLine.amount / Math.pow(10, dp)).toString())

      // For regular expenses, set payment currency to match account
      if (detectedMode === 'expense' && acc) {
        setPaymentCurrencyId(acc.currency_id)
      }

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
      setAmount((fromLine.amount / Math.pow(10, fromDp)).toString())

      const toAcc = accounts.find(a => a.id === toLine.account_id)
      const toDp = toAcc?.decimalPlaces ?? 2
      setToAmount((toLine.amount / Math.pow(10, toDp)).toString())

      if (feeLine) {
        setFee((feeLine.amount / Math.pow(10, fromDp)).toString())
        setFeeTagId(feeLine.tag_id.toString())
      }

      if (detectedMode === 'exchange') {
        const rate = toLine.amount / fromLine.amount
        setExchangeRate(rate.toFixed(6))
      }
    }
  }

  const loadData = async () => {
    try {
      const [wallets, incomeTags, expenseTags, cps, currencyList, defaultPaymentCurrencyId, usedCurrencies] = await Promise.all([
        walletRepository.findActive(),
        tagRepository.findIncomeTags(),
        tagRepository.findExpenseTags(),
        counterpartyRepository.findAll(),
        currencyRepository.findAll(),
        settingsRepository.get('default_payment_currency_id'),
        currencyRepository.findUsedInAccounts(),
      ])

      setDateTime(Date.now())
      setCurrencies(currencyList)
      setActiveCurrencies(usedCurrencies)

      // Build account options with wallet/currency info
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
      setIncomeTags(incomeTags)
      setExpenseTags(expenseTags)
      setCounterparties(cps)

      // Set default payment currency if configured and not editing
      if (!initialData && defaultPaymentCurrencyId) {
        setPaymentCurrencyId(defaultPaymentCurrencyId)
      }

      // Set default account only if not editing
      // Priority: 1. Default account in default wallet, 2. Any default account, 3. First account
      if (!initialData && accountOptions.length > 0) {
        const defaultAcc = accountOptions.find(a => a.walletIsDefault && a.is_default)
          || accountOptions.find(a => a.is_default)
          || accountOptions[0]
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

  // Payment currency (for multi-currency expenses)
  const paymentCurrency = currencies.find(c => c.id === paymentCurrencyId)
  const paymentCurrencyDecimalPlaces = paymentCurrency?.decimal_places ?? 2
  const paymentCurrencyDiffers = mode === 'expense' && paymentCurrencyId && paymentCurrencyId !== selectedAccount?.currency_id

  // Sorted currency options for LiveSearch with priority order
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

    // Priority 1: Default payment currency
    const defaultPaymentCurrency = currencies.find(c => c.id === paymentCurrencyId)
    if (defaultPaymentCurrency) addCurrency(defaultPaymentCurrency)

    // Priority 2: Selected account's currency
    const accountCurrency = currencies.find(c => c.id === selectedAccount?.currency_id)
    if (accountCurrency) addCurrency(accountCurrency)

    // Priority 3: Active currencies (currencies with accounts)
    activeCurrencies.forEach(addCurrency)

    // Priority 4: Other fiat currencies
    currencies.filter(c => c.is_fiat).forEach(addCurrency)

    // Priority 5: Crypto currencies
    currencies.filter(c => c.is_crypto).forEach(addCurrency)

    // Priority 6: Any remaining currencies
    currencies.forEach(addCurrency)

    return result
  }, [currencies, activeCurrencies, selectedAccount?.currency_id, paymentCurrencyId])

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
    if ((mode === 'income' || mode === 'expense') && !tagId && !newTagName) {
      newErrors.tagId = 'Category is required'
    }
    if ((mode === 'transfer' || mode === 'exchange') && !toAccountId) {
      newErrors.toAccountId = 'Destination account is required'
    }
    if (mode === 'exchange') {
      if (!toAmount || parseFloat(toAmount) <= 0) {
        newErrors.toAmount = 'Destination amount is required'
      }
    }
    // Multi-currency expense validation
    if (paymentCurrencyDiffers && (!paymentAmount || parseFloat(paymentAmount) <= 0)) {
      newErrors.paymentAmount = 'Amount in account currency is required'
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
      // Create new tag if pending
      let finalTagId = tagId
      if (newTagName && !tagId) {
        const parent_ids: number[] = [SYSTEM_TAGS.DEFAULT]
        if (newTagType === 'expense' || newTagType === 'both') {
          parent_ids.push(SYSTEM_TAGS.EXPENSE)
        }
        if (newTagType === 'income' || newTagType === 'both') {
          parent_ids.push(SYSTEM_TAGS.INCOME)
        }
        const newTag = await tagRepository.create({
          name: newTagName.trim(),
          parent_ids,
        })
        finalTagId = newTag.id.toString()
      }

      const intAmount = toIntegerAmount(amount, decimalPlaces)
      const intFee = fee ? toIntegerAmount(fee, decimalPlaces) : undefined

      // Get exchange rate for the account's currency (100 = 1.00 in default currency)
      const selectedAccount = accounts.find(a => a.id.toString() === accountId)
      const accountRate = selectedAccount
        ? (await currencyRepository.getExchangeRate(selectedAccount.currency_id))?.rate ?? 100
        : 100

      const payload: TransactionInput = {
        counterparty_id: counterpartyId ? parseInt(counterpartyId) : undefined,
        counterparty_name: counterpartyName || undefined,
        timestamp: Math.floor(datetime / 1000),
        lines: []
      }
      if (mode === 'income') {
        payload.lines.push({
          account_id: parseInt(accountId),
          tag_id: parseInt(finalTagId),
          sign: '+' as const,
          amount: intAmount,
          rate: accountRate,
          note: note || undefined,
        })
      } else if (mode === 'expense') {
        // Check if this is a multi-currency expense
        if (paymentCurrencyDiffers && paymentCurrencyId) {
          // Find or create account for payment currency
          const targetAccount = await walletRepository.findOrCreateAccountForCurrency(
            selectedAccount!.wallet_id,
            paymentCurrencyId
          )

          // Get rates
          const sourceRate = accountRate
          const targetRate = (await currencyRepository.getExchangeRate(paymentCurrencyId))?.rate ?? 100

          // Source amount (what we pay from account)
          const sourceIntAmount = toIntegerAmount(paymentAmount, decimalPlaces)
          // Target amount (what we spend in payment currency)
          const targetIntAmount = toIntegerAmount(amount, paymentCurrencyDecimalPlaces)

          // 1. Exchange OUT from source account
          payload.lines.push({
            account_id: parseInt(accountId),
            tag_id: SYSTEM_TAGS.EXCHANGE,
            sign: '-' as const,
            amount: sourceIntAmount,
            rate: sourceRate,
          })
          // 2. Exchange IN to target account
          payload.lines.push({
            account_id: targetAccount.id,
            tag_id: SYSTEM_TAGS.EXCHANGE,
            sign: '+' as const,
            amount: targetIntAmount,
            rate: targetRate,
          })
          // 3. Expense from target account
          payload.lines.push({
            account_id: targetAccount.id,
            tag_id: parseInt(finalTagId),
            sign: '-' as const,
            amount: targetIntAmount,
            rate: targetRate,
            note: note || undefined,
          })
        } else {
          // Normal single-currency expense
          payload.lines.push({
            account_id: parseInt(accountId),
            tag_id: parseInt(finalTagId),
            sign: '-' as const,
            amount: intAmount,
            rate: accountRate,
            note: note || undefined,
          })
        }
      } else if (mode === 'transfer') {
        payload.lines.push(
          {
            account_id: parseInt(accountId),
            tag_id: SYSTEM_TAGS.TRANSFER,
            sign: '-' as const,
            amount: intAmount,
            rate: accountRate,
            note: note || undefined,
          })
        payload.lines.push({
          account_id: parseInt(toAccountId),
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '+' as const,
          amount: intAmount,
          rate: accountRate, // Same currency for transfers
        })

        if (intFee) {
          payload.lines.push({
            account_id: parseInt(accountId),
            tag_id: feeTagId ? parseInt(feeTagId) : SYSTEM_TAGS.FEE,
            sign: '-' as const,
            amount: intFee,
            rate: accountRate,
          })
        }
      } else if (mode === 'exchange') {
        const intToAmount = toIntegerAmount(toAmount, toDecimalPlaces)

        // Calculate rate: how many units of 'to' currency per 1 unit of 'from' currency
        // Rate stored as integer where 100 = 1.00
        const fromDisplay = parseFloat(amount) || 0
        const toDisplay = parseFloat(toAmount) || 0

        // Find which currency is default to determine rate direction
        const fromCurrency = accounts.find(a => a.id.toString() === accountId)
        const toCurrency = accounts.find(a => a.id.toString() === toAccountId)

        // Rate for 'from' currency: how much default currency you get for 1 unit
        // If from is default currency, rate = 100. Otherwise calculate from exchange.
        let fromRate = 100
        let toRate = 100

        if (fromCurrency && toCurrency && fromDisplay > 0 && toDisplay > 0) {
          // The actual exchange: fromAmount of fromCurrency = toAmount of toCurrency
          // If toCurrency is the default, then fromRate = toAmount/fromAmount * 100
          // If fromCurrency is the default, then toRate = fromAmount/toAmount * 100

          // For now, calculate rate as toAmount/fromAmount * 100 adjusted for decimals
          const fromDisplayNormalized = fromDisplay * Math.pow(10, fromCurrency.decimalPlaces)
          const toDisplayNormalized = toDisplay * Math.pow(10, toCurrency.decimalPlaces)

          await currencyRepository.getExchangeRate(fromCurrency.currency_id)
            .then(v => {
              if (v) fromRate = v.rate
            })
          await currencyRepository.getExchangeRate(toCurrency.currency_id)
            .then(v => {
              if (v) toRate = v.rate
            })
          // Cross rate calculation
          // const crossRate = (toDisplayNormalized / fromDisplayNormalized) * 100

          // Update exchange_rate table for the non-default currency
          // Rate semantics: rate=100 means 1.00 to the default currency
          // If from is default currency, set rate for 'to' currency
          // If to is default currency, set rate for 'from' currency
          const defaultCurrency = await currencyRepository.findDefault()

          if (defaultCurrency) {
            if (fromCurrency.currency_id === defaultCurrency.id) {
              // From is default (USD), to is foreign (EUR)
              // Rate = how many EUR per 1 USD = toAmount/fromAmount * 10^decimal_places
              toRate = Math.round((toDisplayNormalized / fromDisplayNormalized) * 100)
              await currencyRepository.setExchangeRate(toCurrency.currency_id, toRate)
            } else if (toCurrency.currency_id === defaultCurrency.id) {
              // To is default (USD), from is foreign (EUR)
              // Rate = how many EUR per 1 USD = fromAmount/toAmount * 10^decimal_places
              fromRate = Math.round((fromDisplayNormalized / toDisplayNormalized) * 100)
              await currencyRepository.setExchangeRate(fromCurrency.currency_id, fromRate)
            }
          }
        }

        payload.lines.push({
          account_id: parseInt(accountId),
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '-' as const,
          amount: intAmount,
          rate: fromRate,
          note: note || undefined,
        })
        payload.lines.push({
          account_id: parseInt(toAccountId),
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '+' as const,
          amount: intToAmount,
          rate: toRate,
        })

        if (intFee) {
          payload.lines.push({
            account_id: parseInt(accountId),
            tag_id: feeTagId ? parseInt(feeTagId) : SYSTEM_TAGS.FEE,
            sign: '-' as const,
            amount: intFee,
            rate: fromRate,
          })
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
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
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
          Amount {mode === 'expense' && paymentCurrency ? `(${paymentCurrency.symbol})` : selectedAccount && `(${selectedAccount.currencySymbol})`}
        </label>
        <div className="flex flex-row gap-0">
          <input
            id="amount"
            type="number"
            step={getStep(mode === 'expense' && paymentCurrencyDiffers ? paymentCurrencyDecimalPlaces : decimalPlaces)}
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={getPlaceholder(mode === 'expense' && paymentCurrencyDiffers ? paymentCurrencyDecimalPlaces : decimalPlaces)}
            className={`flex-1 min-w-0 px-3 py-3 text-xl font-semibold ${mode === 'expense' ? 'rounded-l-lg' : 'rounded-lg'} border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.amount ? 'border-red-500' : ''}`}
          />
          {mode === 'expense' && (
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
          )}
        </div>
        {errors.amount && <p className="text-sm text-red-600">{errors.amount}</p>}
      </div>

      {/* Payment Amount (when expense currency differs from account) */}
      {paymentCurrencyDiffers && (
        <div className="space-y-1">
          <label htmlFor="paymentAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Amount from account ({selectedAccount?.currencySymbol})
          </label>
          <input
            id="paymentAmount"
            type="number"
            step={getStep(decimalPlaces)}
            min="0"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            placeholder={getPlaceholder(decimalPlaces)}
            className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.paymentAmount ? 'border-red-500' : ''}`}
          />
          {errors.paymentAmount && <p className="text-sm text-red-600">{errors.paymentAmount}</p>}
          {amount && paymentAmount && parseFloat(amount) > 0 && parseFloat(paymentAmount) > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Rate: 1 {selectedAccount?.currencyCode} = {(parseFloat(amount) / parseFloat(paymentAmount)).toFixed(4)} {paymentCurrency?.code}
            </p>
          )}
        </div>
      )}

      {/* Account */}
      <Select
        label="Account"
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        options={accounts.map((a) => ({
          value: a.id,
          label: `${a.walletName} - ${a.currencyCode} (${a.currencySymbol}${formatBalance(a.balance, a.decimalPlaces)})`,
        }))}
        placeholder="Select account"
        error={errors.accountId}
      />

      {/* Category/Tag (for income/expense) */}
      {(mode === 'income' || mode === 'expense') && (
        <div className="space-y-1">
          <LiveSearch
            label="Category"
            value={tagId}
            onChange={(v) => {
              setTagId(`${v}`)
              setNewTagName('') // Clear pending new tag when existing selected
            }}
            options={filteredTags.map((t) => ({
              value: t.id,
              label: t.name,
            }))}
            placeholder="Select category"
            error={errors.tagId}
            onCreateNew={(name) => {
              setNewTagName(name)
              setNewTagType(mode === 'income' ? 'income' : 'expense')
              setShowTagModal(true)
            }}
          />
          {newTagName && (
            <p className="text-sm text-primary-600 dark:text-primary-400">
              New category: "{newTagName}" ({newTagType})
            </p>
          )}
        </div>
      )}

      {/* Counterparty (for income/expense, optional) */}
      {(mode === 'income' || mode === 'expense') && (
        <LiveSearch
          label="Counterparty (optional)"
          options={counterparties.map((cp) => ({
            value: cp.id,
            label: cp.name,
          }))}
          value={counterpartyId}
          onChange={(val) => {
            setCounterpartyId(val.toString())
            setCounterpartyName('')
          }}
          onCreateNew={(name) => {
            setCounterpartyId('')
            setCounterpartyName(name)
          }}
          placeholder="Search or create..."
        />
      )}

      {/* To Account (for transfer/exchange) */}
      {(mode === 'transfer' || mode === 'exchange') && (
        <Select
          label="To Account"
          value={toAccountId}
          onChange={(e) => setToAccountId(e.target.value)}
          options={accounts
            .filter(a => a.id !== selectedAccount?.id)
            .filter((a) => mode === 'transfer' ? a.currency_id === selectedAccount?.currency_id : a.currency_id !== selectedAccount?.currency_id)
            .map((a) => ({
              value: a.id,
              label: `${a.walletName} - ${a.currencyCode} (${a.currencySymbol}${formatBalance(a.balance, a.decimalPlaces)})`,
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
              onChange={(e) => {
                if (e.target.value === '' || e.target.value === '0')
                  setFeeTagId('')
                else
                  setFeeTagId(SYSTEM_TAGS.FEE.toString())
                setFee(e.target.value)
              }}
              placeholder="0.00"
              className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 ${errors.fee ? 'border-red-500' : ''}`}
            />
            {errors.fee && <p className="text-sm text-red-600">{errors.fee}</p>}
          </div>
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
              step="any"
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

      <DateTimeUI
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

      {/* Actions - only show inline buttons when not using action bar */}
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Type
            </label>
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
                setNewTagName('')
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowTagModal(false)
                setTagId('') // Clear tagId since we'll create a new one
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
