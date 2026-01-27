import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../../../store/AuthContext'
import { DatabaseProvider } from '../../../store/DatabaseContext'

// Mock auth service
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
  DatabaseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDatabase: () => ({
    isReady: false,
    error: null,
    setDatabaseReady: vi.fn(),
    setDatabaseError: vi.fn(),
    runDatabaseMigrations: vi.fn(),
    reset: vi.fn(),
  }),
}))

import {
  isDatabaseSetup,
  hasValidSession,
  setupPin as authSetupPin,
  login as authLogin,
  logout as authLogout,
  changePin as authChangePin,
  wipeAndReset as authWipeAndReset,
} from '../../../services/auth'

const mockIsDatabaseSetup = vi.mocked(isDatabaseSetup)
const mockHasValidSession = vi.mocked(hasValidSession)
const mockSetupPin = vi.mocked(authSetupPin)
const mockLogin = vi.mocked(authLogin)
const mockLogout = vi.mocked(authLogout)
const mockChangePin = vi.mocked(authChangePin)
const mockWipeAndReset = vi.mocked(authWipeAndReset)

// Test consumer component
function TestConsumer() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="failed-attempts">{auth.failedAttempts}</span>
      <span data-testid="error">{auth.error || 'no-error'}</span>
      <button data-testid="setup-pin" onClick={() => auth.setupPin('123456')}>Setup</button>
      <button data-testid="login" onClick={() => auth.login('123456')}>Login</button>
      <button data-testid="logout" onClick={() => auth.logout()}>Logout</button>
      <button data-testid="change-pin" onClick={() => auth.changePin('old', 'new')}>Change</button>
      <button data-testid="wipe" onClick={() => auth.wipeAndReset()}>Wipe</button>
      <button data-testid="clear-error" onClick={() => auth.clearError()}>Clear Error</button>
    </div>
  )
}

function renderWithProvider() {
  return render(
    <DatabaseProvider>
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    </DatabaseProvider>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsDatabaseSetup.mockResolvedValue(false)
    mockHasValidSession.mockResolvedValue(false)
  })

  describe('initial state', () => {
    it('starts with checking status', () => {
      renderWithProvider()
      expect(screen.getByTestId('status')).toHaveTextContent('checking')
    })

    it('starts with zero failed attempts', () => {
      renderWithProvider()
      expect(screen.getByTestId('failed-attempts')).toHaveTextContent('0')
    })

    it('starts with no error', () => {
      renderWithProvider()
      expect(screen.getByTestId('error')).toHaveTextContent('no-error')
    })
  })

  describe('auth status check', () => {
    it('sets first_time_setup when no DB exists', async () => {
      mockIsDatabaseSetup.mockResolvedValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('first_time_setup')
      })
    })

    it('sets needs_auth when DB exists but no session', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockHasValidSession.mockResolvedValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })
    })

    it('sets needs_auth even when session appears valid', async () => {
      // Without the encryption key, we can't actually decrypt the DB
      // so we still need to require PIN entry
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockHasValidSession.mockResolvedValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })
    })

    it('sets auth_failed and error when status check throws', async () => {
      mockIsDatabaseSetup.mockRejectedValue(new Error('Database check failed'))

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('auth_failed')
        expect(screen.getByTestId('error')).toHaveTextContent('Database check failed')
      })
    })

    it('sets generic error message when status check throws non-Error', async () => {
      mockIsDatabaseSetup.mockRejectedValue('string error')

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('auth_failed')
        expect(screen.getByTestId('error')).toHaveTextContent('Failed to check auth status')
      })
    })
  })

  describe('setupPin', () => {
    it('calls auth service setupPin', async () => {
      mockIsDatabaseSetup.mockResolvedValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('first_time_setup')
      })

      await act(async () => {
        screen.getByTestId('setup-pin').click()
      })

      expect(mockSetupPin).toHaveBeenCalledWith('123456')
    })

    it('sets authenticated status on success', async () => {
      mockIsDatabaseSetup.mockResolvedValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('first_time_setup')
      })

      await act(async () => {
        screen.getByTestId('setup-pin').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
      })
    })

    it('sets error on failure', async () => {
      mockIsDatabaseSetup.mockResolvedValue(false)
      mockSetupPin.mockRejectedValue(new Error('Setup failed'))

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('first_time_setup')
      })

      await act(async () => {
        screen.getByTestId('setup-pin').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Setup failed')
      })
    })

    it('sets generic error message when setupPin throws non-Error', async () => {
      mockIsDatabaseSetup.mockResolvedValue(false)
      mockSetupPin.mockRejectedValue('string error')

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('first_time_setup')
      })

      await act(async () => {
        screen.getByTestId('setup-pin').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Failed to setup PIN')
      })
    })
  })

  describe('login', () => {
    beforeEach(() => {
      mockIsDatabaseSetup.mockResolvedValue(true)
    })

    it('calls auth service login', async () => {
      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      expect(mockLogin).toHaveBeenCalledWith('123456')
    })

    it('sets authenticated status on success', async () => {
      mockLogin.mockResolvedValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
      })
    })

    it('increments failed attempts on wrong PIN', async () => {
      mockLogin.mockResolvedValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('failed-attempts')).toHaveTextContent('1')
      })
    })

    it('sets error on wrong PIN', async () => {
      mockLogin.mockResolvedValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Incorrect PIN')
      })
    })

    it('resets failed attempts on success', async () => {
      mockLogin.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      // First failed attempt
      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('failed-attempts')).toHaveTextContent('1')
      })

      // Successful attempt
      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('failed-attempts')).toHaveTextContent('0')
      })
    })

    it('sets auth_failed and error when login throws', async () => {
      mockLogin.mockRejectedValue(new Error('Network error'))

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('auth_failed')
        expect(screen.getByTestId('error')).toHaveTextContent('Network error')
      })
    })

    it('sets generic error message when login throws non-Error', async () => {
      mockLogin.mockRejectedValue('string error')

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('auth_failed')
        expect(screen.getByTestId('error')).toHaveTextContent('Login failed')
      })
    })
  })

  describe('logout', () => {
    it('calls auth service logout', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockLogin.mockResolvedValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
      })

      await act(async () => {
        screen.getByTestId('logout').click()
      })

      expect(mockLogout).toHaveBeenCalled()
    })

    it('sets needs_auth status after logout', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockLogin.mockResolvedValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
      })

      await act(async () => {
        screen.getByTestId('logout').click()
      })

      expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
    })
  })

  describe('changePin', () => {
    it('calls auth service changePin', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockLogin.mockResolvedValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
      })

      await act(async () => {
        screen.getByTestId('change-pin').click()
      })

      expect(mockChangePin).toHaveBeenCalledWith('old', 'new')
    })

    it('sets error on failure', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockLogin.mockResolvedValue(true)
      mockChangePin.mockResolvedValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
      })

      await act(async () => {
        screen.getByTestId('change-pin').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Incorrect current PIN')
      })
    })

    it('sets error when changePin throws', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockLogin.mockResolvedValue(true)
      mockChangePin.mockRejectedValue(new Error('Change PIN failed'))

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
      })

      await act(async () => {
        screen.getByTestId('change-pin').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Change PIN failed')
      })
    })

    it('sets generic error message for non-Error thrown', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockLogin.mockResolvedValue(true)
      mockChangePin.mockRejectedValue('string error')

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
      })

      await act(async () => {
        screen.getByTestId('change-pin').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Failed to change PIN')
      })
    })
  })

  describe('wipeAndReset', () => {
    it('calls auth service wipeAndReset', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('wipe').click()
      })

      expect(mockWipeAndReset).toHaveBeenCalled()
    })

    it('sets first_time_setup after wipe', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('wipe').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('first_time_setup')
      })
    })

    it('resets failed attempts after wipe', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockLogin.mockResolvedValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      // Create some failed attempts
      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('failed-attempts')).toHaveTextContent('1')
      })

      await act(async () => {
        screen.getByTestId('wipe').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('failed-attempts')).toHaveTextContent('0')
      })
    })

    it('sets error when wipeAndReset throws', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockWipeAndReset.mockRejectedValue(new Error('Wipe failed'))

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('wipe').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Wipe failed')
      })
    })

    it('sets generic error message for non-Error thrown in wipe', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockWipeAndReset.mockRejectedValue('string error')

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('wipe').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Failed to wipe data')
      })
    })
  })

  describe('clearError', () => {
    it('clears error', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockLogin.mockResolvedValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Incorrect PIN')
      })

      await act(async () => {
        screen.getByTestId('clear-error').click()
      })

      expect(screen.getByTestId('error')).toHaveTextContent('no-error')
    })

    it('changes auth_failed status to needs_auth', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockLogin.mockResolvedValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('auth_failed')
      })

      await act(async () => {
        screen.getByTestId('clear-error').click()
      })

      expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
    })
  })
})
