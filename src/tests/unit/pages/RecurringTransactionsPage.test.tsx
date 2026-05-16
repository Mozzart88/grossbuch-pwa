import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecurringTransactionsPage } from '../../../pages/RecurringTransactionsPage'
import { recurringRepository } from '../../../services/repositories'
import type { RecurringPlan } from '../../../types'

vi.mock('../../../services/repositories', () => ({
  recurringRepository: {
    findAll: vi.fn(),
    update: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    delete: vi.fn(),
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

const mockRecurringRepository = vi.mocked(recurringRepository)

const plan: RecurringPlan = {
  id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
  schedule: {
    frequency: 'weekly',
    interval: 2,
    weekdays: [1, 5],
  },
  transaction_draft: {
    timestamp: 1760000000,
    lines: [
      {
        account_id: 1,
        tag_id: 2,
        sign: '-',
        amount_int: 10,
        amount_frac: 0,
        rate_int: 1,
        rate_frac: 0,
      },
    ],
  },
  mode: 'expense',
  start_date: '2026-05-01',
  next_due_date: '2026-05-15',
  until_policy: { type: 'count', count: 5 },
  occurrence_count: 0,
  status: 'active',
  created_at: 1760000000,
  updated_at: 1760000000,
}

describe('RecurringTransactionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRecurringRepository.findAll.mockResolvedValue([plan])
    mockRecurringRepository.update.mockResolvedValue(plan)
    mockRecurringRepository.pause.mockResolvedValue()
    mockRecurringRepository.resume.mockResolvedValue()
    mockRecurringRepository.delete.mockResolvedValue()
  })

  const renderPage = () => render(
    <MemoryRouter>
      <RecurringTransactionsPage />
    </MemoryRouter>
  )

  it('edits recurrence with the same selectable controls as add transaction', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const dialog = await screen.findByRole('dialog')
    const recurrence = within(dialog)

    expect(recurrence.getByRole('button', { name: 'Daily' })).toBeInTheDocument()
    expect(recurrence.getByRole('button', { name: 'Monthly' })).toBeInTheDocument()
    expect(recurrence.getByRole('button', { name: 'Weekly' })).toBeInTheDocument()
    expect(recurrence.getByRole('button', { name: 'Yearly' })).toBeInTheDocument()
    expect(recurrence.queryByPlaceholderText('0,1,2 (Sun=0)')).not.toBeInTheDocument()
    expect(recurrence.getByRole('button', { name: 'Mon' }).className).toContain('bg-primary-100')
    expect(recurrence.getByRole('button', { name: 'Fri' }).className).toContain('bg-primary-100')

    fireEvent.click(recurrence.getByRole('button', { name: 'Yearly' }))
    fireEvent.click(recurrence.getByRole('button', { name: 'Feb' }))
    fireEvent.click(recurrence.getByRole('button', { name: 'Oct' }))
    fireEvent.click(recurrence.getByRole('button', { name: '2' }))
    fireEvent.change(recurrence.getByRole('combobox'), { target: { value: 'date' } })
    fireEvent.change(recurrence.getByDisplayValue('2026-05-15'), { target: { value: '2026-12-31' } })
    fireEvent.click(recurrence.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockRecurringRepository.update).toHaveBeenCalledWith(plan.id, {
        schedule: {
          frequency: 'yearly',
          interval: 2,
          monthDays: [2],
          months: [2, 10],
        },
        until_policy: { type: 'date', date: '2026-12-31' },
      })
    })
  })

  it('shows empty state when there are no recurring plans', async () => {
    mockRecurringRepository.findAll.mockResolvedValue([])

    renderPage()

    expect(await screen.findByText('No recurring transactions')).toBeInTheDocument()
  })

  it('pauses, resumes, and deletes plans from the list', async () => {
    const pausedPlan = {
      ...plan,
      status: 'paused' as const,
      next_due_date: null,
    }
    mockRecurringRepository.findAll
      .mockResolvedValueOnce([plan])
      .mockResolvedValueOnce([pausedPlan])
      .mockResolvedValueOnce([plan])
      .mockResolvedValueOnce([])

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(mockRecurringRepository.pause).toHaveBeenCalledWith(plan.id))
    expect(await screen.findByText('Next: complete · Status: paused')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    await waitFor(() => expect(mockRecurringRepository.resume).toHaveBeenCalledWith(plan.id))

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mockRecurringRepository.delete).toHaveBeenCalledWith(plan.id))
    expect(mockShowToast).toHaveBeenCalledWith('Recurring plan deleted', 'success')
  })

  it('closes the edit modal without saving', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockRecurringRepository.update).not.toHaveBeenCalled()
  })
})
