export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function getPreviousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function getNextMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m - 1, 1)
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
}

export function formatDate(date: string | Date): string {
  if (typeof date === 'string') {
    // DB format: "2025-01-09 14:30:00" - parse date parts directly
    const [year, month, day] = date.slice(0, 10).split('-').map(Number)
    const d = new Date(year, month - 1, day)
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatTime(date: string | Date): string {
  if (typeof date === 'string') {
    // DB format: "2025-01-09 14:30:00" - extract time directly
    return date.slice(11, 16)
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTime(date: string | Date): string {
  return `${formatDate(date)} ${formatTime(date)}`
}

export function toLocalDateTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export function toDateTimeLocal(date: Date | string): string {
  if (typeof date === 'string') {
    // DB format: "2025-01-09 14:30:00" → datetime-local: "2025-01-09T14:30"
    return date.slice(0, 16).replace(' ', 'T')
  }
  // For Date objects (like new Date()), format as local time
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function fromDateTimeLocal(value: string): string {
  // datetime-local format: "2025-01-09T14:30"
  // Store as: "2025-01-09 14:30:00" (local time, no conversion)
  return value.replace('T', ' ') + ':00'
}

export function groupByDate<T extends { date_time: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()

  for (const item of items) {
    const dateKey = item.date_time.slice(0, 10)
    const group = groups.get(dateKey) || []
    group.push(item)
    groups.set(dateKey, group)
  }

  return groups
}
