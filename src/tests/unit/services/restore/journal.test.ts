import { expect, it } from 'vitest'
import { installRestore, recoverRestore, type RestoreStorage } from '../../../../services/restore/journal'
const bytes = (value: string) => new TextEncoder().encode(value)
function fixture(failAt = Infinity) {
  const files = new Map<string, Uint8Array>([['main.db', bytes('old-main')], ['shared.db', bytes('old-shared')]])
  let writes = 0
  let failed = false
  let salt: string | null = 'old-salt'
  let biometric: string | null = 'wrapped-old-biometric'
  const storage: RestoreStorage = {
    async read(name) { return files.get(name)?.slice() ?? null },
    async write(name, data) {
      if (++writes === failAt && !failed) { failed = true; files.set(name, data.slice(0, 3)); throw new Error('power loss') }
      files.set(name, data.slice())
    },
    async remove(name) { files.delete(name) },
    async list() { return [...files.keys()] },
    getSalt: () => salt,
    setSalt(value) { salt = value },
    getBiometric: () => biometric,
    setBiometric(value) { biometric = value },
    clearCredentials() { biometric = null },
  }
  return { files, storage, salt: () => salt, biometric: () => biometric }
}
it('installs the complete replacement and credential salt, then removes temporary data', async () => {
  const f = fixture()
  await installRestore(f.storage, [{ destination: 'main.db', bytes: bytes('new-main') }, { destination: 'shared.db', bytes: bytes('new-shared') }], 'new-salt')
  expect(f.files).toEqual(new Map([['main.db', bytes('new-main')], ['shared.db', bytes('new-shared')]]))
  expect(f.salt()).toBe('new-salt')
})
it('recovers to one complete set after every interrupted write, including journal writes', async () => {
  for (let failAt = 1; failAt <= 12; failAt++) {
    const f = fixture(failAt)
    try { await installRestore(f.storage, [{ destination: 'main.db', bytes: bytes('new-main') }, { destination: 'shared.db', bytes: bytes('new-shared') }], 'new-salt') } catch { /* simulate restart */ }
    await recoverRestore(f.storage)
    const main = new TextDecoder().decode(f.files.get('main.db'))
    const shared = new TextDecoder().decode(f.files.get('shared.db'))
    expect([['old-main', 'old-shared', 'old-salt'], ['new-main', 'new-shared', 'new-salt']]).toContainEqual([main, shared, f.salt()])
    await recoverRestore(f.storage)
    expect(f.files.size).toBe(2)
  }
})
it('partial installation preserves main and credentials', async () => {
  const f = fixture()
  await installRestore(f.storage, [{ destination: 'shared.db', bytes: bytes('replacement') }])
  expect(f.files.get('main.db')).toEqual(bytes('old-main'))
  expect(f.salt()).toBe('old-salt')
})

it('removes abandoned plaintext inspection files on startup', async () => {
  const f = fixture()
  f.files.set('gb-restore-input-12345678-1234-1234-1234-123456789abc-0.db', bytes('plaintext'))
  f.files.set('unrelated.db', bytes('keep'))
  await recoverRestore(f.storage)
  expect([...f.files.keys()].sort()).toEqual(['main.db', 'shared.db', 'unrelated.db'])
})
it('retries recovery after another interruption without losing rollback backups', async () => {
  const f = fixture(7) // installing journal is verified; second destination write tears
  await expect(installRestore(f.storage, [{ destination: 'main.db', bytes: bytes('new-main') }, { destination: 'shared.db', bytes: bytes('new-shared') }], 'new-salt')).rejects.toThrow()
  const write = f.storage.write
  let failed = false
  f.storage.write = async (name, data) => {
    if (name === 'main.db' && !failed) { failed = true; throw new Error('second interruption') }
    await write(name, data)
  }
  await expect(recoverRestore(f.storage)).rejects.toThrow('second interruption')
  await recoverRestore(f.storage)
  expect(new TextDecoder().decode(f.files.get('main.db'))).toBe('old-main')
  expect(new TextDecoder().decode(f.files.get('shared.db'))).toBe('old-shared')
  expect(f.files.size).toBe(2)
})
it('rolls back a first-install failure to an empty installation', async () => {
  const f = fixture(4)
  f.files.clear()
  await expect(installRestore(f.storage, [{ destination: 'main.db', bytes: bytes('new-main') }, { destination: 'shared.db', bytes: bytes('new-shared') }], 'new-salt')).rejects.toThrow()
  await recoverRestore(f.storage)
  expect(f.files.size).toBe(0)
})
it('retains the new installation after cleanup fails following commit', async () => {
  const f = fixture()
  const remove = f.storage.remove
  let fail = true
  f.storage.remove = async name => {
    if (name.endsWith('.backup') && fail) { fail = false; throw new Error('cleanup interrupted') }
    await remove(name)
  }
  await expect(installRestore(f.storage, [{ destination: 'main.db', bytes: bytes('new-main') }], 'new-salt')).rejects.toThrow('cleanup interrupted')
  await recoverRestore(f.storage)
  expect(new TextDecoder().decode(f.files.get('main.db'))).toBe('new-main')
  expect(f.salt()).toBe('new-salt')
})


it('restores the previous biometric payload after an uncommitted full restore', async () => {
  const f = fixture(7)
  await expect(installRestore(f.storage, [{ destination: 'main.db', bytes: bytes('new-main') }, { destination: 'shared.db', bytes: bytes('new-shared') }], 'new-salt')).rejects.toThrow()
  await recoverRestore(f.storage)
  expect(f.biometric()).toBe('wrapped-old-biometric')
  expect(f.salt()).toBe('old-salt')
})
