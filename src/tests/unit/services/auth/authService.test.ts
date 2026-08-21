import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isDatabaseSetup,
  needsMigration,
  migrateDatabase,
  getPublicKey,
  hasValidSession,
  setupPin,
  login,
  logout,
  changePin,
  wipeAndReset,
  validateAndRefreshSession,
  loginWithBiometrics,
  enableBiometrics,
  disableBiometrics,
} from '../../../../services/auth/authService'
import { AUTH_STORAGE_KEYS } from '../../../../types/auth'

// Mock crypto module
vi.mock('../../../../services/auth/crypto', () => ({
  deriveEncryptionKey: vi.fn().mockResolvedValue({ key: 'mockkey123', salt: 'mocksalt456' }),
  hashPin: vi.fn().mockResolvedValue({ key: 'mockhash789', salt: 'mocksalt456' }),
  generateJwtSalt: vi.fn().mockReturnValue('mockjwtsalt'),
  generateRSAKeyPair: vi.fn().mockResolvedValue({ publicKey: 'mockpubkey', privateKey: 'mockprivkey' }),
  generateDEK: vi.fn().mockReturnValue('mocksharedkeyaa'),
  wrapSharedDEK: vi.fn().mockResolvedValue({ ciphertext: 'mockwrappedciphertext', iv: 'mockiv' }),
  unwrapSharedDEK: vi.fn().mockResolvedValue('mockunwrappedsharedkey'),
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
  checkIsEncrypted: vi.fn().mockResolvedValue(true),
  initEncryptedDatabase: vi.fn().mockResolvedValue(undefined),
  migrateToEncrypted: vi.fn().mockResolvedValue(undefined),
  rekeyDatabase: vi.fn().mockResolvedValue(undefined),
  wipeDatabase: vi.fn().mockResolvedValue(undefined),
  execSQL: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn().mockResolvedValue(null),
  attachDatabase: vi.fn().mockResolvedValue(undefined),
  detachDatabase: vi.fn().mockResolvedValue(undefined),
  rekeySchema: vi.fn().mockResolvedValue(undefined),
  finalizeMainRebuild: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}))

// Mock migrations
vi.mock('../../../../services/database/migrations', () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}))

// Mock shared migrations
vi.mock('../../../../services/database/sharedMigrations', () => ({
  runSharedMigrations: vi.fn().mockResolvedValue(undefined),
}))

// Mock workspace attach/switch
vi.mock('../../../../services/database/workspace', () => ({
  attachActiveWorkspace: vi.fn().mockResolvedValue(undefined),
  switchWorkspace: vi.fn().mockResolvedValue(undefined),
  setSessionDekShared: vi.fn(),
  getActiveWorkspaceId: vi.fn().mockReturnValue(1),
  clearWorkspaceSession: vi.fn(),
}))

// Mock webauthn module
vi.mock('../../../../services/auth/webauthn', () => ({
  authenticateWithWebAuthn: vi.fn().mockResolvedValue(null),
  registerWebAuthn: vi.fn().mockResolvedValue(true),
  clearWebAuthnCredential: vi.fn(),
  clearPRFUnsupportedFlag: vi.fn(),
}))

import { deriveEncryptionKey, hashPin, generateJwtSalt, generateRSAKeyPair, generateDEK, wrapSharedDEK, unwrapSharedDEK } from '../../../../services/auth/crypto'
import { createSessionToken, validateSessionToken, storeSessionToken, getStoredSessionToken, clearSessionToken } from '../../../../services/auth/sessionToken'
import { checkDatabaseExists, checkIsEncrypted, initEncryptedDatabase, migrateToEncrypted, rekeyDatabase, wipeDatabase, execSQL, queryOne, attachDatabase, rekeySchema } from '../../../../services/database/connection'
import { runMigrations } from '../../../../services/database/migrations'
import { attachActiveWorkspace, setSessionDekShared, clearWorkspaceSession, getActiveWorkspaceId } from '../../../../services/database/workspace'
import { authenticateWithWebAuthn, registerWebAuthn, clearWebAuthnCredential } from '../../../../services/auth/webauthn'

const mockAuthenticateWithWebAuthn = vi.mocked(authenticateWithWebAuthn)
const mockRegisterWebAuthn = vi.mocked(registerWebAuthn)
const mockClearWebAuthnCredential = vi.mocked(clearWebAuthnCredential)
const mockDeriveEncryptionKey = vi.mocked(deriveEncryptionKey)
const mockHashPin = vi.mocked(hashPin)
const mockGenerateJwtSalt = vi.mocked(generateJwtSalt)
const mockGenerateRSAKeyPair = vi.mocked(generateRSAKeyPair)
const mockGenerateDEK = vi.mocked(generateDEK)
const mockWrapSharedDEK = vi.mocked(wrapSharedDEK)
const mockUnwrapSharedDEK = vi.mocked(unwrapSharedDEK)
const mockCreateSessionToken = vi.mocked(createSessionToken)
const mockValidateSessionToken = vi.mocked(validateSessionToken)
const mockStoreSessionToken = vi.mocked(storeSessionToken)
const mockGetStoredSessionToken = vi.mocked(getStoredSessionToken)
const mockClearSessionToken = vi.mocked(clearSessionToken)
const mockCheckDatabaseExists = vi.mocked(checkDatabaseExists)
const mockCheckIsEncrypted = vi.mocked(checkIsEncrypted)
const mockInitEncryptedDatabase = vi.mocked(initEncryptedDatabase)
const mockMigrateToEncrypted = vi.mocked(migrateToEncrypted)
const mockRekeyDatabase = vi.mocked(rekeyDatabase)
const mockWipeDatabase = vi.mocked(wipeDatabase)
const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)
const mockRunMigrations = vi.mocked(runMigrations)
const mockAttachDatabase = vi.mocked(attachDatabase)
const mockRekeySchema = vi.mocked(rekeySchema)
const mockAttachActiveWorkspace = vi.mocked(attachActiveWorkspace)
const mockSetSessionDekShared = vi.mocked(setSessionDekShared)
const mockClearWorkspaceSession = vi.mocked(clearWorkspaceSession)
const mockGetActiveWorkspaceId = vi.mocked(getActiveWorkspaceId)

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
    mockGenerateDEK.mockReturnValue('mocksharedkeyaa')
    mockWrapSharedDEK.mockResolvedValue({ ciphertext: 'mockwrappedciphertext', iv: 'mockiv' })
    mockUnwrapSharedDEK.mockResolvedValue('mockunwrappedsharedkey')
    mockCreateSessionToken.mockResolvedValue('mocktoken')
    mockValidateSessionToken.mockResolvedValue({ iat: Date.now(), exp: Date.now() + 900000 })
    mockGetStoredSessionToken.mockReturnValue('mocktoken')
    mockCheckDatabaseExists.mockResolvedValue(false)
    mockCheckIsEncrypted.mockResolvedValue(true)
    mockQueryOne.mockResolvedValue(null)
    mockGetActiveWorkspaceId.mockReturnValue(1)
    mockRegisterWebAuthn.mockResolvedValue(true)
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

  describe('needsMigration', () => {
    it('returns false when the database does not exist', async () => {
      mockCheckDatabaseExists.mockResolvedValue(false)

      expect(await needsMigration()).toBe(false)
      expect(mockCheckIsEncrypted).not.toHaveBeenCalled()
    })

    it('returns true when the database exists and is not encrypted', async () => {
      mockCheckDatabaseExists.mockResolvedValue(true)
      mockCheckIsEncrypted.mockResolvedValue(false)

      expect(await needsMigration()).toBe(true)
    })

    it('returns false when the database exists and is already encrypted', async () => {
      mockCheckDatabaseExists.mockResolvedValue(true)
      mockCheckIsEncrypted.mockResolvedValue(true)

      expect(await needsMigration()).toBe(false)
    })
  })

  describe('getPublicKey', () => {
    it('returns the stored public key', async () => {
      mockQueryOne.mockResolvedValue({ value: 'pubkey-abc' })

      expect(await getPublicKey()).toBe('pubkey-abc')
    })

    it('returns null when no public key is stored', async () => {
      mockQueryOne.mockResolvedValue(null)

      expect(await getPublicKey()).toBeNull()
    })

    it('returns null when the lookup throws', async () => {
      mockQueryOne.mockRejectedValue(new Error('db error'))

      expect(await getPublicKey()).toBeNull()
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
        expect.stringContaining('app_settings'),
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

    it('generates and wraps DEK_shared, then attaches the Shared DB', async () => {
      await setupPin('mypin123')

      expect(mockGenerateDEK).toHaveBeenCalled()
      expect(mockWrapSharedDEK).toHaveBeenCalledWith('mocksharedkeyaa', 'mockkey123')
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('shared_dek_wrapped'),
        expect.arrayContaining(['mockwrappedciphertext', expect.any(Number)])
      )
      expect(mockAttachDatabase).toHaveBeenCalledWith('shared', '/shared.db', 'mocksharedkeyaa')
    })

    it('attaches the active workspace after attaching the Shared DB', async () => {
      await setupPin('mypin123')

      expect(mockAttachActiveWorkspace).toHaveBeenCalledWith('mocksharedkeyaa')
    })

    it('throws when no active workspace is found after attaching (defensive check)', async () => {
      // Default global beforeEach makes the topology_version lookup resolve
      // null, so needsLegacyMigration() is true and this branch is reached.
      mockGetActiveWorkspaceId.mockReturnValue(null)

      await expect(setupPin('mypin123')).rejects.toThrow('No active workspace after attach')
    })
  })

  describe('migrateDatabase', () => {
    beforeEach(() => {
      mockQueryOne
        .mockResolvedValueOnce(null) // app_settings existence check -> run migrations
        .mockResolvedValueOnce(null) // shared_dek_wrapped
        .mockResolvedValueOnce(null) // shared_dek_iv
        .mockResolvedValueOnce({ value: String(2) }) // topology_version (already migrated)
        .mockResolvedValue(null) // public_key
    })

    it('migrates the unencrypted database to encrypted using the derived key', async () => {
      await migrateDatabase('mypin123')

      expect(mockMigrateToEncrypted).toHaveBeenCalledWith('mockkey123')
      expect(mockInitEncryptedDatabase).toHaveBeenCalledWith('mockkey123')
    })

    it('stores the PBKDF2 salt in localStorage', async () => {
      await migrateDatabase('mypin123')

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)).toBe('mocksalt456')
    })

    it('runs migrations when app_settings does not exist yet', async () => {
      await migrateDatabase('mypin123')

      expect(mockRunMigrations).toHaveBeenCalled()
    })

    it('skips migrations when app_settings already exists', async () => {
      mockQueryOne
        .mockReset()
        .mockResolvedValueOnce({ name: 'app_settings' }) // app_settings already exists
        .mockResolvedValueOnce(null) // shared_dek_wrapped
        .mockResolvedValueOnce(null) // shared_dek_iv
        .mockResolvedValueOnce({ value: String(2) }) // topology_version
        .mockResolvedValue(null)

      await migrateDatabase('mypin123')

      expect(mockRunMigrations).not.toHaveBeenCalled()
    })

    it('saves auth settings and creates a session token', async () => {
      await migrateDatabase('mypin123')

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('pin_hash'),
        expect.arrayContaining(['mockhash789', expect.any(Number)])
      )
      expect(mockCreateSessionToken).toHaveBeenCalledWith('mockjwtsalt')
      expect(mockStoreSessionToken).toHaveBeenCalledWith('mocktoken')
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
        .mockResolvedValueOnce({ value: 'wrappedciphertext' })  // shared_dek_wrapped
        .mockResolvedValueOnce({ value: 'wrappediv' })          // shared_dek_iv
        .mockResolvedValueOnce({ value: '2' })              // topology_version (already migrated)
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
        .mockResolvedValueOnce({ value: 'wrappedciphertext' })  // shared_dek_wrapped
        .mockResolvedValueOnce({ value: 'wrappediv' })          // shared_dek_iv
        .mockResolvedValueOnce({ value: '2' })              // topology_version (already migrated)
        .mockResolvedValueOnce({ value: 'existing-pub-key' })  // public_key exists
        .mockResolvedValue(null)

      await login('mypin123')

      expect(mockGenerateRSAKeyPair).not.toHaveBeenCalled()
    })

    it('unwraps DEK_shared and attaches the Shared DB', async () => {
      await login('mypin123')

      expect(mockUnwrapSharedDEK).toHaveBeenCalledWith(
        { ciphertext: 'wrappedciphertext', iv: 'wrappediv' },
        'mockkey123'
      )
      expect(mockAttachDatabase).toHaveBeenCalledWith('shared', '/shared.db', 'mockunwrappedsharedkey')
    })

    it('attaches the active workspace after unwrapping DEK_shared', async () => {
      await login('mypin123')

      expect(mockAttachActiveWorkspace).toHaveBeenCalledWith('mockunwrappedsharedkey')
    })

    it('generates and wraps a new DEK_shared when none exists yet', async () => {
      mockQueryOne
        .mockReset()
        .mockResolvedValueOnce({ value: 'mockhash789' })  // pin_hash
        .mockResolvedValueOnce({ value: 'mockjwtsalt' })  // jwt_salt
        .mockResolvedValueOnce({ value: 'mocksalt456' })  // pbkdf2_salt
        .mockResolvedValueOnce(null)  // shared_dek_wrapped missing
        .mockResolvedValueOnce(null)  // shared_dek_iv missing
        .mockResolvedValueOnce({ value: '2' })  // topology_version (already migrated)
        .mockResolvedValue(null)

      await login('mypin123')

      expect(mockGenerateDEK).toHaveBeenCalled()
      expect(mockWrapSharedDEK).toHaveBeenCalledWith('mocksharedkeyaa', 'mockkey123')
      expect(mockAttachDatabase).toHaveBeenCalledWith('shared', '/shared.db', 'mocksharedkeyaa')
    })

    it('returns false on wrong PIN', async () => {
      mockInitEncryptedDatabase.mockRejectedValue(new Error('Invalid key'))

      const result = await login('wrongpin')
      expect(result).toBe(false)
    })

    it('returns false when reading auth settings throws (auth settings not found)', async () => {
      mockQueryOne.mockReset()
      mockQueryOne.mockRejectedValue(new Error('db error'))

      const result = await login('mypin123')
      expect(result).toBe(false)
    })

    it('returns false when the derived PIN hash does not match the stored one', async () => {
      mockQueryOne
        .mockReset()
        .mockResolvedValueOnce({ value: 'a-different-hash' }) // pin_hash mismatch
        .mockResolvedValueOnce({ value: 'mockjwtsalt' })
        .mockResolvedValueOnce({ value: 'mocksalt456' })
        .mockResolvedValue(null)

      const result = await login('mypin123')
      expect(result).toBe(false)
    })

    it('logs the underlying error when the post-auth chain throws for a reason other than PIN verification, while still returning false', async () => {
      // Simulates a downstream failure (e.g. legacy migration hitting
      // SQLITE_CONSTRAINT_FOREIGNKEY) happening after PIN verification already
      // succeeded — this must be distinguishable in the console from a wrong PIN.
      const migrationError = new Error('SQLITE_CONSTRAINT_FOREIGNKEY: FOREIGN KEY constraint failed')
      mockAttachActiveWorkspace.mockRejectedValueOnce(migrationError)

      const result = await login('mypin123')

      expect(result).toBe(false)
      expect(console.error).toHaveBeenCalledWith('Login failed:', migrationError)
    })
  })

  describe('logout', () => {
    it('clears session token', () => {
      logout()
      expect(mockClearSessionToken).toHaveBeenCalled()
    })

    it('clears the workspace session', () => {
      logout()
      expect(mockClearWorkspaceSession).toHaveBeenCalled()
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

    it('rekeys the attached Shared DB with a freshly generated key', async () => {
      await changePin('oldpin', 'newpin')

      expect(mockGenerateDEK).toHaveBeenCalled()
      expect(mockRekeySchema).toHaveBeenCalledWith('shared', 'mocksharedkeyaa')
    })

    it('re-wraps the new DEK_shared under the new DEK_app', async () => {
      mockDeriveEncryptionKey
        .mockResolvedValueOnce({ key: 'oldkey', salt: 'oldsalt' })
        .mockResolvedValueOnce({ key: 'newkey', salt: 'newsalt' })

      await changePin('oldpin', 'newpin')

      expect(mockWrapSharedDEK).toHaveBeenCalledWith('mocksharedkeyaa', 'newkey')
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('shared_dek_wrapped'),
        expect.arrayContaining(['mockwrappedciphertext', expect.any(Number)])
      )
    })

    it('returns false when rekeying the Shared DB fails', async () => {
      mockRekeySchema.mockRejectedValue(new Error('Shared rekey failed'))

      const result = await changePin('oldpin', 'newpin')
      expect(result).toBe(false)
    })

    it('rekeys the attached workspace to the same fresh DEK_shared', async () => {
      await changePin('oldpin', 'newpin')

      expect(mockRekeySchema).toHaveBeenCalledWith('workspace', 'mocksharedkeyaa')
      expect(mockSetSessionDekShared).toHaveBeenCalledWith('mocksharedkeyaa')
    })

    it('returns false when rekeying the workspace fails', async () => {
      mockRekeySchema.mockImplementation(async (schema: string) => {
        if (schema === 'workspace') throw new Error('Workspace rekey failed')
      })

      const result = await changePin('oldpin', 'newpin')
      expect(result).toBe(false)
    })
  })

  describe('loginWithBiometrics', () => {
    it('returns false when no credential is stored', async () => {
      mockAuthenticateWithWebAuthn.mockResolvedValue(null)

      const result = await loginWithBiometrics()
      expect(result).toBe(false)
    })

    it('unwraps DEK_shared and attaches the Shared DB on success', async () => {
      mockAuthenticateWithWebAuthn.mockResolvedValue('biometricdek')
      mockQueryOne
        .mockResolvedValueOnce({ value: 'pinhash' })          // pin_hash
        .mockResolvedValueOnce({ value: 'jwtsalt' })           // jwt_salt
        .mockResolvedValueOnce({ value: 'pbkdf2salt' })        // pbkdf2_salt
        .mockResolvedValueOnce({ value: 'wrappedciphertext' }) // shared_dek_wrapped
        .mockResolvedValueOnce({ value: 'wrappediv' })         // shared_dek_iv

      const result = await loginWithBiometrics()

      expect(result).toBe(true)
      expect(mockUnwrapSharedDEK).toHaveBeenCalledWith(
        { ciphertext: 'wrappedciphertext', iv: 'wrappediv' },
        'biometricdek'
      )
      expect(mockAttachDatabase).toHaveBeenCalledWith('shared', '/shared.db', 'mockunwrappedsharedkey')
      expect(mockAttachActiveWorkspace).toHaveBeenCalledWith('mockunwrappedsharedkey')
    })

    it('returns false when auth settings are not found', async () => {
      mockAuthenticateWithWebAuthn.mockResolvedValue('biometricdek')
      mockQueryOne.mockResolvedValue(null)

      const result = await loginWithBiometrics()
      expect(result).toBe(false)
    })
  })

  describe('enableBiometrics', () => {
    it('throws when there is no active PIN session', async () => {
      logout() // ensures the cached session DEK is cleared regardless of prior tests

      await expect(enableBiometrics()).rejects.toThrow('No active session — log in with PIN first')
    })

    it('registers a platform authenticator using the cached session DEK', async () => {
      await setupPin('mypin123') // caches sessionDEK = 'mockkey123'
      mockRegisterWebAuthn.mockResolvedValue(true)

      const result = await enableBiometrics()

      expect(result).toBe(true)
      expect(mockRegisterWebAuthn).toHaveBeenCalledWith('mockkey123')
    })

    it('returns false when registration fails', async () => {
      await setupPin('mypin123')
      mockRegisterWebAuthn.mockResolvedValue(false)

      const result = await enableBiometrics()
      expect(result).toBe(false)
    })
  })

  describe('disableBiometrics', () => {
    it('clears the stored webauthn credential', () => {
      disableBiometrics()

      expect(mockClearWebAuthnCredential).toHaveBeenCalled()
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

    it('clears the workspace session', async () => {
      await wipeAndReset()
      expect(mockClearWorkspaceSession).toHaveBeenCalled()
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

    it('returns false when refreshing the token throws', async () => {
      mockCreateSessionToken.mockRejectedValue(new Error('token error'))

      const result = await validateAndRefreshSession()
      expect(result).toBe(false)
    })
  })
})
