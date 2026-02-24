import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import type { AuthStatus, AuthState } from '../types/auth'
import {
  isDatabaseSetup,
  needsMigration as authNeedsMigration,
  migrateDatabase as authMigrateDatabase,
  hasValidSession,
  setupPin as authSetupPin,
  login as authLogin,
  logout as authLogout,
  changePin as authChangePin,
  wipeAndReset as authWipeAndReset,
} from '../services/auth'
import { useDatabase } from './DatabaseContext'

interface AuthContextValue extends AuthState {
  setupPin: (pin: string) => Promise<boolean>
  migrateDatabase: (pin: string) => Promise<boolean>
  login: (pin: string) => Promise<boolean>
  logout: () => void
  changePin: (oldPin: string, newPin: string) => Promise<boolean>
  wipeAndReset: () => Promise<void>
  clearError: () => void
  isFirstSetup: boolean
  clearFirstSetup: () => void
}

const AuthContext = createContext<AuthContextValue>({
  status: 'checking',
  failedAttempts: 0,
  error: null,
  setupPin: async () => false,
  migrateDatabase: async () => false,
  login: async () => false,
  logout: () => {},
  changePin: async () => false,
  wipeAndReset: async () => {},
  clearError: () => {},
  isFirstSetup: false,
  clearFirstSetup: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isFirstSetup, setIsFirstSetup] = useState(false)
  const { setDatabaseReady, setDatabaseError, reset: resetDatabase } = useDatabase()

  // Check auth status on mount
  useEffect(() => {
    async function checkAuthStatus() {
      try {
        const dbExists = await isDatabaseSetup()

        if (!dbExists) {
          setStatus('first_time_setup')
          return
        }

        // Check if database needs migration (unencrypted)
        const migrationNeeded = await authNeedsMigration()
        if (migrationNeeded) {
          setStatus('needs_migration')
          return
        }

        // Database exists and is encrypted - check for valid session
        const hasSession = await hasValidSession()

        if (hasSession) {
          // Try to restore session (would need to decrypt DB)
          // For now, just require re-auth since we can't decrypt without PIN
          setStatus('needs_auth')
        } else {
          setStatus('needs_auth')
        }
      } catch (err) {
        console.error('Auth status check failed:', err)
        setError(err instanceof Error ? err.message : 'Failed to check auth status')
        setStatus('auth_failed')
      }
    }

    checkAuthStatus()
  }, [])

  const setupPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      setError(null)
      await authSetupPin(pin)
      setDatabaseReady()
      setStatus('authenticated')
      setIsFirstSetup(true)
      return true
    } catch (err) {
      console.error('PIN setup failed:', err)
      const message = err instanceof Error ? err.message : 'Failed to setup PIN'
      setError(message)
      setDatabaseError(message)
      return false
    }
  }, [setDatabaseReady, setDatabaseError])

  const migrateDatabase = useCallback(async (pin: string): Promise<boolean> => {
    try {
      setError(null)
      await authMigrateDatabase(pin)
      setDatabaseReady()
      setStatus('authenticated')
      return true
    } catch (err) {
      console.error('Database migration failed:', err)
      const message = err instanceof Error ? err.message : 'Failed to migrate database'
      setError(message)
      setDatabaseError(message)
      return false
    }
  }, [setDatabaseReady, setDatabaseError])

  const login = useCallback(async (pin: string): Promise<boolean> => {
    try {
      setError(null)
      const success = await authLogin(pin)

      if (success) {
        setFailedAttempts(0)
        setDatabaseReady()
        setStatus('authenticated')
        return true
      } else {
        const newAttempts = failedAttempts + 1
        setFailedAttempts(newAttempts)
        setError('Incorrect PIN')
        setStatus('auth_failed')
        return false
      }
    } catch (err) {
      console.error('Login failed:', err)
      const message = err instanceof Error ? err.message : 'Login failed'
      setError(message)
      setStatus('auth_failed')
      return false
    }
  }, [failedAttempts, setDatabaseReady])

  const logout = useCallback(() => {
    authLogout()
    resetDatabase()
    setStatus('needs_auth')
  }, [resetDatabase])

  const changePin = useCallback(async (oldPin: string, newPin: string): Promise<boolean> => {
    try {
      setError(null)
      const success = await authChangePin(oldPin, newPin)

      if (!success) {
        setError('Incorrect current PIN')
        return false
      }

      return true
    } catch (err) {
      console.error('Change PIN failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to change PIN')
      return false
    }
  }, [])

  const wipeAndReset = useCallback(async () => {
    try {
      await authWipeAndReset()
      resetDatabase()
      setFailedAttempts(0)
      setError(null)
      setStatus('first_time_setup')
    } catch (err) {
      console.error('Wipe and reset failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to wipe data')
    }
  }, [resetDatabase])

  const clearFirstSetup = useCallback(() => {
    setIsFirstSetup(false)
  }, [])

  const clearError = useCallback(() => {
    setError(null)
    if (status === 'auth_failed') {
      setStatus('needs_auth')
    }
  }, [status])

  return (
    <AuthContext.Provider
      value={{
        status,
        failedAttempts,
        error,
        setupPin,
        migrateDatabase,
        login,
        logout,
        changePin,
        wipeAndReset,
        clearError,
        isFirstSetup,
        clearFirstSetup,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
