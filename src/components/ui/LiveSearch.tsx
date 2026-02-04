import { useState, useRef, useEffect, useCallback } from 'react'

export interface LiveSearchOption {
  value: string | number
  label: string
}

interface LiveSearchProps {
  label?: string
  error?: string
  options: LiveSearchOption[]
  value: string | number
  onChange: (value: string | number, label: string) => void
  onCreateNew?: (inputValue: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  inputClassName?: string
  dropdownClassName?: string
  renderOption?: (option: LiveSearchOption) => React.ReactNode
  /** Function to get display value for input (defaults to label) */
  getDisplayValue?: (option: LiveSearchOption) => string
}

export function LiveSearch({
  label,
  error,
  options,
  value,
  onChange,
  onCreateNew,
  placeholder,
  disabled,
  className = '',
  inputClassName = '',
  dropdownClassName = '',
  renderOption,
  getDisplayValue,
}: LiveSearchProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const inputId = label?.toLowerCase().replace(/\s+/g, '-')

  // Get the currently selected option
  const selectedOption = value ? options.find(opt => String(opt.value) === String(value)) : null

  // Get display value for the selected option
  const selectedDisplayValue = selectedOption
    ? (getDisplayValue ? getDisplayValue(selectedOption) : selectedOption.label)
    : ''

  // Sync input value with selected option
  // Use string comparison to handle mixed number/string values
  useEffect(() => {
    if (value) {
      const opt = options.find(o => String(o.value) === String(value))
      if (opt) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing controlled input from props is valid
        setInputValue(getDisplayValue ? getDisplayValue(opt) : opt.label)
      }
    } else {
      setInputValue('')
    }
  }, [value, options, getDisplayValue])

  // Filter options based on input
  // If input matches the selected display value, show all options (user just focused)
  const isShowingSelectedValue = inputValue === selectedDisplayValue && !!selectedOption
  const filteredOptions = inputValue.trim() && !isShowingSelectedValue
    ? options.filter(opt =>
        opt.label.toLowerCase().includes(inputValue.toLowerCase())
      )
    : options

  // Check if input exactly matches any option
  const exactMatch = options.find(
    opt => opt.label.toLowerCase() === inputValue.trim().toLowerCase()
  )

  // Show "create new" option when there's input, no exact match, and onCreateNew is provided
  const showCreateNew = onCreateNew && inputValue.trim() && !exactMatch

  // Reset highlighted index when filtered options change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived state is valid
    setHighlightedIndex(0)
  }, [filteredOptions.length, showCreateNew])

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement
      if (highlighted?.scrollIntoView) {
        highlighted.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  const commitValue = useCallback(() => {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput) {
      // Clear selection
      onChange('', '')
      return
    }

    // Check for exact match
    const match = options.find(
      opt => opt.label.toLowerCase() === trimmedInput.toLowerCase()
    )

    if (match) {
      onChange(match.value, match.label)
      setInputValue(getDisplayValue ? getDisplayValue(match) : match.label)
    } else if (onCreateNew) {
      // Create new
      onCreateNew(trimmedInput)
    }
  }, [inputValue, options, onChange, onCreateNew, getDisplayValue])

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        commitValue()
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, inputValue, filteredOptions, exactMatch, commitValue])

  const handleSelectOption = (option: LiveSearchOption) => {
    onChange(option.value, option.label)
    setInputValue(getDisplayValue ? getDisplayValue(option) : option.label)
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleCreateNew = () => {
    if (onCreateNew && inputValue.trim()) {
      onCreateNew(inputValue.trim())
      setIsOpen(false)
      inputRef.current?.blur()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalOptions = filteredOptions.length + (showCreateNew ? 1 : 0)

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
        } else {
          setHighlightedIndex(prev => (prev + 1) % totalOptions)
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (isOpen) {
          setHighlightedIndex(prev => (prev - 1 + totalOptions) % totalOptions)
        }
        break
      case 'Enter':
        e.preventDefault()
        if (isOpen) {
          if (showCreateNew && highlightedIndex === filteredOptions.length) {
            handleCreateNew()
          } else if (filteredOptions[highlightedIndex]) {
            handleSelectOption(filteredOptions[highlightedIndex])
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        // Restore previous value
        if (value) {
          const opt = options.find(o => String(o.value) === String(value))
          if (opt) {
            setInputValue(getDisplayValue ? getDisplayValue(opt) : opt.label)
          }
        } else {
          setInputValue('')
        }
        inputRef.current?.blur()
        break
      case 'Tab':
        commitValue()
        setIsOpen(false)
        break
    }
  }

  const handleFocus = () => {
    setIsOpen(true)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    if (!isOpen) {
      setIsOpen(true)
    }
  }

  return (
    <div className="space-y-1 relative" ref={containerRef}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={`${inputId}-listbox`}
          aria-activedescendant={isOpen ? `${inputId}-option-${highlightedIndex}` : undefined}
          autoComplete="off"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`
            w-full px-3 py-2 rounded-lg border
            bg-white dark:bg-gray-800
            text-gray-900 dark:text-gray-100
            border-gray-300 dark:border-gray-600
            placeholder-gray-400 dark:placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
            disabled:bg-gray-100 disabled:dark:bg-gray-900 disabled:cursor-not-allowed
            ${error ? 'border-red-500 focus:ring-red-500' : ''}
            ${className}
            ${inputClassName}
          `}
        />

        {/* Dropdown */}
        {isOpen && (filteredOptions.length > 0 || showCreateNew) && (
          <ul
            ref={listRef}
            id={`${inputId}-listbox`}
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
            {filteredOptions.map((option, index) => (
              <li
                key={option.value}
                id={`${inputId}-option-${index}`}
                role="option"
                aria-selected={highlightedIndex === index}
                onClick={() => handleSelectOption(option)}
                className={`
                  px-3 py-2 cursor-pointer whitespace-nowrap
                  ${highlightedIndex === index
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }
                `}
              >
                {renderOption ? renderOption(option) : option.label}
              </li>
            ))}
            {showCreateNew && (
              <li
                id={`${inputId}-option-${filteredOptions.length}`}
                role="option"
                aria-selected={highlightedIndex === filteredOptions.length}
                onClick={handleCreateNew}
                className={`
                  px-3 py-2 cursor-pointer italic
                  ${highlightedIndex === filteredOptions.length
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                    : 'text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }
                `}
              >
                Create "{inputValue.trim()}"
              </li>
            )}
          </ul>
        )}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
