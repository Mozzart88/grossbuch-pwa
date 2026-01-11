import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AccountsPage } from '../../../pages/AccountsPage'
import type { Account, Currency } from '../../../types'

// Mock dependencies
vi.mock('../../../services/repositories', () => ({
  accountRepository: {
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  currencyRepository: {
    findAll: vi.fn(),
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

import { accountRepository, currencyRepository } from '../../../services/repositories'

const mockAccountRepository = vi.mocked(accountRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)

const mockAccounts: Account[] = [
  {
    id: 1,
    name: 'Cash',
    currency_id: 1,
    initial_balance: 1000,
    icon: null,
    color: null,
    is_active: 1,
    sort_order: 0,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
    currency_code: 'USD',
    currency_symbol: '$',
    current_balance: 1500,
  },
]

const mockCurrencies: Currency[] = [
  {
    id: 1,
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimal_places: 2,
    is_preset: 1,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  },
]

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAccountRepository.findAll.mockResolvedValue(mockAccounts)
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
    mockAccountRepository.findAll.mockImplementation(
      () => new Promise(() => {})
    )

    const { container } = renderWithRouter()

    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('displays accounts after loading', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument()
    })

    expect(screen.getByText('USD')).toBeInTheDocument()
    expect(screen.getByText('$1,500.00')).toBeInTheDocument()
  })

  it('displays page title', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Accounts')).toBeInTheDocument()
    })
  })

  it('displays Add button', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })
  })

  it('displays empty state when no accounts', async () => {
    mockAccountRepository.findAll.mockResolvedValue([])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('No accounts yet')).toBeInTheDocument()
    })
  })

  it('opens modal when Add button is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Account')).toBeInTheDocument()
    })
  })

  it('opens edit modal when Edit is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Edit'))

    await waitFor(() => {
      expect(screen.getByText('Edit Account')).toBeInTheDocument()
    })
  })

  it('displays account balance with correct color for positive', async () => {
    renderWithRouter()

    await waitFor(() => {
      const balance = screen.getByText('$1,500.00')
      expect(balance.className).toContain('text-green-600')
    })
  })

  it('displays account balance with correct color for negative', async () => {
    mockAccountRepository.findAll.mockResolvedValue([
      { ...mockAccounts[0], current_balance: -500 },
    ])

    renderWithRouter()

    await waitFor(() => {
      const balance = screen.getByText('-$500.00')
      expect(balance.className).toContain('text-red-600')
    })
  })

  it('calls findAll on mount', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(mockAccountRepository.findAll).toHaveBeenCalled()
      expect(mockCurrencyRepository.findAll).toHaveBeenCalled()
    })
  })

  describe('Create account', () => {
    beforeEach(() => {
      mockAccountRepository.create.mockResolvedValue(2)
    })

    it('creates account when form submitted', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Add')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(screen.getByText('Add Account')).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText('Name')
      fireEvent.change(nameInput, { target: { value: 'New Account' } })

      const submitButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockAccountRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Account',
            currency_id: 1,
          })
        )
      })

      expect(mockShowToast).toHaveBeenCalledWith('Account created', 'success')
    })

    it('shows error when create fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockAccountRepository.create.mockRejectedValue(new Error('Create failed'))

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Add')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(screen.getByText('Add Account')).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText('Name')
      fireEvent.change(nameInput, { target: { value: 'New Account' } })

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
        expect(screen.getByText('Add')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(screen.getByText('Add Account')).toBeInTheDocument()
      })

      const submitButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(submitButton)

      expect(mockAccountRepository.create).not.toHaveBeenCalled()
    })
  })

  describe('Update account', () => {
    beforeEach(() => {
      mockAccountRepository.update.mockResolvedValue(undefined)
    })

    it('updates account when form submitted', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Edit'))

      await waitFor(() => {
        expect(screen.getByText('Edit Account')).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText('Name')
      fireEvent.change(nameInput, { target: { value: 'Updated Cash' } })

      const submitButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockAccountRepository.update).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            name: 'Updated Cash',
          })
        )
      })

      expect(mockShowToast).toHaveBeenCalledWith('Account updated', 'success')
    })
  })

  describe('Delete account', () => {
    beforeEach(() => {
      mockAccountRepository.delete.mockResolvedValue(undefined)
      vi.spyOn(window, 'confirm').mockImplementation(() => true)
    })

    it('deletes account when confirmed', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(mockAccountRepository.delete).toHaveBeenCalledWith(1)
      })

      expect(mockShowToast).toHaveBeenCalledWith('Account deleted', 'success')
    })

    it('does not delete when cancelled', async () => {
      vi.spyOn(window, 'confirm').mockImplementationOnce(() => false)

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete'))

      expect(mockAccountRepository.delete).not.toHaveBeenCalled()
    })

    it('shows error when delete fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockAccountRepository.delete.mockRejectedValue(new Error('Delete failed'))

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Delete failed', 'error')
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Modal behavior', () => {
    it('closes modal when Cancel clicked', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Add')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Add'))

      await waitFor(() => {
        expect(screen.getByText('Add Account')).toBeInTheDocument()
      })

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Add Account')).not.toBeInTheDocument()
      })
    })

    it('pre-fills form when editing', async () => {
      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Edit'))

      await waitFor(() => {
        const nameInput = screen.getByLabelText('Name') as HTMLInputElement
        expect(nameInput.value).toBe('Cash')
      })
    })
  })

  describe('Error handling', () => {
    it('handles load error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockAccountRepository.findAll.mockRejectedValue(new Error('Load failed'))

      renderWithRouter()

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load data:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })
  })
})
