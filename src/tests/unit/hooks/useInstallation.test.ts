import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInstallation } from '../../../hooks/useInstallation'

describe('useInstallation', () => {
  let matchMediaListeners: Record<string, ((e: MediaQueryListEvent) => void)[]>
  let windowListeners: Record<string, ((e: Event) => void)[]>
  const originalMatchMedia = window.matchMedia
  const originalAddEventListener = window.addEventListener
  const originalRemoveEventListener = window.removeEventListener

  beforeEach(() => {
    vi.clearAllMocks()
    matchMediaListeners = {}
    windowListeners = {}

    // Mock matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (event: string, handler: (e: MediaQueryListEvent) => void) => {
        if (!matchMediaListeners[event]) matchMediaListeners[event] = []
        matchMediaListeners[event].push(handler)
      },
      removeEventListener: (event: string, handler: (e: MediaQueryListEvent) => void) => {
        if (matchMediaListeners[event]) {
          matchMediaListeners[event] = matchMediaListeners[event].filter(h => h !== handler)
        }
      },
    }))

    // Track window event listeners
    window.addEventListener = vi.fn().mockImplementation((event: string, handler: (e: Event) => void) => {
      if (!windowListeners[event]) windowListeners[event] = []
      windowListeners[event].push(handler)
    })
    window.removeEventListener = vi.fn().mockImplementation((event: string, handler: (e: Event) => void) => {
      if (windowListeners[event]) {
        windowListeners[event] = windowListeners[event].filter(h => h !== handler)
      }
    })
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    window.addEventListener = originalAddEventListener
    window.removeEventListener = originalRemoveEventListener
  })

  it('returns not installed when not in standalone mode', () => {
    const { result } = renderHook(() => useInstallation())

    expect(result.current.isInstalled).toBe(false)
    expect(result.current.canPromptInstall).toBe(false)
  })

  it('returns installed when in standalone mode', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const { result } = renderHook(() => useInstallation())

    expect(result.current.isInstalled).toBe(true)
  })

  it('returns installed when iOS standalone', () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    const { result } = renderHook(() => useInstallation())

    expect(result.current.isInstalled).toBe(true)

    Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true })
  })

  it('detects iOS user agent', () => {
    const originalUA = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', { value: 'iPhone', configurable: true })

    const { result } = renderHook(() => useInstallation())

    expect(result.current.isIOS).toBe(true)

    Object.defineProperty(navigator, 'userAgent', { value: originalUA, configurable: true })
  })

  it('captures beforeinstallprompt event', () => {
    const { result } = renderHook(() => useInstallation())

    expect(result.current.canPromptInstall).toBe(false)

    // Simulate beforeinstallprompt
    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    }
    act(() => {
      windowListeners['beforeinstallprompt']?.forEach(h => h(mockPromptEvent as unknown as Event))
    })

    expect(result.current.canPromptInstall).toBe(true)
    expect(mockPromptEvent.preventDefault).toHaveBeenCalled()
  })

  it('handles promptInstall and accepted outcome', async () => {
    const { result } = renderHook(() => useInstallation())

    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    }
    act(() => {
      windowListeners['beforeinstallprompt']?.forEach(h => h(mockPromptEvent as unknown as Event))
    })

    await act(async () => {
      await result.current.promptInstall()
    })

    expect(mockPromptEvent.prompt).toHaveBeenCalled()
    expect(result.current.isInstalled).toBe(true)
    expect(result.current.canPromptInstall).toBe(false)
  })

  it('handles promptInstall with dismissed outcome', async () => {
    const { result } = renderHook(() => useInstallation())

    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    }
    act(() => {
      windowListeners['beforeinstallprompt']?.forEach(h => h(mockPromptEvent as unknown as Event))
    })

    await act(async () => {
      await result.current.promptInstall()
    })

    expect(result.current.isInstalled).toBe(false)
    expect(result.current.canPromptInstall).toBe(false)
  })

  it('handles appinstalled event', () => {
    const { result } = renderHook(() => useInstallation())

    act(() => {
      windowListeners['appinstalled']?.forEach(h => h(new Event('appinstalled')))
    })

    expect(result.current.isInstalled).toBe(true)
  })

  it('handles display-mode change via matchMedia', () => {
    const { result } = renderHook(() => useInstallation())

    act(() => {
      matchMediaListeners['change']?.forEach(h => h({ matches: true } as MediaQueryListEvent))
    })

    expect(result.current.isInstalled).toBe(true)
  })

  it('cleans up event listeners on unmount', () => {
    const { unmount } = renderHook(() => useInstallation())

    unmount()

    expect(window.removeEventListener).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function))
    expect(window.removeEventListener).toHaveBeenCalledWith('appinstalled', expect.any(Function))
  })

  it('promptInstall does nothing when no deferred prompt', async () => {
    const { result } = renderHook(() => useInstallation())

    // Should not throw
    await act(async () => {
      await result.current.promptInstall()
    })

    expect(result.current.isInstalled).toBe(false)
  })
})
