import { afterEach, expect, it, vi } from 'vitest'
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
it('refuses database startup while another tab owns the installation', async () => {
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: unknown, run: (lock: null) => Promise<void>) => run(null) } })
  const { acquireDatabaseLease } = await import('../../../../services/restore/lease')
  await expect(acquireDatabaseLease()).rejects.toThrow(/another tab/)
})
it('refuses restore when cross-tab exclusivity is unavailable', async () => {
  vi.stubGlobal('navigator', {})
  const { requireRestoreLease } = await import('../../../../services/restore/lease')
  await expect(requireRestoreLease()).rejects.toThrow(/browser/)
})
it('recovers pending files before allowing database startup', async () => {
  let held: Promise<unknown> | undefined
  vi.stubGlobal('navigator', {
    locks: { request: (_name: string, _options: unknown, run: (lock: object) => Promise<void>) => { held = run({}); return held } },
    storage: { getDirectory: async () => { throw new Error('storage unavailable') } },
  })
  const { acquireDatabaseLease } = await import('../../../../services/restore/lease')
  await expect(acquireDatabaseLease()).rejects.toThrow(/recovery/)
  await held
})

it('allows ordinary startup without Web Locks but still refuses restore', async () => {
  vi.stubGlobal('navigator', {})
  const { acquireDatabaseLease, requireRestoreLease, releaseDatabaseLease } = await import('../../../../services/restore/lease')
  await expect(acquireDatabaseLease()).resolves.toBeUndefined()
  await expect(requireRestoreLease()).rejects.toThrow(/browser/)
  releaseDatabaseLease()
})
it('holds one lease across operations and permits a new owner after release', async () => {
  let owner = false
  let request: Promise<void> | undefined
  vi.stubGlobal('navigator', {
    locks: { request: (_name: string, _options: unknown, run: (lock: object | null) => Promise<void>) => {
      if (owner) return run(null)
      owner = true
      request = run({}).finally(() => { owner = false })
      return request
    } },
    storage: { getDirectory: async () => ({ async *entries() { /* empty synthetic origin */ } }) },
  })
  const { acquireDatabaseLease, requireRestoreLease, releaseDatabaseLease } = await import('../../../../services/restore/lease')
  await acquireDatabaseLease()
  await requireRestoreLease()
  expect(owner).toBe(true)
  releaseDatabaseLease()
  await request
  expect(owner).toBe(false)
  await requireRestoreLease()
  expect(owner).toBe(true)
  releaseDatabaseLease()
  await request
})
