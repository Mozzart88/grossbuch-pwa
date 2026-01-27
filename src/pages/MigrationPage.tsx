import { useState } from 'react'
import { Button, Card, Spinner } from '../components/ui'
import { PinInput } from '../components/auth'
import { useAuth } from '../store/AuthContext'

const MIN_PIN_LENGTH = 6

export function MigrationPage() {
  const [step, setStep] = useState<'create' | 'confirm'>('create')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { migrateDatabase, error: authError } = useAuth()

  const handleCreatePin = () => {
    if (pin.length < MIN_PIN_LENGTH) {
      setError(`PIN must be at least ${MIN_PIN_LENGTH} characters`)
      return
    }
    setError(null)
    setStep('confirm')
  }

  const handleConfirmPin = async () => {
    if (confirmPin !== pin) {
      setError('PINs do not match')
      setConfirmPin('')
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      const success = await migrateDatabase(pin)
      if (!success) {
        setError(authError || 'Failed to migrate database')
        setStep('create')
        setPin('')
        setConfirmPin('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to migrate database')
      setStep('create')
      setPin('')
      setConfirmPin('')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBack = () => {
    setStep('create')
    setConfirmPin('')
    setError(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Secure Your Data
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Your existing data will be encrypted with your new PIN
          </p>
        </div>

        <Card className="p-6">
          {step === 'create' ? (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Create Your PIN
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  This PIN will encrypt all your financial data
                </p>
              </div>

              <PinInput
                label="Enter PIN"
                value={pin}
                onChange={setPin}
                onSubmit={handleCreatePin}
                minLength={MIN_PIN_LENGTH}
                error={error || undefined}
                autoFocus
              />

              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>Upgrade Notice:</strong> Your data will be migrated to an encrypted format. This is a one-time process to secure your financial records.
                </p>
              </div>

              <Button
                onClick={handleCreatePin}
                disabled={pin.length < MIN_PIN_LENGTH}
                className="w-full"
              >
                Continue
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Confirm Your PIN
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Enter your PIN again to confirm
                </p>
              </div>

              <PinInput
                label="Confirm PIN"
                value={confirmPin}
                onChange={setConfirmPin}
                onSubmit={handleConfirmPin}
                minLength={MIN_PIN_LENGTH}
                error={error || undefined}
                autoFocus
              />

              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-2">
                  <Spinner size="sm" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Encrypting your data...
                  </span>
                </div>
              ) : (
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleBack}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleConfirmPin}
                    disabled={confirmPin.length < MIN_PIN_LENGTH}
                    className="flex-1"
                  >
                    Encrypt Data
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          Your data will remain on this device, now protected by encryption
        </p>
      </div>
    </div>
  )
}
