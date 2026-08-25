import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GoalDetailsPage } from '../../../pages/GoalDetailsPage'
import type { Goal } from '../../../types'
import { blobToHex } from '../../../utils/blobUtils'
import { LayoutProvider } from '../../../store/LayoutContext'
import { TestActionBar } from '../../helpers/TestActionBar'

vi.mock('../../../services/repositories', () => ({
  goalRepository: {
    findById: vi.fn(),
    update: vi.fn(),
    updateNote: vi.fn(),
    achieve: vi.fn(),
    unachieve: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    remove: vi.fn(),
  },
  transactionRepository: {
    findByAccountIds: vi.fn(),
  },
}))

const mockShowToast = vi.fn()
vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return { ...actual, useToast: () => ({ showToast: mockShowToast }) }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { goalRepository, transactionRepository } from '../../../services/repositories'

const mockGoalRepository = vi.mocked(goalRepository)
const mockTransactionRepository = vi.mocked(transactionRepository)

const goalId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
const goalIdHex = blobToHex(goalId)

const goal: Goal = {
  id: goalId,
  wallet_id: 10,
  name: 'Emergency Fund',
  color: '#10B981',
  currency_id: 1,
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
  balance: 250,
  target_int: 1000,
  target_frac: 0,
  due_date: '2027-01-01',
  updated_at: 0,
  is_achieved: false,
  is_archived: false,
  note: null,
  accounts: [
    { id: 1, wallet_id: 10, currency_id: 1, currency: 'USD', symbol: '$', decimal_places: 2, balance_int: 250, balance_frac: 0, updated_at: 0 },
  ],
}

function renderPage(hexId = goalIdHex) {
  return render(
    <MemoryRouter initialEntries={[`/goals/${hexId}`]}>
      <LayoutProvider>
        <Routes>
          <Route path="/goals/:goalId" element={<GoalDetailsPage />} />
        </Routes>
        <TestActionBar />
      </LayoutProvider>
    </MemoryRouter>
  )
}

function openKebab() {
  const trigger = screen.getAllByRole('button').find(b => b.getAttribute('aria-haspopup') === 'menu')!
  fireEvent.click(trigger)
}

describe('GoalDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGoalRepository.findById.mockResolvedValue(goal)
    mockTransactionRepository.findByAccountIds.mockResolvedValue([])
  })

  it('shows the goal name, balance, target, and due date', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText(/\$250[.,]00/).length).toBeGreaterThan(0)
    expect(screen.getByText(/\$1[.,]000[.,]00/)).toBeInTheDocument()
    expect(screen.getByText(/Due 2027-01-01/)).toBeInTheDocument()
  })

  it('shows a "not found" message for an unknown goal', async () => {
    mockGoalRepository.findById.mockResolvedValue(null)
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Goal not found')).toBeInTheDocument()
    })
  })

  it('offers to add a note when there is none', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Add one')).toBeInTheDocument()
    })
  })

  it('renders an existing note with markdown formatting', async () => {
    mockGoalRepository.findById.mockResolvedValue({ ...goal, note: 'Save for **rainy days**' })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('rainy days').tagName).toBe('STRONG')
    })
  })

  it('switches to an editable form when Edit is clicked, and saves name/target/due-date/note', async () => {
    mockGoalRepository.update.mockResolvedValue(goal)
    renderPage()

    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    openKebab()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))

    const nameInput = await screen.findByLabelText('Name')
    fireEvent.change(nameInput, { target: { value: 'New Name' } })
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'a new note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockGoalRepository.update).toHaveBeenCalledWith(
        goalId,
        expect.objectContaining({ name: 'New Name', target_int: 1000, target_frac: 0, due_date: '2027-01-01' })
      )
      expect(mockGoalRepository.updateNote).toHaveBeenCalledWith(goalId, 'a new note')
    })
  })

  it('disables Save until a field actually changes, and moves Cancel/Save into the bottom ActionBar', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    openKebab()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByLabelText('Name')

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } })
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('exits editing without saving when Cancel is clicked', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    openKebab()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByLabelText('Name')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(mockGoalRepository.update).not.toHaveBeenCalled()
  })

  it('does not submit when the name is blank', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    openKebab()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByLabelText('Name')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockGoalRepository.update).not.toHaveBeenCalled()
  })

  it('does not submit when the target amount is blank', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    openKebab()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByLabelText('Name')

    fireEvent.change(screen.getByLabelText(/Target/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockGoalRepository.update).not.toHaveBeenCalled()
  })

  it('saves due_date as null after clearing the field', async () => {
    mockGoalRepository.update.mockResolvedValue(goal)
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    openKebab()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByLabelText('Name')

    fireEvent.change(screen.getByLabelText(/Due Date/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockGoalRepository.update).toHaveBeenCalledWith(goalId, expect.objectContaining({ due_date: null }))
    })
  })

  it('shows a generic error message when saving fails with a non-Error rejection', async () => {
    mockGoalRepository.update.mockRejectedValue('nope')
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    openKebab()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const nameInput = await screen.findByLabelText('Name')
    fireEvent.change(nameInput, { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to save goal', 'error')
    })
  })

  it('starts an existing note blank when editing a goal without a due date, prefilling empty fields', async () => {
    mockGoalRepository.findById.mockResolvedValue({ ...goal, due_date: null, note: null })
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    openKebab()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))

    expect(await screen.findByLabelText(/Due Date/)).toHaveValue('')
  })

  it('shows an orange progress bar when the target is zero (under 50%)', async () => {
    mockGoalRepository.findById.mockResolvedValue({ ...goal, target_int: 0, target_frac: 0 })
    const { container } = renderPage()

    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    expect(container.querySelector('.bg-orange-500')).toBeInTheDocument()
  })

  it('shows a green progress bar at 75% or more, and a yellow bar between 50% and 75%', async () => {
    mockGoalRepository.findById.mockResolvedValue({ ...goal, balance: 1000 })
    const { container, unmount } = renderPage()
    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    expect(container.querySelector('.bg-green-500')).toBeInTheDocument()
    unmount()

    mockGoalRepository.findById.mockResolvedValue({ ...goal, balance: 600 })
    const { container: container2 } = renderPage()
    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    expect(container2.querySelector('.bg-yellow-500')).toBeInTheDocument()
  })

  it('handles a goal with no accounts array at all', async () => {
    mockGoalRepository.findById.mockResolvedValue({ ...goal, accounts: undefined })
    renderPage()

    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
  })

  it('falls back to blank symbol and 2 decimal places for a per-account row missing those fields', async () => {
    mockGoalRepository.findById.mockResolvedValue({
      ...goal,
      accounts: [
        ...goal.accounts!,
        { id: 2, wallet_id: 10, currency_id: 2, currency: 'EUR', balance_int: 5, balance_frac: 0, updated_at: 0 },
      ],
    })
    renderPage()

    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    expect(screen.getByText('EUR')).toBeInTheDocument()
  })

  it('shows an error toast when saving fails', async () => {
    mockGoalRepository.update.mockRejectedValue(new Error('Save failed'))
    renderPage()

    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    openKebab()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    const nameInput = await screen.findByLabelText('Name')
    fireEvent.change(nameInput, { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Save failed', 'error')
    })
  })

  it('shows the accounts list even for a single-account goal', async () => {
    renderPage()

    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    expect(screen.getByText('Accounts')).toBeInTheDocument()
    expect(screen.getByText('USD')).toBeInTheDocument()
  })

  it('shows a per-account balance breakdown for every linked account', async () => {
    mockGoalRepository.findById.mockResolvedValue({
      ...goal,
      accounts: [
        ...goal.accounts!,
        { id: 2, wallet_id: 10, currency_id: 2, currency: 'EUR', symbol: '€', decimal_places: 2, balance_int: 10, balance_frac: 0, updated_at: 0 },
      ],
    })
    renderPage()

    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    expect(screen.getByText('EUR')).toBeInTheDocument()
    expect(screen.getByText(/€10[.,]00/)).toBeInTheDocument()
  })

  it('navigates to an account\'s own transaction history when its row is clicked', async () => {
    renderPage()

    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByText('USD'))

    expect(mockNavigate).toHaveBeenCalledWith('/accounts/1/transactions')
  })

  it('navigates to the Put/Take page', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))

    fireEvent.click(screen.getByRole('button', { name: 'Put / Take' }))
    expect(mockNavigate).toHaveBeenCalledWith(`/goals/${goalIdHex}/put-take`)
  })

  it('navigates to the full transactions list via "Show all"', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))

    fireEvent.click(screen.getByText('Show all'))
    expect(mockNavigate).toHaveBeenCalledWith(`/goals/${goalIdHex}/transactions`)
  })

  it('updates the due date field while editing', async () => {
    mockGoalRepository.update.mockResolvedValue(goal)
    renderPage()

    await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))
    openKebab()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    await screen.findByLabelText('Name')

    fireEvent.change(screen.getByLabelText(/Due Date/), { target: { value: '2028-05-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockGoalRepository.update).toHaveBeenCalledWith(
        goalId,
        expect.objectContaining({ due_date: '2028-05-01' })
      )
    })
  })

  it('shows an error message when the goal id is missing from the route', async () => {
    render(
      <MemoryRouter initialEntries={['/goals/']}>
        <Routes>
          <Route path="/goals/*" element={<GoalDetailsPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Goal ID is required')).toBeInTheDocument()
    })
  })

  it('shows an error message when loading the goal throws', async () => {
    mockGoalRepository.findById.mockRejectedValue(new Error('boom'))
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Failed to load goal')).toBeInTheDocument()
    })
  })

  describe('management kebab', () => {
    it('achieves the goal', async () => {
      mockGoalRepository.achieve.mockResolvedValue(undefined)
      renderPage()
      await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))

      openKebab()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Achieve' }))

      await waitFor(() => {
        expect(mockGoalRepository.achieve).toHaveBeenCalledWith(goalId)
      })
    })

    it('unachieves an already-achieved goal', async () => {
      mockGoalRepository.findById.mockResolvedValue({ ...goal, is_achieved: true })
      mockGoalRepository.unachieve.mockResolvedValue(undefined)
      renderPage()
      await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))

      openKebab()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Unachieve' }))

      await waitFor(() => {
        expect(mockGoalRepository.unachieve).toHaveBeenCalledWith(goalId)
      })
    })

    it('archives the goal', async () => {
      mockGoalRepository.archive.mockResolvedValue(undefined)
      renderPage()
      await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))

      openKebab()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))

      await waitFor(() => {
        expect(mockGoalRepository.archive).toHaveBeenCalledWith(goalId)
      })
    })

    it('unarchives an already-archived goal', async () => {
      mockGoalRepository.findById.mockResolvedValue({ ...goal, is_archived: true })
      mockGoalRepository.unarchive.mockResolvedValue(undefined)
      renderPage()
      await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))

      openKebab()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Unarchive' }))

      await waitFor(() => {
        expect(mockGoalRepository.unarchive).toHaveBeenCalledWith(goalId)
      })
    })

    it('deletes the goal after confirmation and navigates back to the Goals list', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      mockGoalRepository.remove.mockResolvedValue(undefined)
      renderPage()
      await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))

      openKebab()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

      await waitFor(() => {
        expect(mockGoalRepository.remove).toHaveBeenCalledWith(goalId)
        expect(mockNavigate).toHaveBeenCalledWith('/goals')
      })
    })

    it('does not delete when confirmation is declined', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      renderPage()
      await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))

      openKebab()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

      expect(mockGoalRepository.remove).not.toHaveBeenCalled()
    })

    it('shows an error toast when achieving fails', async () => {
      mockGoalRepository.achieve.mockRejectedValue(new Error('Achieve failed'))
      renderPage()
      await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))

      openKebab()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Achieve' }))

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Achieve failed', 'error')
      })
    })

    it('falls back to a generic message for a non-Error rejection from each management action', async () => {
      mockGoalRepository.achieve.mockRejectedValue('nope')
      mockGoalRepository.archive.mockRejectedValue('nope')
      mockGoalRepository.remove.mockRejectedValue('nope')
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      renderPage()
      await waitFor(() => expect(screen.getAllByText('Emergency Fund').length).toBeGreaterThan(0))

      openKebab()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Achieve' }))
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Failed to achieve goal', 'error'))
      mockShowToast.mockClear()

      openKebab()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Failed to archive goal', 'error'))
      mockShowToast.mockClear()

      openKebab()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
      await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('Failed to delete goal', 'error'))
    })
  })
})
