import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { InputHTMLAttributes } from 'react'
import { evaluateExpression, isExpression } from '../../utils/mathExpression'

export interface AmountInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value?: string
  onChange?: (value: string) => void
  /** When true, zero and negative results are considered invalid */
  isPositive?: boolean
  placeholder?: string
  label?: string
  /** External validation error supplied by the parent form */
  error?: string
  className?: string
  /** Number of decimal places for the currency. Controls minimum fraction digits in display formatting. Defaults to 2. */
  decimalPlaces?: number
}

function formatDisplayValue(value: string, decimalPlaces: number): string {
  const trimmed = value.trim()
  if (!trimmed || isExpression(trimmed)) return value
  const num = Number(trimmed)
  if (!isFinite(num)) return value
  const dotIndex = trimmed.indexOf('.')
  const actualFractionDigits = dotIndex >= 0 ? trimmed.length - dotIndex - 1 : 0
  const minFractionDigits = decimalPlaces === 0 ? 0 : 2
  const maxFractionDigits = Math.max(actualFractionDigits, minFractionDigits)
  return num.toLocaleString(undefined, {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  })
}

/**
 * Returns true when the value should be treated as "field omitted" for a non-required field.
 * Only applies to empty strings and plain numeric zero (e.g. "", "0", "0.00").
 * Expressions (e.g. "5-5") are never treated as omitted.
 */
function isOmitted(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') return true
  if (isExpression(trimmed)) return false
  const num = Number(trimmed)
  return !isNaN(num) && num === 0
}

function getValidity(
  value: string,
  isPositive: boolean | undefined,
  required: boolean | undefined,
): string {
  // For non-required fields, treat empty or plain zero as "omitted" — skip all validation
  if (!required && isOmitted(value)) return ''

  if (!isExpression(value)) {
    const trimmed = value.trim()
    const num = Number(trimmed)
    if (trimmed !== '' && isNaN(num)) return 'Invalid number'
    if (isPositive && trimmed !== '' && num <= 0) return 'Value must be positive'
    return ''
  }
  const result = evaluateExpression(value)
  if (result === null) return 'Invalid expression'
  if (isPositive && result <= 0) return 'Value must be positive'
  return ''
}

export function AmountInput({
  value = '',
  onChange,
  isPositive,
  placeholder,
  label,
  error,
  className = '',
  id,
  required,
  decimalPlaces = 2,
  ...props
}: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  // Derived values — no state needed
  const internalError = getValidity(value, isPositive, required)
  const expressionResult = isExpression(value) ? evaluateExpression(value) : null
  const showPreview =
    isFocused && expressionResult !== null && !(isPositive && expressionResult <= 0)
  const isValidNumber =
    !isFocused && !isExpression(value) && value.trim() !== '' && isFinite(Number(value.trim()))
  const useTextType = isFocused || value.trim() !== ''

  // Keep custom validity in sync with value
  useEffect(() => {
    if (!inputRef.current) return
    inputRef.current.setCustomValidity(internalError)
  }, [internalError])

  // Keep stable refs so the form submit listener closure doesn't go stale
  const onChangeRef = useRef(onChange)
  const valueRef = useRef(value)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
    valueRef.current = value
  })

  useEffect(() => {
    const form = inputRef.current?.closest('form')
    if (!form) return

    const handler = (e: Event) => {
      // Use the prop value via ref — inputRef.current.value may be sanitized to ""
      // by the browser when type="number" and the value is a non-numeric expression
      const v = valueRef.current
      if (!isExpression(v)) return

      const result = evaluateExpression(v)
      const positiveViolation = isPositive && result !== null && result <= 0

      if (result === null || positiveViolation) {
        e.preventDefault()
        const msg = result === null ? 'Invalid expression' : 'Value must be positive'
        if (inputRef.current) {
          inputRef.current.setCustomValidity(msg)
          inputRef.current.reportValidity()
        }
      } else {
        flushSync(() => {
          onChangeRef.current?.(result.toString())
        })
        if (inputRef.current) {
          inputRef.current.setCustomValidity('')
        }
      }
    }

    form.addEventListener('submit', handler)
    return () => form.removeEventListener('submit', handler)
  }, [isPositive, required])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e.target.value)
    },
    [onChange],
  )

  const handleResultClick = useCallback(() => {
    if (expressionResult === null) return
    flushSync(() => {
      onChangeRef.current?.(expressionResult.toString())
    })
    if (inputRef.current) {
      inputRef.current.setCustomValidity('')
      inputRef.current.focus()
    }
  }, [expressionResult])

  const displayError = error || internalError

  return (
    <div className="space-y-1">
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
          type={useTextType ? 'text' : 'number'}
          pattern="[0-9()+\-*/,. ]*"
          value={isValidNumber ? formatDisplayValue(value, decimalPlaces) : value}
          onChange={handleChange}
          placeholder={placeholder}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          required={required}
          className={`focus:outline-none ${className}`}
          {...props}
        />
        {showPreview && (
          <div
            className="absolute top-full left-0 z-10 mt-1 px-3 py-1.5 rounded-lg shadow-md
              bg-white dark:bg-gray-800
              border border-gray-200 dark:border-gray-600
              text-sm text-gray-700 dark:text-gray-200
              cursor-pointer select-none"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleResultClick}
            data-testid="amount-expression-result"
          >
            = {new Intl.NumberFormat().format(expressionResult!)}
          </div>
        )}
      </div>
      {displayError && (
        <p className="text-sm text-red-600 dark:text-red-400">{displayError}</p>
      )}
    </div>
  )
}
