import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDataRefresh, notifyDataRefresh } from '../../../hooks/useDataRefresh'

describe('useDataRefresh', () => {
  it('returns 0 initially', () => {
    const { result } = renderHook(() => useDataRefresh())
    expect(result.current).toBe(0)
  })

  it('increments on notifyDataRefresh()', () => {
    const { result } = renderHook(() => useDataRefresh())
    act(() => { notifyDataRefresh() })
    expect(result.current).toBe(1)
  })

  it('increments for each notification', () => {
    const { result } = renderHook(() => useDataRefresh())
    act(() => { notifyDataRefresh() })
    act(() => { notifyDataRefresh() })
    act(() => { notifyDataRefresh() })
    expect(result.current).toBe(3)
  })

  it('stops receiving after unmount', () => {
    const { result, unmount } = renderHook(() => useDataRefresh())
    act(() => { notifyDataRefresh() })
    expect(result.current).toBe(1)
    unmount()
    // Should not throw after unmount
    act(() => { notifyDataRefresh() })
  })

  it('notifies multiple hooks independently', () => {
    const { result: result1 } = renderHook(() => useDataRefresh())
    const { result: result2 } = renderHook(() => useDataRefresh())
    act(() => { notifyDataRefresh() })
    expect(result1.current).toBe(1)
    expect(result2.current).toBe(1)
  })
})
