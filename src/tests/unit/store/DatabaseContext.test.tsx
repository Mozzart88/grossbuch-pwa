import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { DatabaseProvider, useDatabase } from '../../../store/DatabaseContext'

// Mock the migrations
vi.mock('../../../services/database/migrations', () => ({
  runMigrations: vi.fn(),
}))

import { runMigrations } from '../../../services/database/migrations'

const mockRunMigrations = vi.mocked(runMigrations)

// Test component to access context
function TestConsumer() {
  const { isReady, error, setDatabaseReady, setDatabaseError, reset } = useDatabase()
  return (
    <div>
      <span data-testid="ready">{isReady ? 'ready' : 'not-ready'}</span>
      <span data-testid="error">{error || 'no-error'}</span>
      <button data-testid="set-ready" onClick={() => setDatabaseReady()}>Set Ready</button>
      <button data-testid="set-error" onClick={() => setDatabaseError('Test error')}>Set Error</button>
      <button data-testid="reset" onClick={() => reset()}>Reset</button>
    </div>
  )
}

describe('DatabaseContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunMigrations.mockResolvedValue(undefined)
  })

  describe('DatabaseProvider', () => {
    it('renders children', () => {
      render(
        <DatabaseProvider>
          <div data-testid="child">Child content</div>
        </DatabaseProvider>
      )

      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('starts with isReady false (no auto-init)', () => {
      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      // DatabaseContext no longer auto-inits - AuthContext controls initialization
      expect(screen.getByTestId('ready')).toHaveTextContent('not-ready')
    })

    it('sets isReady to true when setDatabaseReady is called', async () => {
      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      expect(screen.getByTestId('ready')).toHaveTextContent('not-ready')

      await act(async () => {
        screen.getByTestId('set-ready').click()
      })

      expect(screen.getByTestId('ready')).toHaveTextContent('ready')
    })

    it('sets error when setDatabaseError is called', async () => {
      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      expect(screen.getByTestId('error')).toHaveTextContent('no-error')

      await act(async () => {
        screen.getByTestId('set-error').click()
      })

      expect(screen.getByTestId('error')).toHaveTextContent('Test error')
    })

    it('resets state when reset is called', async () => {
      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      // Set ready first
      await act(async () => {
        screen.getByTestId('set-ready').click()
      })
      expect(screen.getByTestId('ready')).toHaveTextContent('ready')

      // Now reset
      await act(async () => {
        screen.getByTestId('reset').click()
      })
      expect(screen.getByTestId('ready')).toHaveTextContent('not-ready')
      expect(screen.getByTestId('error')).toHaveTextContent('no-error')
    })

    it('clears error when setDatabaseReady is called', async () => {
      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      // Set error first
      await act(async () => {
        screen.getByTestId('set-error').click()
      })
      expect(screen.getByTestId('error')).toHaveTextContent('Test error')

      // Now set ready, which should clear error
      await act(async () => {
        screen.getByTestId('set-ready').click()
      })
      expect(screen.getByTestId('error')).toHaveTextContent('no-error')
      expect(screen.getByTestId('ready')).toHaveTextContent('ready')
    })
  })

  describe('useDatabase', () => {
    it('provides context values', () => {
      render(
        <DatabaseProvider>
          <TestConsumer />
        </DatabaseProvider>
      )

      expect(screen.getByTestId('ready')).toBeInTheDocument()
      expect(screen.getByTestId('error')).toBeInTheDocument()
      expect(screen.getByTestId('set-ready')).toBeInTheDocument()
      expect(screen.getByTestId('set-error')).toBeInTheDocument()
    })

    it('returns default values outside provider', () => {
      render(<TestConsumer />)

      expect(screen.getByTestId('ready')).toHaveTextContent('not-ready')
      expect(screen.getByTestId('error')).toHaveTextContent('no-error')
    })
  })
})
