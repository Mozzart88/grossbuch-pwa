import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Modal, Input, Select, Spinner, useToast, DropdownMenu } from '../components/ui'
import type { DropdownMenuItem } from '../components/ui'
import { walletRepository, currencyRepository, accountRepository } from '../services/repositories'
import type { Wallet, WalletInput, Currency, Account } from '../types'
import { Badge } from '../components/ui/Badge'

export function AccountsPage() {
  const { showToast } = useToast()
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [loading, setLoading] = useState(true)

  // Wallet modal state
  const [walletModalOpen, setWalletModalOpen] = useState(false)
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null)
  const [walletName, setWalletName] = useState('')
  const [walletColor, setWalletColor] = useState('')

  // Add currency modal state
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false)
  const [targetWallet, setTargetWallet] = useState<Wallet | null>(null)
  const [selectedCurrencyId, setSelectedCurrencyId] = useState('')

  const [submitting, setSubmitting] = useState(false)

  const WALLET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6']

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [ws, curs] = await Promise.all([
        walletRepository.findAll(),
        currencyRepository.findAll(),
      ])
      setWallets(ws)
      setCurrencies(curs)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Wallet modal handlers
  const openWalletModal = (wallet?: Wallet) => {
    if (wallet) {
      setEditingWallet(wallet)
      setWalletName(wallet.name)
      setWalletColor(wallet.color || '')
    } else {
      setEditingWallet(null)
      setWalletName('')
      setWalletColor('')
    }
    setWalletModalOpen(true)
  }

  const closeWalletModal = () => {
    setWalletModalOpen(false)
    setEditingWallet(null)
  }

  const handleWalletSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!walletName.trim()) return

    setSubmitting(true)
    try {
      const data: WalletInput = {
        name: walletName.trim(),
        color: walletColor || undefined,
      }

      if (editingWallet) {
        await walletRepository.update(editingWallet.id, data)
        showToast('Wallet updated', 'success')
      } else {
        await walletRepository.create(data)
        showToast('Wallet created', 'success')
      }

      closeWalletModal()
      loadData()
    } catch (error) {
      console.error('Failed to save wallet:', error)
      showToast(error instanceof Error ? error.message : 'Failed to save', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteWallet = async (wallet: Wallet) => {
    if (!confirm(`Delete wallet "${wallet.name}" and all its accounts? This cannot be undone.`)) return

    try {
      await walletRepository.delete(wallet.id)
      showToast('Wallet deleted', 'success')
      loadData()
    } catch (error) {
      console.error('Failed to delete wallet:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete', 'error')
    }
  }

  // Currency modal handlers
  const openCurrencyModal = (wallet: Wallet) => {
    setTargetWallet(wallet)
    // Find first currency not already in this wallet
    const existingCurrencyIds = new Set(wallet.accounts?.map(a => a.currency_id) || [])
    const availableCurrency = currencies.find(c => !existingCurrencyIds.has(c.id))
    setSelectedCurrencyId(availableCurrency?.id.toString() || '')
    setCurrencyModalOpen(true)
  }

  const closeCurrencyModal = () => {
    setCurrencyModalOpen(false)
    setTargetWallet(null)
  }

  const handleAddCurrency = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetWallet || !selectedCurrencyId) return

    setSubmitting(true)
    try {
      await walletRepository.addAccount(targetWallet.id, parseInt(selectedCurrencyId))
      showToast('Currency added to wallet', 'success')
      closeCurrencyModal()
      loadData()
    } catch (error) {
      console.error('Failed to add currency:', error)
      showToast(error instanceof Error ? error.message : 'Failed to add currency', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteAccount = async (account: Account, walletName: string) => {
    if (!confirm(`Remove ${account.currency} from "${walletName}"? This cannot be undone.`)) return

    try {
      await accountRepository.delete(account.id)
      showToast('Account removed', 'success')
      loadData()
    } catch (error) {
      console.error('Failed to delete account:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete', 'error')
    }
  }

  const handleSetDefault = async (wallet: Wallet) => {
    try {
      await walletRepository.setDefault(wallet.id)
      showToast('Default wallet updated', 'success')
      loadData()
    } catch (error) {
      console.error('Failed to set default wallet:', error)
      showToast(error instanceof Error ? error.message : 'Failed to set default', 'error')
    }
  }

  const formatBalance = (balance: number, currency: Currency | undefined) => {
    if (!currency) return balance.toString()
    const decimals = currency.decimal_places
    const displayAmount = Math.abs(balance) / Math.pow(10, decimals)
    const sign = balance < 0 ? '-' : ''
    return `${sign}${currency.symbol}${displayAmount.toFixed(decimals)}`
  }

  const getCurrency = (currencyId: number) => currencies.find(c => c.id === currencyId)

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
        title="Wallets & Accounts"
        showBack
        rightAction={
          <Button size="sm" onClick={() => openWalletModal()}>
            Add Wallet
          </Button>
        }
      />

      <div className="p-4 space-y-4">
        {wallets.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>No wallets yet</p>
            <p className="text-sm mt-1">Add your first wallet to get started</p>
          </div>
        ) : (
          wallets.map((wallet) => (
            <Card key={wallet.id} className="overflow-hidden">
              {/* Wallet header */}
              <div
                className="p-4 flex items-center justify-between"
                style={{ borderLeft: wallet.color ? `4px solid ${wallet.color}` : undefined }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💰</span>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {wallet.name}
                      {wallet.is_default ? (
                        <Badge>
                          Default
                        </Badge>
                      ) : ''}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {wallet.accounts?.length || 0} account(s)
                    </p>
                  </div>
                </div>
                <DropdownMenu
                  items={[
                    { label: '+ Currency', onClick: () => openCurrencyModal(wallet) },
                    ...(!wallet.is_default ? [{ label: 'Set Default', onClick: () => handleSetDefault(wallet) }] : []),
                    { label: 'Edit', onClick: () => openWalletModal(wallet) },
                    { label: 'Delete', onClick: () => handleDeleteWallet(wallet), variant: 'danger' as const },
                  ] as DropdownMenuItem[]}
                />
              </div>

              {/* Accounts list */}
              {wallet.accounts && wallet.accounts.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                  {wallet.accounts.map((account) => {
                    const currency = getCurrency(account.currency_id)
                    return (
                      <div key={account.id} className="px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
                        <div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {account.currency}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${account.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatBalance(account.balance, currency)}
                          </p>
                          <button
                            onClick={() => handleDeleteAccount(account, wallet.name)}
                            className="text-xs text-red-600 dark:text-red-400 mt-1"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Wallet Modal */}
      <Modal isOpen={walletModalOpen} onClose={closeWalletModal} title={editingWallet ? 'Edit Wallet' : 'Add Wallet'}>
        <form onSubmit={handleWalletSubmit} className="space-y-4">
          <Input
            label="Name"
            value={walletName}
            onChange={(e) => setWalletName(e.target.value)}
            placeholder="e.g., Cash, Bank Account"
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Color</label>
            <div className="flex flex-wrap gap-2">
              {WALLET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setWalletColor(color)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${walletColor === color
                    ? 'border-gray-900 dark:border-white scale-110'
                    : 'border-transparent hover:scale-105'
                    }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeWalletModal} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Currency Modal */}
      <Modal isOpen={currencyModalOpen} onClose={closeCurrencyModal} title="Add Currency to Wallet">
        <form onSubmit={handleAddCurrency} className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Add a new currency account to <strong>{targetWallet?.name}</strong>
          </p>
          <Select
            label="Currency"
            value={selectedCurrencyId}
            onChange={(e) => setSelectedCurrencyId(e.target.value)}
            options={currencies
              .filter(c => !targetWallet?.accounts?.some(a => a.currency_id === c.id))
              .map((c) => ({
                value: c.id,
                label: `${c.code} - ${c.name}`,
              }))}
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeCurrencyModal} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !selectedCurrencyId} className="flex-1">
              {submitting ? 'Adding...' : 'Add'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
