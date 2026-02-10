import { transactionRepository } from '../repositories'
import { blobToHex } from '../../utils/blobUtils'

export interface ExportFilters {
  startDate?: string
  endDate?: string
  walletIds?: number[]
  accountIds?: number[]
  tagIds?: number[]
  counterpartyIds?: number[]
}

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function exportTransactionsToCSV(filters: ExportFilters = {}): Promise<string> {
  const rows = await transactionRepository.findAllForExportDetailed(filters)

  const headers = [
    'date_time',
    'trx_id',
    'account_id',
    'wallet',
    'currency_code',
    'tag_id',
    'tag',
    'amount',
    'rate',
    'counterparty_id',
    'counterparty',
    'note',
  ]

  const csvRows = rows.map((r) => {
    const divisor = Math.pow(10, r.decimal_places)
    const signedAmount = (r.sign === '-' ? '-' : '') + (r.amount / divisor).toFixed(r.decimal_places)

    return [
      escapeCsvField(r.date_time),
      escapeCsvField(blobToHex(r.trx_id)),
      escapeCsvField(r.account_id),
      escapeCsvField(r.wallet_name),
      escapeCsvField(r.currency_code),
      escapeCsvField(r.tag_id),
      escapeCsvField(r.tag_name),
      escapeCsvField(signedAmount),
      escapeCsvField(r.rate),
      escapeCsvField(r.counterparty_id),
      escapeCsvField(r.counterparty_name),
      escapeCsvField(r.note),
    ].join(',')
  })

  return [headers.join(','), ...csvRows].join('\n')
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
