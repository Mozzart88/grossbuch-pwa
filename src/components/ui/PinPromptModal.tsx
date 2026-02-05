import { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { PinInput } from '../auth/PinInput'

interface PinPromptModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (pin: string) => Promise<void>
  title: string
  description?: string
}

export function PinPromptModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  description
}: PinPromptModalProps) {
  const [pin, setPin] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (pin.length < 6) return

    setIsLoading(true)
    setError(null)

    try {
      await onSubmit(pin)
      // Reset state on success
      setPin('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid PIN')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setPin('')
    setError(null)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="space-y-4">
        {description && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {description}
          </p>
        )}

        <PinInput
          label="Enter PIN"
          value={pin}
          onChange={setPin}
          onSubmit={handleSubmit}
          error={error || undefined}
          disabled={isLoading}
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
            disabled={pin.length < 6 || isLoading}
          >
            {isLoading ? 'Processing...' : 'Confirm'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
