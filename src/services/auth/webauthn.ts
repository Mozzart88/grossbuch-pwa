import type { WebAuthnCredentialData } from '../../types/auth'
import { AUTH_STORAGE_KEYS } from '../../types/auth'
import { hexToBytes, bytesToHex, arrayBufferToBase64Url, base64UrlToArrayBuffer } from './crypto'

const HKDF_INFO = new TextEncoder().encode('GrossBuh-KEK')
const HKDF_SALT = new Uint8Array(32) // 32 zero bytes

/**
 * Check if the platform has a user-verifying authenticator (Face ID, Touch ID, Windows Hello, etc.)
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/**
 * Check if a WebAuthn credential is stored in localStorage
 */
export function hasWebAuthnCredential(): boolean {
  return localStorage.getItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA) !== null
}

/**
 * Remove stored WebAuthn credential from localStorage
 */
export function clearWebAuthnCredential(): void {
  localStorage.removeItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA)
}

/**
 * Returns true if a previous registration attempt confirmed that PRF is not supported
 * on this platform/browser. Used to hide biometric UI rather than showing a confusing
 * "could not enable" error after Face ID / Touch ID succeeds but PRF is absent.
 */
export function isPRFKnownUnsupported(): boolean {
  return localStorage.getItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED) === '1'
}

/**
 * Clear the PRF-unsupported flag (called on wipe/reset so a fresh OS/browser install
 * or OS upgrade gets a clean check).
 */
export function clearPRFUnsupportedFlag(): void {
  localStorage.removeItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED)
}

/**
 * Derive a 256-bit AES-GCM Key Encryption Key (KEK) from a WebAuthn PRF output via HKDF-SHA256
 */
async function deriveKEK(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    'HKDF',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: HKDF_SALT,
      info: HKDF_INFO,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Register a platform authenticator and wrap the DEK with a PRF-derived KEK.
 * Returns true on success, false if PRF is unsupported or any error occurs.
 *
 * @param dekHex - hex-encoded database encryption key currently in use
 */
export async function registerWebAuthn(dekHex: string): Promise<boolean> {
  try {
    const prfSalt = crypto.getRandomValues(new Uint8Array(32))
    const challenge = crypto.getRandomValues(new Uint8Array(32))
    const userId = crypto.getRandomValues(new Uint8Array(16))

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'GrossBuh', id: window.location.hostname },
        user: {
          id: userId,
          name: 'user',
          displayName: 'GrossBuh User',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'required',
        },
        extensions: {
          prf: { eval: { first: prfSalt.buffer as ArrayBuffer } },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null

    if (!credential) return false

    const extensionResults = credential.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } }
    }
    const prfOutput = extensionResults.prf?.results?.first
    if (!prfOutput) {
      // PRF not supported on this platform — remember so we can hide biometric UI
      localStorage.setItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED, '1')
      return false
    }

    const kek = await deriveKEK(prfOutput)

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const wrappedDEK = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      kek,
      hexToBytes(dekHex) as BufferSource
    )

    const data: WebAuthnCredentialData = {
      credentialId: arrayBufferToBase64Url(credential.rawId),
      prfSalt: arrayBufferToBase64Url(prfSalt.buffer as ArrayBuffer),
      wrappedDEK: arrayBufferToBase64Url(wrappedDEK),
      iv: arrayBufferToBase64Url(iv.buffer as ArrayBuffer),
    }

    localStorage.setItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA, JSON.stringify(data))
    // PRF worked — clear any stale unsupported flag (e.g. after an OS upgrade)
    localStorage.removeItem(AUTH_STORAGE_KEYS.PRF_UNSUPPORTED)
    return true
  } catch {
    return false
  }
}

/**
 * Authenticate with the stored platform authenticator and unwrap the DEK.
 * Returns the hex-encoded DEK on success, null on any failure (cancelled, expired, PRF absent, etc.)
 */
export async function authenticateWithWebAuthn(): Promise<string | null> {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA)
    if (!stored) return null

    const data: WebAuthnCredentialData = JSON.parse(stored)
    const credentialId = base64UrlToArrayBuffer(data.credentialId)
    const prfSalt = base64UrlToArrayBuffer(data.prfSalt)

    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: credentialId }],
        userVerification: 'required',
        extensions: {
          prf: { eval: { first: prfSalt } },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null

    if (!credential) return null

    const extensionResults = credential.getClientExtensionResults() as {
      prf?: { results?: { first?: ArrayBuffer } }
    }
    const prfOutput = extensionResults.prf?.results?.first
    if (!prfOutput) return null

    const kek = await deriveKEK(prfOutput)

    const iv = base64UrlToArrayBuffer(data.iv)
    const wrappedDEK = base64UrlToArrayBuffer(data.wrappedDEK)

    const dekBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      kek,
      wrappedDEK
    )
    return bytesToHex(new Uint8Array(dekBytes))
  } catch {
    return null
  }
}
