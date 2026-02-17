import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Modal, Input, Spinner, useToast } from '../components/ui'
import { currencyRepository } from '../services/repositories'
import type { Currency } from '../types'
import { Badge } from '../components/ui/Badge'
import { useLayoutContextSafe } from '../store/LayoutContext'
import { useDataRefresh } from '../hooks/useDataRefresh'

interface CurrencyWithRate extends Currency {
  currentRate: number
  lastUpdated: number | null
}

export function ExchangeRatesPage() {
  const { showToast } = useToast()
  const layoutContext = useLayoutContextSafe()
  const dataVersion = useDataRefresh()
  const [currencies, setCurrencies] = useState<CurrencyWithRate[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCurrency, setEditingCurrency] = useState<CurrencyWithRate | null>(null)

  // Form state
  const [rate, setRate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [dataVersion])

  // Set up plus button to navigate to exchange transaction
  useEffect(() => {
    const setPlusButtonConfig = layoutContext?.setPlusButtonConfig
    if (!setPlusButtonConfig) return

    setPlusButtonConfig({
      to: '/add?type=exchange',
    })

    return () => {
      setPlusButtonConfig(null)
    }
  }, [layoutContext?.setPlusButtonConfig])

  const loadData = async () => {
    try {
      const [curs, rates] = await Promise.all([
        currencyRepository.findAll(),
        currencyRepository.getAllExchangeRates(),
      ])

      // Merge currencies with their rates
      const currenciesWithRates: CurrencyWithRate[] = rates.map((rate) => {
        const currency = curs.find((c) => rate.currency_id === c.id)
        return {
          ...currency!,
          currentRate: rate.rate,
          lastUpdated: rate.updated_at,
        }
      })

      setCurrencies(currenciesWithRates)
    } catch (error) {
      console.error('Failed to load exchange rates:', error)
    } finally {
      setLoading(false)
    }
  }

  const openModal = (currency: CurrencyWithRate) => {
    if (currency.is_system) {
      showToast('Cannot edit rate for default currency', 'error')
      return
    }
    setEditingCurrency(currency)
    // Display rate as decimal (rate stored as value * 10^decimal_places)
    const divisor = Math.pow(10, currency.decimal_places)
    // const displayRate = currency.currentRate !== null
    //   ? (currency.currentRate / divisor).toFixed(4)
    //   : '1.00'
    const displayRate = (currency.currentRate / divisor).toFixed(4)
    setRate(displayRate)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingCurrency(null)
    setRate('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCurrency) return

    const rateFloat = parseFloat(rate)
    if (isNaN(rateFloat) || rateFloat <= 0) {
      showToast('Please enter a valid rate', 'error')
      return
    }

    setSubmitting(true)
    try {
      // Convert display rate to stored integer (rate = value * 10^decimal_places)
      const multiplier = Math.pow(10, editingCurrency.decimal_places)
      const rateInt = Math.round(rateFloat * multiplier)
      await currencyRepository.setExchangeRate(editingCurrency.id, rateInt)
      showToast('Exchange rate updated', 'success')
      closeModal()
      loadData()
    } catch (error) {
      console.error('Failed to save exchange rate:', error)
      showToast(error instanceof Error ? error.message : 'Failed to save', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const formatRate = (currency: CurrencyWithRate): string => {
    if (currency.is_system) {
      return '1.0000'
    }
    // if (currency.currentRate === null) {
    //   return 'Not set'
    // }
    // Rate stored as value * 10^decimal_places
    const divisor = Math.pow(10, currency.decimal_places)
    return (currency.currentRate / divisor).toFixed(4)
  }

  const formatLastUpdated = (timestamp: number | null): string => {
    if (timestamp === null) return '-'
    const date = new Date(timestamp * 1000)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  const defaultCurrency = currencies.find((c) => c.is_system)

  return (
    <div>
      <PageHeader title="Exchange Rates" showBack />

      <div className="p-4 space-y-4">
        {defaultCurrency && (
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Rates are relative to {defaultCurrency.code} ({defaultCurrency.symbol})
          </div>
        )}

        <Card className="divide-y divide-gray-200 dark:divide-gray-700">
          {currencies.map((currency) => (
            <div
              key={currency.id}
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => openModal(currency)}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-gray-500 dark:text-gray-400 w-8">
                  {currency.symbol}
                </span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {currency.code}
                    {currency.is_system ? (
                      <Badge>Default</Badge>
                    ) : ''}
                    {currency.is_crypto ? (
                      <Badge variant='secondary'>Crypto</Badge>
                    ) : ''}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{currency.name}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-mono ${currency.is_system ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                  {formatRate(currency)}
                </p>
                {!currency.is_system && currency.lastUpdated && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {formatLastUpdated(currency.lastUpdated)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </Card>

        <div className="text-xs text-gray-400 dark:text-gray-500 text-center">
          <p>Rate = 1 unit of currency in {defaultCurrency?.code || 'default currency'}</p>
          <p>e.g., EUR rate 1.10 means 1 EUR = 1.10 {defaultCurrency?.code || 'USD'}</p>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={`Edit ${editingCurrency?.code} Rate`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            How much {defaultCurrency?.code || 'default currency'} is 1 {editingCurrency?.code} worth?
          </div>
          <Input
            label={`Rate (in ${defaultCurrency?.code || 'default currency'})`}
            type="number"
            step="0.0001"
            min="0.0001"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g., 1.10"
            required
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
