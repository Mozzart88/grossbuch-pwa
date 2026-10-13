import { afterEach, expect, it, vi } from 'vitest'
import { opfsRestoreStorage } from '../../../../services/restore/opfsStorage'
import { AUTH_STORAGE_KEYS } from '../../../../types/auth'

afterEach(() => vi.unstubAllGlobals())

// Emulate the browser boundary: only close publishes a pending write.
function filesystem() {
  const files = new Map<string, Uint8Array>()
  let failure: 'write' | 'close' | 'abort' | undefined
  let aborted = false
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({
    async getFileHandle(name: string, options?: { create: boolean }) {
      if (!files.has(name) && !options?.create) throw new DOMException('Missing', 'NotFoundError')
      return {
        getFile: async () => ({ arrayBuffer: async () => files.get(name)!.slice().buffer }),
        createWritable: async () => {
          let pending: Uint8Array
          return {
            async write(value: Uint8Array) {
              if (failure === 'write' || failure === 'abort') throw new Error('write failed')
              pending = value.slice()
            },
            async close() {
              if (failure === 'close') throw new Error('close failed')
              files.set(name, pending)
            },
            async abort() { aborted = true; if (failure === 'abort') throw new Error('abort failed') },
          }
        },
      }
    },
    async removeEntry(name: string) {
      if (!files.delete(name)) throw new DOMException('Missing', 'NotFoundError')
    },
    async *entries() { for (const name of files.keys()) yield [name, {}] },
  }) } })
  return { files, fail: (value: typeof failure) => { failure = value }, aborted: () => aborted }
}

it('round-trips binary backups and treats absent files as absent on read and removal', async () => {
  filesystem()
  const storage = await opfsRestoreStorage()
  expect(await storage.read('backup')).toBeNull()
  await storage.remove('backup')
  await storage.write('backup', new Uint8Array([0, 255, 12]))
  expect(await storage.read('backup')).toEqual(new Uint8Array([0, 255, 12]))
  expect(await storage.list()).toEqual(['backup'])
  await storage.remove('backup')
  expect(await storage.list()).toEqual([])
})

it.each(['write', 'close', 'abort'] as const)('aborts an unsuccessful %s without publishing a partial backup', async failure => {
  const fs = filesystem()
  fs.files.set('backup', new Uint8Array([7]))
  fs.fail(failure)
  const storage = await opfsRestoreStorage()
  await expect(storage.write('backup', new Uint8Array([9]))).rejects.toThrow(failure === 'close' ? 'close failed' : 'write failed')
  expect(fs.aborted()).toBe(true)
  expect(await storage.read('backup')).toEqual(new Uint8Array([7]))
})

it.each([new DOMException('Denied', 'NotAllowedError'), new Error('storage offline')])('propagates storage errors instead of treating unreadable backups as absent', async error => {
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({
    getFileHandle: async () => { throw error },
    removeEntry: async () => { throw error },
  }) } })
  const storage = await opfsRestoreStorage()
  await expect(storage.read('backup')).rejects.toBe(error)
  await expect(storage.remove('backup')).rejects.toBe(error)
})

it('restores and clears credential metadata without erasing unrelated preferences', async () => {
  filesystem()
  const storage = await opfsRestoreStorage()
  localStorage.setItem('theme', 'dark')
  localStorage.setItem(AUTH_STORAGE_KEYS.SESSION_TOKEN, 'old-session')
  storage.setSalt('old-salt')
  storage.setBiometric('wrapped-biometric')
  expect(storage.getSalt()).toBe('old-salt')
  expect(storage.getBiometric()).toBe('wrapped-biometric')
  storage.clearCredentials()
  expect(localStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).toBeNull()
  expect(storage.getBiometric()).toBeNull()
  expect(storage.getSalt()).toBe('old-salt')
  storage.setSalt(null)
  storage.setBiometric('rollback-biometric')
  expect(storage.getBiometric()).toBe('rollback-biometric')
  storage.setBiometric(null)
  expect(storage.getBiometric()).toBeNull()
  expect(storage.getSalt()).toBeNull()
  expect(localStorage.getItem('theme')).toBe('dark')
})
