import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ConvertToGoalWizard } from '../../../../components/goals/ConvertToGoalWizard'
import type { Wallet, Currency } from '../../../../types'

vi.mock('../../../../services/repositories', () => ({
  goalRepository: {
    convertWalletToGoal: vi.fn(),
  },
}))

const mockShowToast = vi.fn()
vi.mock('../../../../components/ui', async () => {
  const actual = await vi.importActual('../../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: mockShowToast }),
  }
})

import { goalRepository } from '../../../../services/repositories'

const mockGoalRepository = vi.mocked(goalRepository)

const currencies: Currency[] = [
  { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2 },
  { id: 2, code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2 },
]

const singleAccountWallet: Wallet = {
  id: 10,
  name: 'Emergency Fund',
  color: '#10B981',
  account_type: 'savings',
  accounts: [
    { id: 1, wallet_id: 10, currency_id: 1, balance_int: 500, balance_frac: 0, updated_at: 0, is_default: true },
  ],
}

const multiAccountWallet: Wallet = {
  id: 20,
  name: 'Travel fund',
  color: null,
  account_type: 'savings',
  accounts: [
    { id: 2, wallet_id: 20, currency_id: 1, balance_int: 100, balance_frac: 0, updated_at: 0, is_default: true }, // USD
    { id: 3, wallet_id: 20, currency_id: 2, balance_int: 50, balance_frac: 0, updated_at: 0 },  // EUR
  ],
}

const noConflictDestination: Wallet = {
  id: 30, name: 'Savings wallet B', color: null,
  accounts: [],
}

const conflictDestination: Wallet = {
  id: 40, name: 'Existing USD Wallet', color: null,
  accounts: [{ id: 50, wallet_id: 40, currency_id: 1, balance_int: 200, balance_frac: 0, updated_at: 0 }],
}

// Same currency as conflictDestination's plain account, but savings-typed —
// a wallet can legitimately hold both side by side (design.md Decision 8).
const savingsSourceWallet: Wallet = {
  id: 60,
  name: 'Savings Source',
  color: null,
  account_type: 'savings',
  accounts: [
    { id: 61, wallet_id: 60, currency_id: 1, balance_int: 300, balance_frac: 0, updated_at: 0, is_default: true, account_type: 'savings' },
  ],
}

describe('ConvertToGoalWizard', () => {
  const onClose = vi.fn()
  const onConverted = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('single-account wallet: walks target -> plan -> confirm and converts with no conflict', async () => {
    mockGoalRepository.convertWalletToGoal.mockResolvedValue({} as any)

    render(
      <ConvertToGoalWizard
        wallet={singleAccountWallet}
        currencies={currencies}
        allWallets={[singleAccountWallet, noConflictDestination]}
        onClose={onClose}
        onConverted={onConverted}
      />
    )

    expect(screen.getByLabelText('Goal Name')).toHaveValue('Emergency Fund')
    fireEvent.change(document.getElementById('target-amount')!, { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    const destinationSelect = await screen.findByLabelText('USD account')
    fireEvent.change(destinationSelect, { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => {
      expect(screen.getByText(/moved to/)).toBeInTheDocument()
    })
    // No data-loss checkbox for a no-conflict destination.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockGoalRepository.convertWalletToGoal).toHaveBeenCalledWith({
        walletId: 10,
        name: 'Emergency Fund',
        color: '#10B981',
        target_int: 5000,
        target_frac: 0,
        due_date: null,
        defaultCurrencyId: 1,
        plan: [{ accountId: 1, destinationWalletId: 30 }],
      })
      expect(onConverted).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('warns about data loss on a currency conflict and blocks Confirm until acknowledged', async () => {
    mockGoalRepository.convertWalletToGoal.mockResolvedValue({} as any)

    render(
      <ConvertToGoalWizard
        wallet={singleAccountWallet}
        currencies={currencies}
        allWallets={[singleAccountWallet, conflictDestination]}
        onClose={onClose}
        onConverted={onConverted}
      />
    )

    fireEvent.change(document.getElementById('target-amount')!, { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    const destinationSelect = await screen.findByLabelText('USD account')
    fireEvent.change(destinationSelect, { target: { value: '40' } })

    await waitFor(() => {
      expect(screen.getByText(/already has a USD account/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => {
      expect(screen.getByText(/merged into/)).toBeInTheDocument()
    })

    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    expect(confirmButton).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox'))
    expect(confirmButton).toBeEnabled()

    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(mockGoalRepository.convertWalletToGoal).toHaveBeenCalledWith(
        expect.objectContaining({ plan: [{ accountId: 1, destinationWalletId: 40 }] })
      )
    })
  })

  it('does not flag a conflict when the destination\'s same-currency account is a different type (design.md Decision 8)', async () => {
    mockGoalRepository.convertWalletToGoal.mockResolvedValue({} as any)

    render(
      <ConvertToGoalWizard
        wallet={savingsSourceWallet}
        currencies={currencies}
        allWallets={[savingsSourceWallet, conflictDestination]}
        onClose={onClose}
        onConverted={onConverted}
      />
    )

    fireEvent.change(document.getElementById('target-amount')!, { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    const destinationSelect = await screen.findByLabelText('USD account')
    fireEvent.change(destinationSelect, { target: { value: '40' } })

    // No data-loss warning: conflictDestination's existing account is
    // plain-typed, not savings-typed, so this is a move, not a merge.
    expect(screen.queryByText(/already has a USD account/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => {
      expect(screen.getByText(/moved to/)).toBeInTheDocument()
    })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockGoalRepository.convertWalletToGoal).toHaveBeenCalledWith(
        expect.objectContaining({ plan: [{ accountId: 61, destinationWalletId: 40 }] })
      )
    })
  })

  it('multi-account wallet: requires a destination for every account before proceeding', async () => {
    render(
      <ConvertToGoalWizard
        wallet={multiAccountWallet}
        currencies={currencies}
        allWallets={[multiAccountWallet, noConflictDestination]}
        onClose={onClose}
        onConverted={onConverted}
      />
    )

    fireEvent.change(document.getElementById('target-amount')!, { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await screen.findByLabelText('USD account')
    // Only choose a destination for USD, leave EUR unset.
    fireEvent.change(screen.getByLabelText('USD account'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(mockShowToast).toHaveBeenCalledWith('Choose a destination for every account', 'error')
    // Still on the plan step, not confirm.
    expect(screen.getByLabelText('EUR account')).toBeInTheDocument()
  })

  it('sets a due date and shows it on the confirm step, and lets the user step back at each stage', async () => {
    render(
      <ConvertToGoalWizard
        wallet={singleAccountWallet}
        currencies={currencies}
        allWallets={[singleAccountWallet, noConflictDestination]}
        onClose={onClose}
        onConverted={onConverted}
      />
    )

    fireEvent.change(document.getElementById('target-amount')!, { target: { value: '5000' } })
    fireEvent.change(document.getElementById('due-date-(optional)')!, { target: { value: '2027-06-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    const destinationSelect = await screen.findByLabelText('USD account')
    fireEvent.change(destinationSelect, { target: { value: '30' } })

    // Back from plan returns to the target step.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('Goal Name')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByLabelText('USD account')
    fireEvent.change(screen.getByLabelText('USD account'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => {
      expect(screen.getByText(/due 2027-06-01/)).toBeInTheDocument()
    })

    // Back from confirm returns to the plan step.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('USD account')).toBeInTheDocument()
  })

  it('blocks moving to the plan step with a blank name or target amount', () => {
    render(
      <ConvertToGoalWizard
        wallet={multiAccountWallet}
        currencies={currencies}
        allWallets={[multiAccountWallet, noConflictDestination]}
        onClose={onClose}
        onConverted={onConverted}
      />
    )

    fireEvent.change(screen.getByLabelText('Goal Name'), { target: { value: '' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Next' }).closest('form')!)

    expect(screen.queryByLabelText('USD account')).not.toBeInTheDocument()
  })

  it('shows guidance and disables Next when no destination wallets exist', async () => {
    render(
      <ConvertToGoalWizard
        wallet={singleAccountWallet}
        currencies={currencies}
        allWallets={[singleAccountWallet]}
        onClose={onClose}
        onConverted={onConverted}
      />
    )

    fireEvent.change(document.getElementById('target-amount')!, { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => {
      expect(screen.getByText(/No other wallets exist yet/)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('on failure, keeps the wizard open with prior choices intact instead of resetting to a blank form', async () => {
    mockGoalRepository.convertWalletToGoal.mockRejectedValue(new Error('Account not found'))

    render(
      <ConvertToGoalWizard
        wallet={singleAccountWallet}
        currencies={currencies}
        allWallets={[singleAccountWallet, noConflictDestination]}
        onClose={onClose}
        onConverted={onConverted}
      />
    )

    fireEvent.change(document.getElementById('target-amount')!, { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.change(await screen.findByLabelText('USD account'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText(/moved to/)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Account not found', 'error')
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(onConverted).not.toHaveBeenCalled()
    // Still on the confirm step with the prior plan intact, not reset to target.
    expect(screen.getByText(/moved to/)).toBeInTheDocument()
  })

  it('shows a generic error message for a non-Error rejection', async () => {
    mockGoalRepository.convertWalletToGoal.mockRejectedValue('nope')

    render(
      <ConvertToGoalWizard
        wallet={singleAccountWallet}
        currencies={currencies}
        allWallets={[singleAccountWallet, noConflictDestination]}
        onClose={onClose}
        onConverted={onConverted}
      />
    )

    fireEvent.change(document.getElementById('target-amount')!, { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.change(await screen.findByLabelText('USD account'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText(/moved to/)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to convert wallet to goal', 'error')
    })
  })

  it('falls back to the first account as the default currency when none is marked default', async () => {
    mockGoalRepository.convertWalletToGoal.mockResolvedValue({} as any)
    const noDefaultWallet: Wallet = {
      ...multiAccountWallet,
      accounts: multiAccountWallet.accounts!.map(a => ({ ...a, is_default: false })),
    }

    render(
      <ConvertToGoalWizard
        wallet={noDefaultWallet}
        currencies={currencies}
        allWallets={[noDefaultWallet, noConflictDestination]}
        onClose={onClose}
        onConverted={onConverted}
      />
    )

    fireEvent.change(document.getElementById('target-amount')!, { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.change(await screen.findByLabelText('USD account'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('EUR account'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText(/Review the plan/)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockGoalRepository.convertWalletToGoal).toHaveBeenCalledWith(
        expect.objectContaining({ defaultCurrencyId: 1 }) // first account (USD) in array order
      )
    })
  })

  it('treats a wallet with no accounts field as having zero accounts to plan for', async () => {
    mockGoalRepository.convertWalletToGoal.mockResolvedValue({} as any)
    const noAccountsWallet: Wallet = { id: 40, name: 'Empty Wallet', color: null }

    render(
      <ConvertToGoalWizard
        wallet={noAccountsWallet}
        currencies={currencies}
        allWallets={[noAccountsWallet, noConflictDestination]}
        onClose={onClose}
        onConverted={onConverted}
      />
    )

    fireEvent.change(document.getElementById('target-amount')!, { target: { value: '2000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))

    await waitFor(() => {
      expect(screen.getByText(/Review the plan/)).toBeInTheDocument()
    })
  })
})
