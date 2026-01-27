import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateRandomBytes,
  bytesToHex,
  hexToBytes,
  deriveEncryptionKey,
  hashPin,
  generateJwtSalt,
  createHmacSignature,
  verifyHmacSignature,
} from '../../../../services/auth/crypto'

// Mock crypto.subtle for tests
const mockDeriveBits = vi.fn()
const mockImportKey = vi.fn()
const mockSign = vi.fn()
const mockVerify = vi.fn()

vi.stubGlobal('crypto', {
  getRandomValues: vi.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
    return array
  }),
  subtle: {
    importKey: mockImportKey,
    deriveBits: mockDeriveBits,
    sign: mockSign,
    verify: mockVerify,
  },
})

describe('crypto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockImportKey.mockResolvedValue({ type: 'secret' })
    mockDeriveBits.mockResolvedValue(new ArrayBuffer(32))
    mockSign.mockResolvedValue(new ArrayBuffer(32))
    mockVerify.mockResolvedValue(true)
  })

  describe('generateRandomBytes', () => {
    it('returns Uint8Array of specified length', () => {
      const bytes = generateRandomBytes(16)
      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes.length).toBe(16)
    })

    it('returns different values on each call', () => {
      const bytes1 = generateRandomBytes(16)
      const bytes2 = generateRandomBytes(16)
      expect(bytes1).not.toEqual(bytes2)
    })
  })

  describe('bytesToHex', () => {
    it('converts bytes to hex string', () => {
      const bytes = new Uint8Array([0, 1, 15, 16, 255])
      const hex = bytesToHex(bytes)
      expect(hex).toBe('00010f10ff')
    })

    it('handles empty array', () => {
      const bytes = new Uint8Array([])
      const hex = bytesToHex(bytes)
      expect(hex).toBe('')
    })
  })

  describe('hexToBytes', () => {
    it('converts hex string to bytes', () => {
      const hex = '00010f10ff'
      const bytes = hexToBytes(hex)
      expect(bytes).toEqual(new Uint8Array([0, 1, 15, 16, 255]))
    })

    it('handles empty string', () => {
      const hex = ''
      const bytes = hexToBytes(hex)
      expect(bytes).toEqual(new Uint8Array([]))
    })

    it('roundtrips with bytesToHex', () => {
      const original = new Uint8Array([0, 127, 255, 42, 100])
      const hex = bytesToHex(original)
      const converted = hexToBytes(hex)
      expect(converted).toEqual(original)
    })
  })

  describe('deriveEncryptionKey', () => {
    it('derives key from PIN with new salt', async () => {
      const result = await deriveEncryptionKey('mypin123')

      expect(result.key).toBeDefined()
      expect(result.salt).toBeDefined()
      expect(result.key.length).toBeGreaterThan(0)
      expect(result.salt.length).toBeGreaterThan(0)
    })

    it('uses provided salt when given', async () => {
      const existingSalt = '0123456789abcdef0123456789abcdef'
      const result = await deriveEncryptionKey('mypin123', existingSalt)

      expect(result.salt).toBe(existingSalt)
    })

    it('calls crypto.subtle.importKey', async () => {
      await deriveEncryptionKey('mypin123')

      expect(mockImportKey).toHaveBeenCalled()
    })

    it('calls crypto.subtle.deriveBits with PBKDF2 params', async () => {
      await deriveEncryptionKey('mypin123')

      expect(mockDeriveBits).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'PBKDF2',
          iterations: 100000,
          hash: 'SHA-256',
        }),
        expect.anything(),
        256
      )
    })
  })

  describe('hashPin', () => {
    it('hashes PIN with new salt', async () => {
      const result = await hashPin('mypin123')

      expect(result.key).toBeDefined()
      expect(result.salt).toBeDefined()
    })

    it('uses provided salt when given', async () => {
      const existingSalt = '0123456789abcdef0123456789abcdef'
      const result = await hashPin('mypin123', existingSalt)

      expect(result.salt).toBe(existingSalt)
    })

    it('uses different iteration count than deriveEncryptionKey', async () => {
      await hashPin('mypin123')

      // hashPin uses PBKDF2_ITERATIONS + 1 (100001)
      expect(mockDeriveBits).toHaveBeenCalledWith(
        expect.objectContaining({
          iterations: 100001,
        }),
        expect.anything(),
        256
      )
    })
  })

  describe('generateJwtSalt', () => {
    it('returns hex string', () => {
      const salt = generateJwtSalt()
      expect(typeof salt).toBe('string')
      expect(salt.length).toBe(64) // 32 bytes = 64 hex chars
    })

    it('returns different values on each call', () => {
      const salt1 = generateJwtSalt()
      const salt2 = generateJwtSalt()
      expect(salt1).not.toBe(salt2)
    })
  })

  describe('createHmacSignature', () => {
    it('creates HMAC signature', async () => {
      const data = 'test data'
      const secret = '0123456789abcdef0123456789abcdef'

      const signature = await createHmacSignature(data, secret)

      expect(signature).toBeDefined()
      expect(typeof signature).toBe('string')
    })

    it('calls crypto.subtle.importKey', async () => {
      await createHmacSignature('data', '0123456789abcdef0123456789abcdef')

      expect(mockImportKey).toHaveBeenCalled()
    })

    it('calls crypto.subtle.sign', async () => {
      await createHmacSignature('data', '0123456789abcdef0123456789abcdef')

      expect(mockSign).toHaveBeenCalled()
    })
  })

  describe('verifyHmacSignature', () => {
    it('returns true for valid signature', async () => {
      mockVerify.mockResolvedValue(true)

      const result = await verifyHmacSignature(
        'data',
        '0123456789abcdef',
        '0123456789abcdef0123456789abcdef'
      )

      expect(result).toBe(true)
    })

    it('returns false for invalid signature', async () => {
      mockVerify.mockResolvedValue(false)

      const result = await verifyHmacSignature(
        'data',
        'invalidsignature',
        '0123456789abcdef0123456789abcdef'
      )

      expect(result).toBe(false)
    })

    it('calls crypto.subtle.importKey', async () => {
      await verifyHmacSignature('data', '0123456789abcdef', '0123456789abcdef0123456789abcdef')

      expect(mockImportKey).toHaveBeenCalled()
    })

    it('calls crypto.subtle.verify', async () => {
      await verifyHmacSignature('data', '0123456789abcdef', '0123456789abcdef0123456789abcdef')

      expect(mockVerify).toHaveBeenCalled()
    })
  })
})
