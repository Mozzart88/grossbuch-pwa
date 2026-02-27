import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../../../store/AuthContext'
import { DatabaseProvider } from '../../../store/DatabaseContext'

// Mock auth service
vi.mock('../../../services/auth', () => ({
  isDatabaseSetup: vi.fn().mockResolvedValue(false),
  needsMigration: vi.fn().mockResolvedValue(false),
  migrateDatabase: vi.fn().mockResolvedValue(undefined),
  hasValidSession: vi.fn().mockResolvedValue(false),
  setupPin: vi.fn().mockResolvedValue(undefined),
  login: vi.fn().mockResolvedValue(true),
  logout: vi.fn(),
  changePin: vi.fn().mockResolvedValue(true),
  wipeAndReset: vi.fn().mockResolvedValue(undefined),
  loginWithBiometrics: vi.fn().mockResolvedValue(true),
  enableBiometrics: vi.fn().mockResolvedValue(true),
  disableBiometrics: vi.fn(),
  isPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(false),
  hasWebAuthnCredential: vi.fn().mockReturnValue(false),
  isPRFKnownUnsupported: vi.fn().mockReturnValue(false),
  clearPRFUnsupportedFlag: vi.fn(),
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
  needsMigration,
  migrateDatabase as authMigrateDatabase,
  hasValidSession,
  setupPin as authSetupPin,
  login as authLogin,
  logout as authLogout,
  changePin as authChangePin,
  wipeAndReset as authWipeAndReset,
  loginWithBiometrics as authLoginWithBiometrics,
  enableBiometrics as authEnableBiometrics,
  disableBiometrics as authDisableBiometrics,
  isPlatformAuthenticatorAvailable,
  hasWebAuthnCredential,
  isPRFKnownUnsupported,
} from '../../../services/auth'

const mockIsDatabaseSetup = vi.mocked(isDatabaseSetup)
const mockNeedsMigration = vi.mocked(needsMigration)
const mockMigrateDatabase = vi.mocked(authMigrateDatabase)
const mockHasValidSession = vi.mocked(hasValidSession)
const mockSetupPin = vi.mocked(authSetupPin)
const mockLogin = vi.mocked(authLogin)
const mockLogout = vi.mocked(authLogout)
const mockChangePin = vi.mocked(authChangePin)
const mockWipeAndReset = vi.mocked(authWipeAndReset)
const mockLoginWithBiometrics = vi.mocked(authLoginWithBiometrics)
const mockEnableBiometrics = vi.mocked(authEnableBiometrics)
const mockDisableBiometrics = vi.mocked(authDisableBiometrics)
const mockIsPlatformAuthenticatorAvailable = vi.mocked(isPlatformAuthenticatorAvailable)
const mockHasWebAuthnCredential = vi.mocked(hasWebAuthnCredential)
const mockIsPRFKnownUnsupported = vi.mocked(isPRFKnownUnsupported)

// Test consumer component
function TestConsumer() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="failed-attempts">{auth.failedAttempts}</span>
      <span data-testid="error">{auth.error || 'no-error'}</span>
      <span data-testid="is-first-setup">{String(auth.isFirstSetup)}</span>
      <span data-testid="biometrics-available">{String(auth.biometricsAvailable)}</span>
      <span data-testid="biometrics-enabled">{String(auth.biometricsEnabled)}</span>
      <button data-testid="setup-pin" onClick={() => auth.setupPin('123456')}>Setup</button>
      <button data-testid="migrate" onClick={() => auth.migrateDatabase('123456')}>Migrate</button>
      <button data-testid="login" onClick={() => auth.login('123456')}>Login</button>
      <button data-testid="logout" onClick={() => auth.logout()}>Logout</button>
      <button data-testid="change-pin" onClick={() => auth.changePin('old', 'new')}>Change</button>
      <button data-testid="wipe" onClick={() => auth.wipeAndReset()}>Wipe</button>
      <button data-testid="clear-error" onClick={() => auth.clearError()}>Clear Error</button>
      <button data-testid="clear-first-setup" onClick={() => auth.clearFirstSetup()}>Clear First Setup</button>
      <button data-testid="login-biometrics" onClick={() => auth.loginWithBiometrics()}>Bio Login</button>
      <button data-testid="enable-biometrics" onClick={() => auth.enableBiometrics()}>Enable Bio</button>
      <button data-testid="disable-biometrics" onClick={() => auth.disableBiometrics()}>Disable Bio</button>
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
    mockNeedsMigration.mockResolvedValue(false)
    mockHasValidSession.mockResolvedValue(false)
    mockIsPlatformAuthenticatorAvailable.mockResolvedValue(false)
    mockHasWebAuthnCredential.mockReturnValue(false)
    mockIsPRFKnownUnsupported.mockReturnValue(false)
    mockLoginWithBiometrics.mockResolvedValue(true)
    mockEnableBiometrics.mockResolvedValue(true)
    // Ensure these resolve by default (vi.clearAllMocks may clear return values in some configs)
    mockWipeAndReset.mockResolvedValue(undefined)
    mockLogout.mockReturnValue(undefined)
    mockDisableBiometrics.mockReturnValue(undefined)
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

    it('starts with isFirstSetup false', () => {
      renderWithProvider()
      expect(screen.getByTestId('is-first-setup')).toHaveTextContent('false')
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

    it('sets needs_migration when DB exists but is unencrypted', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockNeedsMigration.mockResolvedValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_migration')
      })
    })
  })

  describe('migrateDatabase', () => {
    it('calls auth service migrateDatabase and sets authenticated on success', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockNeedsMigration.mockResolvedValue(true)
      mockMigrateDatabase.mockResolvedValue(undefined)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_migration')
      })

      await act(async () => {
        screen.getByTestId('migrate').click()
      })

      await waitFor(() => {
        expect(mockMigrateDatabase).toHaveBeenCalledWith('123456')
        expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
      })
    })

    it('sets error when migration fails', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockNeedsMigration.mockResolvedValue(true)
      mockMigrateDatabase.mockRejectedValue(new Error('Migration failed'))

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_migration')
      })

      await act(async () => {
        screen.getByTestId('migrate').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Migration failed')
      })
    })

    it('returns false when migration throws', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockNeedsMigration.mockResolvedValue(true)
      mockMigrateDatabase.mockRejectedValue(new Error('Encryption error'))

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_migration')
      })

      await act(async () => {
        screen.getByTestId('migrate').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Encryption error')
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

    it('sets isFirstSetup true on success', async () => {
      mockIsDatabaseSetup.mockResolvedValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('first_time_setup')
      })

      await act(async () => {
        screen.getByTestId('setup-pin').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('is-first-setup')).toHaveTextContent('true')
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

  describe('clearFirstSetup', () => {
    it('resets isFirstSetup to false', async () => {
      mockIsDatabaseSetup.mockResolvedValue(false)
      mockSetupPin.mockResolvedValue(undefined)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('first_time_setup')
      })

      await act(async () => {
        screen.getByTestId('setup-pin').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('is-first-setup')).toHaveTextContent('true')
      })

      await act(async () => {
        screen.getByTestId('clear-first-setup').click()
      })

      expect(screen.getByTestId('is-first-setup')).toHaveTextContent('false')
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

  describe('biometrics state', () => {
    it('starts with biometricsAvailable false', () => {
      renderWithProvider()
      expect(screen.getByTestId('biometrics-available')).toHaveTextContent('false')
    })

    it('starts with biometricsEnabled false', () => {
      renderWithProvider()
      expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('false')
    })

    it('sets biometricsAvailable true when platform authenticator available', async () => {
      mockIsPlatformAuthenticatorAvailable.mockResolvedValue(true)
      mockHasWebAuthnCredential.mockReturnValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('biometrics-available')).toHaveTextContent('true')
      })
    })

    it('sets biometricsEnabled true when credential stored and platform available', async () => {
      mockIsPlatformAuthenticatorAvailable.mockResolvedValue(true)
      mockHasWebAuthnCredential.mockReturnValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('true')
      })
    })

    it('clears biometricsEnabled when platform authenticator not available', async () => {
      mockIsPlatformAuthenticatorAvailable.mockResolvedValue(false)
      mockHasWebAuthnCredential.mockReturnValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('false')
      })
    })

    it('calls disableBiometrics when platform authenticator not available', async () => {
      mockIsPlatformAuthenticatorAvailable.mockResolvedValue(false)
      mockHasWebAuthnCredential.mockReturnValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(mockDisableBiometrics).toHaveBeenCalled()
      })
    })

    it('sets biometricsAvailable false when PRF is known unsupported', async () => {
      mockIsPlatformAuthenticatorAvailable.mockResolvedValue(true)
      mockIsPRFKnownUnsupported.mockReturnValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('biometrics-available')).toHaveTextContent('false')
      })
    })

    it('sets biometricsEnabled false when PRF is known unsupported', async () => {
      mockIsPlatformAuthenticatorAvailable.mockResolvedValue(true)
      mockHasWebAuthnCredential.mockReturnValue(true)
      mockIsPRFKnownUnsupported.mockReturnValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('false')
      })
    })

    it('calls disableBiometrics when PRF is known unsupported', async () => {
      mockIsPlatformAuthenticatorAvailable.mockResolvedValue(true)
      mockIsPRFKnownUnsupported.mockReturnValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(mockDisableBiometrics).toHaveBeenCalled()
      })
    })
  })

  describe('loginWithBiometrics', () => {
    beforeEach(() => {
      mockIsDatabaseSetup.mockResolvedValue(true)
    })

    it('calls auth service loginWithBiometrics', async () => {
      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login-biometrics').click()
      })

      expect(mockLoginWithBiometrics).toHaveBeenCalled()
    })

    it('sets authenticated status on success', async () => {
      mockLoginWithBiometrics.mockResolvedValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login-biometrics').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
      })
    })

    it('stays needs_auth when biometric login fails', async () => {
      mockLoginWithBiometrics.mockResolvedValue(false)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login-biometrics').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })
    })

    it('stays needs_auth when biometric login throws', async () => {
      mockLoginWithBiometrics.mockRejectedValue(new Error('Biometric error'))

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })

      await act(async () => {
        screen.getByTestId('login-biometrics').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('needs_auth')
      })
    })
  })

  describe('enableBiometrics', () => {
    it('calls auth service enableBiometrics', async () => {
      renderWithProvider()

      await act(async () => {
        screen.getByTestId('enable-biometrics').click()
      })

      expect(mockEnableBiometrics).toHaveBeenCalled()
    })

    it('sets biometricsEnabled true on success', async () => {
      mockEnableBiometrics.mockResolvedValue(true)

      renderWithProvider()

      await act(async () => {
        screen.getByTestId('enable-biometrics').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('true')
      })
    })

    it('does not set biometricsEnabled when enableBiometrics returns false', async () => {
      mockEnableBiometrics.mockResolvedValue(false)

      renderWithProvider()

      await act(async () => {
        screen.getByTestId('enable-biometrics').click()
      })

      expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('false')
    })

    it('returns false when enableBiometrics throws', async () => {
      mockEnableBiometrics.mockRejectedValue(new Error('No session'))

      renderWithProvider()

      // Should not throw, just return false silently
      await act(async () => {
        screen.getByTestId('enable-biometrics').click()
      })

      expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('false')
    })
  })

  describe('disableBiometrics', () => {
    it('calls auth service disableBiometrics', async () => {
      renderWithProvider()

      await act(async () => {
        screen.getByTestId('disable-biometrics').click()
      })

      expect(mockDisableBiometrics).toHaveBeenCalled()
    })

    it('sets biometricsEnabled false', async () => {
      mockIsPlatformAuthenticatorAvailable.mockResolvedValue(true)
      mockHasWebAuthnCredential.mockReturnValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('true')
      })

      await act(async () => {
        screen.getByTestId('disable-biometrics').click()
      })

      expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('false')
    })
  })

  describe('changePin clears biometrics', () => {
    it('sets biometricsEnabled false after PIN change', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockIsPlatformAuthenticatorAvailable.mockResolvedValue(true)
      mockHasWebAuthnCredential.mockReturnValue(true)
      mockLogin.mockResolvedValue(true)
      mockChangePin.mockResolvedValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('true')
      })

      await act(async () => {
        screen.getByTestId('change-pin').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('false')
      })
    })
  })

  describe('wipeAndReset clears biometrics', () => {
    it('sets biometricsEnabled false after wipe', async () => {
      mockIsDatabaseSetup.mockResolvedValue(true)
      mockIsPlatformAuthenticatorAvailable.mockResolvedValue(true)
      mockHasWebAuthnCredential.mockReturnValue(true)

      renderWithProvider()

      await waitFor(() => {
        expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('true')
      })

      await act(async () => {
        screen.getByTestId('wipe').click()
      })

      await waitFor(() => {
        expect(screen.getByTestId('biometrics-enabled')).toHaveTextContent('false')
      })
    })
  })
})
