import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies
const mockPostInit = vi.fn()
const mockGetInit = vi.fn()
const mockDeleteInit = vi.fn()
vi.mock('../../../../services/sync/syncApi', () => ({
  postInit: (...args: unknown[]) => mockPostInit(...args),
  getInit: (...args: unknown[]) => mockGetInit(...args),
  deleteInit: (...args: unknown[]) => mockDeleteInit(...args),
}))

const mockGetInstallationData = vi.fn()
const mockGetPrivateKey = vi.fn()
const mockGetLinkedInstallations = vi.fn()
const mockPushSync = vi.fn()
vi.mock('../../../../services/sync/index', () => ({
  getInstallationData: () => mockGetInstallationData(),
  getPrivateKey: () => mockGetPrivateKey(),
  getLinkedInstallations: () => mockGetLinkedInstallations(),
  pushSync: (...args: unknown[]) => mockPushSync(...args),
}))

const mockGetPublicKey = vi.fn()
vi.mock('../../../../services/auth/authService', () => ({
  getPublicKey: () => mockGetPublicKey(),
}))

const mockSaveLinkedInstallation = vi.fn()
vi.mock('../../../../services/installation/installationStore', () => ({
  saveLinkedInstallation: (...args: unknown[]) => mockSaveLinkedInstallation(...args),
}))

const mockRsaEncrypt = vi.fn()
const mockRsaDecrypt = vi.fn()
const mockArrayBufferToBase64Url = vi.fn()
const mockBase64UrlToArrayBuffer = vi.fn()
vi.mock('../../../../services/auth/crypto', () => ({
  rsaEncrypt: (...args: unknown[]) => mockRsaEncrypt(...args),
  rsaDecrypt: (...args: unknown[]) => mockRsaDecrypt(...args),
  arrayBufferToBase64Url: (...args: unknown[]) => mockArrayBufferToBase64Url(...args),
  base64UrlToArrayBuffer: (...args: unknown[]) => mockBase64UrlToArrayBuffer(...args),
}))

const { sendInit, pollAndProcessInit } = await import('../../../../services/sync/syncInit')

describe('syncInit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sendInit', () => {
    it('encrypts own uuid+publicKey and posts to target', async () => {
      mockGetInstallationData.mockResolvedValue({ id: 'my-uuid', jwt: 'my-jwt' })
      mockGetPublicKey.mockResolvedValue('my-public-key')
      mockRsaEncrypt.mockResolvedValue(new ArrayBuffer(32))
      mockArrayBufferToBase64Url.mockReturnValue('encrypted-base64')

      await sendInit('target-uuid', 'target-public-key')

      // Verify encryption was called with target's public key
      expect(mockRsaEncrypt).toHaveBeenCalledTimes(1)
      const [encryptedData, pubKey] = mockRsaEncrypt.mock.calls[0]
      expect(pubKey).toBe('target-public-key')
      // Verify the payload contains our uuid and publicKey
      const payloadStr = new TextDecoder().decode(new Uint8Array(encryptedData))
      expect(JSON.parse(payloadStr)).toEqual({ uuid: 'my-uuid', publicKey: 'my-public-key' })

      // Verify the encrypted result was base64url encoded
      expect(mockArrayBufferToBase64Url).toHaveBeenCalledWith(new ArrayBuffer(32))

      // Verify API call
      expect(mockPostInit).toHaveBeenCalledWith(
        { target_uuid: 'target-uuid', encrypted_payload: 'encrypted-base64' },
        'my-jwt'
      )
    })

    it('throws if installation not registered', async () => {
      mockGetInstallationData.mockResolvedValue(null)

      await expect(sendInit('target', 'key')).rejects.toThrow('Installation not registered')
    })

    it('throws if no public key available', async () => {
      mockGetInstallationData.mockResolvedValue({ id: 'my-uuid', jwt: 'my-jwt' })
      mockGetPublicKey.mockResolvedValue(null)

      await expect(sendInit('target', 'key')).rejects.toThrow('No public key available')
    })
  })

  describe('pollAndProcessInit', () => {
    it('returns empty when no installation data', async () => {
      mockGetInstallationData.mockResolvedValue(null)

      const result = await pollAndProcessInit()
      expect(result).toEqual({ newDevices: [] })
      expect(mockGetInit).not.toHaveBeenCalled()
    })

    it('returns empty when no private key', async () => {
      mockGetInstallationData.mockResolvedValue({ id: 'my-uuid', jwt: 'my-jwt' })
      mockGetPrivateKey.mockResolvedValue(null)

      const result = await pollAndProcessInit()
      expect(result).toEqual({ newDevices: [] })
      expect(mockGetInit).not.toHaveBeenCalled()
    })

    it('returns empty when no init packages', async () => {
      mockGetInstallationData.mockResolvedValue({ id: 'my-uuid', jwt: 'my-jwt' })
      mockGetPrivateKey.mockResolvedValue('my-private-key')
      mockGetInit.mockResolvedValue([])

      const result = await pollAndProcessInit()
      expect(result).toEqual({ newDevices: [] })
      expect(mockDeleteInit).not.toHaveBeenCalled()
    })

    it('processes init packages: decrypt, save, push, introduce, delete', async () => {
      mockGetInstallationData.mockResolvedValue({ id: 'my-uuid', jwt: 'my-jwt' })
      mockGetPrivateKey.mockResolvedValue('my-private-key')

      const payloadJson = JSON.stringify({ uuid: 'new-device', publicKey: 'new-pub-key' })
      const decryptedBuffer = new TextEncoder().encode(payloadJson).buffer

      mockGetInit.mockResolvedValue([
        { id: 1, sender_uuid: 'new-device', encrypted_payload: 'enc-payload', created_at: '2026-01-01' },
      ])
      mockBase64UrlToArrayBuffer.mockReturnValue(new ArrayBuffer(32))
      mockRsaDecrypt.mockResolvedValue(decryptedBuffer)
      mockPushSync.mockResolvedValue(true)
      mockGetLinkedInstallations.mockResolvedValue([]) // No existing devices
      mockGetPublicKey.mockResolvedValue('my-public-key')

      const result = await pollAndProcessInit()

      expect(result).toEqual({ newDevices: ['new-device'] })

      // Verify decryption
      expect(mockRsaDecrypt).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        'my-private-key'
      )

      // Verify linked installation was saved
      expect(mockSaveLinkedInstallation).toHaveBeenCalledWith('new-device', 'new-pub-key')

      // Verify full push to new device
      expect(mockPushSync).toHaveBeenCalledWith({ targetUuid: 'new-device' })

      // Verify acknowledgment
      expect(mockDeleteInit).toHaveBeenCalledWith({ ids: [1] }, 'my-jwt')
    })

    it('continues when pushSync fails for new device', async () => {
      mockGetInstallationData.mockResolvedValue({ id: 'my-uuid', jwt: 'my-jwt' })
      mockGetPrivateKey.mockResolvedValue('my-private-key')

      const payloadJson = JSON.stringify({ uuid: 'new-device', publicKey: 'new-pub-key' })
      const decryptedBuffer = new TextEncoder().encode(payloadJson).buffer

      mockGetInit.mockResolvedValue([
        { id: 1, sender_uuid: 'new-device', encrypted_payload: 'enc-payload', created_at: '2026-01-01' },
      ])
      mockBase64UrlToArrayBuffer.mockReturnValue(new ArrayBuffer(32))
      mockRsaDecrypt.mockResolvedValue(decryptedBuffer)
      mockPushSync.mockRejectedValue(new Error('push failed'))
      mockGetLinkedInstallations.mockResolvedValue([])
      mockGetPublicKey.mockResolvedValue('my-public-key')

      const result = await pollAndProcessInit()

      // Should still succeed and report the new device
      expect(result).toEqual({ newDevices: ['new-device'] })
      expect(mockDeleteInit).toHaveBeenCalledWith({ ids: [1] }, 'my-jwt')
    })

    it('skips devices with no public key during introduction', async () => {
      mockGetInstallationData.mockResolvedValue({ id: 'my-uuid', jwt: 'my-jwt' })
      mockGetPrivateKey.mockResolvedValue('my-private-key')

      const payloadJson = JSON.stringify({ uuid: 'new-device', publicKey: 'new-pub-key' })
      const decryptedBuffer = new TextEncoder().encode(payloadJson).buffer

      mockGetInit.mockResolvedValue([
        { id: 1, sender_uuid: 'new-device', encrypted_payload: 'enc-payload', created_at: '2026-01-01' },
      ])
      mockBase64UrlToArrayBuffer.mockReturnValue(new ArrayBuffer(32))
      mockRsaDecrypt.mockResolvedValue(decryptedBuffer)
      mockPushSync.mockResolvedValue(true)
      mockGetLinkedInstallations.mockResolvedValue([
        { installation_id: 'no-key-device', public_key: '' },
      ])
      mockGetPublicKey.mockResolvedValue('my-public-key')

      await pollAndProcessInit()

      // Should not attempt introductions for devices without public keys
      expect(mockPostInit).not.toHaveBeenCalled()
    })

    it('continues when introduction fails', async () => {
      mockGetInstallationData.mockResolvedValue({ id: 'my-uuid', jwt: 'my-jwt' })
      mockGetPrivateKey.mockResolvedValue('my-private-key')

      const payloadJson = JSON.stringify({ uuid: 'new-device', publicKey: 'new-pub-key' })
      const decryptedBuffer = new TextEncoder().encode(payloadJson).buffer

      mockGetInit.mockResolvedValue([
        { id: 1, sender_uuid: 'new-device', encrypted_payload: 'enc-payload', created_at: '2026-01-01' },
      ])
      mockBase64UrlToArrayBuffer.mockReturnValue(new ArrayBuffer(32))
      mockRsaDecrypt.mockResolvedValue(decryptedBuffer)
      mockPushSync.mockResolvedValue(true)
      mockGetLinkedInstallations.mockResolvedValue([
        { installation_id: 'existing-device', public_key: 'existing-pub-key' },
      ])
      mockGetPublicKey.mockResolvedValue('my-public-key')
      mockRsaEncrypt.mockRejectedValue(new Error('encrypt failed'))

      const result = await pollAndProcessInit()

      // Should still succeed despite introduction failure
      expect(result).toEqual({ newDevices: ['new-device'] })
      expect(mockDeleteInit).toHaveBeenCalledWith({ ids: [1] }, 'my-jwt')
    })

    it('handles decryption failure for a package gracefully', async () => {
      mockGetInstallationData.mockResolvedValue({ id: 'my-uuid', jwt: 'my-jwt' })
      mockGetPrivateKey.mockResolvedValue('my-private-key')

      mockGetInit.mockResolvedValue([
        { id: 1, sender_uuid: 'bad-device', encrypted_payload: 'bad-payload', created_at: '2026-01-01' },
      ])
      mockBase64UrlToArrayBuffer.mockReturnValue(new ArrayBuffer(32))
      mockRsaDecrypt.mockRejectedValue(new Error('decryption failed'))

      const result = await pollAndProcessInit()

      // Should return empty, package not processed
      expect(result).toEqual({ newDevices: [] })
      // Should not attempt to delete since processing failed
      expect(mockDeleteInit).not.toHaveBeenCalled()
    })

    it('introduces new device to existing linked devices', async () => {
      mockGetInstallationData.mockResolvedValue({ id: 'my-uuid', jwt: 'my-jwt' })
      mockGetPrivateKey.mockResolvedValue('my-private-key')

      const payloadJson = JSON.stringify({ uuid: 'new-device', publicKey: 'new-pub-key' })
      const decryptedBuffer = new TextEncoder().encode(payloadJson).buffer

      mockGetInit.mockResolvedValue([
        { id: 1, sender_uuid: 'new-device', encrypted_payload: 'enc-payload', created_at: '2026-01-01' },
      ])
      mockBase64UrlToArrayBuffer.mockReturnValue(new ArrayBuffer(32))
      mockRsaDecrypt.mockResolvedValue(decryptedBuffer)
      mockPushSync.mockResolvedValue(true)
      mockGetLinkedInstallations.mockResolvedValue([
        { installation_id: 'new-device', public_key: 'new-pub-key' },
        { installation_id: 'existing-device', public_key: 'existing-pub-key' },
      ])
      mockGetPublicKey.mockResolvedValue('my-public-key')
      mockRsaEncrypt.mockResolvedValue(new ArrayBuffer(32))
      mockArrayBufferToBase64Url.mockReturnValue('intro-encrypted')

      await pollAndProcessInit()

      // Should have sent 2 introductions:
      // 1. Tell existing-device about new-device
      // 2. Tell new-device about existing-device
      expect(mockPostInit).toHaveBeenCalledTimes(2)
      expect(mockPostInit).toHaveBeenCalledWith(
        { target_uuid: 'existing-device', encrypted_payload: 'intro-encrypted' },
        'my-jwt'
      )
      expect(mockPostInit).toHaveBeenCalledWith(
        { target_uuid: 'new-device', encrypted_payload: 'intro-encrypted' },
        'my-jwt'
      )
    })
  })
})
