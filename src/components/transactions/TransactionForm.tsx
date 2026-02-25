import { useState, useEffect, useMemo, useRef } from 'react'
import type { Account, Tag, Counterparty, Transaction, TransactionLine, TransactionInput, Currency } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { walletRepository, tagRepository, counterpartyRepository, transactionRepository, currencyRepository } from '../../services/repositories'
import { Button, Input, Select, LiveSearch, DateTimeUI, Modal, Badge } from '../ui'
import type { LiveSearchOption } from '../ui'
import { toDateTimeLocal } from '../../utils/dateUtils'
import { fromIntFrac, toIntFrac } from '../../utils/amount'
import { useLayoutContextSafe } from '../../store/LayoutContext'

type TransactionMode = 'expense' | 'income' | 'transfer' | 'exchange'

// Sub-entry for multi-tag expense support
interface SubEntry {
  id: string
  tagId: string
  newTagName: string
  newTagType: 'expense' | 'income' | 'both'
  amount: string
}

// Common add-on tag entry (Tips, Fee, VAT, Discount)
interface CommonEntry {
  tagId: number
  tagName: string
  isIncome: boolean   // true for Discount (sign '+')
  amtType: 'pct' | 'abs'
  pct: string         // percentage string e.g. "15"
  abs: string         // absolute amount string e.g. "3.50"
}

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

  // Multi-tag expense state
  const [subEntries, setSubEntries] = useState<SubEntry[]>([
    { id: 'sub-1', tagId: '', newTagName: '', newTagType: 'expense', amount: '' }
  ])
  const [activeCommons, setActiveCommons] = useState<CommonEntry[]>([])
  const [commonTags, setCommonTags] = useState<Tag[]>([])
  const [modalTargetEntryId, setModalTargetEntryId] = useState<string>('main')

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
    return exchangeLines.length === 2 && expenseLines.length >= 1
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
      const expenseLines = lines.filter(l =>
        l.tag_id !== SYSTEM_TAGS.EXCHANGE &&
        l.tag_id !== SYSTEM_TAGS.TRANSFER &&
        l.sign === '-' &&
        !l.is_common
      )
      const commonLines = lines.filter(l => l.is_common)

      // Source account (where money came from)
      setAccountId(exchangeOut.account_id.toString())
      setPaymentAmount(fromIntFrac(exchangeOut.amount_int, exchangeOut.amount_frac).toString())

      // Payment currency (expense currency)
      const targetCurrency = currencies.find(c => c.code === expenseLines[0]?.currency)
      if (targetCurrency) setPaymentCurrencyId(targetCurrency.id)

      // Restore sub-entries
      if (expenseLines.length === 1) {
        setAmount(fromIntFrac(expenseLines[0].amount_int, expenseLines[0].amount_frac).toString())
        setTagId(expenseLines[0].tag_id.toString())
      }
      setSubEntries(expenseLines.map((l, i) => ({
        id: `sub-${i + 1}`,
        tagId: l.tag_id.toString(),
        newTagName: '',
        newTagType: 'expense' as const,
        amount: fromIntFrac(l.amount_int, l.amount_frac).toString(),
      })))

      // Restore common add-ons
      if (commonLines.length > 0) {
        setActiveCommons(commonLines.map(l => {
          const isPct = l.pct_value != null && l.pct_value > 0
          return {
            tagId: l.tag_id,
            tagName: l.tag || '',
            isIncome: l.sign === '+',
            amtType: isPct ? 'pct' as const : 'abs' as const,
            pct: isPct ? String((l.pct_value! * 100).toFixed(2).replace(/\.?0+$/, '')) : '',
            abs: isPct ? '' : fromIntFrac(l.amount_int, l.amount_frac).toString(),
          }
        }))
      }

      setNote(initialData.note || '')
      if (initialData.counterparty_id) setCounterpartyId(initialData.counterparty_id.toString())
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

    if (detectedMode === 'income') {
      setAccountId(firstLine.account_id.toString())
      setTagId(firstLine.tag_id.toString())
      setNote(initialData.note || '')
      setAmount(fromIntFrac(firstLine.amount_int, firstLine.amount_frac).toString())
      if (initialData.counterparty_id) {
        setCounterpartyId(initialData.counterparty_id.toString())
      }
    } else if (detectedMode === 'expense') {
      setNote(initialData.note || '')
      if (initialData.counterparty_id) {
        setCounterpartyId(initialData.counterparty_id.toString())
      }

      // Separate plain sub-entries from common add-on entries
      const plainLines = lines.filter((l: TransactionLine) => !l.is_common)
      const commonLines = lines.filter((l: TransactionLine) => l.is_common)

      // Set account from first line
      const firstPlainLine = plainLines[0] || firstLine
      setAccountId(firstPlainLine.account_id.toString())

      // Set payment currency from account
      const acc = accounts.find(a => a.id === firstPlainLine.account_id)
      if (acc) setPaymentCurrencyId(acc.currency_id)

      // Restore plain sub-entries
      if (plainLines.length > 0) {
        setSubEntries(plainLines.map((l: TransactionLine, i: number) => ({
          id: `sub-${i + 1}`,
          tagId: l.tag_id.toString(),
          newTagName: '',
          newTagType: 'expense' as const,
          amount: fromIntFrac(l.amount_int, l.amount_frac).toString(),
        })))
        // For simple mode (1 plain line), also set main amount
        if (plainLines.length === 1) {
          setAmount(fromIntFrac(plainLines[0].amount_int, plainLines[0].amount_frac).toString())
        }
      }

      // Restore common add-on entries
      if (commonLines.length > 0) {
        setActiveCommons(commonLines.map((l: TransactionLine) => {
          const isPct = l.pct_value != null && l.pct_value > 0
          return {
            tagId: l.tag_id,
            tagName: l.tag || '',
            isIncome: l.sign === '+',
            amtType: isPct ? 'pct' as const : 'abs' as const,
            pct: isPct ? String((l.pct_value! * 100).toFixed(2).replace(/\.?0+$/, '')) : '',
            abs: isPct ? '' : fromIntFrac(l.amount_int, l.amount_frac).toString(),
          }
        }))
      }
    } else if (detectedMode === 'transfer' || detectedMode === 'exchange') {
      const fromLine = lines.find((l: TransactionLine) => l.sign === '-')!
      const toLine = lines.find((l: TransactionLine) => l.sign === '+')!
      const feeLine = lines.find((l: TransactionLine) => l.tag_id === SYSTEM_TAGS.FEE || (l.tag_id !== fromLine.tag_id && l.sign === '-'))

      setAccountId(fromLine.account_id.toString())
      setToAccountId(toLine.account_id.toString())
      setNote(initialData.note || '')

      setAmount(fromIntFrac(fromLine.amount_int, fromLine.amount_frac).toString())
      setToAmount(fromIntFrac(toLine.amount_int, toLine.amount_frac).toString())

      if (feeLine) {
        setFee(fromIntFrac(feeLine.amount_int, feeLine.amount_frac).toString())
        setFeeTagId(feeLine.tag_id.toString())
      }

      if (detectedMode === 'exchange') {
        const fromAmt = fromIntFrac(fromLine.amount_int, fromLine.amount_frac)
        const toAmt = fromIntFrac(toLine.amount_int, toLine.amount_frac)
        const rate = toAmt / fromAmt
        setExchangeRate(rate.toFixed(6))
      }
    }
  }

  const loadData = async () => {
    try {
      const [wallets, incomeTags, expenseTags, cps, currencyList, usedCurrencies, commonTagList] = await Promise.all([
        walletRepository.findActive(),
        tagRepository.findIncomeTags(),
        tagRepository.findExpenseTags(),
        counterpartyRepository.findAll(),
        currencyRepository.findAll(),
        currencyRepository.findUsedInAccounts(),
        tagRepository.findCommonTags(),
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
      setCommonTags(commonTagList)

      // Set default payment currency if configured and not editing
      const paymentDefault = currencyList.find(c => c.is_payment_default)
      if (!initialData && paymentDefault) {
        setPaymentCurrencyId(paymentDefault.id)
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

  // Sub-entry handlers (expense mode)
  const addSubEntry = () => {
    setSubEntries(prev => [
      ...prev,
      { id: `sub-${Date.now()}`, tagId: '', newTagName: '', newTagType: 'expense', amount: '' }
    ])
  }
  const removeSubEntry = (id: string) => {
    setSubEntries(prev => prev.filter(e => e.id !== id))
  }
  const updateSubEntry = (id: string, updates: Partial<SubEntry>) => {
    setSubEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e))
  }

  // Common tag handlers (expense mode)
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
    // When switching pct → abs: if currently in simple mode, transfer main amount to sub-entry
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

  const selectedAccount = accounts.find(a => a.id.toString() === accountId)
  const selectedToAccount = accounts.find(a => a.id.toString() === toAccountId)
  const decimalPlaces = selectedAccount?.decimalPlaces ?? 2
  const toDecimalPlaces = selectedToAccount?.decimalPlaces ?? 2

  // Payment currency (for multi-currency expenses)
  const paymentCurrency = currencies.find(c => c.id === paymentCurrencyId)
  const paymentCurrencyDecimalPlaces = paymentCurrency?.decimal_places ?? 2
  // Multi-currency expense: payment currency differs from account currency
  const paymentCurrencyDiffers = mode === 'expense' && paymentCurrencyId && paymentCurrencyId !== selectedAccount?.currency_id

  // Multi-tag computed values (expense mode)
  // Main amount is editable only when: single plain sub-entry AND all commons are pct-based (or no commons)
  const isExpenseMainEditable = mode !== 'expense' || (
    subEntries.length === 1 && activeCommons.every(c => c.amtType === 'pct')
  )
  // Base for pct calculation: main amount when simple; sum of plain amounts when complex
  const expensePlainBase = mode === 'expense' && !isExpenseMainEditable
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
  // Total for display when NOT editable (complex mode)
  const expenseComputedTotal = expensePlainBase + expenseAbsExtras + expensePctExtras
  // Amount displayed in main field
  const expenseDisplayAmount = mode === 'expense' && !isExpenseMainEditable
    ? expenseComputedTotal.toFixed(selectedAccount?.decimalPlaces ?? 2)
    : amount

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

  const sortedTagsOptions = (() => {
    const cId = counterpartyId ? parseInt(counterpartyId) : 0
    const res: { value: number, label: string }[] = []

    if (cId) {
      const counterparty = counterparties.find(c => c.id === cId)!
      filteredTags.filter(ft => counterparty.tag_ids?.includes(ft.id))
        .toSorted((a, b) => (b.sort_order || 0) - (a.sort_order || 0))
        .forEach(t => res.push({ value: t.id, label: t.name }))
    }
    filteredTags
      .toSorted((a, b) => (b.sort_order || 0) - (a.sort_order || 0))
      .forEach(t => {
        if (!res.find(ft => t.id === ft.value)) {
          res.push({ value: t.id, label: t.name })
        }
      })
    return res
  })();
  const sortedCounterpartiesOptions = (() => {
    const primaryTagId = mode === 'expense'
      ? (subEntries[0]?.tagId ? parseInt(subEntries[0].tagId) : 0)
      : (tagId ? parseInt(tagId) : 0)
    const tId = primaryTagId
    const res: { value: number, label: string }[] = []
    if (tId) {
      counterparties.filter(c => c.tag_ids?.includes(tId))
        .toSorted((a, b) => b.sort_order - a.sort_order)
        .forEach(c => res.push({ value: c.id, label: c.name }))

    }
    counterparties
      .toSorted((a, b) => b.sort_order - a.sort_order)
      .forEach(c => {
        if (!res.find(cp => cp.value === c.id))
          res.push({ value: c.id, label: c.name })
      })
    return res
  })();

  // Calculate step and placeholder based on decimal places
  const getStep = (decimals: number) => (1 / Math.pow(10, decimals)).toFixed(decimals)
  const getPlaceholder = (decimals: number) => '0.' + '0'.repeat(decimals)

  // Format balance for display
  const formatBalance = (balanceInt: number, balanceFrac: number, decimals: number) => {
    return fromIntFrac(balanceInt, balanceFrac).toFixed(decimals)
  }

  // Convert display amount to IntFrac
  const toAmountIntFrac = (displayAmount: string): { int: number; frac: number } => {
    const parsed = parseFloat(displayAmount) || 0
    return toIntFrac(Math.abs(parsed))
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

    if (mode === 'expense') {
      // Expense: validate sub-entries (or main amount when simple)
      if (isExpenseMainEditable) {
        if (!amount || parseFloat(amount) <= 0) {
          newErrors.amount = 'Amount is required and must be positive'
        }
      } else {
        if (expensePlainBase <= 0) {
          newErrors.amount = 'At least one sub-amount is required'
        }
      }
      // At least one sub-entry must have a tag
      const hasTag = subEntries.some(e => e.tagId || e.newTagName)
      if (!hasTag) {
        newErrors.tagId = 'Category is required'
      }
    } else {
      if (!amount || parseFloat(amount) <= 0) {
        newErrors.amount = 'Amount is required and must be positive'
      }
      if (mode === 'income' && !tagId && !newTagName) {
        newErrors.tagId = 'Category is required'
      }
    }
    if (!accountId) {
      newErrors.accountId = 'Account is required'
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
      // Create new tag for income if pending
      let finalTagId = tagId
      if (mode === 'income' && newTagName && !tagId) {
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

      // Resolve tag IDs for expense sub-entries (create new tags if pending)
      const resolvedSubTagIds: Record<string, number> = {}
      if (mode === 'expense') {
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
      }

      const { int: amountInt, frac: amountFrac } = toAmountIntFrac(amount)
      const feeIntFrac = fee ? toAmountIntFrac(fee) : undefined

      // Get exchange rate for the account's currency
      const selectedAccount = accounts.find(a => a.id.toString() === accountId)
      const accountRateData = selectedAccount
        ? await currencyRepository.getRateForCurrency(selectedAccount.currency_id)
        : { int: 1, frac: 0 }

      // Collect all tag IDs for counterparty association
      const primaryTagIdsForCp = mode === 'expense'
        ? Object.values(resolvedSubTagIds).filter(id => id > 0)
        : [parseInt(finalTagId)].filter(id => id > 0)

      let finalCounterpartyId = counterpartyId ? parseInt(counterpartyId) : 0
      if (counterpartyName && !counterpartyId) {
        finalCounterpartyId = (await counterpartyRepository.create({
          name: counterpartyName,
          tag_ids: primaryTagIdsForCp
        })).id
      } else if (finalCounterpartyId) {
        const existingTagIds = counterparties.find(c => c.id === finalCounterpartyId)?.tag_ids || []
        await counterpartyRepository.update(finalCounterpartyId, {
          tag_ids: [...new Set([...existingTagIds, ...primaryTagIdsForCp])]
        })
      }
      const payload: TransactionInput = {
        counterparty_id: finalCounterpartyId ? finalCounterpartyId : undefined,
        counterparty_name: counterpartyName || undefined,
        timestamp: Math.floor(datetime / 1000),
        note: note || undefined,
        lines: []
      }
      if (mode === 'income') {
        payload.lines.push({
          account_id: parseInt(accountId),
          tag_id: parseInt(finalTagId),
          sign: '+' as const,
          amount_int: amountInt,
          amount_frac: amountFrac,
          rate_int: accountRateData.int,
          rate_frac: accountRateData.frac,
        })
      } else if (mode === 'expense') {
        if (paymentCurrencyDiffers && paymentCurrencyId) {
          // Multi-currency expense (one or more sub-entries)
          const targetAccount = await walletRepository.findOrCreateAccountForCurrency(
            selectedAccount!.wallet_id,
            paymentCurrencyId
          )
          const sourceRateData = accountRateData
          const targetRateData = await currencyRepository.getRateForCurrency(paymentCurrencyId)
          const sourceAmountIF = toAmountIntFrac(paymentAmount)

          // Total in payment currency (computed or entered)
          const totalPaymentStr = isExpenseMainEditable
            ? amount
            : expenseComputedTotal.toFixed(paymentCurrencyDecimalPlaces)
          const targetTotalAmountIF = toAmountIntFrac(totalPaymentStr)

          // EXCHANGE out (account → payment)
          payload.lines.push({
            account_id: parseInt(accountId),
            tag_id: SYSTEM_TAGS.EXCHANGE,
            sign: '-' as const,
            amount_int: sourceAmountIF.int,
            amount_frac: sourceAmountIF.frac,
            rate_int: sourceRateData.int,
            rate_frac: sourceRateData.frac,
          })
          // EXCHANGE in (payment currency received)
          payload.lines.push({
            account_id: targetAccount.id,
            tag_id: SYSTEM_TAGS.EXCHANGE,
            sign: '+' as const,
            amount_int: targetTotalAmountIF.int,
            amount_frac: targetTotalAmountIF.frac,
            rate_int: targetRateData.int,
            rate_frac: targetRateData.frac,
          })
          // Expense line per sub-entry (in payment currency account)
          for (const entry of subEntries) {
            const subTagId = resolvedSubTagIds[entry.id] || 0
            const subAmountStr = isExpenseMainEditable ? amount : entry.amount
            const subAmountIF = toAmountIntFrac(subAmountStr)
            payload.lines.push({
              account_id: targetAccount.id,
              tag_id: subTagId,
              sign: '-' as const,
              amount_int: subAmountIF.int,
              amount_frac: subAmountIF.frac,
              rate_int: targetRateData.int,
              rate_frac: targetRateData.frac,
              pct_value: null,
            })
          }
          // Common add-on lines (in payment currency)
          const pctBase = isExpenseMainEditable
            ? (parseFloat(amount) || 0)
            : subEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
          for (const common of activeCommons) {
            const commonAmtNum = common.amtType === 'pct'
              ? pctBase * (parseFloat(common.pct) || 0) / 100
              : parseFloat(common.abs) || 0
            const commonIF = toAmountIntFrac(commonAmtNum.toFixed(paymentCurrencyDecimalPlaces))
            const pctValue = common.amtType === 'pct'
              ? (parseFloat(common.pct) || 0) / 100
              : null
            payload.lines.push({
              account_id: targetAccount.id,
              tag_id: common.tagId,
              sign: common.isIncome ? '+' as const : '-' as const,
              amount_int: commonIF.int,
              amount_frac: commonIF.frac,
              rate_int: targetRateData.int,
              rate_frac: targetRateData.frac,
              pct_value: pctValue,
            })
          }
        } else {
          // Single-currency expense: one line per sub-entry
          const accId = parseInt(accountId)
          for (const entry of subEntries) {
            const subTagId = resolvedSubTagIds[entry.id] || 0
            const subAmountStr = isExpenseMainEditable ? amount : entry.amount
            const subAmountIF = toAmountIntFrac(subAmountStr)
            payload.lines.push({
              account_id: accId,
              tag_id: subTagId,
              sign: '-' as const,
              amount_int: subAmountIF.int,
              amount_frac: subAmountIF.frac,
              rate_int: accountRateData.int,
              rate_frac: accountRateData.frac,
              pct_value: null,
            })
          }

          // Common add-on lines
          const pctBase = isExpenseMainEditable
            ? (parseFloat(amount) || 0)
            : subEntries.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)

          for (const common of activeCommons) {
            const commonAmtNum = common.amtType === 'pct'
              ? pctBase * (parseFloat(common.pct) || 0) / 100
              : parseFloat(common.abs) || 0
            const commonIF = toAmountIntFrac(commonAmtNum.toFixed(decimalPlaces))
            const pctValue = common.amtType === 'pct'
              ? (parseFloat(common.pct) || 0) / 100
              : null
            payload.lines.push({
              account_id: accId,
              tag_id: common.tagId,
              sign: common.isIncome ? '+' as const : '-' as const,
              amount_int: commonIF.int,
              amount_frac: commonIF.frac,
              rate_int: accountRateData.int,
              rate_frac: accountRateData.frac,
              pct_value: pctValue,
            })
          }
        }
      } else if (mode === 'transfer') {
        payload.lines.push({
          account_id: parseInt(accountId),
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '-' as const,
          amount_int: amountInt,
          amount_frac: amountFrac,
          rate_int: accountRateData.int,
          rate_frac: accountRateData.frac,
        })
        payload.lines.push({
          account_id: parseInt(toAccountId),
          tag_id: SYSTEM_TAGS.TRANSFER,
          sign: '+' as const,
          amount_int: amountInt,
          amount_frac: amountFrac,
          rate_int: accountRateData.int,
          rate_frac: accountRateData.frac,
        })

        if (feeIntFrac) {
          payload.lines.push({
            account_id: parseInt(accountId),
            tag_id: feeTagId ? parseInt(feeTagId) : SYSTEM_TAGS.FEE,
            sign: '-' as const,
            amount_int: feeIntFrac.int,
            amount_frac: feeIntFrac.frac,
            rate_int: accountRateData.int,
            rate_frac: accountRateData.frac,
          })
        }
      } else if (mode === 'exchange') {
        const toAmountIF = toAmountIntFrac(toAmount)

        const fromDisplay = parseFloat(amount) || 0
        const toDisplay = parseFloat(toAmount) || 0

        const fromCurrency = accounts.find(a => a.id.toString() === accountId)
        const toCurrency = accounts.find(a => a.id.toString() === toAccountId)

        let fromRateIF = { int: 1, frac: 0 }
        let toRateIF = { int: 1, frac: 0 }

        if (fromCurrency && toCurrency && fromDisplay > 0 && toDisplay > 0) {
          fromRateIF = await currencyRepository.getRateForCurrency(fromCurrency.currency_id)
          toRateIF = await currencyRepository.getRateForCurrency(toCurrency.currency_id)

          // Update exchange_rate table for the non-default currency
          const defaultCurrency = await currencyRepository.findSystem()

          if (defaultCurrency) {
            if (fromCurrency.currency_id === defaultCurrency.id) {
              // From is default, set rate for 'to' currency
              const rateValue = toDisplay / fromDisplay
              toRateIF = toIntFrac(rateValue)
              await currencyRepository.setExchangeRate(toCurrency.currency_id, toRateIF.int, toRateIF.frac)
            } else if (toCurrency.currency_id === defaultCurrency.id) {
              // To is default, set rate for 'from' currency
              const rateValue = fromDisplay / toDisplay
              fromRateIF = toIntFrac(rateValue)
              await currencyRepository.setExchangeRate(fromCurrency.currency_id, fromRateIF.int, fromRateIF.frac)
            }
          }
        }

        payload.lines.push({
          account_id: parseInt(accountId),
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '-' as const,
          amount_int: amountInt,
          amount_frac: amountFrac,
          rate_int: fromRateIF.int,
          rate_frac: fromRateIF.frac,
        })
        payload.lines.push({
          account_id: parseInt(toAccountId),
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '+' as const,
          amount_int: toAmountIF.int,
          amount_frac: toAmountIF.frac,
          rate_int: toRateIF.int,
          rate_frac: toRateIF.frac,
        })

        if (feeIntFrac) {
          payload.lines.push({
            account_id: parseInt(accountId),
            tag_id: feeTagId ? parseInt(feeTagId) : SYSTEM_TAGS.FEE,
            sign: '-' as const,
            amount_int: feeIntFrac.int,
            amount_frac: feeIntFrac.frac,
            rate_int: fromRateIF.int,
            rate_frac: fromRateIF.frac,
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
          {mode === 'expense' && !isExpenseMainEditable ? 'Total' : 'Amount'}{' '}
          {mode === 'expense' && paymentCurrency ? `(${paymentCurrency.symbol})` : selectedAccount && `(${selectedAccount.currencySymbol})`}
        </label>
        <div className="flex flex-row gap-0">
          <input
            id="amount"
            type="number"
            step={getStep(mode === 'expense' && paymentCurrencyDiffers ? paymentCurrencyDecimalPlaces : decimalPlaces)}
            min="0"
            value={mode === 'expense' ? expenseDisplayAmount : amount}
            readOnly={mode === 'expense' && !isExpenseMainEditable}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={getPlaceholder(mode === 'expense' && paymentCurrencyDiffers ? paymentCurrencyDecimalPlaces : decimalPlaces)}
            className={`flex-1 min-w-0 px-3 py-3 text-xl font-semibold ${mode === 'expense' ? 'rounded-l-lg' : 'rounded-lg'} border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 ${mode === 'expense' && !isExpenseMainEditable ? 'bg-gray-50 dark:bg-gray-900 cursor-default' : ''} ${errors.amount ? 'border-red-500' : ''}`}
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

      {/* Category/Tag for income (single tag) */}
      {mode === 'income' && (
        <div className="space-y-1">
          <LiveSearch
            label="Category"
            value={tagId}
            onChange={(v) => {
              setTagId(`${v}`)
              setNewTagName('')
            }}
            options={sortedTagsOptions}
            placeholder="Select category"
            error={errors.tagId}
            onCreateNew={(name) => {
              setNewTagName(name)
              setNewTagType('income')
              setModalTargetEntryId('main')
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
      )}

      {/* Category/Tags for expense (multi-sub-entry) */}
      {mode === 'expense' && (
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
                <input
                  type="number"
                  step={getStep(decimalPlaces)}
                  min="0"
                  value={entry.amount}
                  onChange={(e) => updateSubEntry(entry.id, { amount: e.target.value })}
                  placeholder={getPlaceholder(decimalPlaces)}
                  className="w-28 px-2 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 text-right"
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

          {/* Common add-on tags pills */}
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
                      className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                        isActive
                          ? 'bg-primary-100 border-primary-400 text-primary-700 dark:bg-primary-900/30 dark:border-primary-600 dark:text-primary-300'
                          : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      {isActive ? `${tag.name} ✓` : `+ ${tag.name}`}
                    </button>
                  )
                })}
              </div>

              {/* Amount inputs for active common tags */}
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
                  <input
                    type="number"
                    min="0"
                    step={entry.amtType === 'pct' ? '0.01' : getStep(paymentCurrencyDiffers ? paymentCurrencyDecimalPlaces : decimalPlaces)}
                    value={entry.amtType === 'pct' ? entry.pct : entry.abs}
                    onChange={(e) => updateCommonEntry(entry.tagId,
                      entry.amtType === 'pct' ? { pct: e.target.value } : { abs: e.target.value }
                    )}
                    placeholder={entry.amtType === 'pct' ? '15' : getPlaceholder(paymentCurrencyDiffers ? paymentCurrencyDecimalPlaces : decimalPlaces)}
                    className="flex-1 min-w-0 px-2 py-1 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
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
      )}

      {/* Counterparty (for income/expense, optional) */}
      {(mode === 'income' || mode === 'expense') && (
        <LiveSearch
          label="Counterparty (optional)"
          options={sortedCounterpartiesOptions}
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
          pendingNewValue={counterpartyName}
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
              label: `${a.walletName} - ${a.currencyCode} (${a.currencySymbol}${formatBalance(a.balance_int, a.balance_frac, a.decimalPlaces)})`,
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
            Create "{modalTargetEntryId === 'main'
              ? newTagName
              : subEntries.find(e => e.id === modalTargetEntryId)?.newTagName || newTagName
            }" as:
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
                if (modalTargetEntryId === 'main') {
                  setTagId('') // income: clear tagId since we'll create a new one
                } else {
                  // expense sub-entry: sync newTagType to the entry
                  updateSubEntry(modalTargetEntryId, { newTagType })
                }
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
