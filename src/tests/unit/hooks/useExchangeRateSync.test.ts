import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { type ReactNode } from 'react'

// Mock the sync function
vi.mock('../../../services/exchangeRate', () => ({
  syncRates: vi.fn(),
}))

// Mock the toast hook
const mockShowToast = vi.fn()
vi.mock('../../../components/ui', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

import { useExchangeRateSync } from '../../../hooks/useExchangeRateSync'
import { syncRates } from '../../../services/exchangeRate'

const mockSyncRates = vi.mocked(syncRates)

describe('useExchangeRateSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockSyncRates.mockResolvedValue({ success: true, syncedCount: 3 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Simple wrapper that doesn't require actual ToastProvider
  const wrapper = ({ children }: { children: ReactNode }) => children

  it('does not sync when disabled', async () => {
    renderHook(() => useExchangeRateSync({ enabled: false }), { wrapper })

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(mockSyncRates).not.toHaveBeenCalled()
  })

  it('syncs after 1 second delay when enabled', async () => {
    renderHook(() => useExchangeRateSync({ enabled: true }), { wrapper })

    // Not called immediately
    expect(mockSyncRates).not.toHaveBeenCalled()

    // Not called before 1 second
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    expect(mockSyncRates).not.toHaveBeenCalled()

    // Called after 1 second
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(mockSyncRates).toHaveBeenCalledTimes(1)
  })

  it('prevents duplicate syncs on re-render', async () => {
    const { rerender } = renderHook(
      () => useExchangeRateSync({ enabled: true }),
      { wrapper }
    )

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(mockSyncRates).toHaveBeenCalledTimes(1)

    // Re-render should not trigger another sync
    rerender()

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(mockSyncRates).toHaveBeenCalledTimes(1)
  })

  it('handles sync errors gracefully', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSyncRates.mockRejectedValue(new Error('Network error'))

    renderHook(() => useExchangeRateSync({ enabled: true }), { wrapper })

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(consoleWarn).toHaveBeenCalledWith(
      '[useExchangeRateSync] Sync failed:',
      expect.any(Error)
    )

    consoleWarn.mockRestore()
  })

  it('cleans up timeout on unmount', async () => {
    const { unmount } = renderHook(
      () => useExchangeRateSync({ enabled: true }),
      { wrapper }
    )

    // Unmount before timeout fires
    unmount()

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(mockSyncRates).not.toHaveBeenCalled()
  })

  it('defaults to enabled when no options provided', async () => {
    renderHook(() => useExchangeRateSync(), { wrapper })

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(mockSyncRates).toHaveBeenCalledTimes(1)
  })

  it('starts sync when enabled changes to true', async () => {
    const { rerender } = renderHook(
      ({ enabled }) => useExchangeRateSync({ enabled }),
      { initialProps: { enabled: false }, wrapper }
    )

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    expect(mockSyncRates).not.toHaveBeenCalled()

    // Enable sync
    rerender({ enabled: true })

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })
    expect(mockSyncRates).toHaveBeenCalledTimes(1)
  })

  describe('toast notifications in dev mode', () => {
    beforeEach(() => {
      // Simulate dev mode
      vi.stubEnv('DEV', true)
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('shows success toast when sync succeeds', async () => {
      mockSyncRates.mockResolvedValue({ success: true, syncedCount: 5 })

      renderHook(() => useExchangeRateSync({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(1500)
      })

      expect(mockShowToast).toHaveBeenCalledWith(
        'Synced 5 exchange rates',
        'success'
      )
    })

    it('shows info toast when offline', async () => {
      mockSyncRates.mockResolvedValue({
        success: false,
        syncedCount: 0,
        skippedReason: 'offline',
      })

      renderHook(() => useExchangeRateSync({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(1500)
      })

      expect(mockShowToast).toHaveBeenCalledWith(
        'Rate sync skipped: offline',
        'info'
      )
    })

    it('shows error toast when sync fails', async () => {
      mockSyncRates.mockRejectedValue(new Error('Connection failed'))

      renderHook(() => useExchangeRateSync({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(1500)
      })

      expect(mockShowToast).toHaveBeenCalledWith(
        'Rate sync failed: Connection failed',
        'error'
      )
    })
  })
})
