import type { SetStateAction } from 'react'
import type { RecurringSchedule, RecurringUntilPolicy } from '../../types'

interface RecurrenceOptionsFieldsProps {
  schedule: RecurringSchedule
  until: RecurringUntilPolicy
  today: string
  onScheduleChange: (schedule: SetStateAction<RecurringSchedule>) => void
  onUntilChange: (until: RecurringUntilPolicy) => void
}

const frequencyOptions: Array<{ value: RecurringSchedule['frequency']; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'yearly', label: 'Yearly' },
]

const weekDays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
]

const monthNames = [
  { value: 1, label: 'Jan' },
  { value: 2, label: 'Feb' },
  { value: 3, label: 'Mar' },
  { value: 4, label: 'Apr' },
  { value: 5, label: 'May' },
  { value: 6, label: 'Jun' },
  { value: 7, label: 'Jul' },
  { value: 8, label: 'Aug' },
  { value: 9, label: 'Sep' },
  { value: 10, label: 'Oct' },
  { value: 11, label: 'Nov' },
  { value: 12, label: 'Dec' },
]

const monthDays = Array.from({ length: 31 }, (_, index) => index + 1)

const optionButtonClass = (active: boolean) => `rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${active
  ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
}`

const compactOptionButtonClass = (active: boolean) => `rounded-lg border py-2 text-sm font-medium transition-colors ${active
  ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
}`

export function RecurrenceOptionsFields({
  schedule,
  until,
  today,
  onScheduleChange,
  onUntilChange,
}: RecurrenceOptionsFieldsProps) {
  const setFrequency = (frequency: RecurringSchedule['frequency']) => {
    onScheduleChange(prev => ({
      frequency,
      interval: prev.interval,
      weekdays: frequency === 'weekly' ? prev.weekdays : undefined,
      monthDays: frequency === 'monthly' || frequency === 'yearly' ? prev.monthDays : undefined,
      months: frequency === 'yearly' ? prev.months : undefined,
    }))
  }

  const toggleScheduleValue = (field: 'weekdays' | 'monthDays' | 'months', value: number) => {
    onScheduleChange(prev => {
      const current = prev[field] ?? []
      const next = current.includes(value)
        ? current.filter(item => item !== value)
        : [...current, value].sort((a, b) => a - b)
      return { ...prev, [field]: next.length > 0 ? next : undefined }
    })
  }

  const intervalUnit = schedule.frequency === 'daily'
    ? 'day'
    : schedule.frequency === 'weekly'
      ? 'week'
      : schedule.frequency === 'monthly'
        ? 'month'
        : 'year'

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {frequencyOptions.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFrequency(option.value)}
            className={optionButtonClass(schedule.frequency === option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium">Every</span>
          <input
            aria-label="Repeat interval"
            type="number"
            min="1"
            value={schedule.interval}
            onChange={(event) => onScheduleChange(prev => ({ ...prev, interval: Math.max(1, parseInt(event.target.value) || 1) }))}
            className="w-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-center dark:border-gray-600 dark:bg-gray-800"
          />
          <span>{intervalUnit}{schedule.interval === 1 ? '' : 's'}</span>
        </div>

        {schedule.frequency === 'yearly' && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {monthNames.map(month => (
              <button
                key={month.value}
                type="button"
                onClick={() => toggleScheduleValue('months', month.value)}
                className={compactOptionButtonClass(schedule.months?.includes(month.value) ?? false)}
              >
                {month.label}
              </button>
            ))}
          </div>
        )}

        {schedule.frequency === 'weekly' && (
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(day => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleScheduleValue('weekdays', day.value)}
                className={compactOptionButtonClass(schedule.weekdays?.includes(day.value) ?? false)}
              >
                {day.label}
              </button>
            ))}
          </div>
        )}

        {(schedule.frequency === 'monthly' || schedule.frequency === 'yearly') && (
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map(day => (
              <button
                key={day}
                type="button"
                onClick={() => toggleScheduleValue('monthDays', day)}
                className={compactOptionButtonClass(schedule.monthDays?.includes(day) ?? false)}
              >
                {day}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
          <span className="w-20 font-medium">Until</span>
          <select
            value={until.type}
            onChange={(event) => onUntilChange({ type: event.target.value as RecurringUntilPolicy['type'] })}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
          >
            <option value="never">Never</option>
            <option value="date">Date</option>
            <option value="count">Repetitions</option>
          </select>
        </label>
        {until.type === 'date' && (
          <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
            <span className="w-20 font-medium">Date</span>
            <input
              type="date"
              value={until.date ?? today}
              onChange={(event) => onUntilChange({ type: 'date', date: event.target.value })}
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800"
            />
          </label>
        )}
        {until.type === 'count' && (
          <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">Stop after</span>
            <input
              type="number"
              min="1"
              value={until.count ?? 1}
              onChange={(event) => onUntilChange({ type: 'count', count: Math.max(1, parseInt(event.target.value) || 1) })}
              className="w-20 rounded-lg border border-gray-300 bg-white px-3 py-2 text-center dark:border-gray-600 dark:bg-gray-800"
            />
            <span>repetitions</span>
          </label>
        )}
      </div>
    </>
  )
}
