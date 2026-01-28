import { useEffect, useRef } from 'react'
import { syncRates } from '../services/exchangeRate'

interface UseExchangeRateSyncOptions {
  enabled?: boolean
}

export function useExchangeRateSync({
  enabled = true,
}: UseExchangeRateSyncOptions = {}): void {
  const hasSyncedRef = useRef(false)

  useEffect(() => {
    if (!enabled || hasSyncedRef.current) {
      return
    }

    // Delay sync to not block initial render
    const timeoutId = setTimeout(() => {
      hasSyncedRef.current = true

      syncRates().catch((error) => {
        console.warn('[useExchangeRateSync] Sync failed:', error)
      })
    }, 1000)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [enabled])
}
