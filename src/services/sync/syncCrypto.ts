import {
  arrayBufferToBase64Url,
  base64UrlToArrayBuffer,
  rsaEncrypt,
  rsaDecrypt,
} from '../auth/crypto'
import type { SyncPackage, EncryptedSyncPackage, EncryptedRecipientKey } from './syncTypes'

const AES_KEY_LENGTH = 256
const AES_IV_LENGTH = 12 // 96 bits for GCM

async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    true, // extractable for RSA wrapping
    ['encrypt', 'decrypt']
  )
}

async function aesEncrypt(
  plaintext: ArrayBuffer,
  key: CryptoKey
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext
  )
  return { ciphertext, iv }
}

async function aesDecrypt(
  ciphertext: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext
  )
}

/**
 * Encrypt a SyncPackage for multiple recipients using hybrid RSA+AES encryption.
 * AES-256-GCM encrypts the data, RSA-OAEP encrypts the AES key per recipient.
 */
export async function encryptSyncPackage(
  pkg: SyncPackage,
  recipientPublicKeys: Array<{ installation_id: string; public_key: string }>
): Promise<EncryptedSyncPackage> {
  const aesKey = await generateAESKey()

  // Serialize and encrypt the package
  const plaintext = new TextEncoder().encode(JSON.stringify(pkg, (_, v) => {
    if (typeof v === 'bigint') {
      return v.toString()
    }
    return v
  }))
  const { ciphertext, iv } = await aesEncrypt(plaintext.buffer as ArrayBuffer, aesKey)

  // Export AES key for RSA wrapping
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey)

  // Encrypt AES key for each recipient
  const recipientKeys: EncryptedRecipientKey[] = await Promise.all(
    recipientPublicKeys.map(async ({ installation_id, public_key }) => {
      const encryptedKey = await rsaEncrypt(rawAesKey, public_key)
      return {
        installation_id,
        encrypted_key: arrayBufferToBase64Url(encryptedKey),
      }
    })
  )

  return {
    sender_id: pkg.sender_id,
    iv: arrayBufferToBase64Url(iv.buffer as ArrayBuffer),
    ciphertext: arrayBufferToBase64Url(ciphertext),
    recipient_keys: recipientKeys,
  }
}

/**
 * Decrypt an incoming EncryptedSyncPackage using this device's private key.
 */
export async function decryptSyncPackage(
  encrypted: EncryptedSyncPackage,
  installationId: string,
  privateKeyBase64Url: string
): Promise<SyncPackage> {
  // Find our encrypted AES key
  const recipientKey = encrypted.recipient_keys.find(
    (rk) => rk.installation_id === installationId
  )
  if (!recipientKey) {
    throw new Error('No encrypted key found for this installation')
  }

  // RSA decrypt the AES key
  const encryptedAesKey = base64UrlToArrayBuffer(recipientKey.encrypted_key)
  const rawAesKey = await rsaDecrypt(encryptedAesKey, privateKeyBase64Url)

  // Import AES key
  const aesKey = await crypto.subtle.importKey(
    'raw',
    rawAesKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['decrypt']
  )

  // AES decrypt the payload
  const iv = new Uint8Array(base64UrlToArrayBuffer(encrypted.iv))
  const ciphertext = base64UrlToArrayBuffer(encrypted.ciphertext)
  const plaintext = await aesDecrypt(ciphertext, aesKey, iv)

  // Parse JSON
  const json = new TextDecoder().decode(plaintext)
  return JSON.parse(json) as SyncPackage
}
