import { useState } from 'react'
import { Modal, Button } from '../ui'

interface WipeConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
}

export function WipeConfirmModal({ isOpen, onClose, onConfirm }: WipeConfirmModalProps) {
  const [isWiping, setIsWiping] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const handleConfirm = async () => {
    if (confirmText !== 'DELETE') return

    setIsWiping(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      console.error('Wipe failed:', error)
    } finally {
      setIsWiping(false)
      setConfirmText('')
    }
  }

  const handleClose = () => {
    if (!isWiping) {
      setConfirmText('')
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Forgot PIN?">
      <div className="space-y-4">
        <div className="flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>

        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            This will delete ALL your data
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Since your data is encrypted with your PIN, there is no way to recover it without the correct PIN.
          </p>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-200 font-medium">
            The following will be permanently deleted:
          </p>
          <ul className="mt-2 text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
            <li>All transactions</li>
            <li>All accounts and wallets</li>
            <li>All categories and tags</li>
            <li>All counterparties</li>
            <li>All budgets</li>
            <li>All settings</li>
          </ul>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Type <span className="font-mono font-bold">DELETE</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder="DELETE"
            disabled={isWiping}
            className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50"
          />
        </div>

        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isWiping}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={confirmText !== 'DELETE' || isWiping}
            className="flex-1"
          >
            {isWiping ? 'Deleting...' : 'Delete All Data'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
