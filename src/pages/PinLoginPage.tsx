import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Card, Spinner } from '../components/ui'
import { PinInput, WipeConfirmModal, FailedAttemptsModal } from '../components/auth'
import { useAuth } from '../store/AuthContext'

const MIN_PIN_LENGTH = 6
const FAILED_ATTEMPTS_WARNING_THRESHOLD = 3

export function PinLoginPage() {
  const [pin, setPin] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isBiometricLoading, setIsBiometricLoading] = useState(false)
  const [showWipeModal, setShowWipeModal] = useState(false)
  const [showFailedModal, setShowFailedModal] = useState(false)
  const {
    login,
    failedAttempts,
    error,
    wipeAndReset,
    clearError,
    loginWithBiometrics,
    biometricsEnabled,
    biometricsAvailable,
  } = useAuth()

  const showBiometricOption = biometricsEnabled && biometricsAvailable
  // Always start with PIN visible — biometric auto-trigger fires in parallel and on
  // success the user is logged in; on failure/cancel the PIN input is already shown.
  const [showPin, setShowPin] = useState(true)
  const hasTriggeredBiometrics = useRef(false)

  // Show warning modal when failed attempts reach threshold
  useEffect(() => {
    if (failedAttempts >= FAILED_ATTEMPTS_WARNING_THRESHOLD && failedAttempts % FAILED_ATTEMPTS_WARNING_THRESHOLD === 0) {
      setShowFailedModal(true)
    }
  }, [failedAttempts])

  const handleBiometricUnlock = useCallback(async () => {
    setIsBiometricLoading(true)
    try {
      const success = await loginWithBiometrics()
      if (!success) {
        setShowPin(true)
      }
    } catch {
      setShowPin(true)
    } finally {
      setIsBiometricLoading(false)
    }
  }, [loginWithBiometrics])

  // Auto-trigger biometric prompt once on mount when available
  useEffect(() => {
    if (!hasTriggeredBiometrics.current && biometricsEnabled && biometricsAvailable) {
      hasTriggeredBiometrics.current = true
      handleBiometricUnlock()
    }
  }, [biometricsEnabled, biometricsAvailable, handleBiometricUnlock])

  // Show PIN if biometrics becomes unavailable after initial check
  useEffect(() => {
    if (biometricsEnabled && !biometricsAvailable) {
      setShowPin(true)
    }
  }, [biometricsEnabled, biometricsAvailable])

  const handleLogin = async () => {
    if (pin.length < MIN_PIN_LENGTH) return

    setIsLoading(true)
    clearError()

    try {
      const success = await login(pin)
      if (!success) {
        setPin('')
      }
    } catch {
      setPin('')
    } finally {
      setIsLoading(false)
    }
  }

  const handleWipe = async () => {
    await wipeAndReset()
    setShowWipeModal(false)
    setPin('')
  }

  const pinSection = (
    <div className="space-y-6">
      <PinInput
        label="PIN"
        value={pin}
        onChange={(value) => {
          setPin(value)
          if (error) clearError()
        }}
        onSubmit={handleLogin}
        minLength={MIN_PIN_LENGTH}
        error={error || undefined}
        disabled={isLoading}
        autoFocus
      />

      {failedAttempts > 0 && (
        <p className="text-xs text-center text-amber-600 dark:text-amber-400">
          {failedAttempts} failed attempt{failedAttempts > 1 ? 's' : ''}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-2">
          <Spinner size="sm" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Unlocking...
          </span>
        </div>
      ) : (
        <Button
          onClick={handleLogin}
          disabled={pin.length < MIN_PIN_LENGTH}
          className="w-full"
        >
          Unlock
        </Button>
      )}
    </div>
  )

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
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {showBiometricOption ? 'Use biometrics or PIN to unlock GrossBuh' : 'Enter your PIN to unlock GrossBuh'}
          </p>
        </div>

        <Card className="p-6">
          {showBiometricOption ? (
            <div className="space-y-4">
              {isBiometricLoading ? (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Spinner size="sm" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Waiting for biometrics...
                  </span>
                </div>
              ) : (
                <Button
                  onClick={handleBiometricUnlock}
                  className="w-full"
                >
                  Unlock with Biometrics
                </Button>
              )}

              {!showPin && !isBiometricLoading && (
                <button
                  onClick={() => setShowPin(true)}
                  className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Use PIN instead
                </button>
              )}

              {showPin && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  {pinSection}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {pinSection}
            </div>
          )}

          <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setShowWipeModal(true)}
              className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Forgot PIN?
            </button>
          </div>
        </Card>

        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          Your data is encrypted with your PIN
        </p>
      </div>

      <WipeConfirmModal
        isOpen={showWipeModal}
        onClose={() => setShowWipeModal(false)}
        onConfirm={handleWipe}
      />

      <FailedAttemptsModal
        isOpen={showFailedModal}
        onClose={() => setShowFailedModal(false)}
        failedAttempts={failedAttempts}
      />
    </div>
  )
}
