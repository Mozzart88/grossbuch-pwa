import { useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { pullSync } from '../services/sync'
import { notifyDataRefresh } from './useDataRefresh'
import { useSyncContext } from '../contexts/SyncContext'
import { onSyncEvent, onSyncConnection } from '../services/sync/syncEvents'

const THROTTLE_MS = 30000

export function useSyncPull({ enabled = true }: { enabled?: boolean } = {}) {
  const location = useLocation()
  const lastPullRef = useRef(0)
  const isPullingRef = useRef(false)
  const enabledRef = useRef(enabled)
  const sseConnectedRef = useRef(false)

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

  const doForcedPull = useCallback(() => {
    if (!enabledRef.current) return
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
        console.warn('[useSyncPull] SSE pull failed:', err)
      })
      .finally(() => {
        isPullingRef.current = false
      })
  }, [])

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

  // Track SSE connectivity — timer/route polls are fallback only
  useEffect(() => {
    return onSyncConnection((connected) => { sseConnectedRef.current = connected })
  }, [])

  // Trigger pull on route changes — only when SSE is not connected
  useEffect(() => {
    if (!enabled) return
    if (sseConnectedRef.current) return
    doPull()
  }, [enabled, location.pathname, doPull])

  // Periodic pull timer — only fires when SSE is not connected
  useEffect(() => {
    const id = setInterval(() => {
      if (!sseConnectedRef.current) doPull()
    }, THROTTLE_MS)
    return () => clearInterval(id)
  }, [doPull])

  // SSE package event — bypass throttle, pull immediately
  useEffect(() => {
    return onSyncEvent((type) => {
      if (type === 'package') doForcedPull()
    })
  }, [doForcedPull])
}
