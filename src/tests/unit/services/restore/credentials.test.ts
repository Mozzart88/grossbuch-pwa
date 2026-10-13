import { expect, it } from 'vitest'
import { prepareRestoreCredentials } from '../../../../services/restore/credentials'
import { deriveEncryptionKey, hashPin, unwrapSharedDEK } from '../../../../services/auth/crypto'

it.each(['', '12345', '1234567890123', '12345a'])('rejects an invalid new PIN before creating restore credentials', async pin => {
  await expect(prepareRestoreCredentials(pin)).rejects.toThrow(/PIN/)
})
it('generates fresh independent keys and a usable PIN verifier and shared-key wrap', async () => {
  const first = await prepareRestoreCredentials('654321')
  const second = await prepareRestoreCredentials('654321')
  expect(first.appKey).not.toBe(second.appKey)
  expect(first.sharedKey).not.toBe(second.sharedKey)
  expect(first.salt).not.toBe(second.salt)
  expect(first.settings.jwt_salt).not.toBe(second.settings.jwt_salt)
  expect((await deriveEncryptionKey('654321', first.salt)).key).toBe(first.appKey)
  expect((await hashPin('654321', first.salt)).key).toBe(first.settings.pin_hash)
  expect(await unwrapSharedDEK({ ciphertext: first.settings.shared_dek_wrapped, iv: first.settings.shared_dek_iv }, first.appKey)).toBe(first.sharedKey)
})
