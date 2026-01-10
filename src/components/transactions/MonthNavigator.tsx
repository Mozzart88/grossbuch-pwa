import { formatMonth, getPreviousMonth, getNextMonth, getCurrentMonth } from '../../utils/dateUtils'

interface MonthNavigatorProps {
  month: string
  onChange: (month: string) => void
}

export function MonthNavigator({ month, onChange }: MonthNavigatorProps) {
  const isCurrentMonth = month === getCurrentMonth()

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <button
        onClick={() => onChange(getPreviousMonth(month))}
        className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        onClick={() => onChange(getCurrentMonth())}
        className="text-lg font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400"
      >
        {formatMonth(month)}
      </button>

      <button
        onClick={() => onChange(getNextMonth(month))}
        className={`p-2 ${isCurrentMonth ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'}`}
        disabled={isCurrentMonth}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}
