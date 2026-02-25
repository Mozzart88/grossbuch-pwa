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
  arrayBufferToBase64Url,
  base64UrlToArrayBuffer,
  generateRSAKeyPair,
  rsaEncrypt,
  rsaDecrypt,
} from '../../../../services/auth/crypto'

// Mock crypto.subtle for tests
const mockDeriveBits = vi.fn()
const mockImportKey = vi.fn()
const mockSign = vi.fn()
const mockVerify = vi.fn()
const mockGenerateKey = vi.fn()
const mockExportKey = vi.fn()
const mockEncrypt = vi.fn()
const mockDecrypt = vi.fn()

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
    generateKey: mockGenerateKey,
    exportKey: mockExportKey,
    encrypt: mockEncrypt,
    decrypt: mockDecrypt,
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

  describe('arrayBufferToBase64Url', () => {
    it('converts ArrayBuffer to base64url string', () => {
      const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer // "Hello"
      const result = arrayBufferToBase64Url(buffer)
      expect(result).toBe('SGVsbG8')
    })

    it('handles empty buffer', () => {
      const buffer = new ArrayBuffer(0)
      const result = arrayBufferToBase64Url(buffer)
      expect(result).toBe('')
    })

    it('replaces + with - and / with _', () => {
      // Bytes that produce + and / in standard base64
      const buffer = new Uint8Array([251, 239, 190]).buffer // produces ++++ in base64
      const result = arrayBufferToBase64Url(buffer)
      expect(result).not.toContain('+')
      expect(result).not.toContain('/')
      expect(result).not.toContain('=')
    })
  })

  describe('base64UrlToArrayBuffer', () => {
    it('converts base64url string to ArrayBuffer', () => {
      const result = base64UrlToArrayBuffer('SGVsbG8') // "Hello"
      const bytes = new Uint8Array(result)
      expect(bytes).toEqual(new Uint8Array([72, 101, 108, 108, 111]))
    })

    it('handles empty string', () => {
      const result = base64UrlToArrayBuffer('')
      expect(new Uint8Array(result).length).toBe(0)
    })

    it('handles base64url with - and _ characters', () => {
      // First encode, then decode and verify roundtrip
      const original = new Uint8Array([251, 239, 190]).buffer
      const encoded = arrayBufferToBase64Url(original)
      const decoded = base64UrlToArrayBuffer(encoded)
      expect(new Uint8Array(decoded)).toEqual(new Uint8Array(original))
    })

    it('roundtrips with arrayBufferToBase64Url', () => {
      const original = new Uint8Array([0, 127, 255, 42, 100, 200]).buffer
      const encoded = arrayBufferToBase64Url(original)
      const decoded = base64UrlToArrayBuffer(encoded)
      expect(new Uint8Array(decoded)).toEqual(new Uint8Array(original))
    })
  })

  describe('generateRSAKeyPair', () => {
    beforeEach(() => {
      const mockKeyPair = {
        publicKey: { type: 'public' },
        privateKey: { type: 'private' },
      }
      mockGenerateKey.mockResolvedValue(mockKeyPair)
      mockExportKey.mockImplementation((format: string) => {
        if (format === 'spki') return Promise.resolve(new Uint8Array([1, 2, 3]).buffer)
        if (format === 'pkcs8') return Promise.resolve(new Uint8Array([4, 5, 6]).buffer)
        return Promise.reject(new Error('Unknown format'))
      })
    })

    it('returns public and private keys as base64url strings', async () => {
      const result = await generateRSAKeyPair()

      expect(result.publicKey).toBeDefined()
      expect(typeof result.publicKey).toBe('string')
      expect(result.privateKey).toBeDefined()
      expect(typeof result.privateKey).toBe('string')
    })

    it('calls crypto.subtle.generateKey with RSA-OAEP params', async () => {
      await generateRSAKeyPair()

      expect(mockGenerateKey).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'RSA-OAEP',
          modulusLength: 2048,
          hash: 'SHA-256',
        }),
        true,
        ['encrypt', 'decrypt']
      )
    })

    it('exports keys in SPKI and PKCS8 formats', async () => {
      await generateRSAKeyPair()

      expect(mockExportKey).toHaveBeenCalledWith('spki', expect.anything())
      expect(mockExportKey).toHaveBeenCalledWith('pkcs8', expect.anything())
    })
  })

  describe('rsaEncrypt', () => {
    beforeEach(() => {
      mockImportKey.mockResolvedValue({ type: 'public' })
      mockEncrypt.mockResolvedValue(new ArrayBuffer(256))
    })

    it('imports SPKI public key and encrypts data', async () => {
      const data = new ArrayBuffer(32)
      const publicKeyB64 = arrayBufferToBase64Url(new Uint8Array([1, 2, 3]).buffer)

      const result = await rsaEncrypt(data, publicKeyB64)

      expect(mockImportKey).toHaveBeenCalledWith(
        'spki',
        expect.any(ArrayBuffer),
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
      )
      expect(mockEncrypt).toHaveBeenCalledWith(
        { name: 'RSA-OAEP' },
        expect.anything(),
        data
      )
      expect(result).toBeInstanceOf(ArrayBuffer)
    })
  })

  describe('rsaEncrypt — validation', () => {
    it('throws when data exceeds 190 bytes', async () => {
      const largeData = new ArrayBuffer(191)
      const publicKeyB64 = arrayBufferToBase64Url(new Uint8Array([1, 2, 3]).buffer)

      await expect(rsaEncrypt(largeData, publicKeyB64)).rejects.toThrow(
        'data length should not excide 190 bytes'
      )
    })
  })

  describe('rsaDecrypt', () => {
    beforeEach(() => {
      mockImportKey.mockResolvedValue({ type: 'private' })
      mockDecrypt.mockResolvedValue(new ArrayBuffer(32))
    })

    it('imports PKCS8 private key and decrypts data', async () => {
      const data = new ArrayBuffer(256)
      const privateKeyB64 = arrayBufferToBase64Url(new Uint8Array([4, 5, 6]).buffer)

      const result = await rsaDecrypt(data, privateKeyB64)

      expect(mockImportKey).toHaveBeenCalledWith(
        'pkcs8',
        expect.any(ArrayBuffer),
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['decrypt']
      )
      expect(mockDecrypt).toHaveBeenCalledWith(
        { name: 'RSA-OAEP' },
        expect.anything(),
        data
      )
      expect(result).toBeInstanceOf(ArrayBuffer)
    })
  })
})
