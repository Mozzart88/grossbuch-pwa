import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { pullSync } from '../services/sync'
import { notifyDataRefresh } from './useDataRefresh'

const THROTTLE_MS = 30000

export function useSyncPull({ enabled = true }: { enabled?: boolean } = {}) {
  const location = useLocation()
  const lastPullRef = useRef(0)
  const isPullingRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const now = Date.now()
    if (now - lastPullRef.current < THROTTLE_MS) return
    if (isPullingRef.current) return

    isPullingRef.current = true

    pullSync()
      .then((results) => {
        lastPullRef.current = Date.now()
        if (results.some(r => Object.values(r.imported).some(v => v > 0))) {
          notifyDataRefresh()
        }
      })
      .catch((err) => {
        console.warn('[useSyncPull] Pull failed:', err)
      })
      .finally(() => {
        isPullingRef.current = false
      })
  }, [enabled, location.pathname])
}
