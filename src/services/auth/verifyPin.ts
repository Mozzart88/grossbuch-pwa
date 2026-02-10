import { AUTH_STORAGE_KEYS } from '../../types/auth'
import { hashPin } from './crypto'
import { queryOne } from '../database'

export async function verifyPin(pin: string): Promise<void> {
  const salt = localStorage.getItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)
  if (!salt) {
    throw new Error('No salt found. Database may be corrupted.')
  }

  const { key: pinHash } = await hashPin(pin, salt)

  const stored = await queryOne<{ value: string }>(
    `SELECT value FROM auth_settings WHERE key = 'pin_hash'`
  )
  if (!stored) {
    throw new Error('Auth settings not found')
  }

  if (pinHash !== stored.value) {
    throw new Error('Incorrect PIN')
  }
}
