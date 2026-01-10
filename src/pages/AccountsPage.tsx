import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Modal, Input, Select, Spinner, useToast } from '../components/ui'
import { accountRepository, currencyRepository } from '../services/repositories'
import { formatCurrency } from '../utils/formatters'
import type { Account, AccountInput, Currency } from '../types'

export function AccountsPage() {
  const { showToast } = useToast()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [currencyId, setCurrencyId] = useState('')
  const [initialBalance, setInitialBalance] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [accs, curs] = await Promise.all([
        accountRepository.findAll(),
        currencyRepository.findAll(),
      ])
      setAccounts(accs)
      setCurrencies(curs)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const openModal = (account?: Account) => {
    if (account) {
      setEditingAccount(account)
      setName(account.name)
      setCurrencyId(account.currency_id.toString())
      setInitialBalance(account.initial_balance.toString())
    } else {
      setEditingAccount(null)
      setName('')
      setCurrencyId(currencies[0]?.id.toString() || '')
      setInitialBalance('0')
    }
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingAccount(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !currencyId) return

    setSubmitting(true)
    try {
      const data: AccountInput = {
        name: name.trim(),
        currency_id: parseInt(currencyId),
        initial_balance: parseFloat(initialBalance) || 0,
      }

      if (editingAccount) {
        await accountRepository.update(editingAccount.id, data)
        showToast('Account updated', 'success')
      } else {
        await accountRepository.create(data)
        showToast('Account created', 'success')
      }

      closeModal()
      loadData()
    } catch (error) {
      console.error('Failed to save account:', error)
      showToast(error instanceof Error ? error.message : 'Failed to save', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (account: Account) => {
    if (!confirm(`Delete "${account.name}"? This cannot be undone.`)) return

    try {
      await accountRepository.delete(account.id)
      showToast('Account deleted', 'success')
      loadData()
    } catch (error) {
      console.error('Failed to delete account:', error)
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
        title="Accounts"
        showBack
        rightAction={
          <Button size="sm" onClick={() => openModal()}>
            Add
          </Button>
        }
      />

      <div className="p-4 space-y-3">
        {accounts.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>No accounts yet</p>
            <p className="text-sm mt-1">Add your first account to get started</p>
          </div>
        ) : (
          accounts.map((account) => (
            <Card key={account.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{account.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {account.currency_code}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${(account.current_balance || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatCurrency(account.current_balance || 0, account.currency_symbol || '$')}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => openModal(account)}
                      className="text-xs text-primary-600 dark:text-primary-400"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(account)}
                      className="text-xs text-red-600 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editingAccount ? 'Edit Account' : 'Add Account'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Cash, Bank Account"
            required
          />
          <Select
            label="Currency"
            value={currencyId}
            onChange={(e) => setCurrencyId(e.target.value)}
            options={currencies.map((c) => ({
              value: c.id,
              label: `${c.code} - ${c.name}`,
            }))}
            disabled={!!editingAccount}
          />
          <Input
            label="Initial Balance"
            type="number"
            step="0.01"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
            placeholder="0.00"
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
