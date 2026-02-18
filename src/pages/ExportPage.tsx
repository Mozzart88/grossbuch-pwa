import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, DateTimeUI, Card, useToast, CheckboxGroup, PinPromptModal } from '../components/ui'
import { exportTransactionsToCSV, downloadCSV } from '../services/export/csvExport'
import type { ExportFilters } from '../services/export/csvExport'
import { walletRepository, tagRepository, counterpartyRepository } from '../services/repositories'
import { verifyPin } from '../services/auth'
import type { Wallet, Tag, Counterparty, Account } from '../types'

export function ExportPage() {
  const { showToast } = useToast()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [exporting, setExporting] = useState(false)
  const [showPin, setShowPin] = useState(false)

  const [wallets, setWallets] = useState<Wallet[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])

  const [selectedWalletIds, setSelectedWalletIds] = useState<number[]>([])
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [selectedCounterpartyIds, setSelectedCounterpartyIds] = useState<number[]>([])

  useEffect(() => {
    loadFilterData()
  }, [])

  // Filter accounts by selected wallets
  useEffect(() => {
    if (selectedWalletIds.length > 0) {
      const filtered = accounts.filter((a) => selectedWalletIds.includes(a.wallet_id))
      // Remove selected accounts that no longer match wallet filter
      setSelectedAccountIds((prev) => prev.filter((id) => filtered.some((a) => a.id === id)))
    }
  }, [selectedWalletIds, accounts])

  const loadFilterData = async () => {
    try {
      const [walletList, tagList, counterpartyList] = await Promise.all([
        walletRepository.findAll(),
        tagRepository.findAll(),
        counterpartyRepository.findAll(),
      ])
      setWallets(walletList)
      setTags(tagList)
      setCounterparties(counterpartyList)

      // Collect all accounts from wallets
      const allAccounts: Account[] = []
      for (const w of walletList) {
        if (w.accounts) {
          for (const a of w.accounts) {
            allAccounts.push({ ...a, wallet_id: w.id, wallet: w.name } as Account)
          }
        }
      }
      setAccounts(allAccounts)
    } catch (error) {
      console.error('Failed to load filter data:', error)
    }
  }

  const buildFilters = (): ExportFilters => ({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    walletIds: selectedWalletIds.length > 0 ? selectedWalletIds : undefined,
    accountIds: selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
    tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    counterpartyIds: selectedCounterpartyIds.length > 0 ? selectedCounterpartyIds : undefined,
  })

  const handleExportClick = () => {
    setShowPin(true)
  }

  const handlePinSubmit = async (pin: string) => {
    await verifyPin(pin)
    setShowPin(false)
    await runExport()
  }

  const runExport = async () => {
    setExporting(true)
    try {
      const filters = buildFilters()
      const csv = await exportTransactionsToCSV(filters)
      const filename = `transactions_${startDate || 'all'}_${endDate || 'all'}_${new Date().toISOString().slice(0, 10)}.csv`
      downloadCSV(csv, filename)
      showToast('Export successful', 'success')
    } catch (error) {
      console.error('Failed to export:', error)
      showToast('Failed to export transactions', 'error')
    } finally {
      setExporting(false)
    }
  }

  const filteredAccounts = selectedWalletIds.length > 0
    ? accounts.filter((a) => selectedWalletIds.includes(a.wallet_id))
    : accounts

  return (
    <div>
      <PageHeader title="Export Data" showBack />

      <div className="p-4 space-y-4">
        <Card className="p-4 space-y-4">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Export Transactions</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Download your transactions as a CSV file for use in spreadsheets or backup.
            </p>
          </div>

          <DateTimeUI
            label="Start Date (optional)"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />

          <DateTimeUI
            label="End Date (optional)"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Card>

        <Card className="p-4 space-y-2">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Filters</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Leave empty to export all. Select specific items to filter.
          </p>

          <CheckboxGroup
            label="Wallets"
            options={wallets.map((w) => ({ value: w.id, label: w.name }))}
            selected={selectedWalletIds}
            onChange={setSelectedWalletIds}
          />

          <CheckboxGroup
            label="Accounts"
            options={filteredAccounts.map((a) => ({
              value: a.id,
              label: `${a.wallet} - ${a.currency}`,
            }))}
            selected={selectedAccountIds}
            onChange={setSelectedAccountIds}
          />

          <CheckboxGroup
            label="Tags"
            options={tags.map((t) => ({ value: t.id, label: t.name }))}
            selected={selectedTagIds}
            onChange={setSelectedTagIds}
          />

          <CheckboxGroup
            label="Counterparties"
            options={counterparties.map((c) => ({ value: c.id, label: c.name }))}
            selected={selectedCounterpartyIds}
            onChange={setSelectedCounterpartyIds}
          />
        </Card>

        <Button onClick={handleExportClick} disabled={exporting} className="w-full">
          {exporting ? 'Exporting...' : 'Export to CSV'}
        </Button>

        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          <p>Leave dates and filters empty to export all transactions</p>
        </div>
      </div>

      <PinPromptModal
        isOpen={showPin}
        onClose={() => setShowPin(false)}
        onSubmit={handlePinSubmit}
        title="Confirm Export"
        description="Enter your PIN to export transactions."
      />
    </div>
  )
}
