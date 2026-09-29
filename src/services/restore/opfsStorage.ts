import { AUTH_STORAGE_KEYS } from '../../types/auth'
import type { RestoreStorage } from './journal'

export async function opfsRestoreStorage(): Promise<RestoreStorage> {
  const root = await navigator.storage.getDirectory()
  return {
    async read(name) {
      try { return new Uint8Array(await (await (await root.getFileHandle(name)).getFile()).arrayBuffer()) }
      catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return null; throw error }
    },
    async write(name, bytes) {
      const writer = await (await root.getFileHandle(name, { create: true })).createWritable()
      try { await writer.write(bytes as FileSystemWriteChunkType); await writer.close() }
      catch (error) { await writer.abort().catch(() => {}); throw error }
    },
    async remove(name) {
      try { await root.removeEntry(name) }
      catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error }
    },
    async list() { const names = []; for await (const [name] of root.entries()) names.push(name); return names },
    getSalt: () => localStorage.getItem(AUTH_STORAGE_KEYS.PBKDF2_SALT),
    setSalt(salt) {
      if (salt === null) localStorage.removeItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)
      else localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, salt)
    },
    getBiometric: () => localStorage.getItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA),
    setBiometric(value) {
      if (value === null) localStorage.removeItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA)
      else localStorage.setItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA, value)
    },
    clearCredentials() {
      localStorage.removeItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)
      localStorage.removeItem(AUTH_STORAGE_KEYS.WEBAUTHN_DATA)
    },
  }
}
