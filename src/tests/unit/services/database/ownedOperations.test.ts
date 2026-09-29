import { afterEach, beforeEach, expect, it, vi } from 'vitest'
let messages: { type: string; sql?: string; owner?: string }[]
let fail: string | undefined
let transport: { onerror?: (e: unknown) => void }
beforeEach(() => {
  vi.resetModules()
  messages = []
  fail = undefined
  vi.stubGlobal('Worker', class {
    onmessage?: (e: unknown) => void
    onerror?: (e: unknown) => void
    constructor() { transport = this }
    terminate() {}
    postMessage(message: { id: number; type: string; sql?: string; owner?: string }) {
      messages.push(message)
      if (message.sql === 'hang') return
      queueMicrotask(() => this.onmessage?.({ data: { id: message.id, success: !fail || message.sql !== fail, error: 'injected', data: message.type === 'acquire_operation' ? 'owner-1' : [] } }))
    }
  })
})
afterEach(() => vi.unstubAllGlobals())
it('commits before one notification and threads the owner through every statement', async () => {
  const db = await import('../../../../services/database/connection')
  const notified: string[] = []
  db.onDbWrite(() => notified.push(messages.at(-1)!.type))
  await db.withTransaction(async scope => {
    await scope.execSQL('write')
    await scope.queryOne('read')
    expect(notified).toEqual([])
  })
  expect(messages.map(m => m.type)).toEqual(['acquire_operation', 'exec', 'exec', 'query', 'exec', 'release_operation'])
  expect(messages.slice(1).every(m => m.owner === 'owner-1')).toBe(true)
  expect(notified).toEqual(['release_operation'])
})
it('rolls back failures without a notification', async () => {
  const db = await import('../../../../services/database/connection')
  const notified = vi.fn()
  db.onDbWrite(notified)
  await expect(db.withTransaction(async scope => { await scope.execSQL('write'); throw new Error('failure') })).rejects.toThrow('failure')
  expect(messages.some(m => m.sql === 'ROLLBACK')).toBe(true)
  expect(notified).not.toHaveBeenCalled()
})
it('invalidates rather than releasing after rollback fails', async () => {
  const db = await import('../../../../services/database/connection')
  fail = 'ROLLBACK'
  await expect(db.withTransaction(async () => { throw new Error('failure') })).rejects.toThrow()
  expect(messages.at(-1)?.type).toBe('invalidate_operation')
})
it('rejects pending requests when the worker fails', async () => {
  const db = await import('../../../../services/database/connection')
  const pending = db.querySQL('hang')
  const rejected = expect(pending).rejects.toThrow(/worker/i)
  transport.onerror?.(new Error('crash'))
  await rejected
})

it('a throwing observer cannot turn a committed save into a reported failure', async () => {
  const db = await import('../../../../services/database/connection')
  db.onDbWrite(() => { throw new Error('observer failed') })
  await expect(db.withTransaction(async scope => { await scope.execSQL('write'); return 'saved' })).resolves.toBe('saved')
})

it('blocks unrelated queries during restore while allowing its scoped worker commands', async () => {
  const db = await import('../../../../services/database/connection')
  const lease = await import('../../../../services/restore/lease')
  vi.spyOn(lease, 'requireRestoreLease').mockResolvedValue()
  await db.withRestoreAccess(async send => {
    await expect(db.querySQL('unrelated')).rejects.toThrow(/restore/i)
    await send('restore_inspect', { restoreRequest: { inputs: [] } })
  })
  await expect(db.querySQL('after')).resolves.toEqual([])
})

it('keeps normal access blocked after restore rollback cannot finish', async () => {
  const db = await import('../../../../services/database/connection')
  const lease = await import('../../../../services/restore/lease')
  const lifecycle = await import('../../../../services/restore/lifecycle')
  vi.spyOn(lease, 'requireRestoreLease').mockResolvedValue()
  await expect(db.withRestoreAccess(async () => {
    lifecycle.requireDatabaseRecovery()
    throw new Error('rollback failed')
  })).rejects.toThrow('rollback failed')
  await expect(db.querySQL('would write later')).rejects.toThrow(/recovery/i)
  await expect(db.initEncryptedDatabase('11'.repeat(32))).rejects.toThrow(/recovery/i)
  await expect(lifecycle.runDatabaseActivity(async () => 'login')).rejects.toThrow(/recovery/i)
})
