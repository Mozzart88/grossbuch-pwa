import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { GoalTransactionList } from '../../../../components/goals/GoalTransactionList'
import type { TransactionLog } from '../../../../types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../../services/repositories', () => ({
  transactionRepository: {
    findByAccountIds: vi.fn(),
  },
}))

import { transactionRepository } from '../../../../services/repositories'

const createMockTransaction = (overrides: Partial<TransactionLog> = {}): TransactionLog => ({
  id: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
  date_time: '2026-02-04 10:30:00',
  counterparty: null,
  wallet: 'Goal Wallet',
  currency: 'USD',
  symbol: '$',
  decimal_places: 2,
  tags: 'transfer',
  sign: '+',
  amount_int: 50,
  amount_frac: 0,
  rate_int: 1,
  rate_frac: 0,
  wallet_color: null,
  ...overrides,
})

function renderComponent(props: Partial<React.ComponentProps<typeof GoalTransactionList>> = {}) {
  return render(
    <MemoryRouter>
      <GoalTransactionList accountIds={[1, 2]} {...props} />
    </MemoryRouter>
  )
}

describe('GoalTransactionList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a spinner while loading', () => {
    vi.mocked(transactionRepository.findByAccountIds).mockImplementation(() => new Promise(() => { }))
    const { container } = renderComponent()
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('shows the empty message when there are no transactions', async () => {
    vi.mocked(transactionRepository.findByAccountIds).mockResolvedValue([])
    renderComponent({ emptyMessage: 'Nothing here yet' })

    await waitFor(() => {
      expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
    })
  })

  it('groups transactions by date and renders them (each Put/Take group has both of its legs)', async () => {
    const trxA = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])
    const trxB = new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0])
    vi.mocked(transactionRepository.findByAccountIds).mockResolvedValue([
      createMockTransaction({ id: trxA, date_time: '2026-02-04 10:00:00', sign: '+' }),
      createMockTransaction({ id: trxA, date_time: '2026-02-04 10:00:00', sign: '-', amount_int: 0 }),
      createMockTransaction({ id: trxB, date_time: '2026-02-03 09:00:00', sign: '+' }),
      createMockTransaction({ id: trxB, date_time: '2026-02-03 09:00:00', sign: '-', amount_int: 0 }),
    ])
    renderComponent()

    await waitFor(() => {
      expect(screen.getAllByText(/\$50[.,]00/).length).toBe(2)
    })
  })

  it('navigates to the transaction detail page when an entry is clicked', async () => {
    const trxId = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0])
    vi.mocked(transactionRepository.findByAccountIds).mockResolvedValue([
      createMockTransaction({ id: trxId, sign: '+' }),
      createMockTransaction({ id: trxId, sign: '-', amount_int: 0 }),
    ])
    renderComponent()

    const entry = await screen.findByText(/\$50[.,]00/)
    fireEvent.click(entry)

    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/transaction/'))
  })

  it('passes the limit through to the repository call', async () => {
    vi.mocked(transactionRepository.findByAccountIds).mockResolvedValue([])
    renderComponent({ limit: 5 })

    await waitFor(() => {
      expect(transactionRepository.findByAccountIds).toHaveBeenCalledWith([1, 2], 5)
    })
  })
})
