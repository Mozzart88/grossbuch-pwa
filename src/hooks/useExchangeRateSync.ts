import { useEffect, useRef } from 'react'
import { syncRates } from '../services/exchangeRate'
import { useToast } from '../components/ui'

interface UseExchangeRateSyncOptions {
  enabled?: boolean
}

export function useExchangeRateSync({
  enabled = true,
}: UseExchangeRateSyncOptions = {}): void {
  const hasSyncedRef = useRef(false)
  const { showToast } = useToast()

  useEffect(() => {
    if (!enabled || hasSyncedRef.current) {
      return
    }

    // Delay sync to not block initial render
    const timeoutId = setTimeout(async () => {
      hasSyncedRef.current = true

      try {
        const result = await syncRates()

        // Show toast in dev mode only
        if (import.meta.env.DEV) {
          if (result.success) {
            showToast(`Synced ${result.syncedCount} exchange rates`, 'success')
          } else if (result.skippedReason === 'offline') {
            showToast('Rate sync skipped: offline', 'info')
          } else if (result.skippedReason) {
            showToast(`Rate sync skipped: ${result.skippedReason}`, 'info')
          }
        }
      } catch (error) {
        console.warn('[useExchangeRateSync] Sync failed:', error)
        if (import.meta.env.DEV) {
          showToast(
            `Rate sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'error'
          )
        }
      }
    }, 1000)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [enabled, showToast])
}
