import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'

// Mock useSyncPush
const mockSchedulePush = vi.fn()
const mockFlushPush = vi.fn()
vi.mock('../../../hooks/useSyncPush', () => ({
  useSyncPush: () => ({ schedulePush: mockSchedulePush, flushPush: mockFlushPush }),
}))

// Mock onDbWrite
vi.mock('../../../services/database/connection', () => ({
  onDbWrite: vi.fn(() => () => {}),
}))

// Mock settingsRepository
const mockSettingsGet = vi.fn()
vi.mock('../../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: (...args: unknown[]) => mockSettingsGet(...args),
  },
}))

const { SyncProvider, useSyncContext } = await import('../../../contexts/SyncContext')

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SyncProvider, null, children)
}

describe('SyncContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSettingsGet.mockResolvedValue(null)
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
})
