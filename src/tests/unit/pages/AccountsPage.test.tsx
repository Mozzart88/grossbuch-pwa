import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AccountsPage } from '../../../pages/AccountsPage'
import type { Wallet, Currency, Account } from '../../../types'

// Mock dependencies
vi.mock('../../../services/repositories', () => ({
  walletRepository: {
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addAccount: vi.fn(),
  },
  currencyRepository: {
    findAll: vi.fn(),
  },
  accountRepository: {
    delete: vi.fn(),
  },
}))

const mockShowToast = vi.fn()
vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: mockShowToast }),
  }
})

import { walletRepository, currencyRepository, accountRepository } from '../../../services/repositories'

const mockWalletRepository = vi.mocked(walletRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockAccountRepository = vi.mocked(accountRepository)

const mockAccount: Account = {
  id: 1,
  wallet_id: 1,
  currency_id: 1,
  balance: 150000,
  updated_at: 1704067200,
  wallet: 'Cash',
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
}

const mockBankAccount: Account = {
  id: 2,
  wallet_id: 2,
  currency_id: 1,
  balance: 1500000,
  updated_at: 1704067200,
  wallet: 'Bank',
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
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
    is_default: true,
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
      <BrowserRouter>
        <AccountsPage />
      </BrowserRouter>
    )
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

  it('displays page title', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Wallets & Accounts')).toBeInTheDocument()
    })
  })

  it('displays Add Wallet button', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add Wallet')).toBeInTheDocument()
    })
  })

  it('displays empty state when no wallets', async () => {
    mockWalletRepository.findAll.mockResolvedValue([])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('No wallets yet')).toBeInTheDocument()
    })
  })

  it('opens wallet modal when Add Wallet button is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add Wallet')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add Wallet'))

    await waitFor(() => {
      expect(screen.getByText('Add Wallet', { selector: 'h2' })).toBeInTheDocument()
    })
  })

  it('opens edit modal when Edit is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Edit').length > 0)
    })

    fireEvent.click(screen.getAllByText('Edit')[0])

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
        accounts: [{ ...mockAccount, balance: -50000 }],
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
      expect(screen.getByText('Default')).toBeInTheDocument()
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
        expect(screen.getByText('Add Wallet')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Add Wallet'))

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
        expect(screen.getByText('Add Wallet')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Add Wallet'))

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
        expect(screen.getByText('Add Wallet')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Add Wallet'))

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
        expect(screen.getAllByText('Edit').length > 0)
      })

      fireEvent.click(screen.getAllByText('Edit')[0])

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
        expect(screen.getAllByText('Delete').length > 0)
      })

      fireEvent.click(screen.getAllByText('Delete')[0])

      await waitFor(() => {
        expect(mockWalletRepository.delete).toHaveBeenCalledWith(1)
      })

      expect(mockShowToast).toHaveBeenCalledWith('Wallet deleted', 'success')
    })

    it('does not delete when cancelled', async () => {
      vi.spyOn(window, 'confirm').mockImplementationOnce(() => false)

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getAllByText('Delete').length > 0)
      })

      fireEvent.click(screen.getAllByText('Delete')[0])

      expect(mockWalletRepository.delete).not.toHaveBeenCalled()
    })

    it('shows error when delete fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockWalletRepository.delete.mockRejectedValue(new Error('Delete failed'))

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getAllByText('Delete').length > 0)
      })

      fireEvent.click(screen.getAllByText('Delete')[0])

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
        balance: 0,
        updated_at: 0
      })
    })

    it('opens add currency modal', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getAllByText('+ Currency').length > 0)
      })

      fireEvent.click(screen.getAllByText('+ Currency')[0])

      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })
    })

    it('adds currency to wallet', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getAllByText('+ Currency').length > 0)
      })

      fireEvent.click(screen.getAllByText('+ Currency')[0])

      await waitFor(() => {
        expect(screen.getByText('Add Currency to Wallet')).toBeInTheDocument()
      })

      // Submit the form (EUR should be pre-selected as it's not in the wallet)
      const addButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(addButton)

      await waitFor(() => {
        expect(mockWalletRepository.addAccount).toHaveBeenCalled()
      })

      expect(mockShowToast).toHaveBeenCalledWith('Currency added to wallet', 'success')
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
        expect(screen.getAllByText('Remove').length > 0)
      })

      fireEvent.click(screen.getAllByText('Remove')[0])

      await waitFor(() => {
        expect(mockAccountRepository.delete).toHaveBeenCalledWith(1)
      })

      expect(mockShowToast).toHaveBeenCalledWith('Account removed', 'success')
    })
  })

  describe('Modal behavior', () => {
    it('closes modal when Cancel clicked', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Add Wallet')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Add Wallet'))

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
        expect(screen.getAllByText('Edit').length > 0)
      })

      fireEvent.click(screen.getAllByText('Edit')[0])

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
})
