import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { OnboardingPage } from '../../../pages/OnboardingPage'
import type { Currency } from '../../../types'

vi.mock('../../../services/repositories', () => ({
  currencyRepository: {
    findAll: vi.fn(),
    setSystem: vi.fn(),
    setPaymentDefault: vi.fn(),
    clearPaymentDefault: vi.fn(),
  },
  walletRepository: {
    create: vi.fn(),
    addAccount: vi.fn(),
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

import { currencyRepository, walletRepository } from '../../../services/repositories'

const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockWalletRepository = vi.mocked(walletRepository)

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

describe('OnboardingPage', () => {
  const onComplete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.findAll.mockResolvedValue(mockCurrencies)
    mockCurrencyRepository.setSystem.mockResolvedValue(undefined)
    mockCurrencyRepository.setPaymentDefault.mockResolvedValue(undefined)
    mockCurrencyRepository.clearPaymentDefault.mockResolvedValue(undefined)
    mockWalletRepository.create.mockResolvedValue({ id: 1, name: 'My Wallet', color: null })
    mockWalletRepository.addAccount.mockResolvedValue({} as never)
  })

  const renderPage = () => render(<OnboardingPage onComplete={onComplete} />)

  describe('Step 1 — currencies', () => {
    it('shows loading spinner initially', () => {
      mockCurrencyRepository.findAll.mockImplementation(() => new Promise(() => {}))
      const { container } = renderPage()
      expect(container.querySelector('.animate-spin')).toBeTruthy()
    })

    it('loads and displays step 1 after currencies load', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
      })
    })

    it('pre-selects system currency as display currency', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
      })
      const displayInput = screen.getByLabelText('Display currency')
      await waitFor(() => expect(displayInput).toHaveValue('USD — US Dollar'))
    })

    it('pre-selects "Same as display" when no payment default exists', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
      })
      // LiveSearch shows empty input when the controlled value is '' (empty-string option)
      const paymentInput = screen.getByLabelText('Payment currency')
      expect(paymentInput).toHaveValue('')
    })

    it('pre-selects payment default when it exists and differs from system', async () => {
      const currenciesWithPaymentDefault: Currency[] = [
        { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_system: true, is_fiat: true },
        { id: 2, code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, is_fiat: true, is_payment_default: true },
      ]
      mockCurrencyRepository.findAll.mockResolvedValue(currenciesWithPaymentDefault)

      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
      })
      const paymentInput = screen.getByLabelText('Payment currency')
      await waitFor(() => expect(paymentInput).toHaveValue('EUR — Euro'))
    })

    it('does not call setSystem when display currency is unchanged, calls clearPaymentDefault', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Continue'))
      })

      // Display currency is already the system currency — no setSystem call needed
      expect(mockCurrencyRepository.setSystem).not.toHaveBeenCalled()
      expect(mockCurrencyRepository.clearPaymentDefault).toHaveBeenCalled()
      expect(mockCurrencyRepository.setPaymentDefault).not.toHaveBeenCalled()
    })

    it('calls setSystem when display currency is changed', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
      })

      // Change display currency to EUR (id=2)
      const displayInput = screen.getByLabelText('Display currency')
      fireEvent.focus(displayInput)
      await waitFor(() => expect(screen.getByRole('option', { name: /EUR — Euro/ })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('option', { name: /EUR — Euro/ }))

      await act(async () => {
        fireEvent.click(screen.getByText('Continue'))
      })

      expect(mockCurrencyRepository.setSystem).toHaveBeenCalledWith(2)
    })

    it('calls setPaymentDefault when a payment currency is selected', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
      })

      const paymentInput = screen.getByLabelText('Payment currency')
      fireEvent.focus(paymentInput)
      await waitFor(() => expect(screen.getByRole('option', { name: /EUR — Euro/ })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('option', { name: /EUR — Euro/ }))

      await act(async () => {
        fireEvent.click(screen.getByText('Continue'))
      })

      expect(mockCurrencyRepository.setPaymentDefault).toHaveBeenCalledWith(2)
    })

    it('advances to step 2 after Continue', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Continue'))
      })

      await waitFor(() => {
        expect(screen.getByText('First Wallet')).toBeInTheDocument()
      })
    })

    it('advances to step 2 without DB writes on Skip', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
      })

      fireEvent.click(screen.getAllByText('Skip for now')[0])

      await waitFor(() => {
        expect(screen.getByText('First Wallet')).toBeInTheDocument()
      })
      expect(mockCurrencyRepository.setSystem).not.toHaveBeenCalled()
      expect(mockCurrencyRepository.setPaymentDefault).not.toHaveBeenCalled()
      expect(mockCurrencyRepository.clearPaymentDefault).not.toHaveBeenCalled()
    })

    it('shows toast on currency load error', async () => {
      mockCurrencyRepository.findAll.mockRejectedValue(new Error('DB error'))
      renderPage()

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('DB error', 'error')
      })
    })

    it('shows toast on currency save error', async () => {
      mockCurrencyRepository.clearPaymentDefault.mockRejectedValue(new Error('Save failed'))
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByText('Continue'))
      })

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Save failed', 'error')
      })
      // Should stay on step 1
      expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
    })
  })

  describe('Step 2 — wallet', () => {
    const goToStep2 = async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
      })
      fireEvent.click(screen.getAllByText('Skip for now')[0])
      await waitFor(() => {
        expect(screen.getByText('First Wallet')).toBeInTheDocument()
      })
    }

    it('renders wallet form with default name', async () => {
      await goToStep2()
      expect(screen.getByDisplayValue('My Wallet')).toBeInTheDocument()
    })

    it('creates wallet and account on Create Wallet', async () => {
      await goToStep2()

      await act(async () => {
        fireEvent.click(screen.getByText('Create Wallet'))
      })

      expect(mockWalletRepository.create).toHaveBeenCalledWith({ name: 'My Wallet' })
      expect(mockWalletRepository.addAccount).toHaveBeenCalledWith(1, 1, undefined)
      expect(onComplete).toHaveBeenCalled()
    })

    it('passes initial balance when provided', async () => {
      await goToStep2()

      const balanceInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(balanceInput, { target: { value: '500' } })

      await act(async () => {
        fireEvent.click(screen.getByText('Create Wallet'))
      })

      expect(mockWalletRepository.addAccount).toHaveBeenCalledWith(1, 1, 500)
    })

    it('does not pass initial balance when 0', async () => {
      await goToStep2()

      const balanceInput = screen.getByPlaceholderText('0.00')
      fireEvent.change(balanceInput, { target: { value: '0' } })

      await act(async () => {
        fireEvent.click(screen.getByText('Create Wallet'))
      })

      expect(mockWalletRepository.addAccount).toHaveBeenCalledWith(1, 1, undefined)
    })

    it('calls onComplete directly on Skip without DB writes', async () => {
      await goToStep2()

      fireEvent.click(screen.getAllByText('Skip for now')[0])

      expect(onComplete).toHaveBeenCalled()
      expect(mockWalletRepository.create).not.toHaveBeenCalled()
    })

    it('shows toast on wallet creation error', async () => {
      mockWalletRepository.create.mockRejectedValue(new Error('Wallet error'))
      await goToStep2()

      await act(async () => {
        fireEvent.click(screen.getByText('Create Wallet'))
      })

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Wallet error', 'error')
      })
      expect(onComplete).not.toHaveBeenCalled()
    })

    it('pre-fills wallet currency from step 1 display currency', async () => {
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Currency Preferences')).toBeInTheDocument()
      })

      // Change display currency to EUR (id=2)
      const displayInput = screen.getByLabelText('Display currency')
      fireEvent.focus(displayInput)
      await waitFor(() => expect(screen.getByRole('option', { name: /EUR — Euro/ })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('option', { name: /EUR — Euro/ }))

      await act(async () => {
        fireEvent.click(screen.getByText('Continue'))
      })

      await waitFor(() => {
        expect(screen.getByText('First Wallet')).toBeInTheDocument()
      })

      // Wallet currency input should show EUR
      expect(screen.getByLabelText('Currency')).toHaveValue('EUR — Euro')
    })
  })
})
