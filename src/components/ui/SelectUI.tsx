import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'

export interface SelectUIOption {
  value: string | number
  label: string
}

interface SelectUIProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string
  error?: string
  options: SelectUIOption[]
  value: string | number
  onChange: (value: string | number, label: string) => void
  placeholder?: string
  className?: string
  triggerClassName?: string
  dropdownClassName?: string
  renderOption?: (option: SelectUIOption) => ReactNode
  getDisplayValue?: (option: SelectUIOption) => string
  renderSelectedBadge?: (option: SelectUIOption) => ReactNode
}

export function SelectUI({
  label,
  error,
  options,
  value,
  onChange,
  placeholder,
  disabled,
  className = '',
  triggerClassName = '',
  dropdownClassName = '',
  renderOption,
  getDisplayValue,
  renderSelectedBadge,
  id,
  ...props
}: SelectUIProps) {
  const [isOpen, setIsOpen] = useState(false)
  const generatedId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-') || generatedId
  const selectedOption = value ? options.find(opt => String(opt.value) === String(value)) : null
  const selectedDisplayValue = selectedOption
    ? (getDisplayValue ? getDisplayValue(selectedOption) : selectedOption.label)
    : ''
  const selectedBadge = selectedOption && renderSelectedBadge
    ? renderSelectedBadge(selectedOption)
    : null

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelectOption = (option: SelectUIOption) => {
    onChange(option.value, option.label)
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="space-y-1 relative" ref={containerRef}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        value={value}
        onChange={(e) => {
          const option = options.find(opt => String(opt.value) === e.target.value)
          onChange(e.target.value, option?.label ?? '')
        }}
        disabled={disabled}
        className="sr-only"
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={`${selectId}-listbox`}
          disabled={disabled}
          onClick={() => setIsOpen(open => !open)}
          className={`
            w-full px-3 py-2 rounded-lg border text-left
            bg-white dark:bg-gray-800
            text-gray-900 dark:text-gray-100
            border-gray-300 dark:border-gray-600
            focus:outline-none
            disabled:bg-gray-100 disabled:dark:bg-gray-900 disabled:cursor-not-allowed
            ${error ? 'border-red-500 focus:ring-red-500' : ''}
            ${selectedBadge ? 'pr-20' : ''}
            ${className}
            ${triggerClassName}
          `}
        >
          <span className={selectedOption ? '' : 'text-gray-400 dark:text-gray-500'}>
            {selectedOption ? selectedDisplayValue : placeholder}
          </span>
        </button>

        {selectedBadge && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            {selectedBadge}
          </span>
        )}

        {isOpen && options.length > 0 && (
          <ul
            id={`${selectId}-listbox`}
            role="listbox"
            className={`
              absolute z-50 mt-1 w-full
              bg-white dark:bg-gray-800
              border border-gray-300 dark:border-gray-600
              rounded-lg shadow-lg
              max-h-60 overflow-y-auto
              ${dropdownClassName}
            `}
          >
            {options.map((option) => (
              <li
                key={option.value}
                role="option"
                aria-selected={String(option.value) === String(value)}
                onClick={() => handleSelectOption(option)}
                className={`
                  px-3 py-2 cursor-pointer whitespace-nowrap
                  ${String(option.value) === String(value)
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }
                `}
              >
                {renderOption ? renderOption(option) : option.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
