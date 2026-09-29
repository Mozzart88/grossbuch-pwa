import { recoverRestore } from './journal'
import { opfsRestoreStorage } from './opfsStorage'

let lease: Promise<void> | undefined
let release: (() => void) | undefined
export function acquireDatabaseLease(): Promise<void> {
  // Older browsers retain their existing database behavior, but cannot restore.
  if (!navigator.locks) return Promise.resolve()
  if (lease) return lease
  lease = new Promise<void>((resolve, reject) => {
    void navigator.locks.request('grossbuh-database-installation', { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!lock) { reject(new Error('Database is open in another tab. Close it and retry.')); return }
      try {
        await recoverRestore(await opfsRestoreStorage())
        const held = new Promise<void>(done => { release = done })
        resolve()
        await held
      } catch {
        reject(new Error('Database recovery could not finish. Retry after checking available storage.'))
      }
    }).catch(reject)
  }).catch(error => { lease = undefined; throw error })
  return lease
}
export async function requireRestoreLease(): Promise<void> {
  if (!navigator.locks) throw new Error('This browser cannot safely coordinate database restore')
  await acquireDatabaseLease()
}
export function releaseDatabaseLease(): void {
  release?.()
  release = undefined
  lease = undefined
}
