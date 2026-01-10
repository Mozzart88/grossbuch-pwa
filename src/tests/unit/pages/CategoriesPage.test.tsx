import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { CategoriesPage } from '../../../pages/CategoriesPage'
import type { Category } from '../../../types'

// Mock dependencies
vi.mock('../../../services/repositories', () => ({
  categoryRepository: {
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    canDelete: vi.fn(),
  },
}))

vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: vi.fn() }),
  }
})

import { categoryRepository } from '../../../services/repositories'

const mockCategoryRepository = vi.mocked(categoryRepository)

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
    name: 'Salary',
    type: 'income',
    icon: '💰',
    color: null,
    parent_id: null,
    is_preset: 1,
    sort_order: 0,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  },
  {
    id: 3,
    name: 'Gifts',
    type: 'both',
    icon: '🎁',
    color: null,
    parent_id: null,
    is_preset: 0,
    sort_order: 0,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  },
]

describe('CategoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCategoryRepository.findAll.mockResolvedValue(mockCategories)
    mockCategoryRepository.canDelete.mockResolvedValue({ canDelete: true, transactionCount: 0 })
    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  const renderWithRouter = () => {
    return render(
      <BrowserRouter>
        <CategoriesPage />
      </BrowserRouter>
    )
  }

  it('displays loading spinner initially', () => {
    mockCategoryRepository.findAll.mockImplementation(() => new Promise(() => { }))

    const { container } = renderWithRouter()

    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('displays categories after loading', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Food')).toBeInTheDocument()
      expect(screen.getByText('Salary')).toBeInTheDocument()
    })
  })

  it('displays page title', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Categories')).toBeInTheDocument()
    })
  })

  it('displays Add button', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })
  })

  it('separates expense and income categories', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Expense Categories')).toBeInTheDocument()
      expect(screen.getByText('Income Categories')).toBeInTheDocument()
    })
  })

  it('displays category icons', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('🍔')).toBeInTheDocument()
      expect(screen.getByText('💰')).toBeInTheDocument()
    })
  })

  it('opens add modal when Add button is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Category')).toBeInTheDocument()
    })
  })

  it('opens edit modal when Edit is clicked', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Edit').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Edit')[0])

    await waitFor(() => {
      expect(screen.getByText('Edit Category')).toBeInTheDocument()
    })
  })

  it('displays empty state for expense categories when none', async () => {
    mockCategoryRepository.findAll.mockResolvedValue([
      { ...mockCategories[1] }, // Only income
    ])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('No expense categories')).toBeInTheDocument()
    })
  })

  it('displays empty state for income categories when none', async () => {
    mockCategoryRepository.findAll.mockResolvedValue([
      { ...mockCategories[0] }, // Only expense
    ])

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('No income categories')).toBeInTheDocument()
    })
  })

  it('shows both badge for categories with type both', async () => {
    renderWithRouter()

    await waitFor(() => {
      // The "both" badge should appear for the Gifts category
      expect(screen.getAllByText('both').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows Delete button only for non-preset categories', async () => {
    renderWithRouter()

    await waitFor(() => {
      const deleteButtons = screen.getAllByText('Delete')
      // Only Gifts (non-preset) should have delete button
      expect(deleteButtons.length).toBe(2) // Gifts appears in both expense and income sections
    })
  })

  it('handles delete when canDelete is true', async () => {
    mockCategoryRepository.delete.mockResolvedValue()

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Delete').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Delete')[0])

    await waitFor(() => {
      expect(mockCategoryRepository.delete).toHaveBeenCalled()
    })
  })

  it('shows error when category cannot be deleted', async () => {
    const showToast = vi.fn()
    // @ts-ignore
    vi.mocked(await import('../../../components/ui')).useToast = () => ({ showToast })
    mockCategoryRepository.canDelete.mockResolvedValue({ canDelete: false, transactionCount: 5 })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getAllByText('Delete').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getAllByText('Delete')[0])

    await waitFor(() => {
      expect(mockCategoryRepository.delete).not.toHaveBeenCalled()
    })
  })

  it('creates new category via form', async () => {
    // @ts-ignore
    mockCategoryRepository.create.mockResolvedValue(4)

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Category')).toBeInTheDocument()
    })

    // Fill in the form
    const nameInput = screen.getByPlaceholderText('e.g., Groceries')
    fireEvent.change(nameInput, { target: { value: 'Test Category' } })

    // Submit the form
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(mockCategoryRepository.create).toHaveBeenCalled()
    })
  })

  it('displays emoji options in add modal', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      // Check some emoji options are displayed
      expect(screen.getAllByText('🍔').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('🚗').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('allows selecting an emoji icon', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Category')).toBeInTheDocument()
    })

    // Click an emoji to select it
    const emojiButtons = screen.getAllByText('🚗')
    fireEvent.click(emojiButtons[emojiButtons.length - 1]) // Click the emoji button in the form
  })

  it('closes modal on Cancel', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Add Category')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.queryByText('Add Category')).not.toBeInTheDocument()
    })
  })

  it('loads categories on mount', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(mockCategoryRepository.findAll).toHaveBeenCalled()
    })
  })

  it('handles load error gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
    mockCategoryRepository.findAll.mockRejectedValue(new Error('Load failed'))

    renderWithRouter()

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })
})
