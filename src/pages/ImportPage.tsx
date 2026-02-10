import { useState, useRef } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Spinner, useToast, PinPromptModal } from '../components/ui'
import { importTransactionsFromCSV } from '../services/import/csvImport'
import type { ImportResult } from '../services/import/csvImport'
import { verifyPin } from '../services/auth'

export function ImportPage() {
  const { showToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [rowCount, setRowCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const handleFileSelect = async () => {
    try {
      let selectedFile: File
      if ('showOpenFilePicker' in window) {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }],
        })
        selectedFile = await handle.getFile()
      } else {
        selectedFile = await new Promise<File>((resolve, reject) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.csv'
          input.onchange = () => {
            const f = input.files?.[0]
            if (f) resolve(f)
            else reject('file not selected')
          }
          input.click()
        })
      }

      setFile(selectedFile)
      setResult(null)

      // Count rows for preview
      const text = await selectedFile.text()
      const lines = text.split('\n').filter((l) => l.trim().length > 0)
      setRowCount(Math.max(0, lines.length - 1)) // exclude header
    } catch (error) {
      if (error !== 'file not selected') {
        console.error('Failed to select file:', error)
        showToast('Failed to select file', 'error')
      }
    }
  }

  const handleImportClick = () => {
    if (!file) return
    setShowPin(true)
  }

  const handlePinSubmit = async (pin: string) => {
    await verifyPin(pin)
    setShowPin(false)
    await runImport()
  }

  const runImport = async () => {
    if (!file) return

    setImporting(true)
    setResult(null)
    try {
      const text = await file.text()
      const importResult = await importTransactionsFromCSV(text)
      setResult(importResult)

      if (importResult.errors.length === 0) {
        showToast(`Imported ${importResult.importedRows} rows`, 'success')
      } else {
        showToast(`Imported ${importResult.importedRows} rows with ${importResult.errors.length} errors`, 'error')
      }
    } catch (error) {
      console.error('Failed to import:', error)
      showToast('Failed to import transactions', 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Import Data" showBack />

      <div className="p-4 space-y-4">
        <Card className="p-4 space-y-4">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1">Import Transactions</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Import transactions from a CSV file exported by this app. Duplicate transactions will be skipped automatically.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setFile(f)
                setResult(null)
                f.text().then((text) => {
                  const lines = text.split('\n').filter((l) => l.trim().length > 0)
                  setRowCount(Math.max(0, lines.length - 1))
                })
              }
            }}
          />

          <Button onClick={handleFileSelect} variant="secondary" className="w-full">
            Select CSV File
          </Button>

          {file && (
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {file.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {rowCount} data rows
              </p>
            </div>
          )}

          <Button
            onClick={handleImportClick}
            disabled={!file || importing}
            className="w-full"
          >
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </Card>

        {importing && (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        )}

        {result && (
          <Card className="p-4 space-y-3">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">Import Results</h3>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Total rows:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{result.totalRows}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Imported:</span>
                <span className="font-medium text-green-600 dark:text-green-400">{result.importedRows}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Skipped (duplicates):</span>
                <span className="font-medium text-yellow-600 dark:text-yellow-400">{result.skippedDuplicates}</span>
              </div>
            </div>

            {(result.createdWallets.length > 0 ||
              result.createdAccounts.length > 0 ||
              result.createdTags.length > 0 ||
              result.createdCounterparties.length > 0) && (
              <div className="border-t border-gray-200 dark:border-gray-600 pt-3 space-y-2">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Auto-created:</p>
                {result.createdWallets.length > 0 && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Wallets: {result.createdWallets.join(', ')}
                  </p>
                )}
                {result.createdAccounts.length > 0 && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Accounts: {result.createdAccounts.join(', ')}
                  </p>
                )}
                {result.createdTags.length > 0 && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Tags: {result.createdTags.join(', ')}
                  </p>
                )}
                {result.createdCounterparties.length > 0 && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Counterparties: {result.createdCounterparties.join(', ')}
                  </p>
                )}
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
                <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                  Errors ({result.errors.length}):
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400">
                      Row {err.row}: {err.message}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      <PinPromptModal
        isOpen={showPin}
        onClose={() => setShowPin(false)}
        onSubmit={handlePinSubmit}
        title="Confirm Import"
        description="Enter your PIN to import transactions."
      />
    </div>
  )
}
