import { Modal, Button } from '../ui'

interface FailedAttemptsModalProps {
  isOpen: boolean
  onClose: () => void
  failedAttempts: number
}

export function FailedAttemptsModal({ isOpen, onClose, failedAttempts }: FailedAttemptsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Too Many Failed Attempts">
      <div className="space-y-4">
        <div className="flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {failedAttempts} Failed Attempts
          </h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            You've entered the wrong PIN multiple times.
          </p>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            <strong>Security Notice:</strong> In a future version, repeated failed attempts may result in automatic data deletion to protect your information from unauthorized access.
          </p>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
          Please try to remember your PIN. If you've forgotten it, you can use the "Forgot PIN" option, but this will delete all your data.
        </p>

        <Button onClick={onClose} className="w-full">
          I Understand
        </Button>
      </div>
    </Modal>
  )
}
