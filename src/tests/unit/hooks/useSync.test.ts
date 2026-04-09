import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Mock pushSync and pullSync
const mockPushSync = vi.fn()
const mockPullSync = vi.fn()
vi.mock('../../../services/sync', () => ({
  pushSync: (...args: unknown[]) => mockPushSync(...args),
  pullSync: (...args: unknown[]) => mockPullSync(...args),
}))

// Mock useSyncPush
const mockSchedulePush = vi.fn()
vi.mock('../../../hooks/useSyncPush', () => ({
  useSyncPush: () => ({ schedulePush: mockSchedulePush, flushPush: vi.fn() }),
}))

// Mock useSyncPull
vi.mock('../../../hooks/useSyncPull', () => ({
  useSyncPull: vi.fn(),
}))

// Mock notifyDataRefresh
const mockNotifyDataRefresh = vi.fn()
vi.mock('../../../hooks/useDataRefresh', () => ({
  notifyDataRefresh: () => mockNotifyDataRefresh(),
  useDataRefresh: () => 0,
}))

import { useSync } from '../../../hooks/useSync'
import { useSyncPull } from '../../../hooks/useSyncPull'

const mockUseSyncPull = vi.mocked(useSyncPull)

describe('useSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPushSync.mockResolvedValue(true)
    mockPullSync.mockResolvedValue([])
    mockUseSyncPull.mockImplementation(() => {})
  })

  it('returns schedulePush, syncNow, and isSyncing', () => {
    const { result } = renderHook(() => useSync())
    expect(result.current.schedulePush).toBe(mockSchedulePush)
    expect(typeof result.current.syncNow).toBe('function')
    expect(result.current.isSyncing).toBe(false)
  })

  it('passes enabled=true to useSyncPull by default', () => {
    renderHook(() => useSync())
    expect(mockUseSyncPull).toHaveBeenCalledWith({ enabled: true })
  })

  it('passes enabled=false to useSyncPull when specified', () => {
    renderHook(() => useSync({ enabled: false }))
    expect(mockUseSyncPull).toHaveBeenCalledWith({ enabled: false })
  })

  it('syncNow calls pushSync then pullSync', async () => {
    const { result } = renderHook(() => useSync())
    await act(async () => {
      await result.current.syncNow()
    })
    expect(mockPushSync).toHaveBeenCalledOnce()
    expect(mockPullSync).toHaveBeenCalledOnce()
  })

  it('syncNow sets isSyncing to true while running then false after', async () => {
    let resolvePull!: (v: unknown[]) => void
    mockPullSync.mockReturnValue(new Promise<unknown[]>(res => { resolvePull = res }))

    const { result } = renderHook(() => useSync())

    // Start sync without awaiting
    act(() => { result.current.syncNow() })

    // Wait for isSyncing to become true
    await waitFor(() => expect(result.current.isSyncing).toBe(true))

    // Resolve the pull and wait for completion
    await act(async () => { resolvePull([]) })

    await waitFor(() => expect(result.current.isSyncing).toBe(false))
  })

  it('syncNow does nothing if already syncing', async () => {
    let resolvePull!: (v: unknown[]) => void
    mockPullSync.mockReturnValue(new Promise<unknown[]>(res => { resolvePull = res }))

    const { result } = renderHook(() => useSync())

    // Start first sync
    act(() => { result.current.syncNow() })
    await waitFor(() => expect(result.current.isSyncing).toBe(true))

    // Attempt second sync while first is running — should be a no-op
    await act(async () => { await result.current.syncNow() })
    expect(mockPushSync).toHaveBeenCalledOnce()

    // Complete first sync
    await act(async () => { resolvePull([]) })
    await waitFor(() => expect(result.current.isSyncing).toBe(false))
  })

  it('notifies data refresh when imported rows exist', async () => {
    mockPullSync.mockResolvedValue([
      { imported: { transactions: 2, accounts: 0 } },
    ])
    const { result } = renderHook(() => useSync())
    await act(async () => {
      await result.current.syncNow()
    })
    expect(mockNotifyDataRefresh).toHaveBeenCalledOnce()
  })

  it('does not notify data refresh when nothing was imported', async () => {
    mockPullSync.mockResolvedValue([
      { imported: { transactions: 0, accounts: 0 } },
    ])
    const { result } = renderHook(() => useSync())
    await act(async () => {
      await result.current.syncNow()
    })
    expect(mockNotifyDataRefresh).not.toHaveBeenCalled()
  })

  it('does not notify data refresh when pullSync returns empty array', async () => {
    mockPullSync.mockResolvedValue([])
    const { result } = renderHook(() => useSync())
    await act(async () => {
      await result.current.syncNow()
    })
    expect(mockNotifyDataRefresh).not.toHaveBeenCalled()
  })

  it('handles syncNow error gracefully (logs warning, resets isSyncing)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockPushSync.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useSync())
    await act(async () => {
      await result.current.syncNow()
    })

    expect(warnSpy).toHaveBeenCalledWith('[useSync] Manual sync failed:', expect.any(Error))
    expect(result.current.isSyncing).toBe(false)
    warnSpy.mockRestore()
  })
})
