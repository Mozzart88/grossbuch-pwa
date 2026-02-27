// Auth status states
export type AuthStatus =
  | 'checking'        // Initial state, checking if DB exists
  | 'first_time_setup' // No DB exists, user needs to create PIN
  | 'needs_migration' // DB exists but is unencrypted, needs migration
  | 'needs_auth'      // DB exists but no valid session
  | 'authenticated'   // Valid session, can access app
  | 'auth_failed'     // PIN validation failed

// Auth state interface
export interface AuthState {
  status: AuthStatus
  failedAttempts: number
  error: string | null
}

// Session token payload (JWT-like)
export interface SessionToken {
  iat: number  // Issued at (Unix timestamp)
  exp: number  // Expires at (Unix timestamp) - 15 min TTL
}

// Session token with signature
export interface SignedToken {
  payload: SessionToken
  signature: string
}

// Key derivation result
export interface DerivedKey {
  key: string      // Hex-encoded encryption key
  salt: string     // Hex-encoded PBKDF2 salt
}

// Auth settings stored in database
export interface AuthSettings {
  pin_hash: string      // PBKDF2 hash of PIN for verification
  jwt_salt: string      // Salt for JWT token signing
  pbkdf2_salt: string   // Salt for PBKDF2 key derivation
  public_key?: string   // base64url-encoded RSA public key (SPKI)
  private_key?: string  // base64url-encoded RSA private key (PKCS8)
}

// RSA key pair for asymmetric encryption
export interface KeyPair {
  publicKey: string   // base64url-encoded SPKI
  privateKey: string  // base64url-encoded PKCS8
}

// WebAuthn credential data stored in localStorage
export interface WebAuthnCredentialData {
  credentialId: string  // base64url credential ID
  prfSalt: string       // base64url 32-byte PRF input (deterministic)
  wrappedDEK: string    // base64url AES-GCM ciphertext of DEK bytes
  iv: string            // base64url 12-byte GCM IV
}

// Storage keys
export const AUTH_STORAGE_KEYS = {
  PBKDF2_SALT: 'gb_pbkdf2_salt',
  SESSION_TOKEN: 'gb_session_token',
  SHARED_UUID: 'gb_shared_uuid',
  SHARED_PUBLIC_KEY: 'gb_shared_public_key',
  WEBAUTHN_DATA: 'gb_webauthn_data',
  PRF_UNSUPPORTED: 'gb_prf_unsupported',
} as const
