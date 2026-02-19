import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isDatabaseSetup,
  hasValidSession,
  setupPin,
  login,
  logout,
  changePin,
  wipeAndReset,
  validateAndRefreshSession,
} from '../../../../services/auth/authService'
import { AUTH_STORAGE_KEYS } from '../../../../types/auth'

// Mock crypto module
vi.mock('../../../../services/auth/crypto', () => ({
  deriveEncryptionKey: vi.fn().mockResolvedValue({ key: 'mockkey123', salt: 'mocksalt456' }),
  hashPin: vi.fn().mockResolvedValue({ key: 'mockhash789', salt: 'mocksalt456' }),
  generateJwtSalt: vi.fn().mockReturnValue('mockjwtsalt'),
  generateRSAKeyPair: vi.fn().mockResolvedValue({ publicKey: 'mockpubkey', privateKey: 'mockprivkey' }),
}))

// Mock sessionToken module
vi.mock('../../../../services/auth/sessionToken', () => ({
  createSessionToken: vi.fn().mockResolvedValue('mocktoken'),
  validateSessionToken: vi.fn().mockResolvedValue({ iat: Date.now(), exp: Date.now() + 900000 }),
  storeSessionToken: vi.fn(),
  getStoredSessionToken: vi.fn().mockReturnValue('mocktoken'),
  clearSessionToken: vi.fn(),
}))

// Mock database connection module
vi.mock('../../../../services/database/connection', () => ({
  checkDatabaseExists: vi.fn().mockResolvedValue(false),
  initEncryptedDatabase: vi.fn().mockResolvedValue(undefined),
  rekeyDatabase: vi.fn().mockResolvedValue(undefined),
  wipeDatabase: vi.fn().mockResolvedValue(undefined),
  execSQL: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn().mockResolvedValue(null),
}))

// Mock migrations
vi.mock('../../../../services/database/migrations', () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}))

import { deriveEncryptionKey, hashPin, generateJwtSalt, generateRSAKeyPair } from '../../../../services/auth/crypto'
import { createSessionToken, validateSessionToken, storeSessionToken, getStoredSessionToken, clearSessionToken } from '../../../../services/auth/sessionToken'
import { checkDatabaseExists, initEncryptedDatabase, rekeyDatabase, wipeDatabase, execSQL, queryOne } from '../../../../services/database/connection'
import { runMigrations } from '../../../../services/database/migrations'

const mockDeriveEncryptionKey = vi.mocked(deriveEncryptionKey)
const mockHashPin = vi.mocked(hashPin)
const mockGenerateJwtSalt = vi.mocked(generateJwtSalt)
const mockGenerateRSAKeyPair = vi.mocked(generateRSAKeyPair)
const mockCreateSessionToken = vi.mocked(createSessionToken)
const mockValidateSessionToken = vi.mocked(validateSessionToken)
const mockStoreSessionToken = vi.mocked(storeSessionToken)
const mockGetStoredSessionToken = vi.mocked(getStoredSessionToken)
const mockClearSessionToken = vi.mocked(clearSessionToken)
const mockCheckDatabaseExists = vi.mocked(checkDatabaseExists)
const mockInitEncryptedDatabase = vi.mocked(initEncryptedDatabase)
const mockRekeyDatabase = vi.mocked(rekeyDatabase)
const mockWipeDatabase = vi.mocked(wipeDatabase)
const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)
const mockRunMigrations = vi.mocked(runMigrations)

describe('authService', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    sessionStorage.clear()

    // Reset default mock implementations
    mockDeriveEncryptionKey.mockResolvedValue({ key: 'mockkey123', salt: 'mocksalt456' })
    mockHashPin.mockResolvedValue({ key: 'mockhash789', salt: 'mocksalt456' })
    mockGenerateJwtSalt.mockReturnValue('mockjwtsalt')
    mockGenerateRSAKeyPair.mockResolvedValue({ publicKey: 'mockpubkey', privateKey: 'mockprivkey' })
    mockCreateSessionToken.mockResolvedValue('mocktoken')
    mockValidateSessionToken.mockResolvedValue({ iat: Date.now(), exp: Date.now() + 900000 })
    mockGetStoredSessionToken.mockReturnValue('mocktoken')
    mockCheckDatabaseExists.mockResolvedValue(false)
    mockQueryOne.mockResolvedValue(null)
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  describe('isDatabaseSetup', () => {
    it('returns false when database does not exist', async () => {
      mockCheckDatabaseExists.mockResolvedValue(false)

      const result = await isDatabaseSetup()
      expect(result).toBe(false)
    })

    it('returns true when database exists', async () => {
      mockCheckDatabaseExists.mockResolvedValue(true)

      const result = await isDatabaseSetup()
      expect(result).toBe(true)
    })

    it('calls checkDatabaseExists', async () => {
      await isDatabaseSetup()
      expect(mockCheckDatabaseExists).toHaveBeenCalled()
    })
  })

  describe('hasValidSession', () => {
    it('returns false when no token stored', async () => {
      mockGetStoredSessionToken.mockReturnValue(null)

      const result = await hasValidSession()
      expect(result).toBe(false)
    })

    it('returns false when no salt stored', async () => {
      mockGetStoredSessionToken.mockReturnValue('sometoken')
      localStorage.removeItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)

      const result = await hasValidSession()
      expect(result).toBe(false)
    })

    it('returns true when valid token and salt exist', async () => {
      mockGetStoredSessionToken.mockReturnValue(btoa(JSON.stringify({
        payload: { iat: Date.now(), exp: Date.now() + 900000 },
        signature: 'sig'
      })))
      localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, 'somesalt')

      const result = await hasValidSession()
      expect(result).toBe(true)
    })

    it('returns false when token is expired', async () => {
      mockGetStoredSessionToken.mockReturnValue(btoa(JSON.stringify({
        payload: { iat: Date.now() - 1000000, exp: Date.now() - 100 },
        signature: 'sig'
      })))
      localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, 'somesalt')

      const result = await hasValidSession()
      expect(result).toBe(false)
    })
  })

  describe('setupPin', () => {
    it('derives encryption key from PIN', async () => {
      await setupPin('mypin123')

      expect(mockDeriveEncryptionKey).toHaveBeenCalledWith('mypin123')
    })

    it('stores salt in localStorage', async () => {
      await setupPin('mypin123')

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)).toBe('mocksalt456')
    })

    it('initializes encrypted database', async () => {
      await setupPin('mypin123')

      expect(mockInitEncryptedDatabase).toHaveBeenCalledWith('mockkey123')
    })

    it('runs migrations', async () => {
      await setupPin('mypin123')

      expect(mockRunMigrations).toHaveBeenCalled()
    })

    it('saves auth settings to database', async () => {
      await setupPin('mypin123')

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('auth_settings'),
        expect.arrayContaining(['mockhash789', expect.any(Number)])
      )
    })

    it('creates and stores session token', async () => {
      await setupPin('mypin123')

      expect(mockCreateSessionToken).toHaveBeenCalledWith('mockjwtsalt')
      expect(mockStoreSessionToken).toHaveBeenCalledWith('mocktoken')
    })

    it('generates and saves RSA key pair', async () => {
      await setupPin('mypin123')

      expect(mockGenerateRSAKeyPair).toHaveBeenCalled()
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('public_key'),
        expect.arrayContaining(['mockpubkey', expect.any(Number)])
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('private_key'),
        expect.arrayContaining(['mockprivkey', expect.any(Number)])
      )
    })
  })

  describe('login', () => {
    beforeEach(() => {
      // Use mocksalt456 to match what hashPin returns
      localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, 'mocksalt456')
      mockQueryOne
        .mockResolvedValueOnce({ value: 'mockhash789' })  // pin_hash - matches hashPin result
        .mockResolvedValueOnce({ value: 'mockjwtsalt' })  // jwt_salt
        .mockResolvedValueOnce({ value: 'mocksalt456' })  // pbkdf2_salt
        .mockResolvedValueOnce(null)                       // public_key (getPublicKey check)
    })

    it('throws error when no salt found', async () => {
      localStorage.removeItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)

      await expect(login('mypin123')).rejects.toThrow('No salt found')
    })

    it('derives key using stored salt', async () => {
      await login('mypin123')

      expect(mockDeriveEncryptionKey).toHaveBeenCalledWith('mypin123', 'mocksalt456')
    })

    it('initializes encrypted database with derived key', async () => {
      await login('mypin123')

      expect(mockInitEncryptedDatabase).toHaveBeenCalledWith('mockkey123')
    })

    it('returns true on successful login', async () => {
      const result = await login('mypin123')
      expect(result).toBe(true)
    })

    it('generates key pair if not present on login', async () => {
      await login('mypin123')

      expect(mockGenerateRSAKeyPair).toHaveBeenCalled()
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('public_key'),
        expect.arrayContaining(['mockpubkey', expect.any(Number)])
      )
    })

    it('skips key pair generation if already present on login', async () => {
      mockQueryOne
        .mockReset()
        .mockResolvedValueOnce({ value: 'mockhash789' })  // pin_hash
        .mockResolvedValueOnce({ value: 'mockjwtsalt' })  // jwt_salt
        .mockResolvedValueOnce({ value: 'mocksalt456' })  // pbkdf2_salt
        .mockResolvedValueOnce({ value: 'existing-pub-key' })  // public_key exists
        .mockResolvedValue(null)

      await login('mypin123')

      expect(mockGenerateRSAKeyPair).not.toHaveBeenCalled()
    })

    it('returns false on wrong PIN', async () => {
      mockInitEncryptedDatabase.mockRejectedValue(new Error('Invalid key'))

      const result = await login('wrongpin')
      expect(result).toBe(false)
    })
  })

  describe('logout', () => {
    it('clears session token', () => {
      logout()
      expect(mockClearSessionToken).toHaveBeenCalled()
    })
  })

  describe('changePin', () => {
    beforeEach(() => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, 'oldsalt')
      mockQueryOne
        .mockResolvedValueOnce({ value: 'oldhash' })     // pin_hash
        .mockResolvedValueOnce({ value: 'oldjwtsalt' })  // jwt_salt
        .mockResolvedValueOnce({ value: 'oldsalt' })     // pbkdf2_salt
    })

    it('throws error when no salt found', async () => {
      localStorage.removeItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)

      await expect(changePin('oldpin', 'newpin')).rejects.toThrow('No salt found')
    })

    it('derives old key with old salt', async () => {
      await changePin('oldpin', 'newpin')

      expect(mockDeriveEncryptionKey).toHaveBeenCalledWith('oldpin', 'oldsalt')
    })

    it('derives new key without salt', async () => {
      await changePin('oldpin', 'newpin')

      expect(mockDeriveEncryptionKey).toHaveBeenCalledWith('newpin')
    })

    it('rekeys database', async () => {
      await changePin('oldpin', 'newpin')

      expect(mockRekeyDatabase).toHaveBeenCalled()
    })

    it('updates localStorage with new salt', async () => {
      mockDeriveEncryptionKey
        .mockResolvedValueOnce({ key: 'oldkey', salt: 'oldsalt' })
        .mockResolvedValueOnce({ key: 'newkey', salt: 'newsalt' })

      await changePin('oldpin', 'newpin')

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)).toBe('newsalt')
    })

    it('creates new session token', async () => {
      await changePin('oldpin', 'newpin')

      expect(mockClearSessionToken).toHaveBeenCalled()
      expect(mockCreateSessionToken).toHaveBeenCalled()
      expect(mockStoreSessionToken).toHaveBeenCalled()
    })

    it('returns true on success', async () => {
      const result = await changePin('oldpin', 'newpin')
      expect(result).toBe(true)
    })

    it('returns false on rekey failure', async () => {
      mockRekeyDatabase.mockRejectedValue(new Error('Rekey failed'))

      const result = await changePin('oldpin', 'newpin')
      expect(result).toBe(false)
    })
  })

  describe('wipeAndReset', () => {
    beforeEach(() => {
      localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, 'somesalt')
    })

    it('clears session token', async () => {
      await wipeAndReset()
      expect(mockClearSessionToken).toHaveBeenCalled()
    })

    it('clears localStorage salt', async () => {
      await wipeAndReset()
      expect(localStorage.getItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)).toBeNull()
    })

    it('wipes database', async () => {
      await wipeAndReset()
      expect(mockWipeDatabase).toHaveBeenCalled()
    })
  })

  describe('validateAndRefreshSession', () => {
    beforeEach(() => {
      mockQueryOne
        .mockResolvedValueOnce({ value: 'pinhash' })   // pin_hash
        .mockResolvedValueOnce({ value: 'jwtsalt' })   // jwt_salt
        .mockResolvedValueOnce({ value: 'pbkdf2salt' }) // pbkdf2_salt
    })

    it('returns false when no token stored', async () => {
      mockGetStoredSessionToken.mockReturnValue(null)

      const result = await validateAndRefreshSession()
      expect(result).toBe(false)
    })

    it('returns false when auth settings not found', async () => {
      mockQueryOne.mockReset()
      mockQueryOne.mockResolvedValue(null)

      const result = await validateAndRefreshSession()
      expect(result).toBe(false)
    })

    it('returns false when token validation fails', async () => {
      mockValidateSessionToken.mockResolvedValue(null)

      const result = await validateAndRefreshSession()
      expect(result).toBe(false)
    })

    it('returns true and creates new token when valid', async () => {
      const result = await validateAndRefreshSession()

      expect(result).toBe(true)
      expect(mockCreateSessionToken).toHaveBeenCalled()
      expect(mockStoreSessionToken).toHaveBeenCalled()
    })
  })
})
