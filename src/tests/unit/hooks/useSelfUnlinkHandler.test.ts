import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { act } from '@testing-library/react'

let onDbWriteCallback: (() => void) | null = null

const mockOnDbWrite = vi.fn((cb: () => void) => {
  onDbWriteCallback = cb
  return () => { onDbWriteCallback = null }
})

const mockWipeDatabase = vi.fn()

vi.mock('../../../services/database/connection', () => ({
  onDbWrite: (cb: () => void) => mockOnDbWrite(cb),
  wipeDatabase: () => mockWipeDatabase(),
}))

const mockSettingsGet = vi.fn()
const mockSettingsSet = vi.fn()
const mockSettingsDelete = vi.fn()

vi.mock('../../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: (...args: unknown[]) => mockSettingsGet(...args),
    set: (...args: unknown[]) => mockSettingsSet(...args),
    delete: (...args: unknown[]) => mockSettingsDelete(...args),
  },
}))

const mockSendUnlinkConfirmation = vi.fn()
vi.mock('../../../services/sync', () => ({
  sendUnlinkConfirmation: (...args: unknown[]) => mockSendUnlinkConfirmation(...args),
}))

const mockDeleteInstallation = vi.fn()
vi.mock('../../../services/installation/installationApi', () => ({
  deleteInstallation: (...args: unknown[]) => mockDeleteInstallation(...args),
}))

const mockReload = vi.fn()
Object.defineProperty(window, 'location', {
  configurable: true,
  value: { reload: mockReload },
})

import { useSelfUnlinkHandler } from '../../../hooks/useSelfUnlinkHandler'

const OWN_ID = 'own-device-id'
const OWN_JWT = 'own-jwt-token'
const INITIATOR_ID = 'initiator-device-id'
const INITIATOR_PUB_KEY = 'initiator-public-key'

function pendingSelfUnlink(keepData = true) {
  return JSON.stringify({ initiator_id: INITIATOR_ID, keep_data: keepData, initiator_pub_key: INITIATOR_PUB_KEY })
}

function mockInstallationSettings(keepData = true) {
  mockSettingsGet.mockImplementation((key: string) => {
    if (key === 'pending_self_unlink') return Promise.resolve(pendingSelfUnlink(keepData))
    if (key === 'installation_id') return Promise.resolve(JSON.stringify({ id: OWN_ID, jwt: OWN_JWT }))
    return Promise.resolve(null)
  })
}

describe('useSelfUnlinkHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    onDbWriteCallback = null
    mockSettingsGet.mockResolvedValue(null)
    mockSettingsSet.mockResolvedValue(undefined)
    mockSettingsDelete.mockResolvedValue(undefined)
    mockWipeDatabase.mockResolvedValue(undefined)
    mockSendUnlinkConfirmation.mockResolvedValue(undefined)
    mockDeleteInstallation.mockResolvedValue(undefined)
    mockReload.mockReset()
  })

  it('registers an onDbWrite listener on mount', () => {
    renderHook(() => useSelfUnlinkHandler())
    expect(mockOnDbWrite).toHaveBeenCalledTimes(1)
  })

  it('does nothing when pending_self_unlink is not set', async () => {
    mockSettingsGet.mockResolvedValue(null)
    renderHook(() => useSelfUnlinkHandler())

    await act(async () => { onDbWriteCallback?.() })

    expect(mockSettingsSet).not.toHaveBeenCalled()
    expect(mockReload).not.toHaveBeenCalled()
  })

  it('clears linked_installations and pending_self_unlink flag on unlink', async () => {
    mockInstallationSettings(true)
    renderHook(() => useSelfUnlinkHandler())

    await act(async () => { onDbWriteCallback?.() })

    expect(mockSettingsSet).toHaveBeenCalledWith('linked_installations', '{}')
    expect(mockSettingsDelete).toHaveBeenCalledWith('pending_self_unlink')
  })

  describe('keep_data = true (disconnect only)', () => {
    it('does NOT wipe database or revoke installation', async () => {
      mockInstallationSettings(true)
      renderHook(() => useSelfUnlinkHandler())

      await act(async () => { onDbWriteCallback?.() })

      expect(mockWipeDatabase).not.toHaveBeenCalled()
      expect(mockDeleteInstallation).not.toHaveBeenCalled()
    })

    it('sends confirmation to initiator', async () => {
      mockInstallationSettings(true)
      renderHook(() => useSelfUnlinkHandler())

      await act(async () => { onDbWriteCallback?.() })

      expect(mockSendUnlinkConfirmation).toHaveBeenCalledWith(OWN_ID, OWN_JWT, INITIATOR_ID, INITIATOR_PUB_KEY)
    })

    it('reloads the page', async () => {
      mockInstallationSettings(true)
      renderHook(() => useSelfUnlinkHandler())

      await act(async () => { onDbWriteCallback?.() })

      expect(mockReload).toHaveBeenCalledTimes(1)
    })
  })

  describe('keep_data = false (wipe DB)', () => {
    it('wipes database then sends confirmation then revokes JWT', async () => {
      const callOrder: string[] = []
      mockWipeDatabase.mockImplementation(async () => { callOrder.push('wipe') })
      mockSendUnlinkConfirmation.mockImplementation(async () => { callOrder.push('confirm') })
      mockDeleteInstallation.mockImplementation(async () => { callOrder.push('revoke') })

      mockInstallationSettings(false)
      renderHook(() => useSelfUnlinkHandler())

      await act(async () => { onDbWriteCallback?.() })

      expect(callOrder).toEqual(['wipe', 'confirm', 'revoke'])
    })

    it('still sends confirmation and revokes JWT if wipeDatabase resolves', async () => {
      mockInstallationSettings(false)
      renderHook(() => useSelfUnlinkHandler())

      await act(async () => { onDbWriteCallback?.() })

      expect(mockSendUnlinkConfirmation).toHaveBeenCalledWith(OWN_ID, OWN_JWT, INITIATOR_ID, INITIATOR_PUB_KEY)
      expect(mockDeleteInstallation).toHaveBeenCalledWith(OWN_JWT)
      expect(mockReload).toHaveBeenCalledTimes(1)
    })

    it('still revokes JWT if sendUnlinkConfirmation fails', async () => {
      mockSendUnlinkConfirmation.mockRejectedValueOnce(new Error('network error'))
      mockInstallationSettings(false)
      renderHook(() => useSelfUnlinkHandler())

      await act(async () => { onDbWriteCallback?.() })

      expect(mockDeleteInstallation).toHaveBeenCalledWith(OWN_JWT)
      expect(mockReload).toHaveBeenCalledTimes(1)
    })

    it('still reloads if deleteInstallation fails', async () => {
      mockDeleteInstallation.mockRejectedValueOnce(new Error('network error'))
      mockInstallationSettings(false)
      renderHook(() => useSelfUnlinkHandler())

      await act(async () => { onDbWriteCallback?.() })

      expect(mockWipeDatabase).toHaveBeenCalledTimes(1)
      expect(mockReload).toHaveBeenCalledTimes(1)
    })

    it('still reloads if sendUnlinkConfirmation fails', async () => {
      mockSendUnlinkConfirmation.mockRejectedValueOnce(new Error('network error'))
      mockInstallationSettings(false)
      renderHook(() => useSelfUnlinkHandler())

      await act(async () => { onDbWriteCallback?.() })

      expect(mockReload).toHaveBeenCalledTimes(1)
    })
  })

  it('handles corrupt pending_self_unlink data gracefully', async () => {
    mockSettingsGet.mockImplementation((key: string) => {
      if (key === 'pending_self_unlink') return Promise.resolve('not-valid-json')
      return Promise.resolve(null)
    })
    renderHook(() => useSelfUnlinkHandler())

    await act(async () => { onDbWriteCallback?.() })

    expect(mockSettingsDelete).toHaveBeenCalledWith('pending_self_unlink')
    expect(mockReload).not.toHaveBeenCalled()
  })

  it('handles missing own installation data gracefully', async () => {
    mockSettingsGet.mockImplementation((key: string) => {
      if (key === 'pending_self_unlink') return Promise.resolve(pendingSelfUnlink(true))
      if (key === 'installation_id') return Promise.resolve(null)
      return Promise.resolve(null)
    })
    renderHook(() => useSelfUnlinkHandler())

    await act(async () => { onDbWriteCallback?.() })

    // Still reloads even without credentials
    expect(mockReload).toHaveBeenCalledTimes(1)
  })

  it('does not re-enter while already processing', async () => {
    // First trigger sets processingRef = true and holds async work
    let resolveFirst!: () => void
    const firstCallPromise = new Promise<void>(res => { resolveFirst = res })
    mockSettingsGet.mockImplementationOnce(() => firstCallPromise)

    renderHook(() => useSelfUnlinkHandler())

    // Start first trigger (doesn't complete yet)
    const firstTrigger = act(async () => { onDbWriteCallback?.() })

    // Trigger second call while first is pending
    act(() => { onDbWriteCallback?.() })

    // Only one settingsGet call (first trigger; second was skipped)
    expect(mockSettingsGet).toHaveBeenCalledTimes(1)

    resolveFirst()
    await firstTrigger
  })
})
