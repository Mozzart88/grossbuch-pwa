export {
  isDatabaseSetup,
  needsMigration,
  migrateDatabase,
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
} from './authService'

export {
  isPlatformAuthenticatorAvailable,
  hasWebAuthnCredential,
  clearWebAuthnCredential,
  isPRFKnownUnsupported,
  clearPRFUnsupportedFlag,
} from './webauthn'

export {
  deriveEncryptionKey,
  hashPin,
  generateJwtSalt,
  bytesToHex,
  hexToBytes,
  generateRandomBytes,
} from './crypto'

export {
  createSessionToken,
  validateSessionToken,
  storeSessionToken,
  getStoredSessionToken,
  clearSessionToken,
  hasValidSession as hasValidSessionToken,
  refreshSessionToken,
} from './sessionToken'

export { verifyPin } from './verifyPin'
