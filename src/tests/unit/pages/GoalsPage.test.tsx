import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GoalsPage } from '../../../pages/GoalsPage'
import { LayoutProvider } from '../../../store/LayoutContext'
import { TestPlusButton } from '../../helpers/TestPlusButton'
import type { Goal, Currency } from '../../../types'
import { blobToHex } from '../../../utils/blobUtils'

vi.mock('../../../services/repositories', () => ({
  goalRepository: {
    findActive: vi.fn(),
    findAchieved: vi.fn(),
    findArchived: vi.fn(),
    create: vi.fn(),
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

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { goalRepository, currencyRepository } from '../../../services/repositories'

const mockGoalRepository = vi.mocked(goalRepository)
const mockCurrencyRepository = vi.mocked(currencyRepository)

const activeGoalId = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1])
const archivedGoalId = new Uint8Array([2, 2, 2, 2, 2, 2, 2, 2])

const activeGoal: Goal = {
  id: activeGoalId,
  wallet_id: 10,
  name: 'Emergency Fund',
  color: '#10B981',
  currency_id: 1,
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
  balance: 500,
  target_int: 5000,
  target_frac: 0,
  due_date: '2027-01-01',
  updated_at: 1000,
  is_achieved: false,
  is_archived: false,
}

const archivedGoal: Goal = {
  ...activeGoal,
  id: archivedGoalId,
  wallet_id: 11,
  name: 'Old Goal',
  is_archived: true,
}

const mockCurrencies: Currency[] = [
  { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_system: true, is_fiat: true },
  { id: 2, code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, is_fiat: true },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <LayoutProvider>
        <TestPlusButton />
        <GoalsPage />
      </LayoutProvider>
    </MemoryRouter>
  )
}

describe('GoalsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGoalRepository.findActive.mockResolvedValue([activeGoal])
    mockGoalRepository.findAchieved.mockResolvedValue([])
    mockGoalRepository.findArchived.mockResolvedValue([archivedGoal])
    mockCurrencyRepository.findAll.mockResolvedValue(mockCurrencies)
  })

  it('renders active goals', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })
  })

  it('shows a suggested monthly contribution figure for a goal with a due date', async () => {
    // Next calendar month -> the component's months-remaining calculation is
    // exactly 1, regardless of what day "today" actually is when this runs.
    const now = new Date()
    const due = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const dueDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-01`
    mockGoalRepository.findActive.mockResolvedValue([{ ...activeGoal, due_date: dueDate }])

    renderPage()

    await waitFor(() => {
      // (5000 - 500) / 1 month = 4500
      expect(screen.getByText(/Contribute \$4[.,]500[.,]00\/mo/)).toBeInTheDocument()
    })
  })

  it('shows no contribution figure for a goal without a due date', async () => {
    mockGoalRepository.findActive.mockResolvedValue([{ ...activeGoal, due_date: null }])

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Contribute/)).not.toBeInTheDocument()
  })

  it('renders archived goals in a collapsed section', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })

    expect(screen.queryByText('Old Goal')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(/Archived/))

    await waitFor(() => {
      expect(screen.getByText('Old Goal')).toBeInTheDocument()
    })
  })

  it('renders achieved goals in a collapsed section with a count', async () => {
    mockGoalRepository.findAchieved.mockResolvedValue([{ ...activeGoal, id: new Uint8Array([3, 3, 3, 3, 3, 3, 3, 3]), name: 'Achieved Goal', is_achieved: true }])

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Achieved \(1\)/)).toBeInTheDocument()
    })
    expect(screen.queryByText('Achieved Goal')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(/Achieved/))

    await waitFor(() => {
      expect(screen.getByText('Achieved Goal')).toBeInTheDocument()
    })
  })

  it('shows an empty state when there are no goals', async () => {
    mockGoalRepository.findActive.mockResolvedValue([])
    mockGoalRepository.findArchived.mockResolvedValue([])

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/No goals yet/)).toBeInTheDocument()
    })
  })

  it('creates a new goal', async () => {
    mockGoalRepository.create.mockResolvedValue({ ...activeGoal, id: new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]) })
    renderPage()

    await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Add'))

    const nameInput = await screen.findByLabelText('Name')
    fireEvent.change(nameInput, { target: { value: 'Vacation' } })

    // The currency select defaults to the first currency as soon as one is
    // loaded — asserted explicitly since this default is derived at render
    // time (not baked into the plus-button's callback) specifically to avoid
    // a stale-closure race; see GoalsPage.tsx's `effectiveCurrencyId`.
    const currencySelect = screen.getByLabelText('Currency') as HTMLSelectElement
    expect(currencySelect.value).toBe('1')

    const targetInput = screen.getByLabelText(/Target/)
    fireEvent.change(targetInput, { target: { value: '2000' } })

    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)

    await waitFor(() => {
      expect(mockGoalRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Vacation',
          currency_id: 1,
          target_int: 2000,
          target_frac: 0,
        })
      )
    })
  })

  it('creates a new goal with a chosen color, currency, initial balance, and due date', async () => {
    mockGoalRepository.create.mockResolvedValue({ ...activeGoal, id: new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]) })
    renderPage()

    await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Add'))
    await screen.findByLabelText('Name')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'House' } })
    fireEvent.click(document.querySelector('button[style*="16, 185, 129"]')!) // second swatch
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Initial Balance'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText(/Target/), { target: { value: '3000' } })
    fireEvent.change(screen.getByLabelText(/Due Date/), { target: { value: '2028-01-01' } })

    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)

    await waitFor(() => {
      expect(mockGoalRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'House',
          color: '#10B981',
          currency_id: 2,
          initial_balance: 100,
          target_int: 3000,
          target_frac: 0,
          due_date: '2028-01-01',
        })
      )
    })
  })

  it('shows progress percentage for a goal', async () => {
    renderPage()

    await waitFor(() => {
      // balance 500 / target 5000 = 10%
      expect(screen.getByText('10%')).toBeInTheDocument()
    })
  })

  it('shows 0% progress for a goal with a zero target, and no colored left border without a color', async () => {
    mockGoalRepository.findActive.mockResolvedValue([{ ...activeGoal, color: null, target_int: 0, target_frac: 0 }])
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('0%')).toBeInTheDocument()
    })
    const card = screen.getByText('Emergency Fund').closest('[data-goal-card]') as HTMLElement
    expect(card.style.borderLeft).toBe('')
  })

  describe('Navigation', () => {
    it('navigates to goal details when the card is clicked', async () => {
      renderPage()
      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())

      fireEvent.click(screen.getByText('Emergency Fund'))

      expect(mockNavigate).toHaveBeenCalledWith(`/goals/${blobToHex(activeGoalId)}`)
    })
  })

  describe('Validation and error handling', () => {
    it('leaves the currency unset when opening the create modal with no currencies available', async () => {
      mockCurrencyRepository.findAll.mockResolvedValue([])
      renderPage()

      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Add'))

      const currencySelect = await screen.findByLabelText('Currency')
      expect(currencySelect).toHaveValue('')
    })


    it('does not submit when the target amount is empty', async () => {
      renderPage()

      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Add'))
      await screen.findByLabelText('Name')

      fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)

      expect(mockGoalRepository.create).not.toHaveBeenCalled()
    })

    it('shows an error toast when creating a goal without a name', async () => {
      renderPage()

      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Add'))
      await screen.findByLabelText('Name')

      fireEvent.change(screen.getByLabelText(/Target/), { target: { value: '100' } })
      fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Name and currency are required', 'error')
      })
      expect(mockGoalRepository.create).not.toHaveBeenCalled()
    })

    it('logs and swallows an error when loading goals fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
      mockGoalRepository.findActive.mockRejectedValue(new Error('Load failed'))
      renderPage()

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load goals:', expect.any(Error))
      })
      expect(screen.getByText(/No goals yet/)).toBeInTheDocument()
    })

    // A non-Error rejection from create exercises the `error instanceof Error
    // ? ... : 'fallback'` ternary's false branch.
    it('falls back to a generic message for a non-Error rejection from create', async () => {
      mockGoalRepository.create.mockRejectedValue('nope')
      renderPage()
      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())

      fireEvent.click(screen.getByText('Add'))
      await screen.findByLabelText('Name')
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } })
      fireEvent.change(screen.getByLabelText(/Target/), { target: { value: '10' } })
      fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!)
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Failed to save goal', 'error'))
    })
  })

  describe('Progress bar color', () => {
    it('shows green when the goal is 75% funded or more', async () => {
      mockGoalRepository.findActive.mockResolvedValue([{ ...activeGoal, balance: 5000 }])
      const { container } = renderPage()

      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
      expect(container.querySelector('.bg-green-500')).toBeInTheDocument()
    })

    it('shows yellow between 50% and 75% progress', async () => {
      mockGoalRepository.findActive.mockResolvedValue([{ ...activeGoal, balance: 3000 }])
      const { container } = renderPage()

      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
      expect(container.querySelector('.bg-yellow-500')).toBeInTheDocument()
    })

    it('shows orange under 50% progress', async () => {
      mockGoalRepository.findActive.mockResolvedValue([{ ...activeGoal, balance: 500 }])
      const { container } = renderPage()

      await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
      expect(container.querySelector('.bg-orange-500')).toBeInTheDocument()
    })
  })
})
