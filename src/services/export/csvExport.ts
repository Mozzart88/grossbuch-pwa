import { transactionRepository } from '../repositories'
import type { TransactionLog } from '../../types'

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

export async function exportTransactionsToCSV(
  startDate?: string,
  endDate?: string,
  decimalPlaces: number = 2
): Promise<string> {
  // Convert date strings to unix timestamps if provided
  const startTs = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : undefined
  const endTs = endDate ? Math.floor(new Date(endDate + 'T23:59:59').getTime() / 1000) : undefined

  const transactions = await transactionRepository.findAllForExport(startTs, endTs)

  const headers = [
    'Date',
    'Time',
    'Wallet',
    'Currency',
    'Tags',
    'Real Amount',
    'Actual Amount',
    'Counterparty',
  ]

  const divisor = Math.pow(10, decimalPlaces)

  const rows = transactions.map((t: TransactionLog) => [
    escapeCsvField(formatDate(t.created_at)),
    escapeCsvField(formatTime(t.created_at)),
    escapeCsvField(t.wallet),
    escapeCsvField(t.currency),
    escapeCsvField(t.tags),
    escapeCsvField((t.real_amount / divisor).toFixed(decimalPlaces)),
    escapeCsvField((t.actual_amount / divisor).toFixed(decimalPlaces)),
    escapeCsvField(t.counterparty),
  ])

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
  downloadFile(blob, filename)
}

// TODO: move to separate file
export function downloadFile(data: File | Blob, filename: string): void {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(data)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

// TODO: move to separate file
export async function uploadFile(file: File) {
  const root = await navigator.storage.getDirectory()
  const opfsFH = await root.getFileHandle(file.name, { create: true })
  const writable = await opfsFH.createWritable()
  await writable.write(await file.arrayBuffer())
  await writable.close()
}
