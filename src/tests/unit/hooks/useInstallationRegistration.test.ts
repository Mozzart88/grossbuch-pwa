import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { type ReactNode } from 'react'

// Mock the installation API
vi.mock('../../../services/installation', () => ({
  registerInstallation: vi.fn(),
}))

// Mock the settings repository
vi.mock('../../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

// Mock the linked device repository
vi.mock('../../../services/repositories/linkedDeviceRepository', () => ({
  linkedDeviceRepository: {
    upsert: vi.fn(),
  },
}))

// Mock the toast hook
const mockShowToast = vi.fn()
vi.mock('../../../components/ui', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

import { useInstallationRegistration } from '../../../hooks/useInstallationRegistration'
import { registerInstallation } from '../../../services/installation'
import { settingsRepository } from '../../../services/repositories/settingsRepository'
import { linkedDeviceRepository } from '../../../services/repositories/linkedDeviceRepository'
import { AUTH_STORAGE_KEYS } from '../../../types/auth'

const mockRegister = vi.mocked(registerInstallation)
const mockSettingsGet = vi.mocked(settingsRepository.get)
const mockSettingsSet = vi.mocked(settingsRepository.set)
const mockLinkedDeviceUpsert = vi.mocked(linkedDeviceRepository.upsert)

describe('useInstallationRegistration', () => {
  const wrapper = ({ children }: { children: ReactNode }) => children

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockSettingsGet.mockResolvedValue(null)
    mockSettingsSet.mockResolvedValue(undefined)
    mockLinkedDeviceUpsert.mockResolvedValue(undefined)
    mockRegister.mockResolvedValue({
      jwt: 'jwt-token-123',
    })
    // Mock crypto.randomUUID
    vi.stubGlobal('crypto', {
      ...crypto,
      randomUUID: () => 'mock-uuid-1234',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('does not run when disabled', async () => {
    renderHook(() => useInstallationRegistration({ enabled: false }), { wrapper })

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(mockSettingsGet).not.toHaveBeenCalled()
  })

  it('skips registration when already fully registered', async () => {
    mockSettingsGet.mockResolvedValue(JSON.stringify({
      id: 'existing-uuid',
      jwt: 'existing-token',
    }) as never)

    renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(mockRegister).not.toHaveBeenCalled()
    expect(mockSettingsSet).not.toHaveBeenCalled()
  })

  it('retries registration when ID exists but JWT is missing', async () => {
    mockSettingsGet.mockResolvedValue(JSON.stringify({ id: 'existing-uuid' }) as never)

    renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(mockRegister).toHaveBeenCalledWith('existing-uuid', undefined)
    expect(mockSettingsSet).toHaveBeenCalledWith(
      'installation_id',
      JSON.stringify({
        id: 'existing-uuid',
        jwt: 'jwt-token-123',
      })
    )
  })

  it('generates new UUID and registers on first install', async () => {
    renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(mockRegister).toHaveBeenCalledWith('mock-uuid-1234', undefined)
    expect(mockSettingsSet).toHaveBeenCalledWith(
      'installation_id',
      JSON.stringify({
        id: 'mock-uuid-1234',
        jwt: 'jwt-token-123',
      })
    )
  })

  it('saves ID without JWT on API failure for new install', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockRegister.mockRejectedValue(new Error('Network error'))

    renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(mockSettingsSet).toHaveBeenCalledWith(
      'installation_id',
      JSON.stringify({ id: 'mock-uuid-1234' })
    )

    consoleWarn.mockRestore()
  })

  it('handles retry registration API failure gracefully', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSettingsGet.mockResolvedValue(JSON.stringify({ id: 'existing-uuid' }) as never)
    mockRegister.mockRejectedValue(new Error('Server down'))

    renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(mockRegister).toHaveBeenCalledWith('existing-uuid', undefined)
    // Should NOT overwrite the existing setting on retry failure
    expect(mockSettingsSet).not.toHaveBeenCalled()

    consoleWarn.mockRestore()
  })

  it('prevents duplicate runs on re-render', async () => {
    const { rerender } = renderHook(
      () => useInstallationRegistration({ enabled: true }),
      { wrapper }
    )

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(mockSettingsGet).toHaveBeenCalledTimes(1)

    rerender()

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(mockSettingsGet).toHaveBeenCalledTimes(1)
  })

  it('cleans up timeout on unmount', async () => {
    const { unmount } = renderHook(
      () => useInstallationRegistration({ enabled: true }),
      { wrapper }
    )

    unmount()

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(mockSettingsGet).not.toHaveBeenCalled()
  })

  describe('shared UUID handling', () => {
    it('passes shared UUID from localStorage on new install', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_UUID, 'sharer-uuid-abc')

      renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(mockRegister).toHaveBeenCalledWith('mock-uuid-1234', 'sharer-uuid-abc')
    })

    it('clears shared UUID and public key from localStorage on successful new install', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_UUID, 'sharer-uuid-abc')
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY, 'shared-pub-key')

      renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_UUID)).toBeNull()
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY)).toBeNull()
    })

    it('saves linked installation on successful new install with shared UUID', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_UUID, 'sharer-uuid-abc')
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY, 'shared-pub-key')

      renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(mockLinkedDeviceUpsert).toHaveBeenCalledWith('sharer-uuid-abc', 'shared-pub-key')
    })

    it('does not clear shared UUID on failed new install', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_UUID, 'sharer-uuid-abc')
      mockRegister.mockRejectedValue(new Error('Network error'))

      renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_UUID)).toBe('sharer-uuid-abc')
      vi.mocked(console.warn).mockRestore()
    })

    it('passes shared UUID on retry registration', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_UUID, 'sharer-uuid-retry')
      mockSettingsGet.mockResolvedValue(JSON.stringify({ id: 'existing-uuid' }) as never)

      renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(mockRegister).toHaveBeenCalledWith('existing-uuid', 'sharer-uuid-retry')
    })

    it('clears shared UUID and saves linked installation on successful retry', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_UUID, 'sharer-uuid-retry')
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY, 'retry-pub-key')
      mockSettingsGet.mockResolvedValueOnce(JSON.stringify({ id: 'existing-uuid' }) as never)

      renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_UUID)).toBeNull()
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY)).toBeNull()
      expect(mockLinkedDeviceUpsert).toHaveBeenCalledWith('sharer-uuid-retry', 'retry-pub-key')
    })

    it('does not clear shared UUID on failed retry', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_UUID, 'sharer-uuid-retry')
      mockSettingsGet.mockResolvedValue(JSON.stringify({ id: 'existing-uuid' }) as never)
      mockRegister.mockRejectedValue(new Error('Server down'))

      renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_UUID)).toBe('sharer-uuid-retry')
      vi.mocked(console.warn).mockRestore()
    })

    it('upserts the linked device by installation id regardless of prior state', async () => {
      // linked_device is a relational table now (task 4.2/4.4) — upsert (INSERT ... ON
      // CONFLICT DO UPDATE) handles new links and overwrites uniformly, no blob merging
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_UUID, 'sharer-uuid-abc')
      localStorage.setItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY, 'updated-pub-key')

      renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(mockLinkedDeviceUpsert).toHaveBeenCalledWith('sharer-uuid-abc', 'updated-pub-key')
    })
  })

  describe('toast notifications in dev mode', () => {
    beforeEach(() => {
      vi.stubEnv('DEV', true)
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('shows success toast on new registration', async () => {
      renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(mockShowToast).toHaveBeenCalledWith('Installation registered', 'success')
    })

    it('shows success toast on retry registration', async () => {
      mockSettingsGet.mockResolvedValue(JSON.stringify({ id: 'existing-uuid' }) as never)

      renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(mockShowToast).toHaveBeenCalledWith('Installation registered (retry)', 'success')
    })

    it('shows error toast on new registration failure', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockRegister.mockRejectedValue(new Error('Connection failed'))

      renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(mockShowToast).toHaveBeenCalledWith(
        'Registration failed: Connection failed',
        'error'
      )

      vi.mocked(console.warn).mockRestore()
    })

    it('shows error toast on retry registration failure', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockSettingsGet.mockResolvedValue(JSON.stringify({ id: 'existing-uuid' }) as never)
      mockRegister.mockRejectedValue(new Error('Server error'))

      renderHook(() => useInstallationRegistration({ enabled: true }), { wrapper })

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(mockShowToast).toHaveBeenCalledWith(
        'Registration retry failed: Server error',
        'error'
      )

      vi.mocked(console.warn).mockRestore()
    })
  })
})
