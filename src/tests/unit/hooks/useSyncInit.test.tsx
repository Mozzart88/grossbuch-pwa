import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'

let mockPathname = '/'
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mockPathname }),
}))

const mockPollAndProcessInit = vi.fn()
vi.mock('../../../services/sync/syncInit', () => ({
  pollAndProcessInit: (...args: unknown[]) => mockPollAndProcessInit(...args),
}))

// Mock syncEvents
let capturedSyncEventListener: ((type: string) => void) | null = null
let capturedSyncConnectionListener: ((connected: boolean) => void) | null = null
const mockStartSyncEvents = vi.fn()
const mockStopSyncEvents = vi.fn()
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
  startSyncEvents: (...args: unknown[]) => mockStartSyncEvents(...args),
  stopSyncEvents: (...args: unknown[]) => mockStopSyncEvents(...args),
}))

const { useSyncInit, useSharePageInitPolling } = await import('../../../hooks/useSyncInit')

const THROTTLE_MS = 30000
const SHARE_POLL_INTERVAL_MS = 5000

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children)
}

describe('useSyncInit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedSyncEventListener = null
    capturedSyncConnectionListener = null
    mockPathname = '/'
    mockPollAndProcessInit.mockResolvedValue({ newDevices: [], done: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls on mount', async () => {
    renderHook(() => useSyncInit({ enabled: true }), { wrapper })
    await act(async () => {})
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)
  })

  it('does not poll when disabled', async () => {
    renderHook(() => useSyncInit({ enabled: false }), { wrapper })
    await act(async () => {})
    expect(mockPollAndProcessInit).not.toHaveBeenCalled()
  })

  it('does not poll again within the throttle window on route change', async () => {
    vi.useFakeTimers()

    const { rerender } = renderHook(() => useSyncInit({ enabled: true }), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)

    // Route change within throttle window — must not trigger another poll
    mockPathname = '/accounts'
    rerender()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)
  })

  it('polls again on route change after the throttle window elapses', async () => {
    vi.useFakeTimers()

    const { rerender } = renderHook(() => useSyncInit({ enabled: true }), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(THROTTLE_MS + 1) })
    mockPathname = '/accounts'
    rerender()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(2)
  })

  it('continues polling after pollAndProcessInit returns done:true (regression: doneRef removed)', async () => {
    vi.useFakeTimers()
    // Simulate device B completing initial handshake with A → done:true
    mockPollAndProcessInit.mockResolvedValue({ newDevices: [], done: true })

    const { rerender } = renderHook(() => useSyncInit({ enabled: true }), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)

    // C joins later; B must still poll to receive C's introduction package
    await act(async () => { await vi.advanceTimersByTimeAsync(THROTTLE_MS + 1) })
    mockPathname = '/accounts'
    rerender()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(2)
  })

  it('processes new device introductions arriving after the initial done:true', async () => {
    vi.useFakeTimers()

    // First poll: already linked to A, no packages → done:true
    mockPollAndProcessInit.mockResolvedValueOnce({ newDevices: [], done: true })
    // Second poll: A introduced C → one new device
    mockPollAndProcessInit.mockResolvedValueOnce({ newDevices: ['device-c-uuid'], done: false })

    const { rerender } = renderHook(() => useSyncInit({ enabled: true }), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(THROTTLE_MS + 1) })
    mockPathname = '/accounts'
    rerender()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(2)
  })

  it('logs a warning and continues when pollAndProcessInit rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockPollAndProcessInit.mockRejectedValue(new Error('network error'))

    renderHook(() => useSyncInit({ enabled: true }), { wrapper })
    await act(async () => {})
    expect(warnSpy).toHaveBeenCalledWith('[useSyncInit] Poll failed:', expect.any(Error))
    warnSpy.mockRestore()
  })

  it('SSE handshake event bypasses throttle and triggers pollAndProcessInit', async () => {
    renderHook(() => useSyncInit({ enabled: true }), { wrapper })
    await act(async () => {})
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)

    // No time elapsed — within throttle window
    await act(async () => { capturedSyncEventListener?.('handshake') })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(2)
  })

  it('SSE handshake respects in-flight guard — no double poll', async () => {
    let resolveFirst: (() => void) | null = null
    mockPollAndProcessInit.mockImplementation(() => new Promise(r => { resolveFirst = () => r({ newDevices: [], done: false }) }))

    renderHook(() => useSyncInit({ enabled: true }), { wrapper })
    await act(async () => {})
    // poll is in-flight

    act(() => { capturedSyncEventListener?.('handshake') })
    act(() => { capturedSyncEventListener?.('handshake') })

    await act(async () => { resolveFirst?.() })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)
  })

  it('SSE handshake does nothing when enabled is false', async () => {
    renderHook(() => useSyncInit({ enabled: false }), { wrapper })
    await act(async () => {})

    await act(async () => { capturedSyncEventListener?.('handshake') })
    expect(mockPollAndProcessInit).not.toHaveBeenCalled()
  })

  it('SSE non-handshake events are ignored by useSyncInit', async () => {
    renderHook(() => useSyncInit({ enabled: true }), { wrapper })
    await act(async () => {})
    mockPollAndProcessInit.mockClear()

    await act(async () => { capturedSyncEventListener?.('package') })
    expect(mockPollAndProcessInit).not.toHaveBeenCalled()
  })

  it('unsubscribes from SSE on unmount', async () => {
    const { unmount } = renderHook(() => useSyncInit({ enabled: true }), { wrapper })
    await act(async () => {})
    unmount()

    // capturedSyncEventListener is cleared by the unsubscribe function
    expect(capturedSyncEventListener).toBeNull()
  })

  it('route change does not trigger poll when SSE is connected', async () => {
    vi.useFakeTimers()

    const { rerender } = renderHook(() => useSyncInit({ enabled: true }), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)

    // Advance past throttle so the throttle check would pass
    await act(async () => { await vi.advanceTimersByTimeAsync(THROTTLE_MS + 1) })

    // SSE connects
    act(() => { capturedSyncConnectionListener?.(true) })

    // Route change — should be suppressed by SSE guard
    mockPathname = '/accounts'
    rerender()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)
  })

  it('route change triggers poll when SSE is disconnected', async () => {
    vi.useFakeTimers()

    const { rerender } = renderHook(() => useSyncInit({ enabled: true }), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)

    // Advance past throttle
    await act(async () => { await vi.advanceTimersByTimeAsync(THROTTLE_MS + 1) })

    // SSE not connected (default)
    mockPathname = '/accounts'
    rerender()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(2)
  })
})

const SHARE_SSE_TIMEOUT_MS = 60 * 60 * 1000

describe('useSharePageInitPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedSyncEventListener = null
    capturedSyncConnectionListener = null
    mockPollAndProcessInit.mockResolvedValue({ newDevices: [], done: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls immediately on mount', async () => {
    vi.useFakeTimers()
    renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)
  })

  it('polls on each interval tick', async () => {
    vi.useFakeTimers()
    renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(SHARE_POLL_INTERVAL_MS) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(2)

    await act(async () => { await vi.advanceTimersByTimeAsync(SHARE_POLL_INTERVAL_MS) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(3)
  })

  it('returns newDeviceFound:true when a new device arrives', async () => {
    vi.useFakeTimers()
    mockPollAndProcessInit.mockResolvedValue({ newDevices: ['device-c-uuid'], done: false })

    const { result } = renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.newDeviceFound).toBe(true)
  })

  it('returns newDeviceFound:false when no new devices arrive', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.newDeviceFound).toBe(false)
  })

  it('stops polling after unmount', async () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)

    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(SHARE_POLL_INTERVAL_MS * 3) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)
  })

  it('logs a warning and continues when pollAndProcessInit rejects', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockPollAndProcessInit.mockRejectedValue(new Error('network error'))

    renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(warnSpy).toHaveBeenCalledWith('[useSharePageInitPolling] Poll failed:', expect.any(Error))
    warnSpy.mockRestore()
  })

  it('interval does not fire when SSE is connected', async () => {
    vi.useFakeTimers()
    renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)

    // SSE connects
    act(() => { capturedSyncConnectionListener?.(true) })

    await act(async () => { await vi.advanceTimersByTimeAsync(SHARE_POLL_INTERVAL_MS * 3) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)
  })

  it('SSE handshake event triggers poll immediately', async () => {
    vi.useFakeTimers()
    renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(1)

    await act(async () => { capturedSyncEventListener?.('handshake') })
    expect(mockPollAndProcessInit).toHaveBeenCalledTimes(2)
  })

  it('SSE non-handshake events are ignored by useSharePageInitPolling', async () => {
    vi.useFakeTimers()
    renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    mockPollAndProcessInit.mockClear()

    await act(async () => { capturedSyncEventListener?.('package') })
    expect(mockPollAndProcessInit).not.toHaveBeenCalled()
  })

  it('calls startSyncEvents on mount', async () => {
    vi.useFakeTimers()
    renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockStartSyncEvents).toHaveBeenCalledTimes(1)
  })

  it('calls stopSyncEvents on unmount (before timeout)', async () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockStopSyncEvents).not.toHaveBeenCalled()

    unmount()
    expect(mockStopSyncEvents).toHaveBeenCalledTimes(1)
  })

  it('calls stopSyncEvents after 1-hour timeout even if still mounted', async () => {
    vi.useFakeTimers()
    renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(mockStopSyncEvents).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(SHARE_SSE_TIMEOUT_MS) })
    expect(mockStopSyncEvents).toHaveBeenCalledTimes(1)
  })

  it('calls stopSyncEvents only once when timeout fires then component unmounts', async () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(SHARE_SSE_TIMEOUT_MS) })
    expect(mockStopSyncEvents).toHaveBeenCalledTimes(1)

    unmount()
    expect(mockStopSyncEvents).toHaveBeenCalledTimes(1)
  })

  it('calls stopSyncEvents only once when component unmounts before timeout', async () => {
    vi.useFakeTimers()
    const { unmount } = renderHook(() => useSharePageInitPolling(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    unmount()
    expect(mockStopSyncEvents).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(SHARE_SSE_TIMEOUT_MS) })
    expect(mockStopSyncEvents).toHaveBeenCalledTimes(1)
  })
})
