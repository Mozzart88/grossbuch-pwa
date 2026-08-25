import { useState } from 'react'
import { Button, Modal, Input, AmountInput, Select, useToast } from '../ui'
import { goalRepository } from '../../services/repositories'
import type { ConvertAccountPlanEntry } from '../../services/repositories'
import type { Wallet, Currency } from '../../types'
import { toIntFrac } from '../../utils/amount'

interface ConvertToGoalWizardProps {
  wallet: Wallet
  currencies: Currency[]
  allWallets: Wallet[]
  onClose: () => void
  onConverted: () => void
}

type Step = 'target' | 'plan' | 'confirm'

const currencyCode = (currencies: Currency[], currencyId: number): string =>
  currencies.find(c => c.id === currencyId)?.code ?? String(currencyId)

export function ConvertToGoalWizard({ wallet, currencies, allWallets, onClose, onConverted }: ConvertToGoalWizardProps) {
  const { showToast } = useToast()
  const accounts = wallet.accounts ?? []
  const destinationWallets = allWallets.filter(w => w.id !== wallet.id)

  const [step, setStep] = useState<Step>('target')
  const [name, setName] = useState(wallet.name)
  const [targetAmount, setTargetAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [destinationByAccount, setDestinationByAccount] = useState<Record<number, string>>({})
  const [dataLossAcknowledged, setDataLossAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const conflictFor = (accountId: number): Wallet | undefined => {
    const account = accounts.find(a => a.id === accountId)
    const destId = destinationByAccount[accountId]
    if (!account || !destId) return undefined
    const dest = destinationWallets.find(w => w.id.toString() === destId)
    const accountType = account.account_type ?? 'plain'
    return dest?.accounts?.some(a => a.currency_id === account.currency_id && (a.account_type ?? 'plain') === accountType) ? dest : undefined
  }

  const hasAnyConflict = accounts.some(a => conflictFor(a.id))
  const allAssigned = accounts.every(a => destinationByAccount[a.id])

  const goToPlan = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim() || !targetAmount.trim()) return
    setStep('plan')
  }

  const goToConfirm = () => {
    if (!allAssigned) {
      showToast('Choose a destination for every account', 'error')
      return
    }
    setDataLossAcknowledged(false)
    setStep('confirm')
  }

  const handleSubmit = async () => {
    if (hasAnyConflict && !dataLossAcknowledged) return

    setSubmitting(true)
    try {
      const { int: target_int, frac: target_frac } = toIntFrac(parseFloat(targetAmount))
      const defaultAccount = accounts.find(a => a.is_default) ?? accounts[0]

      const plan: ConvertAccountPlanEntry[] = accounts.map(a => ({
        accountId: a.id,
        destinationWalletId: parseInt(destinationByAccount[a.id]),
      }))

      await goalRepository.convertWalletToGoal({
        walletId: wallet.id,
        name: name.trim(),
        color: wallet.color,
        target_int,
        target_frac,
        due_date: dueDate || null,
        defaultCurrencyId: defaultAccount.currency_id,
        plan,
      })

      showToast('Goal created', 'success')
      onConverted()
      onClose()
    } catch (error) {
      console.error('Failed to convert wallet to goal:', error)
      showToast(error instanceof Error ? error.message : 'Failed to convert wallet to goal', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Convert to Goal">
      {step === 'target' && (
        <form onSubmit={goToPlan} className="space-y-4">
          <Input
            label="Goal Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <AmountInput
            label="Target Amount"
            isPositive
            required
            placeholder="0.00"
            value={targetAmount}
            onChange={setTargetAmount}
          />
          <Input
            label="Due Date (optional)"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !targetAmount.trim()} className="flex-1">
              Next
            </Button>
          </div>
        </form>
      )}

      {step === 'plan' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Each account currently in <strong>{wallet.name}</strong> needs a new home for its real, spendable balance.
          </p>
          {destinationWallets.length === 0 ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              No other wallets exist yet. Create one first, then convert this wallet to a goal.
            </p>
          ) : (
            <div className="space-y-3">
              {accounts.map((acc) => {
                const conflict = conflictFor(acc.id)
                return (
                  <div key={acc.id} className="space-y-1">
                    <Select
                      label={`${currencyCode(currencies, acc.currency_id)} account`}
                      value={destinationByAccount[acc.id] ?? ''}
                      onChange={(e) => setDestinationByAccount(prev => ({ ...prev, [acc.id]: e.target.value }))}
                      options={destinationWallets.map(w => ({ value: w.id, label: w.name }))}
                      placeholder="Select destination wallet"
                    />
                    {conflict && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {conflict.name} already has a {currencyCode(currencies, acc.currency_id)} account — its transaction history will be lost and balances merged.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setStep('target')} className="flex-1">
              Back
            </Button>
            <Button type="button" onClick={goToConfirm} disabled={destinationWallets.length === 0} className="flex-1">
              Next
            </Button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Review the plan before converting:
          </p>
          <ul className="text-sm space-y-1 list-disc list-inside text-gray-700 dark:text-gray-300">
            <li>
              <strong>{name.trim()}</strong>, target {targetAmount}{dueDate ? `, due ${dueDate}` : ''}
            </li>
            {accounts.map((acc) => {
              const dest = destinationWallets.find(w => w.id.toString() === destinationByAccount[acc.id])
              const conflict = conflictFor(acc.id)
              return (
                <li key={acc.id}>
                  {currencyCode(currencies, acc.currency_id)} → {conflict ? 'merged into' : 'moved to'} <strong>{dest?.name}</strong>
                  {conflict ? ' (history lost)' : ''}
                </li>
              )
            })}
          </ul>
          {hasAnyConflict && (
            <label className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
              <input
                type="checkbox"
                checked={dataLossAcknowledged}
                onChange={(e) => setDataLossAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              I understand this will permanently delete the transaction history for the merged account(s).
            </label>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setStep('plan')} disabled={submitting} className="flex-1">
              Back
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || (hasAnyConflict && !dataLossAcknowledged)}
              className="flex-1"
            >
              {submitting ? 'Converting...' : 'Confirm'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
