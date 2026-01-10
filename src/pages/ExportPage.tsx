import { useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Input, Card, useToast } from '../components/ui'
import { exportTransactionsToCSV, downloadCSV } from '../services/export/csvExport'

export function ExportPage() {
  const { showToast } = useToast()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const csv = await exportTransactionsToCSV(
        startDate || undefined,
        endDate || undefined
      )

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

          <Input
            label="Start Date (optional)"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />

          <Input
            label="End Date (optional)"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />

          <Button onClick={handleExport} disabled={exporting} className="w-full">
            {exporting ? 'Exporting...' : 'Export to CSV'}
          </Button>
        </Card>

        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          <p>Leave dates empty to export all transactions</p>
        </div>
      </div>
    </div>
  )
}
