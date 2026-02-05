import { useState, useEffect } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { Input } from './Input'

interface TextInputModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (value: string) => Promise<void>
  title: string
  label: string
  initialValue?: string
  submitLabel?: string
  placeholder?: string
}

// Validate filename: non-empty, no path separators or special chars
function isValidFilename(name: string): boolean {
  if (!name.trim()) return false
  // Disallow path separators and common invalid characters
  const invalidChars = /[/\\:*?"<>|]/
  return !invalidChars.test(name)
}

export function TextInputModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  label,
  initialValue = '',
  submitLabel = 'Save',
  placeholder
}: TextInputModalProps) {
  const [value, setValue] = useState(initialValue)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset value when modal opens with new initial value
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue)
      setError(null)
    }
  }, [isOpen, initialValue])

  const handleSubmit = async () => {
    if (!isValidFilename(value)) {
      setError('Invalid filename')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await onSubmit(value.trim())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValidFilename(value)) {
      handleSubmit()
    }
  }

  const handleClose = () => {
    setValue('')
    setError(null)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="space-y-4">
        <Input
          label={label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          error={error || undefined}
          disabled={isLoading}
          placeholder={placeholder}
          autoFocus
        />

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={handleSubmit}
            disabled={!isValidFilename(value) || isLoading}
          >
            {isLoading ? 'Processing...' : submitLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
