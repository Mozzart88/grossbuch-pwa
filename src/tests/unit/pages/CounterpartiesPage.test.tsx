import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { CounterpartiesPage } from '../../../pages/CounterpartiesPage'
import type { Counterparty, Category } from '../../../types'

// Mock dependencies
vi.mock('../../../services/repositories', () => ({
  counterpartyRepository: {
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    canDelete: vi.fn(),
  },
  categoryRepository: {
    findAll: vi.fn(),
  },
}))

vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: vi.fn() }),
  }
})

import { counterpartyRepository, categoryRepository } from '../../../services/repositories'

const mockCounterpartyRepository = vi.mocked(counterpartyRepository)
const mockCategoryRepository = vi.mocked(categoryRepository)

const mockCounterparties: Counterparty[] = [
  {
    id: 1,
    name: 'Supermarket',
    notes: 'Weekly groceries',
    category_ids: [1],
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  },
  {
    id: 2,
    name: 'Employer Inc',
    notes: null,
    category_ids: [],
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  },
]

const mockCategories: Category[] = [
  {
    id: 1,
    name: 'Food',
    type: 'expense',
    icon: '🍔',
    color: null,
    parent_id: null,
    is_preset: 1,
    sort_order: 0,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  },
  {
    id: 2,
    name: 'Transport',
    type: 'expense',
    icon: '🚗',
    color: null,
    parent_id: null,
    is_preset: 1,
    sort_order: 0,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  },
  {
    id: 3,
    name: 'Third Category',
    type: 'expense',
    icon: '📦',
    color: null,
    parent_id: null,
    is_preset: 0,
    sort_order: 0,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  },
]

describe('CounterpartiesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCounterpartyRepository.findAll.mockResolvedValue(mockCounterparties)
    mockCategoryRepository.findAll.mockResolvedValue(mockCategories)
    mockCounterpartyRepository.canDelete.mockResolvedValue({ canDelete: true, transactionCount: 0 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  const renderWithRouter = () => {
    return render(
      <BrowserRouter>
        <CounterpartiesPage />
      </BrowserRouter>
    )
  }

  it('displays loading spinner initially', () => {
    mockCounterpartyRepository.findAll.mockImplementation(() => new Promise(() => {}))

    const { container } = renderWithRouter()

    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('displays counterparties after loading', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Supermarket')).toBeInTheDocument()
      expect(screen.getByText('Employer Inc')).toBeInTheDocument()
    })
  })

  it('displays page title', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Counterparties')).toBeInTheDocument()
    })
  })

  it('displays Add button', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })
  })

  it('displays empty state when no counterparties', async () => {
    mockCounterpartyRepository.findAll.mockResolvedValue([])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('No counterparties yet')).toBeInTheDocument()
    })
  })

  it('displays linked category name', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Food')).toBeInTheDocument()
    })
  })

  it('displays "All categories" when no linked categories', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('All categories')).toBeInTheDocument()
    })
  })

  it('opens add modal when Add button is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Counterparty')).toBeInTheDocument()
    })
  })

  it('opens edit modal when Edit is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Edit').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Edit')[0])

    await waitFor(() => {
      expect(screen.getByText('Edit Counterparty')).toBeInTheDocument()
    })
  })

  it('populates form when editing', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Edit').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Edit')[0])

    await waitFor(() => {
      expect(screen.getByDisplayValue('Supermarket')).toBeInTheDocument()
    })
  })

  it('handles delete when canDelete is true', async () => {
    mockCounterpartyRepository.delete.mockResolvedValue()

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Delete').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Delete')[0])

    await waitFor(() => {
      expect(mockCounterpartyRepository.delete).toHaveBeenCalledWith(1)
    })
  })

  it('does not delete when user cancels confirm', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Delete').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Delete')[0])

    expect(mockCounterpartyRepository.delete).not.toHaveBeenCalled()
  })

  it('creates new counterparty via form', async () => {
    mockCounterpartyRepository.create.mockResolvedValue(3)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Counterparty')).toBeInTheDocument()
    })

    const nameInput = screen.getByPlaceholderText('e.g., Amazon, Supermarket')
    fireEvent.change(nameInput, { target: { value: 'New Shop' } })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockCounterpartyRepository.create).toHaveBeenCalled()
    })
  })

  it('allows toggling category selection', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Counterparty')).toBeInTheDocument()
    })

    // Find the Food category button and click it
    const categoryButtons = screen.getAllByRole('button')
    const foodButton = categoryButtons.find(btn => btn.textContent?.includes('Food'))
    if (foodButton) {
      fireEvent.click(foodButton)
    }
  })

  it('closes modal on Cancel', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Counterparty')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.queryByText('Add Counterparty')).not.toBeInTheDocument()
    })
  })

  it('handles load error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockCounterpartyRepository.findAll.mockRejectedValue(new Error('Load failed'))

    renderWithRouter()

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })

  it('truncates long category lists', async () => {
    // Counterparty with more than 2 categories
    mockCounterpartyRepository.findAll.mockResolvedValue([
      {
        ...mockCounterparties[0],
        category_ids: [1, 2, 3],
      },
    ])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText(/\+1/)).toBeInTheDocument()
    })
  })

  it('shows cannot delete error for counterparty with transactions', async () => {
    mockCounterpartyRepository.canDelete.mockResolvedValue({ canDelete: false, transactionCount: 5 })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Delete').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Delete')[0])

    await waitFor(() => {
      expect(mockCounterpartyRepository.delete).not.toHaveBeenCalled()
    })
  })
})
