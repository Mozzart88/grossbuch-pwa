import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { pollAndProcessInit } from '../services/sync/syncInit'
import { onSyncEvent, onSyncConnection, startSyncEvents, stopSyncEvents } from '../services/sync/syncEvents'

const THROTTLE_MS = 30000

/**
 * Poll for init packages on route changes (like useSyncPull), with 30s throttle.
 * Stops polling once handshake is complete (linked devices exist and no pending packages).
 */
export function useSyncInit({ enabled = true }: { enabled?: boolean } = {}) {
  const location = useLocation()
  const lastPollRef = useRef(0)
  const isPollingRef = useRef(false)
  const sseConnectedRef = useRef(false)

  // Track SSE connectivity — route-change poll is fallback only
  useEffect(() => {
    return onSyncConnection((connected) => { sseConnectedRef.current = connected })
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (sseConnectedRef.current) return

    const now = Date.now()
    if (now - lastPollRef.current < THROTTLE_MS) return
    if (isPollingRef.current) return

    isPollingRef.current = true
    lastPollRef.current = now

    pollAndProcessInit()
      .catch((err) => {
        console.warn('[useSyncInit] Poll failed:', err)
      })
      .finally(() => {
        isPollingRef.current = false
      })
  }, [enabled, location.pathname])

  // SSE handshake event — bypass throttle, poll immediately
  useEffect(() => {
    return onSyncEvent((type) => {
      if (type !== 'handshake') return
      if (!enabled) return
      if (isPollingRef.current) return

      isPollingRef.current = true
      lastPollRef.current = Date.now()

      pollAndProcessInit()
        .catch((err) => {
          console.warn('[useSyncInit] SSE handshake poll failed:', err)
        })
        .finally(() => {
          isPollingRef.current = false
        })
    })
  }, [enabled])
}

const SHARE_POLL_INTERVAL_MS = 5000
const SHARE_SSE_TIMEOUT_MS = 60 * 60 * 1000 // server handshake expiry

/**
 * Aggressive polling for the SharePage — checks every 5s while mounted.
 * Returns { newDeviceFound } for UI feedback.
 */
export function useSharePageInitPolling() {
  const [newDeviceFound, setNewDeviceFound] = useState(false)
  const isPollingRef = useRef(false)
  const sseConnectedRef = useRef(false)

  const poll = useCallback(async () => {
    if (isPollingRef.current) return
    isPollingRef.current = true
    try {
      const result = await pollAndProcessInit()
      if (result.newDevices.length > 0) {
        setNewDeviceFound(true)
      }
    } catch (err) {
      console.warn('[useSharePageInitPolling] Poll failed:', err)
    } finally {
      isPollingRef.current = false
    }
  }, [])

  // Open SSE for device pairing; auto-close after 1 hour (server handshake expiry).
  // If a linked device sends a handshake, SyncContext will have taken over SSE via
  // onDbWrite, so our stop here just decrements the ref count — SSE stays alive.
  useEffect(() => {
    startSyncEvents()
    let stopped = false
    const stop = () => {
      if (stopped) return
      stopped = true
      stopSyncEvents()
    }
    const timeoutId = setTimeout(stop, SHARE_SSE_TIMEOUT_MS)
    return () => {
      clearTimeout(timeoutId)
      stop()
    }
  }, [])

  // Track SSE connectivity — interval poll is fallback only
  useEffect(() => {
    return onSyncConnection((connected) => { sseConnectedRef.current = connected })
  }, [])

  // SSE handshake event — poll immediately when server signals a new device
  useEffect(() => {
    return onSyncEvent((type) => {
      if (type === 'handshake') poll()
    })
  }, [poll])

  useEffect(() => {
    // Run immediately on mount
    poll()

    const intervalId = setInterval(() => {
      if (!sseConnectedRef.current) poll()
    }, SHARE_POLL_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [poll])

  return { newDeviceFound }
}
