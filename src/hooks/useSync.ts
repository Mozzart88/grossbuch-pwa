import { useState, useCallback } from 'react'
import { pushSync, pullSync } from '../services/sync'
import { useSyncPush } from './useSyncPush'
import { useSyncPull } from './useSyncPull'
import { notifyDataRefresh } from './useDataRefresh'

export function useSync({ enabled = true }: { enabled?: boolean } = {}) {
  const [isSyncing, setIsSyncing] = useState(false)
  const { schedulePush } = useSyncPush()

  useSyncPull({ enabled })

  const syncNow = useCallback(async () => {
    if (isSyncing) return
    setIsSyncing(true)
    try {
      await pushSync()
      const results = await pullSync()
      if (results.some(r => Object.values(r.imported).some(v => v > 0))) {
        notifyDataRefresh()
      }
    } catch (err) {
      console.warn('[useSync] Manual sync failed:', err)
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing])

  return { schedulePush, syncNow, isSyncing }
}
