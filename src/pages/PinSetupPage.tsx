import { useState } from 'react'
import { Button, Card, Input, Spinner } from '../components/ui'
import { PinInput } from '../components/auth'
import { useAuth } from '../store/AuthContext'
import { AUTH_STORAGE_KEYS } from '../types/auth'

const MIN_PIN_LENGTH = 6

export function PinSetupPage() {
  const [step, setStep] = useState<'create' | 'confirm'>('create')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showShareInput, setShowShareInput] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [shareError, setShareError] = useState('')
  const [shareSaved, setShareSaved] = useState(false)
  const { setupPin, error: authError } = useAuth()

  const handleShareSubmit = () => {
    let uuid: string | null = null
    let pub: string | null = null
    try {
      const url = new URL(shareLink)
      if (url.pathname !== '/share') {
        setShareError('Please enter a valid share link containing /share?uuid=...')
        return
      }
      uuid = url.searchParams.get('uuid')
      if (!uuid) {
        setShareError('Please enter a valid share link containing /share?uuid=...')
        return
      }
      pub = url.searchParams.get('pub')
    } catch {
      setShareError('Please enter a valid share link containing /share?uuid=...')
      return
    }

    localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_UUID, uuid)
    if (pub) {
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY, pub)
    }
    setShareError('')
    setShareSaved(true)
  }

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
      const success = await setupPin(pin)
      if (!success) {
        setError(authError || 'Failed to setup PIN')
        setStep('create')
        setPin('')
        setConfirmPin('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup PIN')
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
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            GrossBuch
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Personal Expense Tracker
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
                  Your PIN encrypts all your financial data
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

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>Important:</strong> Your PIN cannot be recovered. If you forget it, you'll need to delete all data and start over.
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
                    Setting up encrypted database...
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
                    Create PIN
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setShowShareInput(!showShareInput)}
            className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            Have a share link?
          </button>

          {showShareInput && !shareSaved && (
            <div className="mt-3 space-y-2">
              <Input
                placeholder="Paste share link here"
                value={shareLink}
                onChange={(e) => {
                  setShareLink(e.target.value)
                  setShareError('')
                }}
                error={shareError}
              />
              <Button onClick={handleShareSubmit} className="w-full">
                Go
              </Button>
            </div>
          )}

          {shareSaved && (
            <p className="mt-3 text-sm text-green-600 dark:text-green-400">
              Share link saved. Continue with PIN setup above.
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          All data is stored locally and encrypted on your device
        </p>
      </div>
    </div>
  )
}
