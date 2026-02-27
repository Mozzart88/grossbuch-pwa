import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AUTH_STORAGE_KEYS } from '../../../../types/auth'

// Mock crypto module used by webauthn.ts
vi.mock('../../../../services/auth/crypto', () => ({
  hexToBytes: vi.fn((hex: string) => new Uint8Array(hex.length / 2)),
  bytesToHex: vi.fn((bytes: Uint8Array) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')),
  arrayBufferToBase64Url: vi.fn((buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))),
  base64UrlToArrayBuffer: vi.fn((s: string) => {
    const binary = atob(s)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
  }),
}))

// Set up crypto mock before importing webauthn (which uses crypto.subtle)
const mockImportKey = vi.fn()
const mockDeriveKey = vi.fn()
const mockEncrypt = vi.fn()
const mockDecrypt = vi.fn()
const mockGetRandomValues = vi.fn((array: Uint8Array) => {
  for (let i = 0; i < array.length; i++) array[i] = i % 256
  return array
})

vi.stubGlobal('crypto', {
  getRandomValues: mockGetRandomValues,
  subtle: {
    importKey: mockImportKey,
    deriveKey: mockDeriveKey,
    encrypt: mockEncrypt,
    decrypt: mockDecrypt,
  },
})

// Mock navigator.credentials
const mockCreate = vi.fn()
const mockGet = vi.fn()

vi.stubGlobal('navigator', {
  credentials: {
    create: mockCreate,
    get: mockGet,
  },
})

// Mock PublicKeyCredential
const mockIsUVPAA = vi.fn()
vi.stubGlobal('PublicKeyCredential', {
  isUserVerifyingPlatformAuthenticatorAvailable: mockIsUVPAA,
})

// Import AFTER stubs are set up
import {
  isPlatformAuthenticatorAvailable,
  hasWebAuthnCredential,
  clearWebAuthnCredential,
  registerWebAuthn,
  authenticateWithWebAuthn,
  isPRFKnownUnsupported,
  clearPRFUnsupportedFlag,
} from '../../../../services/auth/webauthn'

const mockKEK = { type: 'secret', algorithm: { name: 'AES-GCM' } }

describe('webauthn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    // Default mock implementations
    mockIsUVPAA.mockResolvedValue(false)
    mockImportKey.mockResolvedValue(mockKEK)
    mockDeriveKey.mockResolvedValue(mockKEK)
    mockEncrypt.mockResolvedValue(new ArrayBuffer(32))
    mockDecrypt.mockResolvedValue(new ArrayBuffer(32))
    mockGetRandomValues.mockImplementation((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) array[i] = i % 256
      return array
    })
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('isPlatformAuthenticatorAvailable', () => {
    it('returns true when platform authenticator is available', async () => {
      mockIsUVPAA.mockResolvedValue(true)
      const result = await isPlatformAuthenticatorAvailable()
      expect(result).toBe(true)
    })

    it('returns false when platform authenticator is not available', async () => {
      mockIsUVPAA.mockResolvedValue(false)
      const result = await isPlatformAuthenticatorAvailable()
      expect(result).toBe(false)
    })

    it('returns false when PublicKeyCredential is not defined', async () => {
      vi.stubGlobal('PublicKeyCredential', undefined)
      const result = await isPlatformAuthenticatorAvailable()
      expect(result).toBe(false)
      vi.stubGlobal('PublicKeyCredential', { isUserVerifyingPlatformAuthenticatorAvailable: mockIsUVPAA })
    })

    it('returns false when isUserVerifyingPlatformAuthenticatorAvailable throws', async () => {
      mockIsUVPAA.mockRejectedValue(new Error('Not supported'))
      const result = await isPlatformAuthenticatorAvailable()
      expect(result).toBe(false)
    })
  })

  describe('hasWebAuthnCredential', () => {
    it('returns false when no credential stored', () => {
      expect(hasWebAuthnCredential()).toBe(false)
    })

    it('returns true when credential is stored', () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA, JSON.stringify({ credentialId: 'abc' }))
      expect(hasWebAuthnCredential()).toBe(true)
    })
  })

  describe('clearWebAuthnCredential', () => {
    it('removes credential from localStorage', () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA, JSON.stringify({ credentialId: 'abc' }))
      clearWebAuthnCredential()
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA)).toBeNull()
    })

    it('does not throw when no credential stored', () => {
      expect(() => clearWebAuthnCredential()).not.toThrow()
    })

    it('does not clear the PRF unsupported flag', () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED, '1')
      clearWebAuthnCredential()
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED)).toBe('1')
    })
  })

  describe('isPRFKnownUnsupported', () => {
    it('returns false when flag is not set', () => {
      expect(isPRFKnownUnsupported()).toBe(false)
    })

    it('returns true when flag is set', () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED, '1')
      expect(isPRFKnownUnsupported()).toBe(true)
    })

    it('returns false when flag is any other value', () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED, 'true')
      expect(isPRFKnownUnsupported()).toBe(false)
    })
  })

  describe('clearPRFUnsupportedFlag', () => {
    it('removes the PRF unsupported flag', () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED, '1')
      clearPRFUnsupportedFlag()
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED)).toBeNull()
    })

    it('does not throw when flag is not set', () => {
      expect(() => clearPRFUnsupportedFlag()).not.toThrow()
    })

    it('does not clear the WebAuthn credential', () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA, JSON.stringify({ credentialId: 'abc' }))
      localStorage.setItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED, '1')
      clearPRFUnsupportedFlag()
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA)).not.toBeNull()
    })
  })

  describe('registerWebAuthn', () => {
    const dekHex = 'aabbccddeeff00112233445566778899'

    function makeCredential(prfFirst?: ArrayBuffer) {
      return {
        rawId: new ArrayBuffer(32),
        getClientExtensionResults: vi.fn().mockReturnValue(
          prfFirst !== undefined
            ? { prf: { results: { first: prfFirst } } }
            : {}
        ),
      }
    }

    it('stores credential data in localStorage on success', async () => {
      const prfOutput = new ArrayBuffer(32)
      mockCreate.mockResolvedValue(makeCredential(prfOutput))

      const result = await registerWebAuthn(dekHex)

      expect(result).toBe(true)
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA)).not.toBeNull()
    })

    it('stores correct JSON structure in localStorage', async () => {
      const prfOutput = new ArrayBuffer(32)
      mockCreate.mockResolvedValue(makeCredential(prfOutput))

      await registerWebAuthn(dekHex)

      const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA)!)
      expect(stored).toHaveProperty('credentialId')
      expect(stored).toHaveProperty('prfSalt')
      expect(stored).toHaveProperty('wrappedDEK')
      expect(stored).toHaveProperty('iv')
    })

    it('returns false when PRF extension result is absent', async () => {
      mockCreate.mockResolvedValue(makeCredential(undefined))

      const result = await registerWebAuthn(dekHex)

      expect(result).toBe(false)
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA)).toBeNull()
    })

    it('sets PRF unsupported flag when PRF result is absent', async () => {
      mockCreate.mockResolvedValue(makeCredential(undefined))

      await registerWebAuthn(dekHex)

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED)).toBe('1')
    })

    it('sets PRF unsupported flag when PRF results.first is undefined', async () => {
      const credential = {
        rawId: new ArrayBuffer(32),
        getClientExtensionResults: vi.fn().mockReturnValue({ prf: { results: {} } }),
      }
      mockCreate.mockResolvedValue(credential)

      await registerWebAuthn(dekHex)

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED)).toBe('1')
    })

    it('clears PRF unsupported flag on successful registration', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED, '1')
      const prfOutput = new ArrayBuffer(32)
      mockCreate.mockResolvedValue(makeCredential(prfOutput))

      await registerWebAuthn(dekHex)

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED)).toBeNull()
    })

    it('does not set PRF unsupported flag when navigator.credentials.create throws', async () => {
      mockCreate.mockRejectedValue(new Error('User cancelled'))

      await registerWebAuthn(dekHex)

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED)).toBeNull()
    })

    it('returns false when PRF results.first is undefined', async () => {
      const credential = {
        rawId: new ArrayBuffer(32),
        getClientExtensionResults: vi.fn().mockReturnValue({ prf: { results: {} } }),
      }
      mockCreate.mockResolvedValue(credential)

      const result = await registerWebAuthn(dekHex)
      expect(result).toBe(false)
    })

    it('returns false when navigator.credentials.create returns null', async () => {
      mockCreate.mockResolvedValue(null)

      const result = await registerWebAuthn(dekHex)
      expect(result).toBe(false)
    })

    it('returns false when navigator.credentials.create throws', async () => {
      mockCreate.mockRejectedValue(new Error('User cancelled'))

      const result = await registerWebAuthn(dekHex)
      expect(result).toBe(false)
    })

    it('calls crypto.subtle.importKey with HKDF for PRF output', async () => {
      const prfOutput = new ArrayBuffer(32)
      mockCreate.mockResolvedValue(makeCredential(prfOutput))

      await registerWebAuthn(dekHex)

      expect(mockImportKey).toHaveBeenCalledWith('raw', prfOutput, 'HKDF', false, ['deriveKey'])
    })

    it('calls crypto.subtle.encrypt with AES-GCM', async () => {
      const prfOutput = new ArrayBuffer(32)
      mockCreate.mockResolvedValue(makeCredential(prfOutput))

      await registerWebAuthn(dekHex)

      expect(mockEncrypt).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'AES-GCM' }),
        mockKEK,
        expect.any(Uint8Array)
      )
    })
  })

  describe('authenticateWithWebAuthn', () => {
    const storedData = {
      credentialId: btoa('credId'),
      prfSalt: btoa('salt'),
      wrappedDEK: btoa('wrappedDEK'),
      iv: btoa('iv'),
    }

    function makeAssertion(prfFirst?: ArrayBuffer) {
      return {
        rawId: new ArrayBuffer(32),
        getClientExtensionResults: vi.fn().mockReturnValue(
          prfFirst !== undefined
            ? { prf: { results: { first: prfFirst } } }
            : {}
        ),
      }
    }

    beforeEach(() => {
      localStorage.setItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA, JSON.stringify(storedData))
    })

    it('returns DEK hex on successful authentication', async () => {
      const prfOutput = new ArrayBuffer(32)
      mockGet.mockResolvedValue(makeAssertion(prfOutput))
      mockDecrypt.mockResolvedValue(new Uint8Array([0xaa, 0xbb, 0xcc]).buffer)

      const result = await authenticateWithWebAuthn()
      expect(result).not.toBeNull()
      expect(typeof result).toBe('string')
    })

    it('returns null when no credential stored', async () => {
      localStorage.removeItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA)

      const result = await authenticateWithWebAuthn()
      expect(result).toBeNull()
    })

    it('returns null when navigator.credentials.get returns null', async () => {
      mockGet.mockResolvedValue(null)

      const result = await authenticateWithWebAuthn()
      expect(result).toBeNull()
    })

    it('returns null when PRF extension result is absent', async () => {
      mockGet.mockResolvedValue(makeAssertion(undefined))

      const result = await authenticateWithWebAuthn()
      expect(result).toBeNull()
    })

    it('returns null when PRF results.first is undefined', async () => {
      const assertion = {
        getClientExtensionResults: vi.fn().mockReturnValue({ prf: { results: {} } }),
      }
      mockGet.mockResolvedValue(assertion)

      const result = await authenticateWithWebAuthn()
      expect(result).toBeNull()
    })

    it('returns null when navigator.credentials.get throws (user cancelled)', async () => {
      mockGet.mockRejectedValue(new Error('User cancelled'))

      const result = await authenticateWithWebAuthn()
      expect(result).toBeNull()
    })

    it('returns null when AES-GCM decrypt fails', async () => {
      const prfOutput = new ArrayBuffer(32)
      mockGet.mockResolvedValue(makeAssertion(prfOutput))
      mockDecrypt.mockRejectedValue(new Error('Decryption failed'))

      const result = await authenticateWithWebAuthn()
      expect(result).toBeNull()
    })

    it('calls crypto.subtle.importKey with HKDF for PRF output', async () => {
      const prfOutput = new ArrayBuffer(32)
      mockGet.mockResolvedValue(makeAssertion(prfOutput))

      await authenticateWithWebAuthn()

      expect(mockImportKey).toHaveBeenCalledWith('raw', prfOutput, 'HKDF', false, ['deriveKey'])
    })

    it('calls crypto.subtle.decrypt with AES-GCM', async () => {
      const prfOutput = new ArrayBuffer(32)
      mockGet.mockResolvedValue(makeAssertion(prfOutput))

      await authenticateWithWebAuthn()

      expect(mockDecrypt).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'AES-GCM' }),
        mockKEK,
        expect.any(ArrayBuffer)
      )
    })
  })
})
