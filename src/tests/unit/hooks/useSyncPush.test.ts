import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSyncPush } from '../../../hooks/useSyncPush'
import { pushSync } from '../../../services/sync'

vi.mock('../../../services/sync', () => ({
  pushSync: vi.fn(),
}))

const mockPushSync = vi.mocked(pushSync)

describe('useSyncPush', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockPushSync.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces scheduled pushes', async () => {
    const { result } = renderHook(() => useSyncPush())

    act(() => {
      result.current.schedulePush()
      result.current.schedulePush()
      vi.advanceTimersByTime(2999)
    })

    expect(mockPushSync).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })

    expect(mockPushSync).toHaveBeenCalledTimes(1)
  })

  it('flushes pending pushes immediately and returns the sync result', async () => {
    const { result } = renderHook(() => useSyncPush())

    act(() => {
      result.current.schedulePush()
    })

    await expect(result.current.flushPush()).resolves.toBe(true)

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(mockPushSync).toHaveBeenCalledTimes(1)
  })

  it('returns false when a flush is already in progress', async () => {
    let resolvePush: (value: boolean) => void = () => {}
    mockPushSync.mockImplementation(() => new Promise<boolean>(resolve => {
      resolvePush = resolve
    }))
    const { result } = renderHook(() => useSyncPush())

    const firstFlush = result.current.flushPush()
    await Promise.resolve()

    await expect(result.current.flushPush()).resolves.toBe(false)

    resolvePush(true)
    await expect(firstFlush).resolves.toBe(true)
  })

  it('reports scheduled and flushed push failures without throwing', async () => {
    const { result } = renderHook(() => useSyncPush())
    mockPushSync.mockRejectedValueOnce(new Error('scheduled failed'))

    await act(async () => {
      result.current.schedulePush()
      vi.advanceTimersByTime(3000)
      await Promise.resolve()
    })

    mockPushSync.mockRejectedValueOnce(new Error('flush failed'))

    await expect(result.current.flushPush()).resolves.toBe(false)
    expect(console.warn).toHaveBeenCalledWith('[useSyncPush] Push failed:', expect.any(Error))
    expect(console.warn).toHaveBeenCalledWith('[useSyncPush] Flush push failed:', expect.any(Error))
  })
})
