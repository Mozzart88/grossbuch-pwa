import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createSessionToken,
  validateSessionToken,
  storeSessionToken,
  getStoredSessionToken,
  clearSessionToken,
  hasValidSession,
  refreshSessionToken,
} from '../../../../services/auth/sessionToken'
import { AUTH_STORAGE_KEYS } from '../../../../types/auth'

// Mock crypto functions
vi.mock('../../../../services/auth/crypto', () => ({
  createHmacSignature: vi.fn().mockResolvedValue('mocksignature1234'),
  verifyHmacSignature: vi.fn().mockResolvedValue(true),
}))

import { createHmacSignature, verifyHmacSignature } from '../../../../services/auth/crypto'

const mockCreateHmacSignature = vi.mocked(createHmacSignature)
const mockVerifyHmacSignature = vi.mocked(verifyHmacSignature)

describe('sessionToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createSessionToken', () => {
    it('creates a token string', async () => {
      const token = await createSessionToken('testsalt')

      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
    })

    it('creates token with correct expiration', async () => {
      const now = new Date('2024-01-01T00:00:00Z').getTime()
      vi.setSystemTime(now)

      const token = await createSessionToken('testsalt')
      const decoded = JSON.parse(atob(token))

      // 15 minutes = 900000ms
      expect(decoded.payload.iat).toBe(now)
      expect(decoded.payload.exp).toBe(now + 15 * 60 * 1000)
    })

    it('calls createHmacSignature with payload', async () => {
      await createSessionToken('testsalt')

      expect(mockCreateHmacSignature).toHaveBeenCalledWith(
        expect.any(String),
        'testsalt'
      )
    })

    it('includes signature in token', async () => {
      mockCreateHmacSignature.mockResolvedValue('customsignature')

      const token = await createSessionToken('testsalt')
      const decoded = JSON.parse(atob(token))

      expect(decoded.signature).toBe('customsignature')
    })
  })

  describe('validateSessionToken', () => {
    it('returns payload for valid token', async () => {
      const now = new Date('2024-01-01T00:00:00Z').getTime()
      vi.setSystemTime(now)

      mockVerifyHmacSignature.mockResolvedValue(true)

      const token = await createSessionToken('testsalt')
      const payload = await validateSessionToken(token, 'testsalt')

      expect(payload).toBeDefined()
      expect(payload?.iat).toBe(now)
      expect(payload?.exp).toBe(now + 15 * 60 * 1000)
    })

    it('returns null for invalid signature', async () => {
      mockVerifyHmacSignature.mockResolvedValue(false)

      const token = await createSessionToken('testsalt')
      const payload = await validateSessionToken(token, 'testsalt')

      expect(payload).toBeNull()
    })

    it('returns null for expired token', async () => {
      const now = new Date('2024-01-01T00:00:00Z').getTime()
      vi.setSystemTime(now)

      mockVerifyHmacSignature.mockResolvedValue(true)

      const token = await createSessionToken('testsalt')

      // Advance time past expiration
      vi.setSystemTime(now + 16 * 60 * 1000)

      const payload = await validateSessionToken(token, 'testsalt')
      expect(payload).toBeNull()
    })

    it('returns null for malformed token', async () => {
      const payload = await validateSessionToken('invalid-base64!@#$', 'testsalt')
      expect(payload).toBeNull()
    })

    it('returns null for invalid JSON', async () => {
      const invalidJson = btoa('not valid json')
      const payload = await validateSessionToken(invalidJson, 'testsalt')
      expect(payload).toBeNull()
    })
  })

  describe('storeSessionToken', () => {
    it('stores token in sessionStorage', () => {
      storeSessionToken('mytoken123')

      expect(sessionStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).toBe('mytoken123')
    })
  })

  describe('getStoredSessionToken', () => {
    it('retrieves token from sessionStorage', () => {
      sessionStorage.setItem(AUTH_STORAGE_KEYS.SESSION_TOKEN, 'storedtoken')

      const token = getStoredSessionToken()
      expect(token).toBe('storedtoken')
    })

    it('returns null when no token stored', () => {
      const token = getStoredSessionToken()
      expect(token).toBeNull()
    })
  })

  describe('clearSessionToken', () => {
    it('removes token from sessionStorage', () => {
      sessionStorage.setItem(AUTH_STORAGE_KEYS.SESSION_TOKEN, 'tokentoremove')

      clearSessionToken()

      expect(sessionStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).toBeNull()
    })
  })

  describe('hasValidSession', () => {
    it('returns false when no token stored', async () => {
      const result = await hasValidSession('testsalt')
      expect(result).toBe(false)
    })

    it('returns true when valid token exists', async () => {
      const now = new Date('2024-01-01T00:00:00Z').getTime()
      vi.setSystemTime(now)

      mockVerifyHmacSignature.mockResolvedValue(true)

      const token = await createSessionToken('testsalt')
      storeSessionToken(token)

      const result = await hasValidSession('testsalt')
      expect(result).toBe(true)
    })

    it('returns false when token is expired', async () => {
      const now = new Date('2024-01-01T00:00:00Z').getTime()
      vi.setSystemTime(now)

      mockVerifyHmacSignature.mockResolvedValue(true)

      const token = await createSessionToken('testsalt')
      storeSessionToken(token)

      // Advance past expiration
      vi.setSystemTime(now + 16 * 60 * 1000)

      const result = await hasValidSession('testsalt')
      expect(result).toBe(false)
    })

    it('returns false when token signature invalid', async () => {
      const token = await createSessionToken('testsalt')
      storeSessionToken(token)

      mockVerifyHmacSignature.mockResolvedValue(false)

      const result = await hasValidSession('testsalt')
      expect(result).toBe(false)
    })
  })

  describe('refreshSessionToken', () => {
    it('returns false when no token stored', async () => {
      const result = await refreshSessionToken('testsalt')
      expect(result).toBe(false)
    })

    it('returns false when current token invalid', async () => {
      mockVerifyHmacSignature.mockResolvedValue(false)
      storeSessionToken('invalidtoken')

      const result = await refreshSessionToken('testsalt')
      expect(result).toBe(false)
    })

    it('creates new token when current is valid', async () => {
      const now = new Date('2024-01-01T00:00:00Z').getTime()
      vi.setSystemTime(now)

      mockVerifyHmacSignature.mockResolvedValue(true)

      const originalToken = await createSessionToken('testsalt')
      storeSessionToken(originalToken)

      // Advance time a bit
      vi.setSystemTime(now + 5 * 60 * 1000)

      const result = await refreshSessionToken('testsalt')
      expect(result).toBe(true)

      // Token should be updated
      const newToken = getStoredSessionToken()
      expect(newToken).not.toBe(originalToken)
    })

    it('extends expiration time', async () => {
      const now = new Date('2024-01-01T00:00:00Z').getTime()
      vi.setSystemTime(now)

      mockVerifyHmacSignature.mockResolvedValue(true)

      const originalToken = await createSessionToken('testsalt')
      storeSessionToken(originalToken)

      // Advance 10 minutes
      vi.setSystemTime(now + 10 * 60 * 1000)

      await refreshSessionToken('testsalt')

      const newToken = getStoredSessionToken()!
      const decoded = JSON.parse(atob(newToken))

      // New expiration should be 15 min from now (25 min from original time)
      expect(decoded.payload.exp).toBe(now + 25 * 60 * 1000)
    })
  })
})
