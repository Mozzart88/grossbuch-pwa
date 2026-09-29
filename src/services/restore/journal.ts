import { restoreDestination } from './inspection'

export interface RestoreStorage {
  read(name: string): Promise<Uint8Array | null>
  write(name: string, data: Uint8Array): Promise<void>
  remove(name: string): Promise<void>
  list(): Promise<string[]>
  getSalt(): string | null
  setSalt(salt: string | null): void
  getBiometric(): string | null
  setBiometric(value: string | null): void
  clearCredentials(): void
}
interface Entry { destination: string; backup: string; before: string | null; staged: string; after: string }
interface Journal { version: 1; id: string; committed: boolean; entries: Entry[]; saltBefore: string | null; saltAfter?: string; biometricBefore: string | null }
const prefix = 'gb-restore-'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
export async function checksum(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}
async function verifiedRead(storage: RestoreStorage, name: string, hash: string): Promise<Uint8Array> {
  const bytes = await storage.read(name)
  if (!bytes || await checksum(bytes) !== hash) throw new Error('Restore recovery file is missing or damaged; keep the backup files and retry')
  return bytes
}
async function writeVerified(storage: RestoreStorage, name: string, bytes: Uint8Array) {
  await storage.write(name, bytes)
  await verifiedRead(storage, name, await checksum(bytes))
}
async function publish(storage: RestoreStorage, journal: Journal) {
  const payload = JSON.stringify(journal)
  const bytes = encoder.encode(JSON.stringify({ payload, checksum: await checksum(encoder.encode(payload)) }))
  await writeVerified(storage, `${prefix}${journal.id}.${journal.committed ? 'committed' : 'installing'}.json`, bytes)
}
async function readJournal(storage: RestoreStorage, name: string): Promise<Journal | null> {
  const bytes = await storage.read(name)
  if (!bytes) return null
  try {
    const envelope = JSON.parse(decoder.decode(bytes))
    if (await checksum(encoder.encode(envelope.payload)) !== envelope.checksum) return null
    const j = JSON.parse(envelope.payload) as Journal
    if (j.version !== 1 || !/^[a-f0-9-]{36}$/.test(j.id) || !Array.isArray(j.entries) || !j.entries.length) throw new Error()
    if (name !== `${prefix}${j.id}.${j.committed ? 'committed' : 'installing'}.json`) throw new Error()
    const destinations = new Set<string>()
    for (const [index, entry] of j.entries.entries()) {
      if (restoreDestination(entry.destination) !== entry.destination || destinations.has(entry.destination)) throw new Error()
      destinations.add(entry.destination)
      if (entry.backup !== `${prefix}${j.id}-${index}.backup` || entry.staged !== `${prefix}${j.id}-${index}.stage`) throw new Error()
      if (!/^[a-f0-9]{64}$/.test(entry.after) || (entry.before !== null && !/^[a-f0-9]{64}$/.test(entry.before))) throw new Error()
    }
    if (j.biometricBefore !== null && typeof j.biometricBefore !== 'string') throw new Error()
    if (j.saltBefore !== null && typeof j.saltBefore !== 'string') throw new Error()
    if (j.saltAfter !== undefined && typeof j.saltAfter !== 'string') throw new Error()
    return j
  } catch { return null }
}
async function cleanup(storage: RestoreStorage, j: Journal) {
  // Remove the obsolete installing marker first. If cleanup is interrupted the
  // committed marker must remain authoritative even after backups disappear.
  await storage.remove(`${prefix}${j.id}.installing.json`)
  for (const entry of j.entries) {
    await storage.remove(entry.backup)
    await storage.remove(entry.staged)
  }
  await storage.remove(`${prefix}${j.id}.committed.json`)
}
export async function recoverRestore(storage: RestoreStorage): Promise<void> {
  const names = await storage.list()
  const journals: Journal[] = []
  for (const name of names.filter(name => /^gb-restore-[a-f0-9-]{36}\.(installing|committed)\.json$/.test(name))) {
    const journal = await readJournal(storage, name)
    if (journal) journals.push(journal)
  }
  const ids = new Set(journals.map(j => j.id))
  if (ids.size > 1) throw new Error('Multiple restore journals found; recovery requires attention')
  const j = journals.find(j => j.committed) ?? journals[0]
  if (j) {
    if (j.committed) {
      // A committed destination should already be durable. Do not require stage
      // files, since a previous cleanup may already have removed them.
      for (const entry of j.entries) await verifiedRead(storage, entry.destination, entry.after)
      if (j.saltAfter !== undefined) { storage.setSalt(j.saltAfter); storage.clearCredentials() }
    } else {
      // Validate every backup before starting rollback; retry keeps all backups.
      const old = await Promise.all(j.entries.map(e => e.before === null ? null : verifiedRead(storage, e.backup, e.before)))
      for (const [index, entry] of j.entries.entries()) {
        if (old[index]) await writeVerified(storage, entry.destination, old[index]!)
        else await storage.remove(entry.destination)
      }
      if (j.saltAfter !== undefined) { storage.setSalt(j.saltBefore); storage.clearCredentials(); storage.setBiometric(j.biometricBefore) }
      // Publish rollback completion by removing the installing marker before
      // backups: after this point the old installation is completely restored.
    }
    await cleanup(storage, j)
  }
  // No live replacement starts until a verified installing marker exists.
  // Unreferenced stage/backup/invalid first-journal files are pre-install debris.
  for (const name of await storage.list()) {
    if (/^gb-restore-input-[a-f0-9-]{36}-\d+(?:-encrypted)?\.db(?:-journal|-wal|-shm)?$/.test(name)) await storage.remove(name)
    if (/^gb-restore-[a-f0-9-]{36}(?:-\d+\.(?:backup|stage)|\.(?:installing|committed)\.json)$/.test(name)) await storage.remove(name)
  }
}
export async function installRestore(storage: RestoreStorage, files: { destination: string; bytes: Uint8Array }[], salt?: string): Promise<void> {
  await recoverRestore(storage)
  if (!files.length || new Set(files.map(f => f.destination)).size !== files.length) throw new Error('Invalid restore destinations')
  for (const file of files) if (restoreDestination(file.destination) !== file.destination) throw new Error('Invalid restore destination')
  const journal: Journal = { version: 1, id: crypto.randomUUID(), committed: false, entries: [], saltBefore: storage.getSalt(), saltAfter: salt, biometricBefore: storage.getBiometric() }
  for (const [index, file] of files.entries()) {
    const old = await storage.read(file.destination)
    const entry: Entry = { destination: file.destination, backup: `${prefix}${journal.id}-${index}.backup`, staged: `${prefix}${journal.id}-${index}.stage`, before: old ? await checksum(old) : null, after: await checksum(file.bytes) }
    journal.entries.push(entry)
    await writeVerified(storage, entry.staged, file.bytes)
    if (old) await writeVerified(storage, entry.backup, old)
  }
  await publish(storage, journal)
  for (const entry of journal.entries) await writeVerified(storage, entry.destination, await verifiedRead(storage, entry.staged, entry.after))
  if (salt !== undefined) { storage.setSalt(salt); storage.clearCredentials() }
  journal.committed = true
  await publish(storage, journal)
  await cleanup(storage, journal)
}
