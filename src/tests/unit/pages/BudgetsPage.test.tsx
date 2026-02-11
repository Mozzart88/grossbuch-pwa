import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { BudgetsPage } from '../../../pages/BudgetsPage'
import { ToastProvider } from '../../../components/ui'
import { SYSTEM_TAGS } from '../../../types'

// Mock repositories
vi.mock('../../../services/repositories', () => ({
  budgetRepository: {
    findByMonth: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    canDelete: vi.fn(),
  },
  tagRepository: {
    findExpenseTags: vi.fn(),
  },
  currencyRepository: {
    findSystem: vi.fn(),
  },
}))

import { budgetRepository, tagRepository, currencyRepository } from '../../../services/repositories'

const mockBudgetRepository = vi.mocked(budgetRepository)
const mockTagRepository = vi.mocked(tagRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)

const mockBudget = {
  id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
  start: 1704067200,
  end: 1706745600,
  tag_id: SYSTEM_TAGS.FOOD,
  amount: 50000,
  tag: 'food',
  actual: 25000,
}

const mockExpenseTags = [
  { id: 12, name: 'food', created_at: 1, updated_at: 1, sort_order: 10 },
  { id: 13, name: 'transport', created_at: 1, updated_at: 1, sort_order: 8 },
]

const mockCurrency = {
  id: 1,
  code: 'USD',
  name: 'US Dollar',
  symbol: '$',
  decimal_places: 2,
  created_at: 1,
  updated_at: 1,
  is_system: true,
}

const renderPage = () => {
  return render(
    <BrowserRouter>
      <ToastProvider>
        <BudgetsPage />
      </ToastProvider>
    </BrowserRouter>
  )
}

describe('BudgetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBudgetRepository.findByMonth.mockResolvedValue([])
    mockTagRepository.findExpenseTags.mockResolvedValue(mockExpenseTags)
    mockCurrencyRepository.findSystem.mockResolvedValue(mockCurrency)
  })

  describe('Loading state', () => {
    it('shows loading spinner initially', () => {
      mockBudgetRepository.findByMonth.mockImplementation(() => new Promise(() => { }))
      renderPage()

      expect(screen.getByRole('status')).toBeInTheDocument()
    })
  })

  describe('Empty state', () => {
    it('shows empty state when no budgets', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([])
      renderPage()

      await waitFor(() => {
        expect(screen.getByText(/No budgets for/)).toBeInTheDocument()
      })
    })

    it('shows Add Budget button in empty state', async () => {
      renderPage()

      const now = new Date()
      const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

      await waitFor(() => {
        expect(screen.getByText(`No budgets for ${monthLabel}`)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Create Budget' })).toBeInTheDocument()
      })
    })
  })

  describe('Budget list', () => {
    it('displays budgets with progress', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([mockBudget])
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('food')).toBeInTheDocument()
      })
    })

    it('shows spent amount and limit', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([mockBudget])
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('$250.00 spent')).toBeInTheDocument()
        expect(screen.getByText('$500.00 limit')).toBeInTheDocument()
      })
    })

    it('shows over budget warning when exceeded', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        { ...mockBudget, actual: 60000 },
      ])
      renderPage()

      await waitFor(() => {
        expect(screen.getByText(/Over budget by/)).toBeInTheDocument()
      })
    })
  })

  describe('Month navigation', () => {
    it('shows current month label', async () => {
      renderPage()

      const now = new Date()
      const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

      await waitFor(() => {
        expect(screen.getByText(monthLabel)).toBeInTheDocument()
      })
    })

    it('navigates to previous month when clicking left arrow', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
      })

      const prevButton = screen.getAllByRole('button')[0]
      fireEvent.click(prevButton)

      expect(mockBudgetRepository.findByMonth).toHaveBeenCalled()
    })

    it('navigates to next month when clicking right arrow', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
      })

      const buttons = screen.getAllByRole('button')
      const nextButton = buttons[buttons.length - 1]
      fireEvent.click(nextButton)

      expect(mockBudgetRepository.findByMonth).toHaveBeenCalled()
    })
  })

  describe('Add Budget modal', () => {
    it('opens modal when Add button clicked', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(addButton)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Add Budget')).toBeInTheDocument()
    })

    it('shows category dropdown with expense tags', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(addButton)

      expect(screen.getByLabelText(/Category/i)).toBeInTheDocument()
    })

    it('shows amount input', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: 'Add' })
      fireEvent.click(addButton)

      expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument()
    })

    it('closes modal on Cancel', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('creates budget on form submit', async () => {
      mockBudgetRepository.create.mockResolvedValue(mockBudget)
      renderPage()

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      const categorySelect = screen.getByLabelText(/Category/i)
      fireEvent.change(categorySelect, { target: { value: '12' } })

      const amountInput = screen.getByLabelText(/Amount/i)
      fireEvent.change(amountInput, { target: { value: '500' } })

      fireEvent.click(screen.getByRole('button', { name: /Save/i }))

      await waitFor(() => {
        expect(mockBudgetRepository.create).toHaveBeenCalled()
      })
    })
  })

  describe('Edit Budget', () => {
    it('opens modal with budget data when Edit clicked', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([mockBudget])
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('food')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Edit'))

      expect(screen.getByText('Edit Budget')).toBeInTheDocument()
    })

    it('updates budget on form submit', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([mockBudget])
      mockBudgetRepository.update.mockResolvedValue({ ...mockBudget, amount: 75000 })
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('food')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Edit'))

      const amountInput = screen.getByLabelText(/Amount/i)
      fireEvent.change(amountInput, { target: { value: '750' } })

      fireEvent.click(screen.getByRole('button', { name: /Save/i }))

      await waitFor(() => {
        expect(mockBudgetRepository.update).toHaveBeenCalled()
      })
    })
  })

  describe('Delete Budget', () => {
    it('deletes budget when Delete clicked and confirmed', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([mockBudget])
      mockBudgetRepository.canDelete.mockResolvedValue({ canDelete: true })
      mockBudgetRepository.delete.mockResolvedValue(undefined)
      vi.spyOn(window, 'confirm').mockReturnValue(true)

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('food')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(mockBudgetRepository.delete).toHaveBeenCalled()
      })
    })

    it('handles delete error gracefully', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([mockBudget])
      mockBudgetRepository.canDelete.mockResolvedValue({ canDelete: true })
      mockBudgetRepository.delete.mockRejectedValue(new Error('Delete failed'))
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('food')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to delete budget:', expect.any(Error))
      })
      consoleSpy.mockRestore()
    })

    it('does not delete when confirmation cancelled', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([mockBudget])
      mockBudgetRepository.canDelete.mockResolvedValue({ canDelete: true })
      vi.spyOn(window, 'confirm').mockReturnValue(false)

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('food')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete'))

      expect(mockBudgetRepository.delete).not.toHaveBeenCalled()
    })

    it('shows message when budget cannot be deleted', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([mockBudget])
      mockBudgetRepository.canDelete.mockResolvedValue({ canDelete: false, reason: 'In use' })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('food')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(screen.getByText('Cannot delete: In use')).toBeInTheDocument()
      })
    })
  })

  describe('Error handling', () => {
    it('handles load error gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockBudgetRepository.findByMonth.mockRejectedValue(new Error('Load failed'))
      renderPage()

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load budgets:', expect.any(Error))
      })
      consoleSpy.mockRestore()
    })

    it('handles create error gracefully', async () => {
      mockBudgetRepository.create.mockRejectedValue(new Error('Failed to create'))
      renderPage()

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      const categorySelect = screen.getByLabelText(/Category/i)
      fireEvent.change(categorySelect, { target: { value: '12' } })

      const amountInput = screen.getByLabelText(/Amount/i)
      fireEvent.change(amountInput, { target: { value: '500' } })

      fireEvent.click(screen.getByRole('button', { name: /Save/i }))

      await waitFor(() => {
        expect(mockBudgetRepository.create).toHaveBeenCalled()
      })
    })
  })

  describe('Edge cases', () => {
    it('handles budget with zero limit amount', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        { ...mockBudget, amount: 0, actual: 100 },
      ])
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('food')).toBeInTheDocument()
        expect(screen.getByText(/Over budget by \$1\.00/)).toBeInTheDocument()
      })
    })

    it('handles budget with zero actual spending', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        { ...mockBudget, actual: 0 },
      ])
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('food')).toBeInTheDocument()
        expect(screen.getByText('$0.00 spent')).toBeInTheDocument()
      })
    })

    it('shows yellow progress bar for 80-100% spending', async () => {
      mockBudgetRepository.findByMonth.mockResolvedValue([
        { ...mockBudget, amount: 10000, actual: 8500 }, // 85%
      ])
      renderPage()

      await waitFor(() => {
        const progressBar = screen.getByRole('progressbar')
        const fill = progressBar.children[0]
        expect(fill).toHaveClass('bg-yellow-500')
      })
    })
  })
})
