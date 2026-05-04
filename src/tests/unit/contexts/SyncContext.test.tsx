import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'

// Mock useSyncPush
const mockSchedulePush = vi.fn()
const mockFlushPush = vi.fn()
vi.mock('../../../hooks/useSyncPush', () => ({
  useSyncPush: () => ({ schedulePush: mockSchedulePush, flushPush: mockFlushPush }),
}))

// Mock onDbWrite — capture all registered callbacks so tests can trigger DB writes
const capturedDbWriteListeners: Array<() => void> = []
vi.mock('../../../services/database/connection', () => ({
  onDbWrite: vi.fn((cb: () => void) => {
    capturedDbWriteListeners.push(cb)
    return () => {}
  }),
}))

// Mock settingsRepository
const mockSettingsGet = vi.fn()
vi.mock('../../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: (...args: unknown[]) => mockSettingsGet(...args),
  },
}))

// Mock getLinkedInstallations
const mockGetLinkedInstallations = vi.fn()
vi.mock('../../../services/sync', () => ({
  getLinkedInstallations: (...args: unknown[]) => mockGetLinkedInstallations(...args),
}))

// Mock syncEvents
const mockStartSyncEvents = vi.fn()
const mockStopSyncEvents = vi.fn()
vi.mock('../../../services/sync/syncEvents', () => ({
  startSyncEvents: (...args: unknown[]) => mockStartSyncEvents(...args),
  stopSyncEvents: (...args: unknown[]) => mockStopSyncEvents(...args),
}))

const { SyncProvider, useSyncContext } = await import('../../../contexts/SyncContext')

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SyncProvider, null, children)
}

describe('SyncContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedDbWriteListeners.length = 0
    mockSettingsGet.mockResolvedValue(null)
    mockGetLinkedInstallations.mockResolvedValue([])
  })

  it('isInitialSyncing is false by default (no DB flag)', async () => {
    mockSettingsGet.mockResolvedValue(null)

    const { result } = renderHook(() => useSyncContext(), { wrapper })

    await waitFor(() => {
      expect(mockSettingsGet).toHaveBeenCalledWith('pending_initial_sync')
    })

    expect(result.current.isInitialSyncing).toBe(false)
  })

  it('isInitialSyncing is true when DB has pending_initial_sync = "1"', async () => {
    mockSettingsGet.mockImplementation((key: string) => {
      if (key === 'pending_initial_sync') return Promise.resolve('1')
      return Promise.resolve(null)
    })

    const { result } = renderHook(() => useSyncContext(), { wrapper })

    await waitFor(() => {
      expect(result.current.isInitialSyncing).toBe(true)
    })
  })

  it('onInitialSyncComplete() resets isInitialSyncing to false', async () => {
    mockSettingsGet.mockImplementation((key: string) => {
      if (key === 'pending_initial_sync') return Promise.resolve('1')
      return Promise.resolve(null)
    })

    const { result } = renderHook(() => useSyncContext(), { wrapper })

    await waitFor(() => {
      expect(result.current.isInitialSyncing).toBe(true)
    })

    act(() => {
      result.current.onInitialSyncComplete()
    })

    expect(result.current.isInitialSyncing).toBe(false)
  })

  it('exposes flushPush as a function in context value', async () => {
    const { result } = renderHook(() => useSyncContext(), { wrapper })

    await waitFor(() => {
      expect(mockSettingsGet).toHaveBeenCalledWith('pending_initial_sync')
    })

    expect(typeof result.current.flushPush).toBe('function')
  })

  it('throws when used outside SyncProvider', () => {
    expect(() => {
      renderHook(() => useSyncContext())
    }).toThrow('useSyncContext must be used within a SyncProvider')
  })

  it('does not call startSyncEvents when no linked devices exist', async () => {
    mockGetLinkedInstallations.mockResolvedValue([])

    renderHook(() => useSyncContext(), { wrapper })
    await waitFor(() => {
      expect(mockGetLinkedInstallations).toHaveBeenCalled()
    })

    expect(mockStartSyncEvents).not.toHaveBeenCalled()
  })

  it('calls startSyncEvents on mount when linked devices exist', async () => {
    mockGetLinkedInstallations.mockResolvedValue([{ installation_id: 'dev-b', public_key: 'pk' }])

    renderHook(() => useSyncContext(), { wrapper })
    await waitFor(() => {
      expect(mockStartSyncEvents).toHaveBeenCalled()
    })
  })

  it('calls startSyncEvents when linked devices appear after a DB write', async () => {
    // First check on mount: no linked devices
    mockGetLinkedInstallations.mockResolvedValueOnce([])
    // After DB write: linked device appeared
    mockGetLinkedInstallations.mockResolvedValue([{ installation_id: 'dev-b', public_key: 'pk' }])

    renderHook(() => useSyncContext(), { wrapper })
    await waitFor(() => {
      expect(mockGetLinkedInstallations).toHaveBeenCalledTimes(1)
    })
    expect(mockStartSyncEvents).not.toHaveBeenCalled()

    // Simulate a DB write (e.g., linked_installations updated)
    await act(async () => {
      for (const cb of capturedDbWriteListeners) cb()
    })
    await waitFor(() => {
      expect(mockStartSyncEvents).toHaveBeenCalledTimes(1)
    })
  })

  it('calls startSyncEvents only once even with multiple DB writes', async () => {
    mockGetLinkedInstallations.mockResolvedValue([{ installation_id: 'dev-b', public_key: 'pk' }])

    renderHook(() => useSyncContext(), { wrapper })
    await waitFor(() => {
      expect(mockStartSyncEvents).toHaveBeenCalledTimes(1)
    })

    // Multiple DB writes after SSE is already started — must not increment ref count again
    await act(async () => {
      for (const cb of capturedDbWriteListeners) cb()
      for (const cb of capturedDbWriteListeners) cb()
    })
    await waitFor(() => {})

    expect(mockStartSyncEvents).toHaveBeenCalledTimes(1)
  })

  it('calls stopSyncEvents on unmount when linked devices existed', async () => {
    mockGetLinkedInstallations.mockResolvedValue([{ installation_id: 'dev-b', public_key: 'pk' }])

    const { unmount } = renderHook(() => useSyncContext(), { wrapper })
    await waitFor(() => {
      expect(mockStartSyncEvents).toHaveBeenCalled()
    })
    unmount()
    expect(mockStopSyncEvents).toHaveBeenCalled()
  })

  it('does not call stopSyncEvents on unmount when no linked devices existed', async () => {
    mockGetLinkedInstallations.mockResolvedValue([])

    const { unmount } = renderHook(() => useSyncContext(), { wrapper })
    await waitFor(() => {
      expect(mockGetLinkedInstallations).toHaveBeenCalled()
    })
    unmount()
    expect(mockStopSyncEvents).not.toHaveBeenCalled()
  })
})
