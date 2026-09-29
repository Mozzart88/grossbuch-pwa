import { deriveEncryptionKey, generateDEK, generateJwtSalt, hashPin, wrapSharedDEK } from '../auth/crypto'
import type { RestoreCredentials } from './types'
export async function prepareRestoreCredentials(pin: string): Promise<RestoreCredentials> {
  if (!/^\d{6,12}$/.test(pin)) throw new Error('Choose a PIN of 6 to 12 digits')
  const { key: appKey, salt } = await deriveEncryptionKey(pin)
  const sharedKey = generateDEK()
  const wrapped = await wrapSharedDEK(sharedKey, appKey)
  return { appKey, sharedKey, salt, settings: {
    pbkdf2_salt: salt, pin_hash: (await hashPin(pin, salt)).key, jwt_salt: generateJwtSalt(),
    shared_dek_wrapped: wrapped.ciphertext, shared_dek_iv: wrapped.iv,
  } }
}
