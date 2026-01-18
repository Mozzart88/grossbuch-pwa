import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExchangeRatesPage } from '../../../pages/ExchangeRatesPage'
import type { Currency, ExchangeRate } from '../../../types'

// Mock repositories
vi.mock('../../../services/repositories', () => ({
  currencyRepository: {
    findAll: vi.fn(),
    getAllExchangeRates: vi.fn(),
    setExchangeRate: vi.fn(),
  },
}))

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}))

import { currencyRepository } from '../../../services/repositories'

const mockCurrencyRepository = vi.mocked(currencyRepository)

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
    is_default: false,
    is_fiat: true,
  },
  {
    id: 3,
    code: 'RUB',
    name: 'Russian Ruble',
    symbol: '₽',
    decimal_places: 2,
    is_default: false,
    is_fiat: true,
  },
]

const mockExchangeRates: ExchangeRate[] = [
  { currency_id: 2, rate: 92, updated_at: 1704067200 },
  { currency_id: 3, rate: 9000, updated_at: 1704067200 },
]

describe('ExchangeRatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.findAll.mockResolvedValue(mockCurrencies)
    mockCurrencyRepository.getAllExchangeRates.mockResolvedValue(mockExchangeRates)
    mockCurrencyRepository.setExchangeRate.mockResolvedValue(undefined)
  })

  it('shows loading spinner initially', () => {
    mockCurrencyRepository.findAll.mockImplementation(() => new Promise(() => {}))

    const { container } = render(<ExchangeRatesPage />)

    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('displays all currencies with their rates', async () => {
    render(<ExchangeRatesPage />)

    await waitFor(() => {
      expect(screen.getByText('USD')).toBeInTheDocument()
      expect(screen.getByText('EUR')).toBeInTheDocument()
      expect(screen.getByText('RUB')).toBeInTheDocument()
    })
  })

  it('shows default badge for default currency', async () => {
    render(<ExchangeRatesPage />)

    await waitFor(() => {
      expect(screen.getByText('Default')).toBeInTheDocument()
    })
  })

  it('displays rate of 1.0000 for default currency', async () => {
    render(<ExchangeRatesPage />)

    await waitFor(() => {
      // USD should show 1.0000
      const rates = screen.getAllByText('1.0000')
      expect(rates.length).toBeGreaterThan(0)
    })
  })

  it('displays formatted rates for non-default currencies', async () => {
    render(<ExchangeRatesPage />)

    await waitFor(() => {
      // EUR rate 92 with 2 decimals = 92/100 = 0.92 displayed as 0.9200
      expect(screen.getByText('0.9200')).toBeInTheDocument()
      // RUB rate 9000 with 2 decimals = 9000/100 = 90.00 displayed as 90.0000
      expect(screen.getByText('90.0000')).toBeInTheDocument()
    })
  })

  it('shows "Not set" for currencies without rates', async () => {
    mockCurrencyRepository.getAllExchangeRates.mockResolvedValue([])

    render(<ExchangeRatesPage />)

    await waitFor(() => {
      const notSetElements = screen.getAllByText('Not set')
      expect(notSetElements.length).toBe(2) // EUR and RUB
    })
  })

  it('opens modal when clicking on non-default currency', async () => {
    render(<ExchangeRatesPage />)

    await waitFor(() => {
      expect(screen.getByText('EUR')).toBeInTheDocument()
    })

    // Click on EUR row
    const eurRow = screen.getByText('EUR').closest('div[class*="cursor-pointer"]')
    if (eurRow) {
      fireEvent.click(eurRow)
    }

    await waitFor(() => {
      expect(screen.getByText(/Edit EUR Rate/i)).toBeInTheDocument()
    })
  })

  it('does not open modal for default currency', async () => {
    render(<ExchangeRatesPage />)

    await waitFor(() => {
      expect(screen.getByText('USD')).toBeInTheDocument()
    })

    // Click on USD row
    const usdRow = screen.getByText('USD').closest('div[class*="cursor-pointer"]')
    if (usdRow) {
      fireEvent.click(usdRow)
    }

    // Modal should not appear
    await waitFor(() => {
      expect(screen.queryByText(/Edit USD Rate/i)).not.toBeInTheDocument()
    })
  })

  it('saves new rate when form is submitted', async () => {
    render(<ExchangeRatesPage />)

    await waitFor(() => {
      expect(screen.getByText('EUR')).toBeInTheDocument()
    })

    // Click on EUR row
    const eurRow = screen.getByText('EUR').closest('div[class*="cursor-pointer"]')
    if (eurRow) {
      fireEvent.click(eurRow)
    }

    await waitFor(() => {
      expect(screen.getByText(/Edit EUR Rate/i)).toBeInTheDocument()
    })

    // Change rate
    const rateInput = screen.getByRole('spinbutton')
    fireEvent.change(rateInput, { target: { value: '1.15' } })

    // Submit
    const saveButton = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(saveButton)

    await waitFor(() => {
      // Rate 1.15 * 100 = 115
      expect(mockCurrencyRepository.setExchangeRate).toHaveBeenCalledWith(2, 115)
    })
  })

  it('closes modal when cancel is clicked', async () => {
    render(<ExchangeRatesPage />)

    await waitFor(() => {
      expect(screen.getByText('EUR')).toBeInTheDocument()
    })

    // Click on EUR row
    const eurRow = screen.getByText('EUR').closest('div[class*="cursor-pointer"]')
    if (eurRow) {
      fireEvent.click(eurRow)
    }

    await waitFor(() => {
      expect(screen.getByText(/Edit EUR Rate/i)).toBeInTheDocument()
    })

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelButton)

    await waitFor(() => {
      expect(screen.queryByText(/Edit EUR Rate/i)).not.toBeInTheDocument()
    })
  })

  it('displays info text about rate semantics', async () => {
    render(<ExchangeRatesPage />)

    await waitFor(() => {
      expect(screen.getByText(/Rates are relative to/i)).toBeInTheDocument()
    })
  })

  it('handles error when loading data fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCurrencyRepository.findAll.mockRejectedValue(new Error('Load failed'))

    render(<ExchangeRatesPage />)

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })

  it('shows default rate in modal for currency without rate', async () => {
    // EUR has no rate set
    mockCurrencyRepository.getAllExchangeRates.mockResolvedValue([])

    render(<ExchangeRatesPage />)

    await waitFor(() => {
      expect(screen.getByText('EUR')).toBeInTheDocument()
    })

    // Click on EUR row
    const eurRow = screen.getByText('EUR').closest('div[class*="cursor-pointer"]')
    if (eurRow) {
      fireEvent.click(eurRow)
    }

    await waitFor(() => {
      // Should show default rate 1.00 in input
      const rateInput = screen.getByRole('spinbutton')
      expect(rateInput).toHaveValue(1)
    })
  })

  it('shows error toast for invalid rate input', async () => {
    render(<ExchangeRatesPage />)

    await waitFor(() => {
      expect(screen.getByText('EUR')).toBeInTheDocument()
    })

    // Click on EUR row
    const eurRow = screen.getByText('EUR').closest('div[class*="cursor-pointer"]')
    if (eurRow) {
      fireEvent.click(eurRow)
    }

    await waitFor(() => {
      expect(screen.getByText(/Edit EUR Rate/i)).toBeInTheDocument()
    })

    // Enter invalid rate
    const rateInput = screen.getByRole('spinbutton')
    fireEvent.change(rateInput, { target: { value: '0' } })

    // Submit
    const saveButton = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(saveButton)

    // Should not call setExchangeRate
    expect(mockCurrencyRepository.setExchangeRate).not.toHaveBeenCalled()
  })

  it('handles error when saving rate fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCurrencyRepository.setExchangeRate.mockRejectedValue(new Error('Save failed'))

    render(<ExchangeRatesPage />)

    await waitFor(() => {
      expect(screen.getByText('EUR')).toBeInTheDocument()
    })

    // Click on EUR row
    const eurRow = screen.getByText('EUR').closest('div[class*="cursor-pointer"]')
    if (eurRow) {
      fireEvent.click(eurRow)
    }

    await waitFor(() => {
      expect(screen.getByText(/Edit EUR Rate/i)).toBeInTheDocument()
    })

    // Enter valid rate
    const rateInput = screen.getByRole('spinbutton')
    fireEvent.change(rateInput, { target: { value: '1.15' } })

    // Submit
    const saveButton = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })
})
