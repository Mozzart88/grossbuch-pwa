import type { AuthSettings } from '../../types/auth'
import { AUTH_STORAGE_KEYS } from '../../types/auth'
import {
  deriveEncryptionKey,
  hashPin,
  generateJwtSalt,
  generateRSAKeyPair,
  generateDEK,
  wrapSharedDEK,
  unwrapSharedDEK,
  type WrappedSharedKey,
} from './crypto'
import {
  createSessionToken,
  validateSessionToken,
  storeSessionToken,
  getStoredSessionToken,
  clearSessionToken,
} from './sessionToken'
import {
  checkDatabaseExists,
  checkIsEncrypted,
  initEncryptedDatabase,
  migrateToEncrypted,
  rekeyDatabase,
  wipeDatabase,
  execSQL,
  queryOne,
  attachDatabase,
  rekeySchema,
  deleteFile,
} from '../database/connection'
import { SHARED_DB_FILENAME, workspaceDbFilename } from '../database/paths'
import { runMigrations } from '../database/migrations'
import { runSharedMigrations } from '../database/sharedMigrations'
import { attachActiveWorkspace, setSessionDekShared, clearWorkspaceSession, getActiveWorkspaceId } from '../database/workspace'
import { needsLegacyMigration, migrateLegacyInstallation } from '../database/legacyMigration'
import {
  authenticateWithWebAuthn,
  registerWebAuthn,
  clearWebAuthnCredential,
  clearPRFUnsupportedFlag,
} from './webauthn'

/**
 * Module-level DEK cache — set after PIN login/setup, cleared on logout/wipe.
 * Used by enableBiometrics() to wrap the DEK without re-deriving it.
 */
let sessionDEK: string | null = null

/**
 * Get PBKDF2 salt from localStorage
 */
function getStoredSalt(): string | null {
  return localStorage.getItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)
}

/**
 * Store PBKDF2 salt in localStorage
 */
function storeSalt(salt: string): void {
  localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, salt)
}

/**
 * Clear PBKDF2 salt from localStorage
 */
function clearStoredSalt(): void {
  localStorage.removeItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)
}

/**
 * Get auth settings from database
 */
async function getAuthSettings(): Promise<AuthSettings | null> {
  try {
    const pinHash = await queryOne<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = 'pin_hash'`
    )
    const jwtSalt = await queryOne<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = 'jwt_salt'`
    )
    const pbkdf2Salt = await queryOne<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = 'pbkdf2_salt'`
    )

    if (!pinHash || !jwtSalt || !pbkdf2Salt) {
      return null
    }

    return {
      pin_hash: pinHash.value,
      jwt_salt: jwtSalt.value,
      pbkdf2_salt: pbkdf2Salt.value,
    }
  } catch {
    return null
  }
}

/**
 * Save auth settings to database
 */
async function saveAuthSettings(settings: AuthSettings): Promise<void> {
  const now = Math.floor(Date.now() / 1000)

  await execSQL(
    `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('pin_hash', ?, ?)`,
    [settings.pin_hash, now]
  )
  await execSQL(
    `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('jwt_salt', ?, ?)`,
    [settings.jwt_salt, now]
  )
  await execSQL(
    `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('pbkdf2_salt', ?, ?)`,
    [settings.pbkdf2_salt, now]
  )
}

/**
 * Save RSA key pair to app_settings
 */
async function saveKeyPair(publicKey: string, privateKey: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await execSQL(
    `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('public_key', ?, ?)`,
    [publicKey, now]
  )
  await execSQL(
    `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('private_key', ?, ?)`,
    [privateKey, now]
  )
}

/**
 * Get the wrapped DEK_shared from app_settings, or null if not yet created
 */
async function getWrappedSharedDEK(): Promise<WrappedSharedKey | null> {
  const ciphertext = await queryOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'shared_dek_wrapped'`
  )
  const iv = await queryOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'shared_dek_iv'`
  )
  if (!ciphertext || !iv) return null
  return { ciphertext: ciphertext.value, iv: iv.value }
}

/**
 * Persist the wrapped DEK_shared in app_settings
 */
async function saveWrappedSharedDEK(wrapped: WrappedSharedKey): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await execSQL(
    `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('shared_dek_wrapped', ?, ?)`,
    [wrapped.ciphertext, now]
  )
  await execSQL(
    `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('shared_dek_iv', ?, ?)`,
    [wrapped.iv, now]
  )
}

/**
 * Unwrap DEK_shared using the given DEK_app and attach the Shared DB.
 * If no wrapped DEK_shared exists yet (e.g. first unlock after this feature
 * shipped), generates one, wraps it, attaches, and creates the shared schema.
 * If this installation still has its financial/shared data sitting in `main`
 * (pre-split topology), runs the one-time legacy migration to move it into
 * `shared`/`workspace` once both are attached.
 */
async function unwrapAndAttachSharedDatabase(dekApp: string): Promise<void> {
  const wrapped = await getWrappedSharedDEK()
  let dekShared: string

  if (!wrapped) {
    dekShared = generateDEK()
    await saveWrappedSharedDEK(await wrapSharedDEK(dekShared, dekApp))
  } else {
    dekShared = await unwrapSharedDEK(wrapped, dekApp)
  }

  // Checked before attaching: while `main` is still below TOPOLOGY_VERSION,
  // nothing legitimate can have written to `shared`/the default workspace
  // yet (the app never switches over to them as the live topology until
  // migrateLegacyInstallation() flips topology_version, at the very end of
  // its temp-build-and-swap). A pre-existing file here can only be a
  // leftover from an earlier attempt that crashed between that migration's
  // SQL commit and its (non-transactional) file swap — delete and rebuild
  // from scratch rather than risk resuming into duplicate-key failures (see
  // design.md's "Retried migration deletes and rebuilds shared/workspace"
  // decision). A freshly (re)created shared.db always seeds its one default
  // workspace as id 1 (AUTOINCREMENT on an empty table), so workspace-1 is
  // the only file that can possibly hold partial data at this point.
  const pendingLegacyMigration = await needsLegacyMigration()
  if (pendingLegacyMigration) {
    await deleteFile(SHARED_DB_FILENAME)
    await deleteFile(workspaceDbFilename(1))
  }

  await attachDatabase('shared', SHARED_DB_FILENAME, dekShared)
  await runSharedMigrations()

  await attachActiveWorkspace(dekShared)

  if (pendingLegacyMigration) {
    const activeWorkspaceId = getActiveWorkspaceId()
    if (activeWorkspaceId === null) throw new Error('No active workspace after attach')
    await migrateLegacyInstallation(activeWorkspaceId, dekApp, dekShared)
  }
}

/**
 * Get public key from app_settings
 */
export async function getPublicKey(): Promise<string | null> {
  try {
    const row = await queryOne<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = 'public_key'`
    )
    return row?.value ?? null
  } catch {
    return null
  }
}

/**
 * Check if database exists (for determining first-time setup vs login)
 */
export async function isDatabaseSetup(): Promise<boolean> {
  return checkDatabaseExists()
}

/**
 * Check if database needs migration (exists but is unencrypted)
 */
export async function needsMigration(): Promise<boolean> {
  const dbExists = await checkDatabaseExists()
  if (!dbExists) return false

  const isEncrypted = await checkIsEncrypted()
  return !isEncrypted
}

/**
 * Migrate an unencrypted database to encrypted with PIN
 */
export async function migrateDatabase(pin: string): Promise<void> {
  // Generate encryption key from PIN
  const { key: encryptionKey, salt: pbkdf2Salt } = await deriveEncryptionKey(pin)

  // Store salt in localStorage (needed for future logins)
  storeSalt(pbkdf2Salt)

  // Perform migration using sqlcipher_export
  await migrateToEncrypted(encryptionKey)

  // Initialize the newly encrypted database
  await initEncryptedDatabase(encryptionKey)

  // Check if app_settings table exists, run migrations if needed
  if (await queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'"
  ) === null) {
    await runMigrations()
  }

  // Generate DEK_shared, wrap it under DEK_app, and attach the Shared DB
  await unwrapAndAttachSharedDatabase(encryptionKey)

  // Generate PIN hash for verification (with same salt for simplicity)
  const { key: pinHash } = await hashPin(pin, pbkdf2Salt)

  // Generate JWT salt for session tokens
  const jwtSalt = generateJwtSalt()

  // Save auth settings to database
  await saveAuthSettings({
    pin_hash: pinHash,
    jwt_salt: jwtSalt,
    pbkdf2_salt: pbkdf2Salt,
  })

  // Create session token
  const sessionToken = await createSessionToken(jwtSalt)
  storeSessionToken(sessionToken)
}

/**
 * Check if there's a valid session token
 */
export async function hasValidSession(): Promise<boolean> {
  const token = getStoredSessionToken()
  if (!token) return false

  const salt = getStoredSalt()
  if (!salt) return false

  // We need to get the JWT salt from the database to validate the token
  // But we can't access the database without the encryption key
  // So we just check if the token exists and hasn't expired (basic check)
  try {
    const decoded = JSON.parse(atob(token))
    const exp = decoded.payload?.exp
    if (exp && Date.now() < exp) {
      return true
    }
  } catch {
    // Invalid token format
  }

  return false
}

/**
 * First-time PIN setup - creates encrypted database
 */
export async function setupPin(pin: string): Promise<void> {
  // Generate encryption key from PIN
  const { key: encryptionKey, salt: pbkdf2Salt } = await deriveEncryptionKey(pin)

  // Generate PIN hash for verification (with same salt for simplicity)
  const { key: pinHash } = await hashPin(pin, pbkdf2Salt)

  // Generate JWT salt for session tokens
  const jwtSalt = generateJwtSalt()

  // Store salt in localStorage (needed for future logins)
  storeSalt(pbkdf2Salt)

  // Initialize encrypted database
  await initEncryptedDatabase(encryptionKey)

  // Run migrations to create tables (includes currency seeding in v4)
  await runMigrations()

  // Generate DEK_shared, wrap it under DEK_app, and attach the Shared DB
  await unwrapAndAttachSharedDatabase(encryptionKey)

  // Save auth settings to database
  await saveAuthSettings({
    pin_hash: pinHash,
    jwt_salt: jwtSalt,
    pbkdf2_salt: pbkdf2Salt,
  })

  // Generate and save RSA key pair
  const keyPair = await generateRSAKeyPair()
  await saveKeyPair(keyPair.publicKey, keyPair.privateKey)

  // Create session token
  const sessionToken = await createSessionToken(jwtSalt)
  storeSessionToken(sessionToken)

  // Cache DEK for potential biometric enrollment
  sessionDEK = encryptionKey
}

/**
 * Login with PIN
 * @returns true if login successful, false if PIN incorrect
 */
export async function login(pin: string): Promise<boolean> {
  // Get stored salt
  const storedSalt = getStoredSalt()
  if (!storedSalt) {
    throw new Error('No salt found. Database may be corrupted.')
  }

  // Derive encryption key from PIN
  const { key: encryptionKey } = await deriveEncryptionKey(pin, storedSalt)

  try {
    // Try to open database with encryption key
    await initEncryptedDatabase(encryptionKey)

    // Run migrations in case there are new ones (includes currency seeding in v4)
    await runMigrations()

    // Get auth settings and verify PIN hash
    const settings = await getAuthSettings()
    if (!settings) {
      throw new Error('Auth settings not found in database')
    }

    // Verify PIN hash
    const { key: pinHash } = await hashPin(pin, storedSalt)
    if (pinHash !== settings.pin_hash) {
      throw new Error('PIN verification failed')
    }

    // Unwrap (or create) DEK_shared and attach the Shared DB
    await unwrapAndAttachSharedDatabase(encryptionKey)

    // Generate key pair if not present (for existing installations)
    const existingPublicKey = await getPublicKey()
    if (!existingPublicKey) {
      const keyPair = await generateRSAKeyPair()
      await saveKeyPair(keyPair.publicKey, keyPair.privateKey)
    }

    // Create session token
    const sessionToken = await createSessionToken(settings.jwt_salt)
    storeSessionToken(sessionToken)

    // Cache DEK for potential biometric enrollment
    sessionDEK = encryptionKey

    return true
  } catch (error) {
    // Could be a genuinely wrong PIN, but could also be a downstream failure
    // (e.g. legacy migration hitting SQLITE_CONSTRAINT_FOREIGNKEY) — log so
    // the two are distinguishable in the console instead of looking identical.
    console.error('Login failed:', error)
    return false
  }
}

/**
 * Logout - clear session token and DEK cache
 */
export function logout(): void {
  clearSessionToken()
  sessionDEK = null
  clearWorkspaceSession()
}

/**
 * Change PIN
 * @returns true if successful, false if old PIN is incorrect
 */
export async function changePin(oldPin: string, newPin: string): Promise<boolean> {
  const storedSalt = getStoredSalt()
  if (!storedSalt) {
    throw new Error('No salt found. Database may be corrupted.')
  }

  // Derive old encryption key
  const { key: oldKey } = await deriveEncryptionKey(oldPin, storedSalt)

  // Generate new encryption key and salt
  const { key: newKey, salt: newSalt } = await deriveEncryptionKey(newPin)

  // Generate new PIN hash
  const { key: newPinHash } = await hashPin(newPin, newSalt)

  // Generate new JWT salt
  const newJwtSalt = generateJwtSalt()

  // Generate a fresh DEK_shared — the Shared DB is physically rekeyed below
  const newDekShared = generateDEK()

  try {
    // Rekey the App DB
    await rekeyDatabase(oldKey, newKey)

    // Physically rekey the attached Shared DB to the freshly generated key
    await rekeySchema('shared', newDekShared)

    // Workspace files share DEK_shared (see design.md) — rekey the attached one too
    await rekeySchema('workspace', newDekShared)
    setSessionDekShared(newDekShared)

    // Update auth settings in database
    await saveAuthSettings({
      pin_hash: newPinHash,
      jwt_salt: newJwtSalt,
      pbkdf2_salt: newSalt,
    })

    // Re-wrap DEK_shared under the new DEK_app
    await saveWrappedSharedDEK(await wrapSharedDEK(newDekShared, newKey))

    // Update localStorage salt
    storeSalt(newSalt)

    // Clear old session and create new one
    clearSessionToken()
    const sessionToken = await createSessionToken(newJwtSalt)
    storeSessionToken(sessionToken)

    // DEK changed — old wrapped DEK is invalid; clear biometric credential
    clearWebAuthnCredential()
    sessionDEK = newKey

    return true
  } catch {
    return false
  }
}

/**
 * Wipe all data and reset - for "forgot PIN" flow
 */
export async function wipeAndReset(): Promise<void> {
  // Clear session token
  clearSessionToken()

  // Clear stored salt
  clearStoredSalt()

  // Clear biometric credential and PRF flag so next install gets a fresh check
  clearWebAuthnCredential()
  clearPRFUnsupportedFlag()
  sessionDEK = null
  clearWorkspaceSession()

  // Delete database file
  await wipeDatabase()
}

/**
 * Login using a stored WebAuthn credential (biometric unlock).
 * Returns true on success, false if no credential stored or authentication fails.
 */
export async function loginWithBiometrics(): Promise<boolean> {
  const dek = await authenticateWithWebAuthn()
  if (!dek) return false

  await initEncryptedDatabase(dek)
  await runMigrations()

  const settings = await getAuthSettings()
  if (!settings) return false

  await unwrapAndAttachSharedDatabase(dek)

  const sessionToken = await createSessionToken(settings.jwt_salt)
  storeSessionToken(sessionToken)

  sessionDEK = dek
  return true
}

/**
 * Enable biometric unlock by registering a platform authenticator and wrapping the current DEK.
 * Requires an active PIN session (sessionDEK must be set).
 * Returns true on success, false if PRF unsupported or registration fails.
 */
export async function enableBiometrics(): Promise<boolean> {
  if (!sessionDEK) throw new Error('No active session — log in with PIN first')
  return registerWebAuthn(sessionDEK)
}

/**
 * Disable biometric unlock by removing the stored credential.
 */
export function disableBiometrics(): void {
  clearWebAuthnCredential()
}

/**
 * Validate current session and refresh if valid
 */
export async function validateAndRefreshSession(): Promise<boolean> {
  const token = getStoredSessionToken()
  if (!token) return false

  try {
    // Get auth settings (requires database to be open)
    const settings = await getAuthSettings()
    if (!settings) return false

    // Validate token
    const payload = await validateSessionToken(token, settings.jwt_salt)
    if (!payload) return false

    // Refresh token
    const newToken = await createSessionToken(settings.jwt_salt)
    storeSessionToken(newToken)

    return true
  } catch {
    return false
  }
}
