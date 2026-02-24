import { useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { pullSync } from '../services/sync'
import { notifyDataRefresh } from './useDataRefresh'
import { useSyncContext } from '../contexts/SyncContext'

const THROTTLE_MS = 30000

export function useSyncPull({ enabled = true }: { enabled?: boolean } = {}) {
  const location = useLocation()
  const lastPullRef = useRef(0)
  const isPullingRef = useRef(false)
  const enabledRef = useRef(enabled)

  const { schedulePush, flushPush, isInitialSyncing, onInitialSyncComplete } = useSyncContext()
  const isInitialSyncingRef = useRef(isInitialSyncing)
  const onInitialSyncCompleteRef = useRef(onInitialSyncComplete)
  const schedulePushRef = useRef(schedulePush)
  const flushPushRef = useRef(flushPush)

  useEffect(() => { enabledRef.current = enabled }, [enabled])
  useEffect(() => { isInitialSyncingRef.current = isInitialSyncing }, [isInitialSyncing])
  useEffect(() => { onInitialSyncCompleteRef.current = onInitialSyncComplete }, [onInitialSyncComplete])
  useEffect(() => { schedulePushRef.current = schedulePush }, [schedulePush])
  useEffect(() => { flushPushRef.current = flushPush }, [flushPush])

  const doPull = useCallback(() => {
    if (!enabledRef.current) return

    const now = Date.now()
    if (now - lastPullRef.current < THROTTLE_MS) return
    if (isPullingRef.current) return

    isPullingRef.current = true

    flushPushRef.current()
      .then(() => pullSync())
      .then((results) => {
        lastPullRef.current = Date.now()
        const hasNewData = results.some(r => Object.values(r.imported).some(v => v > 0))
        if (hasNewData) {
          notifyDataRefresh()
          if (isInitialSyncingRef.current) {
            onInitialSyncCompleteRef.current()
          }
        }
        schedulePushRef.current()
      })
      .catch((err) => {
        console.warn('[useSyncPull] Pull failed:', err)
      })
      .finally(() => {
        isPullingRef.current = false
      })
  }, [])

  // Trigger pull on route changes
  useEffect(() => {
    if (!enabled) return
    doPull()
  }, [enabled, location.pathname, doPull])

  // Periodic pull timer (fires even without navigation)
  useEffect(() => {
    const id = setInterval(doPull, THROTTLE_MS)
    return () => clearInterval(id)
  }, [doPull])
}
