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
