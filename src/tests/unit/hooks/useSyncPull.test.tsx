import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/' }),
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
})
