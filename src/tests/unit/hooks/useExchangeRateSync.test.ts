import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock the sync function
vi.mock('../../../services/exchangeRate', () => ({
  syncRates: vi.fn(),
}))

import { useExchangeRateSync } from '../../../hooks/useExchangeRateSync'
import { syncRates } from '../../../services/exchangeRate'

const mockSyncRates = vi.mocked(syncRates)

describe('useExchangeRateSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockSyncRates.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not sync when disabled', async () => {
    renderHook(() => useExchangeRateSync({ enabled: false }))

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(mockSyncRates).not.toHaveBeenCalled()
  })

  it('syncs after 1 second delay when enabled', async () => {
    renderHook(() => useExchangeRateSync({ enabled: true }))

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
    const { rerender } = renderHook(() =>
      useExchangeRateSync({ enabled: true })
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

    renderHook(() => useExchangeRateSync({ enabled: true }))

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
    const { unmount } = renderHook(() =>
      useExchangeRateSync({ enabled: true })
    )

    // Unmount before timeout fires
    unmount()

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(mockSyncRates).not.toHaveBeenCalled()
  })

  it('defaults to enabled when no options provided', async () => {
    renderHook(() => useExchangeRateSync())

    await act(async () => {
      vi.advanceTimersByTime(1500)
    })

    expect(mockSyncRates).toHaveBeenCalledTimes(1)
  })

  it('starts sync when enabled changes to true', async () => {
    const { rerender } = renderHook(
      ({ enabled }) => useExchangeRateSync({ enabled }),
      { initialProps: { enabled: false } }
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
})
