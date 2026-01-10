import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { TransactionsPage } from '../../../pages/TransactionsPage'

// Mock TransactionList component
vi.mock('../../../components/transactions', () => ({
  TransactionList: () => <div data-testid="transaction-list">Transaction List</div>,
}))

describe('TransactionsPage', () => {
  it('renders TransactionList component', () => {
    render(
      <BrowserRouter>
        <TransactionsPage />
      </BrowserRouter>
    )

    expect(screen.getByTestId('transaction-list')).toBeInTheDocument()
  })

  it('renders without error', () => {
    expect(() => {
      render(
        <BrowserRouter>
          <TransactionsPage />
        </BrowserRouter>
      )
    }).not.toThrow()
  })
})
