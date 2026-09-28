import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import initPlain from 'sql.js'
import { loadSqlcipher, seedEvidence, rawRows, mainKey, sharedKey, readCipherFile } from '../helpers/sqlcipher'

const loader = vi.hoisted(() => ({ init: vi.fn() }))
vi.mock('../../sqlite-wasm', () => ({ default: loader.init }))
let sqlite: any
let plain: any
let live: any
let files: Set<string>
let nextId: number
let requests: Map<number, (value: any) => void>
let failSql: ((sql: string) => boolean) | undefined
let failAfterSql = false
let failCreate = false
let failRead = false
let failRemove = false
let beforeRead: (() => Promise<void>) | undefined
let beforeCreate: (() => Promise<void>) | undefined
let root: any
let sourceBytes: Uint8Array[]

function request(type: string, options: Record<string, unknown> = {}): Promise<any> {
  const id = ++nextId
  const promise = new Promise(resolve => requests.set(id, resolve))
  self.onmessage!({ data: { id, type, ...options } } as MessageEvent)
  return promise
}
async function successful(type: string, options: Record<string, unknown> = {}) {
  const result = await request(type, options)
  expect(result.error).toBeUndefined()
  expect(result.success).toBe(true)
  return result.data
}
async function exported(source: Record<string, unknown>, session = 'stale') {
  return request('export_decrypted', { exportRequest: { source, session, key: source.kind === 'main' || source.kind === 'legacy' ? mainKey : sharedKey } })
}
function assertTopology() {
  expect(live.selectValues('SELECT name FROM pragma_database_list')).toEqual(['main', 'temp', 'shared', 'workspace'])
  expect(live.selectValue('SELECT count(*) FROM visible_lines')).toBe(2)
  live.exec('INSERT INTO workspace.lines VALUES(99,1,2,999,0); DELETE FROM workspace.lines WHERE id=99')
}
function assertSourceUnchanged() {
  for (const [i, schema] of ['main', 'shared', 'workspace'].entries()) {
    expect(readCipherFile(sqlite, live, schema)).toEqual(sourceBytes[i])
  }
}

beforeEach(async () => {
  vi.resetModules()
  nextId = 0
  requests = new Map()
  failSql = undefined
  failAfterSql = false
  failCreate = false
  failRead = false
  failRemove = false
  beforeRead = undefined
  beforeCreate = undefined
  sqlite = await loadSqlcipher()
  plain = await initPlain()
  files = new Set(['main.db', 'shared.db', 'workspace-1.db', 'workspace-2.db', 'expense-tracker.sqlite3', 'unrelated.db'])
  for (const [name, key, marker] of [
    ['/main.db', mainKey, 10], ['/shared.db', sharedKey, 11],
    ['/workspace-1.db', sharedKey, 12], ['/workspace-2.db', sharedKey, 13],
    ['/expense-tracker.sqlite3', mainKey, 14],
  ] as const) {
    const db = new sqlite.oo1.DB(name, 'c')
    db.exec(`PRAGMA key="x'${key}'"`)
    seedEvidence(db, 'main', marker)
    if (name === '/shared.db') db.exec('CREATE TABLE workspace(id INTEGER PRIMARY KEY); INSERT INTO workspace VALUES(1),(2)')
    db.close()
  }
  const DB = sqlite.oo1.DB
  sqlite.oo1.OpfsDb = class extends DB {
    constructor(filename: string, flags: string) {
      super(filename, flags.replace('t', ''))
      live = this
    }
    exec(arg: any) {
      const sql = typeof arg === 'string' ? arg : arg.sql
      if (failSql?.(sql)) {
        failSql = undefined
        if (failAfterSql) super.exec(arg)
        throw new Error(`injected SQL error with secret ${sharedKey}`)
      }
      return super.exec(arg)
    }
  }
  loader.init.mockResolvedValue(sqlite)
  root = {
    getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
      if (options?.create) {
        await beforeCreate?.()
        files.add(name)
        if (failCreate) { failCreate = false; throw new Error('create failed after acquisition') }
      }
      if (!files.has(name)) throw new DOMException('missing', 'NotFoundError')
      return { getFile: async () => {
        await beforeRead?.()
        if (failRead) { failRead = false; throw new Error('read failed') }
        const db = new DB('/' + name, 'r')
        try {
          const bytes = readCipherFile(sqlite, db)
          return { arrayBuffer: async () => bytes.buffer }
        } finally { db.close() }
      } }
    }),
    removeEntry: vi.fn(async (name: string) => {
      if (failRemove) { failRemove = false; throw new Error('remove failed') }
      if (!files.delete(name)) throw new DOMException('missing', 'NotFoundError')
    }),
  }
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { getDirectory: async () => root } })
  vi.stubGlobal('postMessage', (response: any) => {
    requests.get(response.id)!(response)
    requests.delete(response.id)
  })
  await import('../../services/database/worker')
  await successful('init_encrypted', { key: mainKey })
  await successful('attach', { schema: 'shared', filename: '/shared.db', key: sharedKey })
  await successful('attach', { schema: 'workspace', filename: '/workspace-1.db', key: sharedKey })
  await successful('exec', { sql: 'CREATE TEMP VIEW visible_lines AS SELECT * FROM workspace.lines' })
  sourceBytes = ['main', 'shared', 'workspace'].map(schema => readCipherFile(sqlite, live, schema))
})
afterEach(() => { live?.close(); vi.unstubAllGlobals() })

it.each([
  [{ kind: 'main' }, 10], [{ kind: 'shared' }, 11],
  [{ kind: 'workspace', workspaceId: 1 }, 12], [{ kind: 'workspace', workspaceId: 2 }, 13],
  [{ kind: 'legacy' }, 14],
])('exports %j with exact evidence and metadata while retaining the live topology', async (source, version) => {
  const session = await successful('export_session')
  const result = await exported(source, session)
  expect(result.error).toBeUndefined()
  expect(result.success).toBe(true)
  const output = new plain.Database(new Uint8Array(result.data))
  expect(output.exec('SELECT * FROM lines ORDER BY id')[0].values).toEqual(rawRows)
  expect(output.exec('PRAGMA user_version')[0].values).toEqual([[version]])
  expect(output.exec('PRAGMA application_id')[0].values).toEqual([[400 + version]])
  expect(output.exec("SELECT name FROM sqlite_master WHERE name='visible_lines'")).toEqual([])
  output.close()
  expect([...files].filter(n => n.startsWith('export-decrypted-'))).toEqual([])
  expect(files.has('unrelated.db')).toBe(true)
  assertSourceUnchanged()
  assertTopology()
})
it('rejects an export in another operation’s transaction without ending it', async () => {
  const session = await successful('export_session')
  await successful('exec', { sql: 'BEGIN; INSERT INTO workspace.lines VALUES(88,0,0,0,0)' })
  expect((await exported({ kind: 'main' }, session)).error).toMatch(/transaction/i)
  expect(sqlite.capi.sqlite3_get_autocommit(live.pointer)).toBe(0)
  expect(live.selectValue('SELECT count(*) FROM workspace.lines WHERE id=88')).toBe(1)
  live.exec('ROLLBACK')
  assertSourceUnchanged()
})
it('rejects stale session context without revealing the supplied key', async () => {
  const session = await successful('export_session')
  const result = await exported({ kind: 'main' }, `${session}-stale`)
  expect(result.error).toMatch(/session/i)
  expect(result.error).not.toContain(mainKey)
  assertSourceUnchanged()
})
it.each([{kind:'unknown'}, {kind:'workspace',workspaceId:0}, {kind:'workspace',workspaceId:3}])('rejects an unsupported or unregistered source %j', async source => {
  const session = await successful('export_session')
  expect((await exported(source, session)).success).toBe(false)
  assertSourceUnchanged()
  assertTopology()
})
it('rejects a missing inactive source without creating it', async () => {
  const session = await successful('export_session')
  files.delete('workspace-2.db')
  expect((await exported({kind:'workspace',workspaceId:2}, session)).success).toBe(false)
  expect(files.has('workspace-2.db')).toBe(false)
  expect(root.getFileHandle).not.toHaveBeenCalledWith('workspace-2.db', {create:true})
})
it.each(['create', 'source attach', 'target attach', 'copy', 'metadata', 'target detach', 'source detach', 'read', 'remove'])('recovers from %s failure, resumes queued work, and allows retry', async phase => {
  const session = await successful('export_session')
  const sqlPhase: Record<string,string> = {
    'source attach': 'ATTACH DATABASE ? AS export_source', 'target attach': 'ATTACH DATABASE ? AS export_target',
    copy: 'sqlcipher_export', metadata: 'PRAGMA export_target.user_version',
    'target detach': 'DETACH DATABASE export_target', 'source detach': 'DETACH DATABASE export_source',
  }
  if (sqlPhase[phase]) failSql = sql => sql.includes(sqlPhase[phase])
  failCreate = phase === 'create'
  failRead = phase === 'read'
  failRemove = phase === 'remove'
  const resultPromise = exported({kind:'workspace',workspaceId:2}, session)
  const queued = request('query', {sql:'SELECT count(*) AS n FROM visible_lines'})
  const result = await resultPromise
  expect(result.success).toBe(false)
  expect(result.error).not.toContain(sharedKey)
  expect(result.error).not.toContain('ATTACH')
  expect((await queued).data).toEqual([{n:2}])
  expect([...files].filter(n => n.startsWith('export-decrypted-'))).toEqual([])
  assertSourceUnchanged()
  expect((await exported({kind:'workspace',workspaceId:2}, session)).success).toBe(true)
  assertTopology()
})
it('cleans up an attachment even when attachment reports an error after acquiring it', async () => {
  const session = await successful('export_session')
  failSql = sql => sql.includes('ATTACH DATABASE ? AS export_target')
  failAfterSql = true
  expect((await exported({kind:'main'}, session)).success).toBe(false)
  expect([...files].filter(n => n.startsWith('export-decrypted-'))).toEqual([])
  assertSourceUnchanged()
  assertTopology()
})
it.each(['setup', 'read'])('queues ordinary operations and rejects overlapping exports during %s', async phase => {
  const session = await successful('export_session')
  let release!: () => void
  let entered!: () => void
  const ready = new Promise<void>(resolve => { entered = resolve })
  const blocked = new Promise<void>(resolve => { release = resolve })
  const pause = async () => { entered(); await blocked }
  if (phase === 'setup') beforeCreate = pause
  else beforeRead = pause
  const first = exported({kind:'main'}, session)
  await ready
  let queryDone = false
  const query = request('query', {sql:'SELECT count(*) AS n FROM visible_lines'}).then(r => { queryDone=true; return r })
  expect((await exported({kind:'shared'}, session)).error).toMatch(/busy/i)
  expect(queryDone).toBe(false)
  release()
  expect((await first).success).toBe(true)
  expect((await query).data).toEqual([{n:2}])
  assertTopology()
})

it('rejects the wrong inactive workspace key without disrupting the session', async () => {
  const session = await successful('export_session')
  const result = await request('export_decrypted', {exportRequest: {
    source: {kind:'workspace', workspaceId:2}, session, key: mainKey,
  }})
  expect(result.success).toBe(false)
  expect(result.error).not.toContain(mainKey)
  assertSourceUnchanged()
  assertTopology()
})
it('does not detach pre-existing export aliases or remove unrelated files', async () => {
  const session = await successful('export_session')
  live.exec("ATTACH ':memory:' AS export_target; CREATE TABLE export_target.keep_me(id)")
  const result = await exported({kind:'main'}, session)
  expect(result.error).toMatch(/cleanup/i)
  expect(live.selectValue("SELECT count(*) FROM export_target.sqlite_master WHERE name='keep_me'")).toBe(1)
  expect(root.removeEntry).not.toHaveBeenCalled()
})
it('reports persistent removal failures rather than returning plaintext', async () => {
  const session = await successful('export_session')
  root.removeEntry.mockRejectedValue(new Error('unavailable filesystem'))
  const result = await exported({kind:'main'}, session)
  expect(result.success).toBe(false)
  expect(result.data).toBeUndefined()
  expect(result.error).toMatch(/cleanup failed/i)
  assertSourceUnchanged()
  assertTopology()
})
it('invalidates a captured session when the shared attachment changes', async () => {
  const session = await successful('export_session')
  await successful('detach', {schema:'shared'})
  await successful('attach', {schema:'shared', filename:'/shared.db', key:sharedKey})
  expect((await exported({kind:'shared'}, session)).error).toMatch(/session/i)
  assertSourceUnchanged()
})
it('does not remove an unrelated journal whose name collides with the proposed destination', async () => {
  const session = await successful('export_session')
  const uuid = '00000000-0000-4000-8000-000000000000'
  const random = vi.spyOn(crypto, 'randomUUID').mockReturnValue(uuid)
  const journal = `export-decrypted-${uuid}.db-journal`
  files.add(journal)
  try {
    const result = await exported({kind:'main'}, session)
    expect(result.success).toBe(false)
    expect(files.has(journal)).toBe(true)
    expect(root.removeEntry).not.toHaveBeenCalled()
  } finally { random.mockRestore() }
})
it('rejects a session captured before the worker was replaced even with the same keys and topology', async () => {
  const previous = await successful('export_session')
  await successful('close')
  vi.resetModules()
  await import('../../services/database/worker')
  await successful('init_encrypted', {key:mainKey})
  await successful('attach', {schema:'shared', filename:'/shared.db', key:sharedKey})
  await successful('attach', {schema:'workspace', filename:'/workspace-1.db', key:sharedKey})
  const result = await exported({kind:'main'}, previous)
  expect(result.success).toBe(false)
  expect(result.error).toMatch(/session/i)
})
