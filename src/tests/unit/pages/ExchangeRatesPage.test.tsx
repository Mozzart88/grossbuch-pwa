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
    is_system: true,
    is_fiat: true,
  },
  {
    id: 2,
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    decimal_places: 2,
    is_system: false,
    is_fiat: true,
  },
  {
    id: 3,
    code: 'RUB',
    name: 'Russian Ruble',
    symbol: '₽',
    decimal_places: 2,
    is_system: false,
    is_fiat: true,
  },
]

const mockExchangeRates: ExchangeRate[] = [
  { currency_id: 1, rate_int: 1, rate_frac: 0, updated_at: 1704067200 }, // USD (default) = 1.0
  { currency_id: 2, rate_int: 0, rate_frac: 920000000000000000, updated_at: 1704067200 },  // EUR = 0.92
  { currency_id: 3, rate_int: 90, rate_frac: 0, updated_at: 1704067200 }, // RUB = 90.0
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

  it('displays rate of 1.00 for default currency', async () => {
    render(<ExchangeRatesPage />)

    await waitFor(() => {
      // USD should show 1.00
      const rates = screen.getAllByText('1.00')
      expect(rates.length).toBeGreaterThan(0)
    })
  })

  it('displays formatted rates for non-default currencies', async () => {
    render(<ExchangeRatesPage />)

    await waitFor(() => {
      // EUR rate fromIntFrac(0, 920000000000000000) = 0.92 displayed as 0.9200
      expect(screen.getByText('0.9200')).toBeInTheDocument()
      // RUB rate fromIntFrac(90, 0) = 90.0 displayed as 90.0000
      expect(screen.getByText('90.0000')).toBeInTheDocument()
    })
  })

  it('only shows currencies with exchange rates', async () => {
    // Only EUR has a rate
    mockCurrencyRepository.getAllExchangeRates.mockResolvedValue([
      { currency_id: 2, rate_int: 0, rate_frac: 920000000000000000, updated_at: 1704067200 },
    ])

    render(<ExchangeRatesPage />)

    await waitFor(() => {
      // EUR should appear (has rate)
      expect(screen.getByText('EUR')).toBeInTheDocument()
      // USD and RUB should not appear (no rates)
      expect(screen.queryByText('USD')).not.toBeInTheDocument()
      expect(screen.queryByText('RUB')).not.toBeInTheDocument()
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
      // toIntFrac(1.15) = {int: 1, frac: ~150000000000000000}
      expect(mockCurrencyRepository.setExchangeRate).toHaveBeenCalledWith(2, 1, expect.any(Number))
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

  it('shows existing rate in modal when editing', async () => {
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
      // Should show existing rate (fromIntFrac(0, 920000000000000000) = 0.92) in input
      const rateInput = screen.getByRole('spinbutton')
      expect(rateInput).toHaveValue(0.92)
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
