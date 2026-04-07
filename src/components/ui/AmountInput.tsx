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
}

function getValidity(value: string, isPositive: boolean | undefined): string {
  if (!isExpression(value)) {
    const num = Number(value.trim())
    if (value.trim() !== '' && isNaN(num)) return 'Invalid number'
    if (isPositive && value.trim() !== '' && num <= 0) return 'Value must be positive'
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
  ...props
}: AmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  // Derived values — no state needed
  const internalError = getValidity(value, isPositive)
  const expressionResult = isExpression(value) ? evaluateExpression(value) : null
  const showPreview =
    isFocused && expressionResult !== null && !(isPositive && expressionResult <= 0)

  // Keep custom validity in sync with value
  useEffect(() => {
    if (!inputRef.current) return
    inputRef.current.setCustomValidity(internalError)
  }, [internalError])

  // Keep a stable ref to onChange so the form submit listener doesn't need to re-register
  const onChangeRef = useRef(onChange)
  useLayoutEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const form = inputRef.current?.closest('form')
    if (!form) return

    const handler = (e: Event) => {
      const v = inputRef.current?.value ?? ''
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
  }, [isPositive])

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
          type="text"
          inputMode="numeric"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
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
            = {expressionResult}
          </div>
        )}
      </div>
      {displayError && (
        <p className="text-sm text-red-600 dark:text-red-400">{displayError}</p>
      )}
    </div>
  )
}
