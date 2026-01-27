import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useAuth } from '../../../store/AuthContext'

// Mock the auth service to prevent actual calls
vi.mock('../../../services/auth', () => ({
  isDatabaseSetup: vi.fn().mockResolvedValue(false),
  hasValidSession: vi.fn().mockResolvedValue(false),
  setupPin: vi.fn().mockResolvedValue(undefined),
  login: vi.fn().mockResolvedValue(true),
  logout: vi.fn(),
  changePin: vi.fn().mockResolvedValue(true),
  wipeAndReset: vi.fn().mockResolvedValue(undefined),
}))

// Mock database context
vi.mock('../../../store/DatabaseContext', () => ({
  useDatabase: () => ({
    isReady: false,
    error: null,
    setDatabaseReady: vi.fn(),
    setDatabaseError: vi.fn(),
    runDatabaseMigrations: vi.fn(),
    reset: vi.fn(),
  }),
}))

// Test component that uses useAuth WITHOUT a provider
function DefaultsConsumer() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="attempts">{auth.failedAttempts}</span>
      <span data-testid="error">{auth.error || 'none'}</span>
      <button data-testid="setup" onClick={async () => {
        const result = await auth.setupPin('123456')
        document.getElementById('setup-result')!.textContent = String(result)
      }}>Setup</button>
      <span id="setup-result" data-testid="setup-result"></span>
      <button data-testid="login" onClick={async () => {
        const result = await auth.login('123456')
        document.getElementById('login-result')!.textContent = String(result)
      }}>Login</button>
      <span id="login-result" data-testid="login-result"></span>
      <button data-testid="logout" onClick={() => auth.logout()}>Logout</button>
      <button data-testid="change" onClick={async () => {
        const result = await auth.changePin('old', 'new')
        document.getElementById('change-result')!.textContent = String(result)
      }}>Change</button>
      <span id="change-result" data-testid="change-result"></span>
      <button data-testid="wipe" onClick={() => auth.wipeAndReset()}>Wipe</button>
      <button data-testid="clear" onClick={() => auth.clearError()}>Clear</button>
    </div>
  )
}

describe('AuthContext default values (outside provider)', () => {
  it('has checking status by default', () => {
    render(<DefaultsConsumer />)
    expect(screen.getByTestId('status')).toHaveTextContent('checking')
  })

  it('has zero failed attempts by default', () => {
    render(<DefaultsConsumer />)
    expect(screen.getByTestId('attempts')).toHaveTextContent('0')
  })

  it('has null error by default', () => {
    render(<DefaultsConsumer />)
    expect(screen.getByTestId('error')).toHaveTextContent('none')
  })

  it('default setupPin returns false', async () => {
    render(<DefaultsConsumer />)
    await act(async () => {
      screen.getByTestId('setup').click()
    })
    expect(screen.getByTestId('setup-result')).toHaveTextContent('false')
  })

  it('default login returns false', async () => {
    render(<DefaultsConsumer />)
    await act(async () => {
      screen.getByTestId('login').click()
    })
    expect(screen.getByTestId('login-result')).toHaveTextContent('false')
  })

  it('default logout does not throw', () => {
    render(<DefaultsConsumer />)
    expect(() => screen.getByTestId('logout').click()).not.toThrow()
  })

  it('default changePin returns false', async () => {
    render(<DefaultsConsumer />)
    await act(async () => {
      screen.getByTestId('change').click()
    })
    expect(screen.getByTestId('change-result')).toHaveTextContent('false')
  })

  it('default wipeAndReset does not throw', async () => {
    render(<DefaultsConsumer />)
    await act(async () => {
      screen.getByTestId('wipe').click()
    })
    // Just verify no error
  })

  it('default clearError does not throw', () => {
    render(<DefaultsConsumer />)
    expect(() => screen.getByTestId('clear').click()).not.toThrow()
  })
})
