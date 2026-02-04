import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { runMigrations } from '../services/database/migrations'

interface DatabaseContextValue {
  isReady: boolean
  error: string | null
  setDatabaseReady: () => void
  setDatabaseError: (error: string) => void
  runDatabaseMigrations: () => Promise<void>
  reset: () => void
}

const DatabaseContext = createContext<DatabaseContextValue>({
  isReady: false,
  error: null,
  setDatabaseReady: () => {},
  setDatabaseError: () => {},
  runDatabaseMigrations: async () => {},
  reset: () => {},
})

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setDatabaseReady = useCallback(() => {
    setIsReady(true)
    setError(null)
  }, [])

  const setDatabaseError = useCallback((err: string) => {
    setIsReady(false)
    setError(err)
  }, [])

  const runDatabaseMigrations = useCallback(async () => {
    await runMigrations()
  }, [])

  const reset = useCallback(() => {
    setIsReady(false)
    setError(null)
  }, [])

  return (
    <DatabaseContext.Provider value={{
      isReady,
      error,
      setDatabaseReady,
      setDatabaseError,
      runDatabaseMigrations,
      reset,
    }}>
      {children}
    </DatabaseContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDatabase() {
  return useContext(DatabaseContext)
}
