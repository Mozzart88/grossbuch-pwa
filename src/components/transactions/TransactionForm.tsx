import { useState, useEffect } from 'react'
import type { Tag, Counterparty, Currency, Transaction, TransactionLine } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { walletRepository, tagRepository, counterpartyRepository, currencyRepository } from '../../services/repositories'
import type { TransactionMode, AccountOption } from './transactionFormShared'
import { IncomeTransactionForm } from './IncomeTransactionForm'
import { ExpenseTransactionForm } from './ExpenseTransactionForm'
import { TransferTransactionForm } from './TransferTransactionForm'
import { ExchangeTransactionForm } from './ExchangeTransactionForm'

interface TransactionFormProps {
  initialData?: Transaction
  initialMode?: TransactionMode
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

export function TransactionForm({ initialData, initialMode, onSubmit, onCancel, useActionBar = false }: TransactionFormProps) {
  const [mode, setMode] = useState<TransactionMode>(initialMode || 'expense')
  const [loading, setLoading] = useState(true)

  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [activeCurrencies, setActiveCurrencies] = useState<Currency[]>([])
  const [incomeTags, setIncomeTags] = useState<Tag[]>([])
  const [expenseTags, setExpenseTags] = useState<Tag[]>([])
  const [commonTags, setCommonTags] = useState<Tag[]>([])
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [defaultAccountId, setDefaultAccountId] = useState('')
  const [defaultPaymentCurrencyId, setDefaultPaymentCurrencyId] = useState<number | null>(null)

  // Detect mode from initialData (does not need accounts/currencies)
  useEffect(() => {
    if (!initialData || !initialData.lines || initialData.lines.length === 0) return
    const lines = initialData.lines as TransactionLine[]
    if (isMultiCurrencyExpense(lines)) {
      setMode('expense')
    } else if (lines.some(l => l.tag_id === SYSTEM_TAGS.TRANSFER)) {
      setMode('transfer')
    } else if (lines.some(l => l.tag_id === SYSTEM_TAGS.EXCHANGE)) {
      setMode('exchange')
    } else if (lines[0].sign === '+') {
      setMode('income')
    } else {
      setMode('expense')
    }
  }, [initialData])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [wallets, incomeTagList, expenseTagList, cps, currencyList, usedCurrencies, commonTagList] = await Promise.all([
        walletRepository.findActive(),
        tagRepository.findIncomeTags(),
        tagRepository.findExpenseTags(),
        counterpartyRepository.findAll(),
        currencyRepository.findAll(),
        currencyRepository.findUsedInAccounts(),
        tagRepository.findCommonTags(),
      ])

      setCurrencies(currencyList)
      setActiveCurrencies(usedCurrencies)
      setIncomeTags(incomeTagList)
      setExpenseTags(expenseTagList)
      setCounterparties(cps)
      setCommonTags(commonTagList)

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

      // Compute defaults for sub-forms (only when not editing)
      if (!initialData) {
        if (accountOptions.length > 0) {
          const defaultAcc = accountOptions.find(a => a.walletIsDefault && a.is_default)
            || accountOptions.find(a => a.is_default)
            || accountOptions[0]
          setDefaultAccountId(defaultAcc.id.toString())
        }
        const paymentDefault = currencyList.find(c => c.is_payment_default)
        if (paymentDefault) setDefaultPaymentCurrencyId(paymentDefault.id)
      }
    } catch (error) {
      console.error('Failed to load form data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div role="status" className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-primary-600" />
      </div>
    )
  }

  const sharedProps = { initialData, onSubmit, onCancel, useActionBar }

  return (
    <div className="space-y-4">
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

      {mode === 'income' && (
        <IncomeTransactionForm
          {...sharedProps}
          accounts={accounts}
          incomeTags={incomeTags}
          counterparties={counterparties}
          defaultAccountId={defaultAccountId}
        />
      )}
      {mode === 'expense' && (
        <ExpenseTransactionForm
          {...sharedProps}
          accounts={accounts}
          currencies={currencies}
          activeCurrencies={activeCurrencies}
          expenseTags={expenseTags}
          commonTags={commonTags}
          counterparties={counterparties}
          defaultAccountId={defaultAccountId}
          defaultPaymentCurrencyId={defaultPaymentCurrencyId}
        />
      )}
      {mode === 'transfer' && (
        <TransferTransactionForm
          {...sharedProps}
          accounts={accounts}
          defaultAccountId={defaultAccountId}
        />
      )}
      {mode === 'exchange' && (
        <ExchangeTransactionForm
          {...sharedProps}
          accounts={accounts}
          defaultAccountId={defaultAccountId}
        />
      )}
    </div>
  )
}
