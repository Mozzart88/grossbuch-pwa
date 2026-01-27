import { useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'

interface PinInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  label?: string
  error?: string
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  minLength?: number
  showToggle?: boolean
}

export function PinInput({
  label,
  error,
  value,
  onChange,
  onSubmit,
  minLength = 6,
  showToggle = true,
  className = '',
  id,
  ...props
}: PinInputProps) {
  const [showPin, setShowPin] = useState(false)
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-') || 'pin-input'

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow alphanumeric characters only
    const newValue = e.target.value.replace(/[^a-zA-Z0-9]/g, '')
    onChange(newValue)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSubmit && value.length >= minLength) {
      onSubmit()
    }
  }

  const isValid = value.length >= minLength

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
          id={inputId}
          type={showPin ? 'text' : 'password'}
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={`
            w-full px-3 py-3 rounded-lg border text-lg tracking-widest
            bg-white dark:bg-gray-800
            text-gray-900 dark:text-gray-100
            border-gray-300 dark:border-gray-600
            placeholder-gray-400 dark:placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
            disabled:bg-gray-100 disabled:dark:bg-gray-900 disabled:cursor-not-allowed
            ${error ? 'border-red-500 focus:ring-red-500' : ''}
            ${showToggle ? 'pr-12' : ''}
            ${className}
          `}
          {...props}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShowPin(!showPin)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
            tabIndex={-1}
          >
            {showPin ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        )}
      </div>
      <div className="flex justify-between items-center">
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {value.length < minLength
              ? `${minLength - value.length} more characters needed`
              : 'PIN is valid'}
          </p>
        )}
        {!error && (
          <p className={`text-xs ${isValid ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
            {value.length}/{minLength}+
          </p>
        )}
      </div>
    </div>
  )
}
