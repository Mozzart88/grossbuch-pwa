import { useEffect, useRef, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { pollAndProcessInit } from '../services/sync/syncInit'

const THROTTLE_MS = 30000

/**
 * Poll for init packages on route changes (like useSyncPull), with 30s throttle.
 * Stops polling once handshake is complete (linked devices exist and no pending packages).
 */
export function useSyncInit({ enabled = true }: { enabled?: boolean } = {}) {
  const location = useLocation()
  const lastPollRef = useRef(0)
  const isPollingRef = useRef(false)
  const doneRef = useRef(false)

  useEffect(() => {
    if (!enabled || doneRef.current) return

    const now = Date.now()
    if (now - lastPollRef.current < THROTTLE_MS) return
    if (isPollingRef.current) return

    isPollingRef.current = true
    lastPollRef.current = now

    pollAndProcessInit()
      .then((result) => {
        if (result.done) {
          doneRef.current = true
        }
      })
      .catch((err) => {
        console.warn('[useSyncInit] Poll failed:', err)
      })
      .finally(() => {
        isPollingRef.current = false
      })
  }, [enabled, location.pathname])
}

const SHARE_POLL_INTERVAL_MS = 5000

/**
 * Aggressive polling for the SharePage — checks every 5s while mounted.
 * Returns { newDeviceFound } for UI feedback.
 */
export function useSharePageInitPolling() {
  const [newDeviceFound, setNewDeviceFound] = useState(false)
  const isPollingRef = useRef(false)

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

  useEffect(() => {
    // Run immediately on mount
    poll()

    const intervalId = setInterval(poll, SHARE_POLL_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [poll])

  return { newDeviceFound }
}
