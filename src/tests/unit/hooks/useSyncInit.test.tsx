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

const { useSyncInit, useSharePageInitPolling } = await import('../../../hooks/useSyncInit')

const THROTTLE_MS = 30000
const SHARE_POLL_INTERVAL_MS = 5000

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children)
}

describe('useSyncInit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})

describe('useSharePageInitPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
