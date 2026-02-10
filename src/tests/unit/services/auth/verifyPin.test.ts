import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AUTH_STORAGE_KEYS } from '../../../../types/auth'

// Mock crypto module
vi.mock('../../../../services/auth/crypto', () => ({
  hashPin: vi.fn().mockResolvedValue({ key: 'mockhash789', salt: 'mocksalt456' }),
}))

// Mock database module
vi.mock('../../../../services/database', () => ({
  queryOne: vi.fn().mockResolvedValue(null),
}))

import { verifyPin } from '../../../../services/auth/verifyPin'
import { hashPin } from '../../../../services/auth/crypto'
import { queryOne } from '../../../../services/database'

const mockHashPin = vi.mocked(hashPin)
const mockQueryOne = vi.mocked(queryOne)

describe('verifyPin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    // Reset default mock implementations
    mockHashPin.mockResolvedValue({ key: 'mockhash789', salt: 'mocksalt456' })
    mockQueryOne.mockResolvedValue(null)
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('salt retrieval from localStorage', () => {
    it('throws "No salt found. Database may be corrupted." when no salt in localStorage', async () => {
      await expect(verifyPin('1234')).rejects.toThrow(
        'No salt found. Database may be corrupted.'
      )
    })

    it('does not call hashPin when salt is missing', async () => {
      await expect(verifyPin('1234')).rejects.toThrow()

      expect(mockHashPin).not.toHaveBeenCalled()
    })

    it('does not query the database when salt is missing', async () => {
      await expect(verifyPin('1234')).rejects.toThrow()

      expect(mockQueryOne).not.toHaveBeenCalled()
    })
  })

  describe('hashPin invocation', () => {
    beforeEach(() => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, 'storedsalt123')
    })

    it('calls hashPin with the provided pin and the stored salt', async () => {
      mockQueryOne.mockResolvedValue({ value: 'mockhash789' })

      await verifyPin('5678')

      expect(mockHashPin).toHaveBeenCalledOnce()
      expect(mockHashPin).toHaveBeenCalledWith('5678', 'storedsalt123')
    })

    it('calls hashPin with the exact salt from localStorage', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, 'differentsalt')
      mockQueryOne.mockResolvedValue({ value: 'mockhash789' })

      await verifyPin('9999')

      expect(mockHashPin).toHaveBeenCalledWith('9999', 'differentsalt')
    })
  })

  describe('database query', () => {
    beforeEach(() => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, 'storedsalt123')
    })

    it('queries the auth_settings table for pin_hash', async () => {
      mockQueryOne.mockResolvedValue({ value: 'mockhash789' })

      await verifyPin('1234')

      expect(mockQueryOne).toHaveBeenCalledOnce()
      expect(mockQueryOne).toHaveBeenCalledWith(
        "SELECT value FROM auth_settings WHERE key = 'pin_hash'"
      )
    })

    it('throws "Auth settings not found" when no stored hash exists', async () => {
      mockQueryOne.mockResolvedValue(null)

      await expect(verifyPin('1234')).rejects.toThrow('Auth settings not found')
    })

    it('throws "Auth settings not found" when queryOne returns undefined', async () => {
      mockQueryOne.mockResolvedValue(undefined as never)

      await expect(verifyPin('1234')).rejects.toThrow('Auth settings not found')
    })
  })

  describe('PIN hash comparison', () => {
    beforeEach(() => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, 'storedsalt123')
    })

    it('throws "Incorrect PIN" when computed hash does not match stored hash', async () => {
      mockHashPin.mockResolvedValue({ key: 'computedhash_aaa', salt: 'storedsalt123' })
      mockQueryOne.mockResolvedValue({ value: 'storedhash_bbb' })

      await expect(verifyPin('1234')).rejects.toThrow('Incorrect PIN')
    })

    it('resolves without error when computed hash matches stored hash', async () => {
      mockHashPin.mockResolvedValue({ key: 'matchinghash', salt: 'storedsalt123' })
      mockQueryOne.mockResolvedValue({ value: 'matchinghash' })

      await expect(verifyPin('1234')).resolves.toBeUndefined()
    })

    it('returns void (undefined) on successful verification', async () => {
      mockHashPin.mockResolvedValue({ key: 'samehash', salt: 'storedsalt123' })
      mockQueryOne.mockResolvedValue({ value: 'samehash' })

      const result = await verifyPin('1234')

      expect(result).toBeUndefined()
    })
  })

  describe('end-to-end flow ordering', () => {
    it('executes steps in order: salt check, hashPin, queryOne, comparison', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, 'salt_abc')

      const callOrder: string[] = []

      mockHashPin.mockImplementation(async () => {
        callOrder.push('hashPin')
        return { key: 'finalhash', salt: 'salt_abc' }
      })

      mockQueryOne.mockImplementation(async () => {
        callOrder.push('queryOne')
        return { value: 'finalhash' }
      })

      await verifyPin('4321')

      expect(callOrder).toEqual(['hashPin', 'queryOne'])
    })

    it('does not query database if hashPin rejects', async () => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, 'salt_abc')
      mockHashPin.mockRejectedValue(new Error('crypto failure'))

      await expect(verifyPin('1234')).rejects.toThrow('crypto failure')

      expect(mockQueryOne).not.toHaveBeenCalled()
    })
  })
})
