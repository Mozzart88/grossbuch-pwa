import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need real Web Crypto for AES/RSA tests - use the Node.js built-in
// Mock only the imports from auth/crypto that wrap Web Crypto

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

const { encryptSyncPackage, decryptSyncPackage } = await import(
  '../../../../services/sync/syncCrypto'
)

import type { SyncPackage } from '../../../../services/sync/syncTypes'

// Mock crypto.subtle
const mockGenerateKey = vi.fn()
const mockEncrypt = vi.fn()
const mockDecrypt = vi.fn()
const mockExportKey = vi.fn()
const mockImportKey = vi.fn()

vi.stubGlobal('crypto', {
  getRandomValues: vi.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) array[i] = i + 1
    return array
  }),
  subtle: {
    generateKey: mockGenerateKey,
    encrypt: mockEncrypt,
    decrypt: mockDecrypt,
    exportKey: mockExportKey,
    importKey: mockImportKey,
  },
})

describe('syncCrypto', () => {
  const samplePackage: SyncPackage = {
    version: 1,
    sender_id: 'sender-1',
    created_at: 1000,
    since: 0,
    icons: [],
    tags: [],
    wallets: [],
    accounts: [],
    counterparties: [],
    currencies: [],
    transactions: [],
    budgets: [],
    deletions: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()

    const mockKey = { type: 'secret', algorithm: { name: 'AES-GCM' } }
    mockGenerateKey.mockResolvedValue(mockKey)
    mockExportKey.mockResolvedValue(new ArrayBuffer(32))
    mockEncrypt.mockResolvedValue(new ArrayBuffer(64))
    mockDecrypt.mockImplementation(() => {
      return Promise.resolve(new TextEncoder().encode(JSON.stringify(samplePackage)).buffer)
    })
    mockImportKey.mockResolvedValue(mockKey)

    mockRsaEncrypt.mockResolvedValue(new ArrayBuffer(256))
    mockRsaDecrypt.mockResolvedValue(new ArrayBuffer(32))
    mockArrayBufferToBase64Url.mockImplementation((buf: ArrayBuffer) => {
      return Buffer.from(new Uint8Array(buf)).toString('base64url')
    })
    mockBase64UrlToArrayBuffer.mockImplementation((str: string) => {
      return Buffer.from(str, 'base64url').buffer
    })
  })

  describe('encryptSyncPackage', () => {
    it('generates AES key and encrypts payload', async () => {
      const recipients = [{ installation_id: 'r1', public_key: 'pk1' }]

      const result = await encryptSyncPackage(samplePackage, recipients)

      expect(mockGenerateKey).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'AES-GCM', length: 256 }),
        true,
        ['encrypt', 'decrypt']
      )
      expect(mockEncrypt).toHaveBeenCalled()
      expect(result.sender_id).toBe('sender-1')
      expect(result.iv).toBeDefined()
      expect(result.ciphertext).toBeDefined()
    })

    it('encrypts AES key for each recipient via RSA', async () => {
      const recipients = [
        { installation_id: 'r1', public_key: 'pk1' },
        { installation_id: 'r2', public_key: 'pk2' },
      ]

      const result = await encryptSyncPackage(samplePackage, recipients)

      expect(mockRsaEncrypt).toHaveBeenCalledTimes(2)
      expect(mockRsaEncrypt).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'pk1')
      expect(mockRsaEncrypt).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'pk2')
      expect(result.recipient_keys).toHaveLength(2)
      expect(result.recipient_keys[0].installation_id).toBe('r1')
      expect(result.recipient_keys[1].installation_id).toBe('r2')
    })

    it('exports raw AES key for RSA wrapping', async () => {
      await encryptSyncPackage(samplePackage, [{ installation_id: 'r1', public_key: 'pk1' }])

      expect(mockExportKey).toHaveBeenCalledWith('raw', expect.anything())
    })

    it('serializes BigInt values in payload to strings', async () => {
      const recipients = [{ installation_id: 'r1', public_key: 'pk1' }]
      const pkgWithBigInt = { ...samplePackage, customField: BigInt(42) } as unknown as SyncPackage
      await encryptSyncPackage(pkgWithBigInt, recipients)
      expect(mockEncrypt).toHaveBeenCalled()
    })
  })

  describe('decryptSyncPackage', () => {
    it('finds recipient key and decrypts', async () => {
      const encrypted = {
        sender_id: 'sender-1',
        iv: mockArrayBufferToBase64Url(new ArrayBuffer(12)),
        ciphertext: mockArrayBufferToBase64Url(new ArrayBuffer(64)),
        recipient_keys: [
          { installation_id: 'my-id', encrypted_key: mockArrayBufferToBase64Url(new ArrayBuffer(256)) },
        ],
      }

      const result = await decryptSyncPackage(encrypted, 'my-id', 'my-private-key')

      expect(mockRsaDecrypt).toHaveBeenCalled()
      expect(mockImportKey).toHaveBeenCalledWith(
        'raw',
        expect.any(ArrayBuffer),
        expect.objectContaining({ name: 'AES-GCM' }),
        false,
        ['decrypt']
      )
      expect(mockDecrypt).toHaveBeenCalled()
      expect(result.version).toBe(1)
      expect(result.sender_id).toBe('sender-1')
    })

    it('throws when no recipient key matches installation', async () => {
      const encrypted = {
        sender_id: 'sender-1',
        iv: 'iv',
        ciphertext: 'ct',
        recipient_keys: [
          { installation_id: 'other-id', encrypted_key: 'ek' },
        ],
      }

      await expect(
        decryptSyncPackage(encrypted, 'my-id', 'pk')
      ).rejects.toThrow('No encrypted key found for this installation')
    })
  })
})
