import { transactionRepository } from '../repositories'
import type { Transaction } from '../../types'

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function formatDate(dateTime: string): string {
  return dateTime.slice(0, 10)
}

function formatTime(dateTime: string): string {
  return dateTime.slice(11, 16)
}

export async function exportTransactionsToCSV(startDate?: string, endDate?: string): Promise<string> {
  const transactions = await transactionRepository.findAllForExport(startDate, endDate)

  const headers = [
    'Date',
    'Time',
    'Type',
    'Amount',
    'Currency',
    'Account',
    'Category',
    'Counterparty',
    'Notes',
    'To Account',
    'To Amount',
    'To Currency',
    'Exchange Rate',
  ]

  const rows = transactions.map((t: Transaction) => [
    escapeCsvField(formatDate(t.date_time)),
    escapeCsvField(formatTime(t.date_time)),
    escapeCsvField(t.type),
    escapeCsvField(t.amount),
    escapeCsvField(t.currency_code),
    escapeCsvField(t.account_name),
    escapeCsvField(t.category_name),
    escapeCsvField(t.counterparty_name),
    escapeCsvField(t.notes),
    escapeCsvField(t.to_account_name),
    escapeCsvField(t.to_amount),
    escapeCsvField(t.to_currency_code),
    escapeCsvField(t.exchange_rate),
  ])

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}
