import { useState, useEffect } from 'react'
import { Button, Card, Input, LiveSearch, Spinner, useToast } from '../components/ui'
import { currencyRepository, walletRepository } from '../services/repositories'
import type { Currency } from '../types'

type Step = 'currencies' | 'wallet'

interface OnboardingPageProps {
  onComplete: () => void
}

export function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const { showToast } = useToast()
  const [step, setStep] = useState<Step>('currencies')
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [loading, setLoading] = useState(true)
  const [originalSystemId, setOriginalSystemId] = useState<number | null>(null)

  // Step 1 state
  const [displayCurrencyId, setDisplayCurrencyId] = useState<string>('')
  const [paymentCurrencyId, setPaymentCurrencyId] = useState<string>('')

  // Step 2 state — carried from step 1
  const [walletCurrencyId, setWalletCurrencyId] = useState<string>('')
  const [walletName, setWalletName] = useState('My Wallet')
  const [initialBalance, setInitialBalance] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const all = await currencyRepository.findAll()
        setCurrencies(all)

        const systemCurrency = all.find((c) => c.is_system)
        const paymentDefault = all.find((c) => c.is_payment_default && !c.is_system)

        if (systemCurrency) {
          setOriginalSystemId(systemCurrency.id)
          setDisplayCurrencyId(String(systemCurrency.id))
          setWalletCurrencyId(String(systemCurrency.id))
        }

        if (paymentDefault) {
          setPaymentCurrencyId(String(paymentDefault.id))
        } else {
          setPaymentCurrencyId('')
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to load currencies', 'error')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [showToast])

  const handleCurrenciesContinue = async () => {
    try {
      const displayId = Number(displayCurrencyId)

      // Only call setSystem if the user selected a different currency than what's already system
      if (displayCurrencyId && displayId !== originalSystemId) {
        await currencyRepository.setSystem(displayId)
      }

      // setPaymentDefault must not be called when payment === display, because setSystem
      // already set DEFAULT on the display currency (or it was already there).
      // Use clearPaymentDefault() for "same as display" (empty) or when payment === display.
      if (paymentCurrencyId && Number(paymentCurrencyId) !== displayId) {
        await currencyRepository.setPaymentDefault(Number(paymentCurrencyId))
      } else {
        await currencyRepository.clearPaymentDefault()
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save currency settings', 'error')
      return
    }

    setWalletCurrencyId(displayCurrencyId)
    setStep('wallet')
  }

  const handleCurrenciesSkip = () => {
    setStep('wallet')
  }

  const handleCreateWallet = async () => {
    setSaving(true)
    try {
      const name = walletName.trim() || 'My Wallet'
      const wallet = await walletRepository.create({ name })
      const balance = parseFloat(initialBalance)
      await walletRepository.addAccount(
        wallet.id,
        Number(walletCurrencyId),
        balance > 0 ? balance : undefined
      )
      onComplete()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create wallet', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-4">
        <Spinner size="lg" />
      </div>
    )
  }

  const currencyOptions = currencies.map((c) => ({
    value: String(c.id),
    label: `${c.code} — ${c.name}`,
  }))

  const paymentOptions = [
    { value: '', label: 'Same as display' },
    ...currencyOptions,
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">GrossBuch</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {step === 'currencies' ? 'Step 1 of 2 — Set your currencies' : 'Step 2 of 2 — Create your first wallet'}
          </p>
        </div>

        {step === 'currencies' ? (
          <Card className="p-6">
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Currency Preferences</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Choose the currencies you work with
                </p>
              </div>

              <div className="space-y-4">
                <LiveSearch
                  label="Display currency"
                  value={displayCurrencyId}
                  onChange={(value) => setDisplayCurrencyId(String(value))}
                  options={currencyOptions}
                  placeholder="Search currencies"
                />
                <LiveSearch
                  label="Payment currency"
                  value={paymentCurrencyId}
                  onChange={(value) => setPaymentCurrencyId(String(value))}
                  options={paymentOptions}
                  placeholder="Search currencies"
                />
              </div>

              <Button onClick={handleCurrenciesContinue} className="w-full">
                Continue
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleCurrenciesSkip}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">First Wallet</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Create a wallet to start tracking expenses
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Wallet name
                  </label>
                  <Input
                    value={walletName}
                    onChange={(e) => setWalletName(e.target.value)}
                    placeholder="My Wallet"
                  />
                </div>

                <LiveSearch
                  label="Currency"
                  value={walletCurrencyId}
                  onChange={(value) => setWalletCurrencyId(String(value))}
                  options={currencyOptions}
                  placeholder="Search currencies"
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Initial balance (optional)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {saving ? (
                <div className="flex items-center justify-center gap-2 py-2">
                  <Spinner size="sm" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Creating wallet...</span>
                </div>
              ) : (
                <Button onClick={handleCreateWallet} className="w-full">
                  Create Wallet
                </Button>
              )}

              <div className="text-center">
                <button
                  type="button"
                  onClick={onComplete}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
