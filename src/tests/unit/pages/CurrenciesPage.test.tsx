import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { CurrenciesPage } from '../../../pages/CurrenciesPage'
import type { Currency } from '../../../types'

// Mock dependencies
vi.mock('../../../services/repositories', () => ({
  currencyRepository: {
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setDefault: vi.fn(),
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

import { currencyRepository } from '../../../services/repositories'

const mockCurrencyRepository = vi.mocked(currencyRepository)

const mockCurrencies: Currency[] = [
  {
    id: 1,
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimal_places: 2,
    created_at: 1704067200,
    updated_at: 1704067200,
    is_default: true,
    is_fiat: true,
  },
  {
    id: 2,
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    decimal_places: 2,
    created_at: 1704067200,
    updated_at: 1704067200,
    is_fiat: true,
  },
  {
    id: 3,
    code: 'BTC',
    name: 'Bitcoin',
    symbol: '₿',
    decimal_places: 8,
    created_at: 1704067200,
    updated_at: 1704067200,
    is_crypto: true,
  },
]

describe('CurrenciesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrencyRepository.findAll.mockResolvedValue(mockCurrencies)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  const renderWithRouter = () => {
    return render(
      <BrowserRouter>
        <CurrenciesPage />
      </BrowserRouter>
    )
  }

  it('displays loading spinner initially', () => {
    mockCurrencyRepository.findAll.mockImplementation(() => new Promise(() => {}))

    const { container } = renderWithRouter()

    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('displays currencies after loading', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('USD')).toBeInTheDocument()
      expect(screen.getByText('US Dollar')).toBeInTheDocument()
      expect(screen.getByText('EUR')).toBeInTheDocument()
    })
  })

  it('displays page title', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Currencies')).toBeInTheDocument()
    })
  })

  it('displays Add button', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })
  })

  it('displays currency symbols', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('$')).toBeInTheDocument()
      expect(screen.getByText('€')).toBeInTheDocument()
      expect(screen.getByText('₿')).toBeInTheDocument()
    })
  })

  it('displays Default badge for default currency', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Default')).toBeInTheDocument()
    })
  })

  it('displays Crypto badge for crypto currencies', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Crypto')).toBeInTheDocument()
    })
  })

  it('opens add modal when Add button is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Currency')).toBeInTheDocument()
    })
  })

  it('opens edit modal when Edit is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Edit').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Edit')[0])

    await waitFor(() => {
      expect(screen.getByText('Edit Currency')).toBeInTheDocument()
    })
  })

  it('populates form when editing', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Edit').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Edit')[0])

    await waitFor(() => {
      expect(screen.getByDisplayValue('USD')).toBeInTheDocument()
      expect(screen.getByDisplayValue('US Dollar')).toBeInTheDocument()
    })
  })

  it('shows Set Default button for non-default currencies', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Set Default').length).toBe(2) // EUR and BTC
    })
  })

  it('handles set default', async () => {
    mockCurrencyRepository.setDefault.mockResolvedValue()

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Set Default').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Set Default')[0])

    await waitFor(() => {
      expect(mockCurrencyRepository.setDefault).toHaveBeenCalled()
    })
  })

  it('handles delete', async () => {
    mockCurrencyRepository.delete.mockResolvedValue()

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Delete').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Delete')[0])

    await waitFor(() => {
      expect(mockCurrencyRepository.delete).toHaveBeenCalled()
    })
  })

  it('does not delete when user cancels confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Delete').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Delete')[0])

    expect(mockCurrencyRepository.delete).not.toHaveBeenCalled()
  })

  it('creates new currency via form', async () => {
    mockCurrencyRepository.create.mockResolvedValue(4)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Currency')).toBeInTheDocument()
    })

    const codeInput = screen.getByPlaceholderText('e.g., BTC, GBP')
    const nameInput = screen.getByPlaceholderText('e.g., Bitcoin, British Pound')
    const symbolInput = screen.getByPlaceholderText('e.g., B, L')

    fireEvent.change(codeInput, { target: { value: 'GBP' } })
    fireEvent.change(nameInput, { target: { value: 'British Pound' } })
    fireEvent.change(symbolInput, { target: { value: '£' } })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockCurrencyRepository.create).toHaveBeenCalled()
    })
  })

  it('converts code to uppercase', async () => {
    mockCurrencyRepository.create.mockResolvedValue(4)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Currency')).toBeInTheDocument()
    })

    const codeInput = screen.getByPlaceholderText('e.g., BTC, GBP')
    const nameInput = screen.getByPlaceholderText('e.g., Bitcoin, British Pound')
    const symbolInput = screen.getByPlaceholderText('e.g., B, L')

    fireEvent.change(codeInput, { target: { value: 'gbp' } })
    fireEvent.change(nameInput, { target: { value: 'British Pound' } })
    fireEvent.change(symbolInput, { target: { value: '£' } })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockCurrencyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'GBP' })
      )
    })
  })

  it('allows selecting fiat or crypto type', async () => {
    mockCurrencyRepository.create.mockResolvedValue(4)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Currency')).toBeInTheDocument()
    })

    // Find and click the Crypto button
    const cryptoButton = screen.getByRole('button', { name: 'Crypto' })
    fireEvent.click(cryptoButton)

    const codeInput = screen.getByPlaceholderText('e.g., BTC, GBP')
    const nameInput = screen.getByPlaceholderText('e.g., Bitcoin, British Pound')
    const symbolInput = screen.getByPlaceholderText('e.g., B, L')

    fireEvent.change(codeInput, { target: { value: 'ETH' } })
    fireEvent.change(nameInput, { target: { value: 'Ethereum' } })
    fireEvent.change(symbolInput, { target: { value: 'Ξ' } })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockCurrencyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          is_fiat: false,
          is_crypto: true,
        })
      )
    })
  })

  it('closes modal on Cancel', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Currency')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.queryByText('Add Currency')).not.toBeInTheDocument()
    })
  })

  it('handles load error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCurrencyRepository.findAll.mockRejectedValue(new Error('Load failed'))

    renderWithRouter()

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })

  it('handles delete error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCurrencyRepository.delete.mockRejectedValue(new Error('Delete failed'))

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Delete').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Delete')[0])

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Delete failed', 'error')
    })

    consoleSpy.mockRestore()
  })

  it('handles save error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCurrencyRepository.create.mockRejectedValue(new Error('Save failed'))

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    const codeInput = screen.getByPlaceholderText('e.g., BTC, GBP')
    const nameInput = screen.getByPlaceholderText('e.g., Bitcoin, British Pound')
    const symbolInput = screen.getByPlaceholderText('e.g., B, L')

    fireEvent.change(codeInput, { target: { value: 'GBP' } })
    fireEvent.change(nameInput, { target: { value: 'British Pound' } })
    fireEvent.change(symbolInput, { target: { value: '£' } })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Save failed', 'error')
    })

    consoleSpy.mockRestore()
  })

  it('does not submit when form is incomplete', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    // Only fill code, not name or symbol
    const codeInput = screen.getByPlaceholderText('e.g., BTC, GBP')
    fireEvent.change(codeInput, { target: { value: 'GBP' } })

    fireEvent.click(screen.getByText('Save'))

    expect(mockCurrencyRepository.create).not.toHaveBeenCalled()
  })
})
