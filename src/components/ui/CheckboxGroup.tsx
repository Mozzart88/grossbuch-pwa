import { useState } from 'react'

interface CheckboxGroupProps {
  label: string
  options: { value: number; label: string }[]
  selected: number[]
  onChange: (selected: number[]) => void
}

export function CheckboxGroup({ label, options, selected, onChange }: CheckboxGroupProps) {
  const [isOpen, setIsOpen] = useState(false)

  const allSelected = options.length > 0 && selected.length === options.length
  const noneSelected = selected.length === 0

  const toggleAll = () => {
    if (allSelected || noneSelected) {
      onChange(allSelected ? [] : options.map((o) => o.value))
    } else {
      onChange(options.map((o) => o.value))
    }
  }

  const toggle = (value: number) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 text-sm font-medium text-gray-900 dark:text-gray-100"
      >
        <span>{label}</span>
        <span className="flex items-center gap-2">
          {selected.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300">
              {selected.length} selected
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="mt-1 space-y-1">
          <button
            type="button"
            onClick={toggleAll}
            className="text-xs text-primary-600 dark:text-primary-400 hover:underline mb-1"
          >
            {allSelected ? 'Clear' : 'Select All'}
          </button>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => toggle(option.value)}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
