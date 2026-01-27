import type { DerivedKey } from '../../types/auth'

// PBKDF2 parameters
const PBKDF2_ITERATIONS = 100000
const KEY_LENGTH = 256 // bits
const SALT_LENGTH = 16 // bytes

/**
 * Generate cryptographically secure random bytes
 */
export function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

/**
 * Convert byte array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Convert hex string to byte array
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

/**
 * Derive an encryption key from a PIN using PBKDF2
 * @param pin - The user's PIN
 * @param saltHex - Optional hex-encoded salt. If not provided, generates new salt
 * @returns Object containing hex-encoded key and salt
 */
export async function deriveEncryptionKey(
  pin: string,
  saltHex?: string
): Promise<DerivedKey> {
  const saltBytes = saltHex ? hexToBytes(saltHex) : generateRandomBytes(SALT_LENGTH)

  // Import PIN as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  // Derive key bits using PBKDF2
  const keyBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH
  )

  return {
    key: bytesToHex(new Uint8Array(keyBits)),
    salt: bytesToHex(saltBytes),
  }
}

/**
 * Generate a hash of the PIN for verification purposes
 * Uses different salt than encryption key to avoid key derivation from hash
 */
export async function hashPin(pin: string, saltHex?: string): Promise<DerivedKey> {
  // Use different iteration count for hash to make it distinct from encryption key
  const saltBytes = saltHex ? hexToBytes(saltHex) : generateRandomBytes(SALT_LENGTH)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const hashBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: PBKDF2_ITERATIONS + 1, // Slightly different to ensure different output
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH
  )

  return {
    key: bytesToHex(new Uint8Array(hashBits)),
    salt: bytesToHex(saltBytes),
  }
}

/**
 * Generate a random salt for JWT signing
 */
export function generateJwtSalt(): string {
  return bytesToHex(generateRandomBytes(32))
}

/**
 * Create HMAC-SHA256 signature
 */
export async function createHmacSignature(
  data: string,
  secretHex: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(secretHex) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data)
  )

  return bytesToHex(new Uint8Array(signature))
}

/**
 * Verify HMAC-SHA256 signature
 */
export async function verifyHmacSignature(
  data: string,
  signatureHex: string,
  secretHex: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(secretHex) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  return crypto.subtle.verify(
    'HMAC',
    key,
    hexToBytes(signatureHex) as BufferSource,
    new TextEncoder().encode(data)
  )
}
