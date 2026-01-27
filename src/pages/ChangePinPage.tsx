import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Spinner, useToast } from '../components/ui'
import { PinInput, WipeConfirmModal } from '../components/auth'
import { useAuth } from '../store/AuthContext'

const MIN_PIN_LENGTH = 6

type Step = 'current' | 'new' | 'confirm'

export function ChangePinPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { changePin, wipeAndReset, logout } = useAuth()

  const [step, setStep] = useState<Step>('current')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showWipeModal, setShowWipeModal] = useState(false)

  const handleCurrentPinSubmit = () => {
    if (currentPin.length < MIN_PIN_LENGTH) {
      setError(`PIN must be at least ${MIN_PIN_LENGTH} characters`)
      return
    }
    setError(null)
    setStep('new')
  }

  const handleNewPinSubmit = () => {
    if (newPin.length < MIN_PIN_LENGTH) {
      setError(`PIN must be at least ${MIN_PIN_LENGTH} characters`)
      return
    }
    if (newPin === currentPin) {
      setError('New PIN must be different from current PIN')
      return
    }
    setError(null)
    setStep('confirm')
  }

  const handleConfirmPinSubmit = async () => {
    if (confirmPin !== newPin) {
      setError('PINs do not match')
      setConfirmPin('')
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      const success = await changePin(currentPin, newPin)
      if (success) {
        showToast('PIN changed successfully', 'success')
        navigate('/settings')
      } else {
        setError('Incorrect current PIN')
        setStep('current')
        setCurrentPin('')
        setNewPin('')
        setConfirmPin('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change PIN')
      setStep('current')
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBack = () => {
    setError(null)
    if (step === 'confirm') {
      setStep('new')
      setConfirmPin('')
    } else if (step === 'new') {
      setStep('current')
      setNewPin('')
    } else {
      navigate('/settings')
    }
  }

  const handleWipe = async () => {
    await wipeAndReset()
    setShowWipeModal(false)
    showToast('All data deleted', 'success')
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const getStepTitle = () => {
    switch (step) {
      case 'current':
        return 'Enter Current PIN'
      case 'new':
        return 'Enter New PIN'
      case 'confirm':
        return 'Confirm New PIN'
    }
  }

  const getStepDescription = () => {
    switch (step) {
      case 'current':
        return 'Verify your identity with your current PIN'
      case 'new':
        return 'Choose a new PIN for your account'
      case 'confirm':
        return 'Enter your new PIN again to confirm'
    }
  }

  return (
    <div>
      <PageHeader title="Security" showBack />

      <div className="p-4 space-y-4">
        <Card className="p-6">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {getStepTitle()}
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {getStepDescription()}
              </p>
            </div>

            {/* Progress indicator */}
            <div className="flex justify-center gap-2">
              {(['current', 'new', 'confirm'] as Step[]).map((s, i) => (
                <div
                  key={s}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i <= ['current', 'new', 'confirm'].indexOf(step)
                      ? 'bg-primary-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                />
              ))}
            </div>

            {step === 'current' && (
              <PinInput
                label="Current PIN"
                value={currentPin}
                onChange={setCurrentPin}
                onSubmit={handleCurrentPinSubmit}
                minLength={MIN_PIN_LENGTH}
                error={error || undefined}
                autoFocus
              />
            )}

            {step === 'new' && (
              <PinInput
                label="New PIN"
                value={newPin}
                onChange={setNewPin}
                onSubmit={handleNewPinSubmit}
                minLength={MIN_PIN_LENGTH}
                error={error || undefined}
                autoFocus
              />
            )}

            {step === 'confirm' && (
              <PinInput
                label="Confirm New PIN"
                value={confirmPin}
                onChange={setConfirmPin}
                onSubmit={handleConfirmPinSubmit}
                minLength={MIN_PIN_LENGTH}
                error={error || undefined}
                autoFocus
              />
            )}

            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-2">
                <Spinner size="sm" />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Changing PIN...
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
                  onClick={
                    step === 'current'
                      ? handleCurrentPinSubmit
                      : step === 'new'
                      ? handleNewPinSubmit
                      : handleConfirmPinSubmit
                  }
                  disabled={
                    (step === 'current' && currentPin.length < MIN_PIN_LENGTH) ||
                    (step === 'new' && newPin.length < MIN_PIN_LENGTH) ||
                    (step === 'confirm' && confirmPin.length < MIN_PIN_LENGTH)
                  }
                  className="flex-1"
                >
                  {step === 'confirm' ? 'Change PIN' : 'Continue'}
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Additional security options */}
        <Card className="divide-y divide-gray-200 dark:divide-gray-700">
          <button
            onClick={handleLogout}
            className="flex items-center gap-4 p-4 w-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
          >
            <span className="text-2xl">🔒</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Lock App</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Lock the app and require PIN to access</p>
            </div>
          </button>

          <button
            onClick={() => setShowWipeModal(true)}
            className="flex items-center gap-4 p-4 w-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
          >
            <span className="text-2xl">🗑️</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete All Data</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Permanently delete all data and reset the app</p>
            </div>
          </button>
        </Card>
      </div>

      <WipeConfirmModal
        isOpen={showWipeModal}
        onClose={() => setShowWipeModal(false)}
        onConfirm={handleWipe}
      />
    </div>
  )
}
