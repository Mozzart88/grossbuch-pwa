import type { AuthSettings } from '../../types/auth'
import { AUTH_STORAGE_KEYS } from '../../types/auth'
import {
  deriveEncryptionKey,
  hashPin,
  generateJwtSalt,
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
} from '../database/connection'
import { runMigrations } from '../database/migrations'

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
      `SELECT value FROM auth_settings WHERE key = 'pin_hash'`
    )
    const jwtSalt = await queryOne<{ value: string }>(
      `SELECT value FROM auth_settings WHERE key = 'jwt_salt'`
    )
    const pbkdf2Salt = await queryOne<{ value: string }>(
      `SELECT value FROM auth_settings WHERE key = 'pbkdf2_salt'`
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
    `INSERT OR REPLACE INTO auth_settings (key, value, updated_at) VALUES ('pin_hash', ?, ?)`,
    [settings.pin_hash, now]
  )
  await execSQL(
    `INSERT OR REPLACE INTO auth_settings (key, value, updated_at) VALUES ('jwt_salt', ?, ?)`,
    [settings.jwt_salt, now]
  )
  await execSQL(
    `INSERT OR REPLACE INTO auth_settings (key, value, updated_at) VALUES ('pbkdf2_salt', ?, ?)`,
    [settings.pbkdf2_salt, now]
  )
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

  // Check if auth_settings table exists, run migrations if needed
  if (await queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='auth_settings'"
  ) === null) {
    await runMigrations()
  }

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

  // Run migrations to create tables
  await runMigrations()

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

    // Run migrations in case there are new ones
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

    // Create session token
    const sessionToken = await createSessionToken(settings.jwt_salt)
    storeSessionToken(sessionToken)

    return true
  } catch {
    // Invalid key - wrong PIN
    return false
  }
}

/**
 * Logout - clear session token
 */
export function logout(): void {
  clearSessionToken()
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

  try {
    // Rekey the database
    await rekeyDatabase(oldKey, newKey)

    // Update auth settings in database
    await saveAuthSettings({
      pin_hash: newPinHash,
      jwt_salt: newJwtSalt,
      pbkdf2_salt: newSalt,
    })

    // Update localStorage salt
    storeSalt(newSalt)

    // Clear old session and create new one
    clearSessionToken()
    const sessionToken = await createSessionToken(newJwtSalt)
    storeSessionToken(sessionToken)

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

  // Delete database file
  await wipeDatabase()
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
