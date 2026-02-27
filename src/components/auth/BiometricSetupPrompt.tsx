import { useState } from 'react'
import { Button, Card, Spinner } from '../ui'

interface Props {
  onEnable: () => Promise<void>
  onSkip: () => void
}

export function BiometricSetupPrompt({ onEnable, onSkip }: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEnable = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await onEnable()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable biometrics. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-1.657-1.343-3-3-3S6 9.343 6 11c0 1.104.476 2.095 1.232 2.77M12 11c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.104-.476 2.095-1.232 2.77M12 11v6m0 0c-2.21 0-4-1.343-4-3m4 3c2.21 0 4-1.343 4-3" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Enable Biometric Unlock?
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Use Face ID, Touch ID, or your device PIN to unlock GrossBuh without entering your PIN each time.
          </p>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-2">
                <Spinner size="sm" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Setting up biometrics...
                </span>
              </div>
            ) : (
              <Button onClick={handleEnable} className="w-full">
                Enable Biometrics
              </Button>
            )}

            {error && (
              <p className="text-sm text-center text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            {!isLoading && (
              <button
                onClick={onSkip}
                className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Skip for now
              </button>
            )}
          </div>
        </Card>

        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          You can enable this later in Settings → Change PIN
        </p>
      </div>
    </div>
  )
}
