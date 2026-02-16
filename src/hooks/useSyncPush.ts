import { useCallback, useRef } from 'react'
import { pushSync } from '../services/sync'

const DEBOUNCE_MS = 3000

export function useSyncPush() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPushingRef = useRef(false)

  const schedulePush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(async () => {
      if (isPushingRef.current) return
      isPushingRef.current = true

      try {
        await pushSync()
      } catch (err) {
        console.warn('[useSyncPush] Push failed:', err)
      } finally {
        isPushingRef.current = false
      }
    }, DEBOUNCE_MS)
  }, [])

  return { schedulePush }
}
