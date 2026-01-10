import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { DatabaseProvider, useDatabase } from '../../../store/DatabaseContext'

// Mock the database initialization
vi.mock('../../../services/database', () => ({
  initDatabase: vi.fn(),
}))

import { initDatabase } from '../../../services/database'

const mockInitDatabase = vi.mocked(initDatabase)

// Test component to access context
function TestConsumer() {
  const { isReady, error } = useDatabase()
  return (
    <div>
      <span data-testid="ready">{isReady ? 'ready' : 'not-ready'}</span>
      <span data-testid="error">{error || 'no-error'}</span>
    </div>
  )
}

describe('DatabaseContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('DatabaseProvider', () => {
    it('renders children', () => {
      mockInitDatabase.mockResolvedValue(undefined)

      render(
        <DatabaseProvider>
          <div data-testid="child">Child content</div>
        </DatabaseProvider>
      )

      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('starts with isReady false', () => {
      mockInitDatabase.mockResolvedValue(undefined)

      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      expect(screen.getByTestId('ready')).toHaveTextContent('not-ready')
    })

    it('sets isReady to true after successful initialization', async () => {
      mockInitDatabase.mockResolvedValue(undefined)

      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('ready')).toHaveTextContent('ready')
      })
    })

    it('sets error on initialization failure with Error object', async () => {
      const errorMessage = 'Database initialization failed'
      mockInitDatabase.mockRejectedValue(new Error(errorMessage))

      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent(errorMessage)
      })
    })

    it('sets default error message for non-Error rejection', async () => {
      mockInitDatabase.mockRejectedValue('some string error')

      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Failed to initialize database')
      })
    })

    it('calls initDatabase on mount', async () => {
      mockInitDatabase.mockResolvedValue(undefined)

      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      await waitFor(() => {
        expect(mockInitDatabase).toHaveBeenCalledTimes(1)
      })
    })

    it('maintains error state and isReady false on failure', async () => {
      mockInitDatabase.mockRejectedValue(new Error('Failed'))

      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('error')).not.toHaveTextContent('no-error')
        expect(screen.getByTestId('ready')).toHaveTextContent('not-ready')
      })
    })
  })

  describe('useDatabase', () => {
    it('provides context values', async () => {
      mockInitDatabase.mockResolvedValue(undefined)

      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      await waitFor(() => {
        expect(screen.getByTestId('ready')).toBeInTheDocument()
        expect(screen.getByTestId('error')).toBeInTheDocument()
      })
    })

    it('returns default values outside provider', () => {
      render(<TestConsumer />)

      expect(screen.getByTestId('ready')).toHaveTextContent('not-ready')
      expect(screen.getByTestId('error')).toHaveTextContent('no-error')
    })
  })
})
