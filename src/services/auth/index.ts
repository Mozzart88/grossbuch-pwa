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
} from './authService'

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
