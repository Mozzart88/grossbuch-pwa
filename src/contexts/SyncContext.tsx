import { createContext, useContext, useEffect } from 'react'
import { useSyncPush } from '../hooks/useSyncPush'
import { onDbWrite } from '../services/database/connection'

interface SyncContextValue {
  schedulePush: () => void
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { schedulePush } = useSyncPush()

  useEffect(() => {
    return onDbWrite(schedulePush)
  }, [schedulePush])

  return (
    <SyncContext.Provider value={{ schedulePush }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSyncContext(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) {
    throw new Error('useSyncContext must be used within a SyncProvider')
  }
  return ctx
}
