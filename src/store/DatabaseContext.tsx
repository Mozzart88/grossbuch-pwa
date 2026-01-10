import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { initDatabase } from '../services/database'

interface DatabaseContextValue {
  isReady: boolean
  error: string | null
}

const DatabaseContext = createContext<DatabaseContextValue>({
  isReady: false,
  error: null,
})

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initDatabase()
      .then(() => setIsReady(true))
      .catch((err) => {
        console.error('Database initialization failed:', err)
        setError(err instanceof Error ? err.message : 'Failed to initialize database')
      })
  }, [])

  return (
    <DatabaseContext.Provider value={{ isReady, error }}>
      {children}
    </DatabaseContext.Provider>
  )
}

export function useDatabase() {
  return useContext(DatabaseContext)
}
