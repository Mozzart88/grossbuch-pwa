import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Modal, Input, Spinner, useToast } from '../components/ui'
import { currencyRepository } from '../services/repositories'
import type { Currency, CurrencyInput } from '../types'

export function CurrenciesPage() {
  const { showToast } = useToast()
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null)

  // Form state
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [decimalPlaces, setDecimalPlaces] = useState('2')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const curs = await currencyRepository.findAll()
      setCurrencies(curs)
    } catch (error) {
      console.error('Failed to load currencies:', error)
    } finally {
      setLoading(false)
    }
  }

  const openModal = (currency?: Currency) => {
    if (currency) {
      setEditingCurrency(currency)
      setCode(currency.code)
      setName(currency.name)
      setSymbol(currency.symbol)
      setDecimalPlaces(currency.decimal_places.toString())
    } else {
      setEditingCurrency(null)
      setCode('')
      setName('')
      setSymbol('')
      setDecimalPlaces('2')
    }
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingCurrency(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !name.trim() || !symbol.trim()) return

    setSubmitting(true)
    try {
      const data: CurrencyInput = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        symbol: symbol.trim(),
        decimal_places: parseInt(decimalPlaces) || 2,
      }

      if (editingCurrency) {
        await currencyRepository.update(editingCurrency.id, data)
        showToast('Currency updated', 'success')
      } else {
        await currencyRepository.create(data)
        showToast('Currency created', 'success')
      }

      closeModal()
      loadData()
    } catch (error) {
      console.error('Failed to save currency:', error)
      showToast(error instanceof Error ? error.message : 'Failed to save', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (currency: Currency) => {
    if (!confirm(`Delete "${currency.name}"? This cannot be undone.`)) return

    try {
      await currencyRepository.delete(currency.id)
      showToast('Currency deleted', 'success')
      loadData()
    } catch (error) {
      console.error('Failed to delete currency:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete', 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Currencies"
        showBack
        rightAction={
          <Button size="sm" onClick={() => openModal()}>
            Add
          </Button>
        }
      />

      <div className="p-4">
        <Card className="divide-y divide-gray-200 dark:divide-gray-700">
          {currencies.map((currency) => (
            <div key={currency.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-gray-500 dark:text-gray-400 w-8">
                  {currency.symbol}
                </span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{currency.code}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{currency.name}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openModal(currency)}
                  className="text-xs text-primary-600 dark:text-primary-400"
                >
                  Edit
                </button>
                {!currency.is_preset && (
                  <button
                    onClick={() => handleDelete(currency)}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editingCurrency ? 'Edit Currency' : 'Add Currency'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g., BTC, GBP"
            maxLength={6}
            required
          />
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Bitcoin, British Pound"
            required
          />
          <Input
            label="Symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="e.g., ₿, £"
            maxLength={3}
            required
          />
          <Input
            label="Decimal Places"
            type="number"
            min="0"
            max="8"
            value={decimalPlaces}
            onChange={(e) => setDecimalPlaces(e.target.value)}
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
