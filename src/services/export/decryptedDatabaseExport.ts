import { verifyPin } from '../auth/verifyPin'
import { deriveEncryptionKey } from '../auth/crypto'
import { AUTH_STORAGE_KEYS } from '../../types/auth'
import { getSessionDekShared } from '../database/workspace'
import { getExportSession, exportDecryptedDatabase as exportSource, queryOne } from '../database/connection'
import { MAIN_DB_FILENAME, SHARED_DB_FILENAME, LEGACY_DB_FILENAME } from '../database/paths'
import type { DecryptedExportSource } from '../database/decryptedExportTypes'

function resolveSource(filename: string): DecryptedExportSource {
  if (filename === MAIN_DB_FILENAME.slice(1)) return { kind: 'main' }
  if (filename === SHARED_DB_FILENAME.slice(1)) return { kind: 'shared' }
  if (filename === LEGACY_DB_FILENAME.slice(1)) return { kind: 'legacy' }
  const match = /^workspace-([1-9]\d*)\.db$/.exec(filename)
  if (match && Number.isSafeInteger(Number(match[1]))) {
    return { kind: 'workspace', workspaceId: Number(match[1]) }
  }
  throw new Error('Unsupported database file. Select a canonical database or registered workspace.')
}

/** PIN-confirmed local diagnostic export; never persist or log its keys. */
export async function exportDecryptedDatabase(filename: string, pin: string): Promise<ArrayBuffer> {
  const session = await getExportSession()
  await verifyPin(pin)
  const sharedKey = getSessionDekShared()
  if (!sharedKey) throw new Error('No active session. Unlock the application and try again.')
  const source = resolveSource(filename)
  if (source.kind === 'workspace' && !await queryOne(
    'SELECT id FROM shared.workspace WHERE id = ?', [source.workspaceId]
  )) {
    throw new Error('Workspace is not registered.')
  }
  const root = await navigator.storage.getDirectory()
  try {
    await root.getFileHandle(filename)
  } catch {
    throw new Error('Database file not found or unavailable.')
  }
  let key = sharedKey
  if (source.kind === 'main' || source.kind === 'legacy') {
    const salt = localStorage.getItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)
    if (!salt) throw new Error('Encryption salt not found')
    key = (await deriveEncryptionKey(pin, salt)).key
  }
  const assertSession = () => {
    if (getSessionDekShared() !== sharedKey) {
      throw new Error('The session changed. Unlock the application and try again.')
    }
  }
  assertSession()
  const bytes = await exportSource({ source, key, session })
  assertSession()
  return bytes
}
