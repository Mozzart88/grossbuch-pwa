import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ send: vi.fn(), key: '11'.repeat(32), shared: '22'.repeat(32) }))
vi.mock('../../../../services/database/connection', () => ({ withRestoreAccess: async (action: any) => action(mocks.send) }))
vi.mock('../../../../services/auth/authService', () => ({ getSessionAppKey: () => mocks.key }))
vi.mock('../../../../services/database/workspace', () => ({ getSessionDekShared: () => mocks.shared, getActiveWorkspaceId: () => 1 }))
import { inspectDatabaseRestore, restoreDatabases } from '../../../../services/restore/restoreService'
const bytes = new TextEncoder().encode('encrypted-data')
let files: Map<string, Uint8Array>
const plan = { mode: 'partial', files: [{ name: 'workspace-1.db', destination: 'workspace-1.db', role: 'workspace', workspaceId: 1, findings: [] }], retained: ['main.db', 'shared.db'], workspaceIds: [1], findings: [] }
beforeEach(() => {
  files = new Map([['main.db', new TextEncoder().encode('existing-main')]])
  localStorage.clear()
  localStorage.setItem('gb_pbkdf2_salt', 'old-salt')
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { getDirectory: async () => ({
    async *entries() { for (const name of files.keys()) yield [name, {}] },
    async removeEntry(name: string) { files.delete(name) },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!files.has(name) && !options?.create) throw new DOMException('missing', 'NotFoundError')
      return { getFile: async () => ({ arrayBuffer: async () => files.get(name)!.slice().buffer }), createWritable: async () => ({ write: async (value: Uint8Array) => { files.set(name, value.slice()) }, close: async () => {}, abort: async () => {} }) }
    },
  }) } })
  mocks.send.mockReset().mockImplementation(async (type: string) => {
    if (type === 'export_session') return 'session-1'
    if (type === 'restore_inspect') return { plan, files: [] }
    if (type === 'restore_prepare') return { plan, files: [{ destination: 'workspace-1.db', bytes }] }
  })
})
it('installs a reviewed partial restore and preserves the installed main and salt', async () => {
  const selection = [{ name: 'workspace-1.db', arrayBuffer: async () => new ArrayBuffer(16) }] as File[]
  const review = await inspectDatabaseRestore(selection)
  await restoreDatabases(review)
  expect(new TextDecoder().decode(files.get('workspace-1.db'))).toBe('encrypted-data')
  expect(new TextDecoder().decode(files.get('main.db'))).toBe('existing-main')
  expect(localStorage.getItem('gb_pbkdf2_salt')).toBe('old-salt')
  expect([...files.keys()].sort()).toEqual(['main.db', 'workspace-1.db'])
})
it('refuses to install if the session changes after the preview', async () => {
  const review = await inspectDatabaseRestore([{ name: 'workspace-1.db', arrayBuffer: async () => new ArrayBuffer(16) }] as File[])
  mocks.send.mockImplementation(async type => type === 'export_session' ? 'different' : undefined)
  await expect(restoreDatabases(review)).rejects.toThrow(/session/i)
  expect(files.has('workspace-1.db')).toBe(false)
})
