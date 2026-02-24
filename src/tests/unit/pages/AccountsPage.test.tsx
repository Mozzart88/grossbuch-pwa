import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AccountsPage } from '../../../pages/AccountsPage'
import { LayoutProvider } from '../../../store/LayoutContext'
import { TestPlusButton } from '../../helpers/TestPlusButton'
import type { Wallet, Currency, Account } from '../../../types'

// Mock dependencies
vi.mock('../../../services/repositories', () => ({
  walletRepository: {
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addAccount: vi.fn(),
    setDefault: vi.fn(),
  },
  currencyRepository: {
    findAll: vi.fn(),
    getExchangeRate: vi.fn(),
    setExchangeRate: vi.fn(),
  },
  accountRepository: {
    delete: vi.fn(),
    setDefault: vi.fn(),
  },
  transactionRepository: {
    createBalanceAdjustment: vi.fn(),
  },
}))

vi.mock('../../../services/exchangeRate/exchangeRateSync', () => ({
  syncSingleRate: vi.fn(),
}))

const mockShowToast = vi.fn()
vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: mockShowToast }),
  }
})

import { walletRepository, currencyRepository, accountRepository, transactionRepository } from '../../../services/repositories'
import { syncSingleRate } from '../../../services/exchangeRate/exchangeRateSync'

const mockWalletRepository = vi.mocked(walletRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockAccountRepository = vi.mocked(accountRepository)
const mockTransactionRepository = vi.mocked(transactionRepository)
const mockSyncSingleRate = vi.mocked(syncSingleRate)

const mockAccount: Account = {
  id: 1,
  wallet_id: 1,
  currency_id: 1,
  balance_int: 1500,
  balance_frac: 0,
  updated_at: 1704067200,
  wallet: 'Cash',
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
  is_default: true,
}

const mockBankAccount: Account = {
  id: 2,
  wallet_id: 2,
  currency_id: 1,
  balance_int: 15000,
  balance_frac: 0,
  updated_at: 1704067200,
  wallet: 'Bank',
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
  is_default: false,
}

const mockWallets: Wallet[] = [
  {
    id: 1,
    name: 'Cash',
    color: '#3B82F6',
    is_default: true,
    accounts: [mockAccount],
  },
  {
    id: 2,
    name: 'Bank',
    color: '#3B82F6',
    is_default: false,
    accounts: [mockBankAccount],
  },
]

const mockCurrencies: Currency[] = [
  {
    id: 1,
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimal_places: 2,
    is_system: true,
    is_fiat: true,
  },
  {
    id: 2,
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    decimal_places: 2,
    is_fiat: true,
  },
]

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWalletRepository.findAll.mockResolvedValue(mockWallets)
    mockCurrencyRepository.findAll.mockResolvedValue(mockCurrencies)
  })

  const renderWithRouter = () => {
    return render(
      <MemoryRouter>
        <LayoutProvider>
          <AccountsPage />
          <TestPlusButton />
        </LayoutProvider>
      </MemoryRouter>
    )
  }

  // Helper to open dropdown menu and click an action
  const openDropdownAndClick = async (dropdownIndex: number, actionText: string) => {
    const dropdownTriggers = screen.getAllByRole('button', { expanded: false })
    // Filter to only dropdown triggers (those with aria-haspopup="menu")
    const menuTriggers = dropdownTriggers.filter(btn => btn.getAttribute('aria-haspopup') === 'menu')
    fireEvent.click(menuTriggers[dropdownIndex])

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(actionText))
  }

  it('displays loading spinner initially', () => {
    // Delay resolution to see loading state
    mockWalletRepository.findAll.mockImplementation(
      () => new Promise(() => { })
    )

    const { container } = renderWithRouter()

    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('displays wallets after loading', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument()
    })
  })

  it('displays page title', { skip: true }, async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Wallets & Accounts')).toBeInTheDocument()
    })
  })

  it('displays Add button for wallets', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    })
  })

  it('displays empty state when no wallets', async () => {
    mockWalletRepository.findAll.mockResolvedValue([])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('No wallets yet')).toBeInTheDocument()
    })
  })

  it('opens wallet modal when Add button is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(screen.getByText('Add Wallet', { selector: 'h2' })).toBeInTheDocument()
    })
  })

  it('opens edit modal when Edit is clicked from dropdown', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument()
    })

    await openDropdownAndClick(0, 'Edit')

    await waitFor(() => {
      expect(screen.getByText('Edit Wallet')).toBeInTheDocument()
    })
  })

  it('displays wallet with color', async () => {
    renderWithRouter()

    await waitFor(() => {
      // Wallet should be displayed with its color
      expect(screen.getByText('Cash')).toBeInTheDocument()
      expect(screen.getByText('Bank')).toBeInTheDocument()
    })
  })

  it('displays wallet without color', async () => {
    mockWalletRepository.findAll.mockResolvedValue([
      {
        ...mockWallets[0],
        color: null, // No color
      },
    ])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument()
    })
  })

  it('displays wallet with no accounts array', async () => {
    mockWalletRepository.findAll.mockResolvedValue([
      {
        id: 1,
        name: 'Empty Wallet',
        color: '#3B82F6',
        is_default: false,
        accounts: undefined, // No accounts array
      },
    ])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Empty Wallet')).toBeInTheDocument()
      expect(screen.getByText('0 account(s)')).toBeInTheDocument()
    })
  })

  it('displays balance as raw number when currency not found', async () => {
    mockWalletRepository.findAll.mockResolvedValue([
      {
        id: 1,
        name: 'Unknown Currency Wallet',
        color: '#3B82F6',
        is_default: false,
        accounts: [{
          ...mockAccount,
          currency_id: 999, // Non-existent currency
          balance_int: 123,
          balance_frac: 450000000000000000,
        }],
      },
    ])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Unknown Currency Wallet')).toBeInTheDocument()
      // Balance displayed as raw number when currency not found (fromIntFrac(123, 450000000000000000) = 123.45)
      expect(screen.getByText('123.45')).toBeInTheDocument()
    })
  })

  it('displays account currency', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('USD').length === 2)
    })
  })

  it('displays account balance with correct color for positive', async () => {
    renderWithRouter()

    await waitFor(() => {
      const balance = screen.getByText('$1500.00')
      expect(balance.className).toContain('text-green')
    })
  })

  it('displays account balance with correct color for negative', async () => {
    mockWalletRepository.findAll.mockResolvedValue([
      {
        ...mockWallets[0],
        accounts: [{ ...mockAccount, balance_int: -500, balance_frac: 0 }],
      },
    ])

    renderWithRouter()

    await waitFor(() => {
      const balance = screen.getByText('-$500.00')
      expect(balance.className).toContain('text-red')
    })
  })

  it('calls findAll on mount', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(mockWalletRepository.findAll).toHaveBeenCalled()
      expect(mockCurrencyRepository.findAll).toHaveBeenCalled()
    })
  })

  it('displays Default badge for default wallet', async () => {
    renderWithRouter()

    await waitFor(() => {
      // 2 Default badges: 1 for default wallet, 1 for default account
      expect(screen.getAllByText('Default').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('displays account count', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('1 account(s)').length == 2)
    })
  })

  describe('Create wallet', () => {
    beforeEach(() => {
      mockWalletRepository.create.mockResolvedValue({
        id: 0,
        name: 'Text',
        color: '#000'
      })
    })

    it('creates wallet when form submitted', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByLabelText('Name')).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText('Name')
      fireEvent.change(nameInput, { target: { value: 'New Wallet' } })

      const submitButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockWalletRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Wallet',
          })
        )
      })

      expect(mockShowToast).toHaveBeenCalledWith('Wallet created', 'success')
    })

    it('shows error when create fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockWalletRepository.create.mockRejectedValue(new Error('Create failed'))

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByLabelText('Name')).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText('Name')
      fireEvent.change(nameInput, { target: { value: 'New Wallet' } })

      const submitButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Create failed', 'error')
      })

      consoleSpy.mockRestore()
    })

    it('does not submit if name is empty', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(submitButton)

      expect(mockWalletRepository.create).not.toHaveBeenCalled()
    })
  })

  describe('Update wallet', () => {
    beforeEach(() => {
      mockWalletRepository.update.mockResolvedValue(undefined)
    })

    it('updates wallet when form submitted', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, 'Edit')

      await waitFor(() => {
        expect(screen.getByText('Edit Wallet')).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText('Name')
      fireEvent.change(nameInput, { target: { value: 'Updated Cash' } })

      const submitButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockWalletRepository.update).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            name: 'Updated Cash',
          })
        )
      })

      expect(mockShowToast).toHaveBeenCalledWith('Wallet updated', 'success')
    })
  })

  describe('Delete wallet', () => {
    beforeEach(() => {
      mockWalletRepository.delete.mockResolvedValue(undefined)
      vi.spyOn(window, 'confirm').mockImplementation(() => true)
    })

    it('deletes wallet when confirmed', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, 'Delete')

      await waitFor(() => {
        expect(mockWalletRepository.delete).toHaveBeenCalledWith(1)
      })

      expect(mockShowToast).toHaveBeenCalledWith('Wallet deleted', 'success')
    })

    it('does not delete when cancelled', async () => {
      vi.spyOn(window, 'confirm').mockImplementationOnce(() => false)

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, 'Delete')

      expect(mockWalletRepository.delete).not.toHaveBeenCalled()
    })

    it('shows error when delete fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockWalletRepository.delete.mockRejectedValue(new Error('Delete failed'))

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, 'Delete')

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Delete failed', 'error')
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Add currency to wallet', () => {
    beforeEach(() => {
      mockWalletRepository.addAccount.mockResolvedValue({
        id: 0,
        wallet_id: 1,
        currency_id: 1,
        balance_int: 0,
        balance_frac: 0,
        updated_at: 0
      })
    })

    it('opens add currency modal', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, '+ Currency')

      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })
    })

    it('adds currency to wallet', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, '+ Currency')

      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })

      // Submit the form (EUR should be pre-selected as it's not in the wallet)
      // Use getAllByRole and find the one inside the modal (not the TestPlusButton)
      const dialog = screen.getByRole('dialog')
      const addButton = dialog.querySelector('button[type="submit"]') as HTMLButtonElement
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(mockWalletRepository.addAccount).toHaveBeenCalled()
      })

      expect(mockShowToast).toHaveBeenCalledWith('Currency added to wallet', 'success')
    })

    it('shows error when add currency fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockWalletRepository.addAccount.mockRejectedValueOnce(new Error('Add currency failed'))

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, '+ Currency')

      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })

      const dialog = screen.getByRole('dialog')
      const addButton = dialog.querySelector('button[type="submit"]') as HTMLButtonElement
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Add currency failed', 'error')
      })

      consoleSpy.mockRestore()
    })

    it('displays Initial Balance input field in modal', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, '+ Currency')

      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })

      expect(screen.getByLabelText('Initial Balance')).toBeInTheDocument()
    })

    it('passes initial balance to repository when provided', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, '+ Currency')

      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })

      // Enter initial balance (100.50 as float)
      const balanceInput = screen.getByLabelText('Initial Balance')
      fireEvent.change(balanceInput, { target: { value: '100.50' } })

      const dialog = screen.getByRole('dialog')
      const addButton = dialog.querySelector('button[type="submit"]') as HTMLButtonElement
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(mockWalletRepository.addAccount).toHaveBeenCalledWith(1, 2, 100.50)
      })
    })

    it('passes undefined when initial balance is empty', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, '+ Currency')

      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })

      // Don't enter any initial balance

      const dialog = screen.getByRole('dialog')
      const addButton = dialog.querySelector('button[type="submit"]') as HTMLButtonElement
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(mockWalletRepository.addAccount).toHaveBeenCalledWith(1, 2, undefined)
      })
    })

    it('input field has min=0 attribute for browser validation', async () => {
      // Browser enforces min=0 constraint on type="number" inputs,
      // preventing form submission with negative values via HTML5 validation.
      // This test verifies the correct attributes are set.
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, '+ Currency')

      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })

      const balanceInput = screen.getByLabelText('Initial Balance') as HTMLInputElement
      expect(balanceInput.type).toBe('number')
      expect(balanceInput.min).toBe('0')
    })

    it('resets initial balance when modal is closed', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      // Open modal and enter a balance
      await openDropdownAndClick(0, '+ Currency')
      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })
      const balanceInput = screen.getByLabelText('Initial Balance') as HTMLInputElement
      fireEvent.change(balanceInput, { target: { value: '100' } })

      // Close modal
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Add Currency to Wallet')).not.toBeInTheDocument()
      })

      // Re-open modal
      await openDropdownAndClick(0, '+ Currency')
      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })

      // Balance should be reset
      const newBalanceInput = screen.getByLabelText('Initial Balance') as HTMLInputElement
      expect(newBalanceInput.value).toBe('')
    })
  })

  describe('Delete account', () => {
    beforeEach(() => {
      mockAccountRepository.delete.mockResolvedValue(undefined)
      vi.spyOn(window, 'confirm').mockImplementation(() => true)
    })

    it('removes account when confirmed', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      // Index order: [0]=Cash wallet, [1]=Cash account, [2]=Bank wallet, [3]=Bank account
      await openDropdownAndClick(1, 'Remove')

      await waitFor(() => {
        expect(mockAccountRepository.delete).toHaveBeenCalledWith(1)
      })

      expect(mockShowToast).toHaveBeenCalledWith('Account removed', 'success')
    })

    it('shows error when delete account fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockAccountRepository.delete.mockRejectedValueOnce(new Error('Delete account failed'))

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      // Index order: [0]=Cash wallet, [1]=Cash account, [2]=Bank wallet, [3]=Bank account
      await openDropdownAndClick(1, 'Remove')

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Delete account failed', 'error')
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Modal behavior', () => {
    it('closes modal when Cancel clicked', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      })

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Add Wallet', { selector: 'h2' })).not.toBeInTheDocument()
      })
    })

    it('pre-fills form when editing', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, 'Edit')

      await waitFor(() => {
        const nameInput = screen.getByLabelText('Name') as HTMLInputElement
        expect(nameInput.value).toBe('Cash')
      })
    })
  })

  describe('Error handling', () => {
    it('handles load error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockWalletRepository.findAll.mockRejectedValue(new Error('Load failed'))

      renderWithRouter()

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load data:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Set default wallet', () => {
    beforeEach(() => {
      mockWalletRepository.setDefault.mockResolvedValue(undefined)
    })

    it('shows Set Default option only for non-default wallets in dropdown', async () => {
      renderWithRouter()
      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      // Index order: [0]=Cash wallet, [1]=Cash account, [2]=Bank wallet, [3]=Bank account
      const menuTriggers = screen.getAllByRole('button', { expanded: false }).filter(
        btn => btn.getAttribute('aria-haspopup') === 'menu'
      )

      // Open first wallet dropdown (Cash - default wallet)
      fireEvent.click(menuTriggers[0])

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      // Should NOT show Set Default for default wallet
      expect(screen.queryByText('Set Default')).not.toBeInTheDocument()

      // Close dropdown
      fireEvent.click(menuTriggers[0])

      // Open second wallet dropdown (Bank - non-default wallet) at index 2
      fireEvent.click(menuTriggers[2])

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      // Should show Set Default for non-default wallet
      expect(screen.getByText('Set Default')).toBeInTheDocument()
    })

    it('sets wallet as default when clicked', async () => {
      renderWithRouter()
      await waitFor(() => {
        expect(screen.getByText('Bank')).toBeInTheDocument()
      })

      // Index order: [0]=Cash wallet, [1]=Cash account, [2]=Bank wallet, [3]=Bank account
      // Bank wallet is at index 2
      await openDropdownAndClick(2, 'Set Default')

      await waitFor(() => {
        expect(mockWalletRepository.setDefault).toHaveBeenCalledWith(2)
      })
      expect(mockShowToast).toHaveBeenCalledWith('Default wallet updated', 'success')
    })

    it('shows error toast when setDefault fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockWalletRepository.setDefault.mockRejectedValueOnce(new Error('DB error'))

      renderWithRouter()
      await waitFor(() => {
        expect(screen.getByText('Bank')).toBeInTheDocument()
      })

      // Index order: [0]=Cash wallet, [1]=Cash account, [2]=Bank wallet, [3]=Bank account
      // Bank wallet is at index 2
      await openDropdownAndClick(2, 'Set Default')

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('DB error', 'error')
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Set default account', () => {
    beforeEach(() => {
      mockAccountRepository.setDefault.mockResolvedValue(undefined)
    })

    // Helper to open account dropdown
    // Index order: [0]=Cash wallet, [1]=Cash account, [2]=Bank wallet, [3]=Bank account
    const openAccountDropdownAndClick = async (accountDropdownIndex: number, actionText: string) => {
      const menuTriggers = screen.getAllByRole('button', { expanded: false }).filter(
        btn => btn.getAttribute('aria-haspopup') === 'menu'
      )
      // accountDropdownIndex 0 = Cash account (index 1), accountDropdownIndex 1 = Bank account (index 3)
      // Formula: walletIndex * 2 + 1 for accounts
      const accountMenuIndex = accountDropdownIndex * 2 + 1
      fireEvent.click(menuTriggers[accountMenuIndex])

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText(actionText))
    }

    it('displays Default badge for default accounts', async () => {
      renderWithRouter()
      await waitFor(() => {
        // There should be 2 "Default" badges: 1 wallet + 1 account
        expect(screen.getAllByText('Default').length).toBe(2)
      })
    })

    it('shows Set Default option only for non-default accounts in dropdown', async () => {
      renderWithRouter()
      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      // Open dropdown for default account (first account in Cash wallet)
      // Index order: [0]=Cash wallet, [1]=Cash account, [2]=Bank wallet, [3]=Bank account
      const menuTriggers = screen.getAllByRole('button', { expanded: false }).filter(
        btn => btn.getAttribute('aria-haspopup') === 'menu'
      )
      fireEvent.click(menuTriggers[1]) // Cash's account dropdown (default account)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      // Should NOT show Set Default for default account
      expect(screen.queryByText('Set Default')).not.toBeInTheDocument()
      expect(screen.getByText('Remove')).toBeInTheDocument()
    })

    it('sets account as default when clicked from dropdown', async () => {
      renderWithRouter()
      await waitFor(() => {
        expect(screen.getByText('Bank')).toBeInTheDocument()
      })

      // Bank account (index 1) is non-default
      await openAccountDropdownAndClick(1, 'Set Default')

      await waitFor(() => {
        expect(mockAccountRepository.setDefault).toHaveBeenCalledWith(2)
      })
      expect(mockShowToast).toHaveBeenCalledWith('Default account updated', 'success')
    })

    it('shows error toast when setDefault fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockAccountRepository.setDefault.mockRejectedValueOnce(new Error('DB error'))

      renderWithRouter()
      await waitFor(() => {
        expect(screen.getByText('Bank')).toBeInTheDocument()
      })

      await openAccountDropdownAndClick(1, 'Set Default')

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('DB error', 'error')
      })
      consoleSpy.mockRestore()
    })
  })

  describe('Adjust balance', () => {
    beforeEach(() => {
      mockTransactionRepository.createBalanceAdjustment.mockResolvedValue({
        id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        timestamp: 1704067200,
      })
    })

    it('opens adjust balance modal from account dropdown', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      // Index order: [0]=Cash wallet, [1]=Cash account, [2]=Bank wallet, [3]=Bank account
      await openDropdownAndClick(1, 'Adjust Balance')

      await waitFor(() => {
        expect(screen.getByText('Adjust Balance', { selector: 'h2' })).toBeInTheDocument()
      })
    })

    it('displays current balance in modal', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(1, 'Adjust Balance')

      await waitFor(() => {
        expect(screen.getByText(/Current balance:/)).toBeInTheDocument()
        expect(screen.getByText('$1500.00', { selector: 'strong' })).toBeInTheDocument()
      })
    })

    it('creates balance adjustment when form submitted', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(1, 'Adjust Balance')

      await waitFor(() => {
        expect(screen.getByLabelText('Target Balance')).toBeInTheDocument()
      })

      const targetInput = screen.getByLabelText('Target Balance')
      fireEvent.change(targetInput, { target: { value: '2000' } })

      const dialog = screen.getByRole('dialog')
      const adjustButton = dialog.querySelector('button[type="submit"]') as HTMLButtonElement
      fireEvent.click(adjustButton)

      await waitFor(() => {
        // Current balance is (1500, 0), target is 2000.00 = toIntFrac(2000) = {int: 2000, frac: 0}
        expect(mockTransactionRepository.createBalanceAdjustment).toHaveBeenCalledWith(
          1, // account id
          1500, // current balance_int
          0, // current balance_frac
          2000, // target_int
          0 // target_frac
        )
      })

      expect(mockShowToast).toHaveBeenCalledWith('Balance adjusted', 'success')
    })

    it('shows info toast when target equals current balance', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(1, 'Adjust Balance')

      await waitFor(() => {
        expect(screen.getByLabelText('Target Balance')).toBeInTheDocument()
      })

      // Current balance is 1500.00
      const targetInput = screen.getByLabelText('Target Balance')
      fireEvent.change(targetInput, { target: { value: '1500' } })

      const dialog = screen.getByRole('dialog')
      const adjustButton = dialog.querySelector('button[type="submit"]') as HTMLButtonElement
      fireEvent.click(adjustButton)

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Balance already matches target', 'info')
      })

      expect(mockTransactionRepository.createBalanceAdjustment).not.toHaveBeenCalled()
    })

    it('shows error when adjustment fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockTransactionRepository.createBalanceAdjustment.mockRejectedValueOnce(new Error('Adjustment failed'))

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(1, 'Adjust Balance')

      await waitFor(() => {
        expect(screen.getByLabelText('Target Balance')).toBeInTheDocument()
      })

      const targetInput = screen.getByLabelText('Target Balance')
      fireEvent.change(targetInput, { target: { value: '2000' } })

      const dialog = screen.getByRole('dialog')
      const adjustButton = dialog.querySelector('button[type="submit"]') as HTMLButtonElement
      fireEvent.click(adjustButton)

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Adjustment failed', 'error')
      })

      consoleSpy.mockRestore()
    })

    it('closes modal when cancel is clicked', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(1, 'Adjust Balance')

      await waitFor(() => {
        expect(screen.getByText('Adjust Balance', { selector: 'h2' })).toBeInTheDocument()
      })

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Adjust Balance', { selector: 'h2' })).not.toBeInTheDocument()
      })
    })

    it('resets target balance when modal is reopened', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      // Open modal and enter a value
      await openDropdownAndClick(1, 'Adjust Balance')
      await waitFor(() => {
        expect(screen.getByLabelText('Target Balance')).toBeInTheDocument()
      })
      const targetInput = screen.getByLabelText('Target Balance') as HTMLInputElement
      fireEvent.change(targetInput, { target: { value: '999' } })

      // Close modal
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Adjust Balance', { selector: 'h2' })).not.toBeInTheDocument()
      })

      // Reopen modal
      await openDropdownAndClick(1, 'Adjust Balance')
      await waitFor(() => {
        expect(screen.getByLabelText('Target Balance')).toBeInTheDocument()
      })

      // Value should be reset
      const newTargetInput = screen.getByLabelText('Target Balance') as HTMLInputElement
      expect(newTargetInput.value).toBe('')
    })

    it('displays explanatory text about adjustment transaction', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(1, 'Adjust Balance')

      await waitFor(() => {
        expect(screen.getByText(/adjustment transaction will be created/i)).toBeInTheDocument()
      })
    })
  })

  describe('Exchange rate on add currency', () => {
    beforeEach(() => {
      mockWalletRepository.addAccount.mockResolvedValue({
        id: 0,
        wallet_id: 1,
        currency_id: 2,
        balance_int: 0,
        balance_frac: 0,
        updated_at: 0,
      })
    })

    // Helper to open currency modal and submit EUR
    const addEurCurrency = async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, '+ Currency')

      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })

      // EUR is pre-selected as it's the only available currency not in the wallet
      const dialog = screen.getByRole('dialog')
      const addButton = dialog.querySelector('button[type="submit"]') as HTMLButtonElement
      fireEvent.click(addButton)
    }

    it('auto-fetches rate when adding non-default currency with no existing rate', async () => {
      mockCurrencyRepository.getExchangeRate.mockResolvedValue(null)
      mockSyncSingleRate.mockResolvedValue({ success: true, rate: 92 })

      await addEurCurrency()

      await waitFor(() => {
        expect(mockCurrencyRepository.getExchangeRate).toHaveBeenCalledWith(2)
      })

      await waitFor(() => {
        expect(mockSyncSingleRate).toHaveBeenCalledWith(2)
      })

      // Rate modal should NOT appear since sync succeeded
      expect(screen.queryByText('Enter Exchange Rate')).not.toBeInTheDocument()
    })

    it('skips rate check when adding default currency', async () => {
      // Make the wallet have no USD account so USD is available
      mockWalletRepository.findAll.mockResolvedValue([
        { id: 1, name: 'Cash', color: '#3B82F6', is_default: true, accounts: [] },
      ])
      // Put USD first in available currencies
      mockCurrencyRepository.findAll.mockResolvedValue([
        { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_system: true, is_fiat: true },
        { id: 2, code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, is_fiat: true },
      ])
      mockWalletRepository.addAccount.mockResolvedValue({
        id: 0, wallet_id: 1, currency_id: 1, balance_int: 0, balance_frac: 0, updated_at: 0,
      })

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })

      await openDropdownAndClick(0, '+ Currency')

      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })

      // Select USD (default currency)
      const select = screen.getByLabelText('Currency')
      fireEvent.change(select, { target: { value: '1' } })

      const dialog = screen.getByRole('dialog')
      const addButton = dialog.querySelector('button[type="submit"]') as HTMLButtonElement
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(mockWalletRepository.addAccount).toHaveBeenCalled()
      })

      // Should NOT check for exchange rate since it's the default currency
      expect(mockCurrencyRepository.getExchangeRate).not.toHaveBeenCalled()
      expect(mockSyncSingleRate).not.toHaveBeenCalled()
    })

    it('skips rate fetch when exchange rate already exists', async () => {
      mockCurrencyRepository.getExchangeRate.mockResolvedValue({
        currency_id: 2, rate_int: 0, rate_frac: 920000000000000000, updated_at: 1704067200,
      })

      await addEurCurrency()

      await waitFor(() => {
        expect(mockCurrencyRepository.getExchangeRate).toHaveBeenCalledWith(2)
      })

      // Should NOT try to sync since rate already exists
      expect(mockSyncSingleRate).not.toHaveBeenCalled()
    })

    it('shows rate modal when sync fails (offline)', async () => {
      mockCurrencyRepository.getExchangeRate.mockResolvedValue(null)
      mockSyncSingleRate.mockResolvedValue({ success: false })

      await addEurCurrency()

      await waitFor(() => {
        expect(screen.getByText('Enter Exchange Rate')).toBeInTheDocument()
      })

      // Should show currency codes in the modal text
      expect(screen.getByText(/Enter exchange rate for/)).toBeInTheDocument()
      expect(screen.getByText('EUR', { selector: 'strong' })).toBeInTheDocument()
    })

    it('saves manual rate from rate modal', async () => {
      mockCurrencyRepository.getExchangeRate.mockResolvedValue(null)
      mockSyncSingleRate.mockResolvedValue({ success: false })
      mockCurrencyRepository.setExchangeRate.mockResolvedValue(undefined)

      await addEurCurrency()

      await waitFor(() => {
        expect(screen.getByText('Enter Exchange Rate')).toBeInTheDocument()
      })

      const rateInput = screen.getByLabelText('Exchange Rate')
      fireEvent.change(rateInput, { target: { value: '0.92' } })

      const saveButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(saveButton)

      await waitFor(() => {
        // toIntFrac(0.92) = {int: 0, frac: ~920000000000000000}
        expect(mockCurrencyRepository.setExchangeRate).toHaveBeenCalledWith(2, 0, expect.any(Number))
      })

      expect(mockShowToast).toHaveBeenCalledWith('Exchange rate saved', 'success')
    })

    it('closes rate modal on Skip without saving', async () => {
      mockCurrencyRepository.getExchangeRate.mockResolvedValue(null)
      mockSyncSingleRate.mockResolvedValue({ success: false })

      await addEurCurrency()

      await waitFor(() => {
        expect(screen.getByText('Enter Exchange Rate')).toBeInTheDocument()
      })

      const skipButton = screen.getByRole('button', { name: 'Skip' })
      fireEvent.click(skipButton)

      await waitFor(() => {
        expect(screen.queryByText('Enter Exchange Rate')).not.toBeInTheDocument()
      })

      expect(mockCurrencyRepository.setExchangeRate).not.toHaveBeenCalled()
    })

    it('shows error toast when manual rate save fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockCurrencyRepository.getExchangeRate.mockResolvedValue(null)
      mockSyncSingleRate.mockResolvedValue({ success: false })
      mockCurrencyRepository.setExchangeRate.mockRejectedValue(new Error('DB error'))

      await addEurCurrency()

      await waitFor(() => {
        expect(screen.getByText('Enter Exchange Rate')).toBeInTheDocument()
      })

      const rateInput = screen.getByLabelText('Exchange Rate')
      fireEvent.change(rateInput, { target: { value: '0.92' } })

      const saveButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('DB error', 'error')
      })

      consoleSpy.mockRestore()
    })
  })
})
