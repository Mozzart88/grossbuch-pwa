import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GoalTransactionsPage } from '../../../pages/GoalTransactionsPage'
import { LayoutProvider } from '../../../store/LayoutContext'
import { TestPlusButton } from '../../helpers/TestPlusButton'
import type { Goal } from '../../../types'
import { blobToHex } from '../../../utils/blobUtils'

vi.mock('../../../services/repositories', () => ({
  goalRepository: { findById: vi.fn() },
  transactionRepository: { findByAccountIds: vi.fn() },
}))

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
  color: null,
  currency_id: 1,
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
  balance: 250,
  target_int: 1000,
  target_frac: 0,
  due_date: null,
  updated_at: 0,
  is_achieved: false,
  is_archived: false,
  accounts: [{ id: 1, wallet_id: 10, currency_id: 1, currency: 'USD', decimal_places: 2, balance_int: 250, balance_frac: 0, updated_at: 0 }],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/goals/${goalIdHex}/transactions`]}>
      <LayoutProvider>
        <TestPlusButton />
        <Routes>
          <Route path="/goals/:goalId/transactions" element={<GoalTransactionsPage />} />
        </Routes>
      </LayoutProvider>
    </MemoryRouter>
  )
}

describe('GoalTransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGoalRepository.findById.mockResolvedValue(goal)
    mockTransactionRepository.findByAccountIds.mockResolvedValue([])
  })

  it('shows the goal name in the header', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Emergency Fund - Transactions/)).toBeInTheDocument()
    })
  })

  it('queries transactions for every account in the goal wallet, unfiltered by month', async () => {
    renderPage()

    await waitFor(() => {
      expect(mockTransactionRepository.findByAccountIds).toHaveBeenCalledWith([1], undefined)
    })
  })

  it('shows a not-found message for an unknown goal', async () => {
    mockGoalRepository.findById.mockResolvedValue(null)
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Goal not found')).toBeInTheDocument()
    })
  })

  it('wires the global footer + button to navigate to the Put/Take page', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText(/Emergency Fund - Transactions/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(mockNavigate).toHaveBeenCalledWith(`/goals/${goalIdHex}/put-take`)
  })

  it('shows an error message when the goal id is missing from the route', async () => {
    render(
      <MemoryRouter initialEntries={['/goals/']}>
        <Routes>
          <Route path="/goals/*" element={<GoalTransactionsPage />} />
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

  it('treats a goal with no accounts field as having nothing to list', async () => {
    mockGoalRepository.findById.mockResolvedValue({ ...goal, accounts: undefined })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Emergency Fund - Transactions/)).toBeInTheDocument()
    })
    expect(mockTransactionRepository.findByAccountIds).toHaveBeenCalledWith([], undefined)
  })
})
