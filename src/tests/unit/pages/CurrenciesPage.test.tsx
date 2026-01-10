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
  },
}))

vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: vi.fn() }),
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
    is_preset: 1,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  },
  {
    id: 2,
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    decimal_places: 2,
    is_preset: 0,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
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

  it('shows Delete button only for non-preset currencies', async () => {
    renderWithRouter()

    await waitFor(() => {
      const deleteButtons = screen.getAllByText('Delete')
      expect(deleteButtons.length).toBe(1) // Only EUR is non-preset
    })
  })

  it('handles delete', async () => {
    mockCurrencyRepository.delete.mockResolvedValue()

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(mockCurrencyRepository.delete).toHaveBeenCalledWith(2)
    })
  })

  it('does not delete when user cancels confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Delete'))

    expect(mockCurrencyRepository.delete).not.toHaveBeenCalled()
  })

  it('creates new currency via form', async () => {
    mockCurrencyRepository.create.mockResolvedValue(3)

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
    const symbolInput = screen.getByPlaceholderText('e.g., ₿, £')

    fireEvent.change(codeInput, { target: { value: 'GBP' } })
    fireEvent.change(nameInput, { target: { value: 'British Pound' } })
    fireEvent.change(symbolInput, { target: { value: '£' } })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockCurrencyRepository.create).toHaveBeenCalled()
    })
  })

  it('converts code to uppercase', async () => {
    mockCurrencyRepository.create.mockResolvedValue(3)

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
    const symbolInput = screen.getByPlaceholderText('e.g., ₿, £')

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
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
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
    const symbolInput = screen.getByPlaceholderText('e.g., ₿, £')

    fireEvent.change(codeInput, { target: { value: 'GBP' } })
    fireEvent.change(nameInput, { target: { value: 'British Pound' } })
    fireEvent.change(symbolInput, { target: { value: '£' } })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
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
