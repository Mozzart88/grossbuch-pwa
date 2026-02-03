import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CounterpartiesPage } from '../../../pages/CounterpartiesPage'
import { LayoutProvider } from '../../../store/LayoutContext'
import { TestPlusButton } from '../../helpers/TestPlusButton'
import type { Counterparty, Tag } from '../../../types'

// Mock dependencies
vi.mock('../../../services/repositories', () => ({
  counterpartyRepository: {
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    canDelete: vi.fn(),
  },
  tagRepository: {
    findUserTags: vi.fn(),
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

import { counterpartyRepository, tagRepository } from '../../../services/repositories'

const mockCounterpartyRepository = vi.mocked(counterpartyRepository)
const mockTagRepository = vi.mocked(tagRepository)

const mockCounterparties: Counterparty[] = [
  {
    id: 1,
    name: 'Supermarket',
    note: 'Weekly groceries',
    tag_ids: [12],
    tags: ['food'],
    created_at: 1704067200,
    updated_at: 1704067200,
  },
  {
    id: 2,
    name: 'Employer Inc',
    note: null,
    tag_ids: [],
    created_at: 1704067200,
    updated_at: 1704067200,
  },
]

const mockTags: Tag[] = [
  {
    id: 12,
    name: 'food',
    created_at: 1704067200,
    updated_at: 1704067200,
  },
  {
    id: 14,
    name: 'transport',
    created_at: 1704067200,
    updated_at: 1704067200,
  },
  {
    id: 15,
    name: 'house',
    created_at: 1704067200,
    updated_at: 1704067200,
  },
]

describe('CounterpartiesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCounterpartyRepository.findAll.mockResolvedValue(mockCounterparties)
    mockTagRepository.findUserTags.mockResolvedValue(mockTags)
    mockCounterpartyRepository.canDelete.mockResolvedValue({ canDelete: true, transactionCount: 0 })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  const renderWithRouter = () => {
    return render(
      <MemoryRouter>
        <LayoutProvider>
          <CounterpartiesPage />
          <TestPlusButton />
        </LayoutProvider>
      </MemoryRouter>
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

  it('displays linked tag name', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('food')).toBeInTheDocument()
    })
  })

  it('displays "All tags" when no linked tags', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('All tags')).toBeInTheDocument()
    })
  })

  it('displays note when present', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Weekly groceries')).toBeInTheDocument()
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

  it('allows toggling tag selection', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Counterparty')).toBeInTheDocument()
    })

    // Find the food tag button and click it
    const tagButtons = screen.getAllByRole('button')
    const foodButton = tagButtons.find(btn => btn.textContent?.includes('food'))
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

  it('truncates long tag lists', async () => {
    // Counterparty with more than 2 tags
    mockCounterpartyRepository.findAll.mockResolvedValue([
      {
        ...mockCounterparties[0],
        tag_ids: [12, 14, 15],
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
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Cannot delete'),
        'error'
      )
    })
  })

  it('displays note field in form', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Additional info...')).toBeInTheDocument()
    })
  })

  it('saves note when provided', async () => {
    mockCounterpartyRepository.create.mockResolvedValue(3)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    const nameInput = screen.getByPlaceholderText('e.g., Amazon, Supermarket')
    const noteInput = screen.getByPlaceholderText('Additional info...')

    fireEvent.change(nameInput, { target: { value: 'New Shop' } })
    fireEvent.change(noteInput, { target: { value: 'Test note' } })

    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockCounterpartyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Shop',
          note: 'Test note',
        })
      )
    })
  })
})
