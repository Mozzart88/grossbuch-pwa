import type { SessionToken, SignedToken } from '../../types/auth'
import { AUTH_STORAGE_KEYS } from '../../types/auth'
import { createHmacSignature, verifyHmacSignature } from './crypto'

// Session token TTL: 15 minutes
const TOKEN_TTL_MS = 15 * 60 * 1000

/**
 * Create a new session token
 */
export async function createSessionToken(jwtSalt: string): Promise<string> {
  const now = Date.now()
  const payload: SessionToken = {
    iat: now,
    exp: now + TOKEN_TTL_MS,
  }

  const payloadStr = JSON.stringify(payload)
  const signature = await createHmacSignature(payloadStr, jwtSalt)

  const signedToken: SignedToken = {
    payload,
    signature,
  }

  const tokenStr = btoa(JSON.stringify(signedToken))
  return tokenStr
}

/**
 * Parse and validate a session token
 * @returns The token payload if valid, null if invalid or expired
 */
export async function validateSessionToken(
  tokenStr: string,
  jwtSalt: string
): Promise<SessionToken | null> {
  try {
    const signedToken: SignedToken = JSON.parse(atob(tokenStr))
    const { payload, signature } = signedToken

    // Verify signature
    const payloadStr = JSON.stringify(payload)
    const isValid = await verifyHmacSignature(payloadStr, signature, jwtSalt)
    if (!isValid) {
      return null
    }

    // Check expiration
    if (Date.now() > payload.exp) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

/**
 * Store session token in sessionStorage
 */
export function storeSessionToken(token: string): void {
  sessionStorage.setItem(AUTH_STORAGE_KEYS.SESSION_TOKEN, token)
}

/**
 * Get session token from sessionStorage
 */
export function getStoredSessionToken(): string | null {
  return sessionStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)
}

/**
 * Clear session token from sessionStorage
 */
export function clearSessionToken(): void {
  sessionStorage.removeItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)
}

/**
 * Check if a valid session exists
 */
export async function hasValidSession(jwtSalt: string): Promise<boolean> {
  const token = getStoredSessionToken()
  if (!token) return false

  const payload = await validateSessionToken(token, jwtSalt)
  return payload !== null
}

/**
 * Refresh session token if still valid (extends TTL)
 */
export async function refreshSessionToken(jwtSalt: string): Promise<boolean> {
  const currentToken = getStoredSessionToken()
  if (!currentToken) return false

  const payload = await validateSessionToken(currentToken, jwtSalt)
  if (!payload) return false

  // Create new token with extended TTL
  const newToken = await createSessionToken(jwtSalt)
  storeSessionToken(newToken)
  return true
}
