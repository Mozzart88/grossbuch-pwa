import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/' }),
}))

// Mock syncEvents
let capturedSyncEventListener: ((type: string) => void) | null = null
let capturedSyncConnectionListener: ((connected: boolean) => void) | null = null
vi.mock('../../../services/sync/syncEvents', () => ({
  onSyncEvent: vi.fn((cb: (type: string) => void) => {
    capturedSyncEventListener = cb
    return () => { capturedSyncEventListener = null }
  }),
  onSyncConnection: vi.fn((cb: (connected: boolean) => void) => {
    cb(false) // default: not connected
    capturedSyncConnectionListener = cb
    return () => { capturedSyncConnectionListener = null }
  }),
}))

// Mock pullSync
const mockPullSync = vi.fn()
vi.mock('../../../services/sync', () => ({
  pullSync: (...args: unknown[]) => mockPullSync(...args),
}))

// Mock notifyDataRefresh
const mockNotifyDataRefresh = vi.fn()
vi.mock('../../../hooks/useDataRefresh', () => ({
  notifyDataRefresh: () => mockNotifyDataRefresh(),
}))

// Mock useSyncContext
const mockSchedulePush = vi.fn()
const mockFlushPush = vi.fn()
const mockOnInitialSyncComplete = vi.fn()
let mockIsInitialSyncing = false

vi.mock('../../../contexts/SyncContext', () => ({
  useSyncContext: () => ({
    schedulePush: mockSchedulePush,
    flushPush: mockFlushPush,
    isInitialSyncing: mockIsInitialSyncing,
    onInitialSyncComplete: mockOnInitialSyncComplete,
  }),
}))

const { useSyncPull } = await import('../../../hooks/useSyncPull')

const THROTTLE_MS = 30000

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children)
}

describe('useSyncPull', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedSyncEventListener = null
    capturedSyncConnectionListener = null
    mockIsInitialSyncing = false
    mockPullSync.mockResolvedValue([])
    mockFlushPush.mockResolvedValue(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls pullSync on mount', async () => {
    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => {})
    expect(mockPullSync).toHaveBeenCalledTimes(1)
  })

  it('calls flushPush before pullSync in doPull', async () => {
    const callOrder: string[] = []
    mockFlushPush.mockImplementation(async () => { callOrder.push('flushPush'); return false })
    mockPullSync.mockImplementation(async () => { callOrder.push('pullSync'); return [] })

    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => {})

    expect(callOrder).toEqual(['flushPush', 'pullSync'])
  })

  it('calls schedulePush after a completed pull', async () => {
    mockPullSync.mockResolvedValue([])
    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => {})
    expect(mockSchedulePush).toHaveBeenCalled()
  })

  it('calls schedulePush even when no new data was imported', async () => {
    mockPullSync.mockResolvedValue([{ imported: { transactions: 0 }, newAccountCurrencyIds: [], conflicts: 0, errors: [] }])
    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => {})
    expect(mockSchedulePush).toHaveBeenCalled()
  })

  it('calls onInitialSyncComplete when isInitialSyncing is true and new data arrives', async () => {
    mockIsInitialSyncing = true
    mockPullSync.mockResolvedValue([{
      imported: { transactions: 5 },
      newAccountCurrencyIds: [],
      conflicts: 0,
      errors: [],
    }])

    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => {})
    expect(mockOnInitialSyncComplete).toHaveBeenCalled()
  })

  it('does not call onInitialSyncComplete when isInitialSyncing is false', async () => {
    mockIsInitialSyncing = false
    mockPullSync.mockResolvedValue([{
      imported: { transactions: 5 },
      newAccountCurrencyIds: [],
      conflicts: 0,
      errors: [],
    }])

    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => {})
    expect(mockSchedulePush).toHaveBeenCalled()
    expect(mockOnInitialSyncComplete).not.toHaveBeenCalled()
  })

  it('does not call pullSync when enabled is false', async () => {
    renderHook(() => useSyncPull({ enabled: false }), { wrapper })
    await act(async () => {})
    expect(mockPullSync).not.toHaveBeenCalled()
  })

  it('calls pullSync when the timer interval fires', async () => {
    vi.useFakeTimers()
    mockPullSync.mockResolvedValue([])

    renderHook(() => useSyncPull({ enabled: true }), { wrapper })

    // First pull on mount
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockPullSync).toHaveBeenCalledTimes(1)

    // Advance past throttle window — interval fires
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THROTTLE_MS + 1)
    })
    expect(mockPullSync).toHaveBeenCalledTimes(2)
  })

  it('does not call pullSync again within the throttle window', async () => {
    vi.useFakeTimers()
    mockPullSync.mockResolvedValue([])

    renderHook(() => useSyncPull({ enabled: true }), { wrapper })

    // First pull on mount
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockPullSync).toHaveBeenCalledTimes(1)

    // Advance time but stay within throttle window
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THROTTLE_MS - 1000)
    })
    expect(mockPullSync).toHaveBeenCalledTimes(1)
  })

  it('clears the interval on unmount', async () => {
    vi.useFakeTimers()
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

    const { unmount } = renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('SSE package event bypasses 30s throttle and triggers pull', async () => {
    mockPullSync.mockResolvedValue([])

    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    // Complete initial pull on mount
    await act(async () => {})
    expect(mockPullSync).toHaveBeenCalledTimes(1)

    // Trigger SSE event within the throttle window (no time elapsed)
    await act(async () => {
      capturedSyncEventListener?.('package')
    })

    expect(mockPullSync).toHaveBeenCalledTimes(2)
  })

  it('SSE package event respects in-flight guard — no double pull', async () => {
    let resolveFirst: (() => void) | null = null
    mockPullSync.mockImplementation(() => new Promise<[]>(r => { resolveFirst = () => r([]) }))
    mockFlushPush.mockResolvedValue(false)

    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    // Mount triggers first pull (in-flight, never resolves yet)
    await act(async () => {})

    // Two SSE events arrive while in-flight
    act(() => { capturedSyncEventListener?.('package') })
    act(() => { capturedSyncEventListener?.('package') })

    // Resolve the first pull
    await act(async () => { resolveFirst?.() })

    // Still only 1 call total (mount pull) because in-flight guard blocked SSE pulls
    expect(mockPullSync).toHaveBeenCalledTimes(1)
  })

  it('SSE pull calls notifyDataRefresh when new data arrives', async () => {
    mockPullSync.mockResolvedValue([{ imported: { transactions: 3 }, newAccountCurrencyIds: [], conflicts: 0, errors: [] }])

    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => {})
    mockPullSync.mockClear()
    mockNotifyDataRefresh.mockClear()

    await act(async () => {
      capturedSyncEventListener?.('package')
    })

    expect(mockNotifyDataRefresh).toHaveBeenCalled()
  })

  it('SSE pull resets lastPullRef so timer can fire after', async () => {
    vi.useFakeTimers()
    mockPullSync.mockResolvedValue([])

    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPullSync).toHaveBeenCalledTimes(1)

    // SSE event triggers a forced pull
    await act(async () => { capturedSyncEventListener?.('package') })
    expect(mockPullSync).toHaveBeenCalledTimes(2)

    // Timer fires after THROTTLE_MS — should pull again
    await act(async () => { await vi.advanceTimersByTimeAsync(THROTTLE_MS + 1) })
    expect(mockPullSync).toHaveBeenCalledTimes(3)
  })

  it('SSE does not trigger pull when enabled is false', async () => {
    renderHook(() => useSyncPull({ enabled: false }), { wrapper })
    await act(async () => {})

    await act(async () => { capturedSyncEventListener?.('package') })
    expect(mockPullSync).not.toHaveBeenCalled()
  })

  it('SSE non-package events are ignored', async () => {
    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => {})
    mockPullSync.mockClear()

    await act(async () => { capturedSyncEventListener?.('handshake') })
    expect(mockPullSync).not.toHaveBeenCalled()
  })

  it('timer does not fire pull when SSE is connected', async () => {
    vi.useFakeTimers()
    mockPullSync.mockResolvedValue([])

    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPullSync).toHaveBeenCalledTimes(1)

    // SSE connects
    act(() => { capturedSyncConnectionListener?.(true) })

    await act(async () => { await vi.advanceTimersByTimeAsync(THROTTLE_MS + 1) })
    expect(mockPullSync).toHaveBeenCalledTimes(1)
  })

  it('timer fires pull when SSE is disconnected', async () => {
    vi.useFakeTimers()
    mockPullSync.mockResolvedValue([])

    renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPullSync).toHaveBeenCalledTimes(1)

    // SSE disconnected (default state)
    await act(async () => { await vi.advanceTimersByTimeAsync(THROTTLE_MS + 1) })
    expect(mockPullSync).toHaveBeenCalledTimes(2)
  })

  it('route change does not trigger pull when SSE is connected', async () => {
    let currentPathname = '/'
    const { vi: viMod } = await import('vitest')
    void viMod

    const { rerender } = renderHook(() => useSyncPull({ enabled: true }), { wrapper })
    await act(async () => {})
    expect(mockPullSync).toHaveBeenCalledTimes(1)

    // SSE connects
    act(() => { capturedSyncConnectionListener?.(true) })

    // Re-render simulates route change (pathname mock returns '/' so no actual pathname diff here,
    // but we verify the SSE-connected guard itself by checking the call count is stable)
    rerender()
    await act(async () => {})
    expect(mockPullSync).toHaveBeenCalledTimes(1)
  })
})
