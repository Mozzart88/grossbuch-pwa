import { createContext, useContext, useEffect, useState } from 'react'
import { useSyncPush } from '../hooks/useSyncPush'
import { onDbWrite } from '../services/database/connection'
import { settingsRepository } from '../services/repositories/settingsRepository'

interface SyncContextValue {
  schedulePush: () => void
  flushPush: () => Promise<boolean>
  isInitialSyncing: boolean
  onInitialSyncComplete: () => void
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { schedulePush, flushPush } = useSyncPush()
  const [isInitialSyncing, setIsInitialSyncing] = useState(false)

  useEffect(() => {
    settingsRepository.get('pending_initial_sync').then((val) => {
      if (val === '1') {
        setIsInitialSyncing(true)
      }
    })
  }, [])

  useEffect(() => {
    return onDbWrite(schedulePush)
  }, [schedulePush])

  const onInitialSyncComplete = () => {
    setIsInitialSyncing(false)
  }

  return (
    <SyncContext.Provider value={{ schedulePush, flushPush, isInitialSyncing, onInitialSyncComplete }}>
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
