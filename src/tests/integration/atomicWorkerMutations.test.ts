import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loadSqlcipher, sharedKey } from '../helpers/sqlcipher'
import type { TransactionInput } from '../../types'

const loader = vi.hoisted(() => ({ init: vi.fn() }))
vi.mock('../../sqlite-wasm', () => ({ default: loader.init }))
let db: typeof import('../../services/database/connection')
let repository: typeof import('../../services/repositories/transactionRepository').transactionRepository
let importer: typeof import('../../services/sync/syncImport').importSyncPackage
let live: any
let failSql: ((sql: string) => boolean) | undefined
let pauseSql: ((sql: string) => Promise<void>) | undefined
let input: TransactionInput

beforeEach(async () => {
  vi.resetModules()
  failSql = undefined
  pauseSql = undefined
  const sqlite = await loadSqlcipher()
  const DB = sqlite.oo1.DB
  sqlite.oo1.OpfsDb = class extends DB {
    constructor(filename: string, flags: string) { super(filename, flags.replace('t', '')); live = this }
    exec(arg: any) {
      const sql = typeof arg === 'string' ? arg : arg.sql
      if (failSql?.(sql)) throw new Error('Injected operation failure')
      return super.exec(arg)
    }
  }
  loader.init.mockResolvedValue(sqlite)
  Object.defineProperty(navigator, 'storage', { configurable: true, value: { getDirectory: async () => ({ getFileHandle: async () => { throw new DOMException('missing', 'NotFoundError') } }) } })
  await import('../../services/database/worker')
  const handler = self.onmessage!
  let transport: any
  vi.stubGlobal('postMessage', (response: unknown) => queueMicrotask(() => transport.onmessage({ data: response })))
  vi.stubGlobal('Worker', class {
    onmessage: unknown
    onerror: unknown
    constructor() { transport = this }
    terminate() {}
    postMessage(message: any) {
      void (async () => {
        if (message.sql) await pauseSql?.(message.sql)
        handler.call(self, { data: message } as MessageEvent)
      })()
    }
  })
  db = await import('../../services/database/connection')
  await db.initDatabase()
  await db.attachDatabase('shared', '/shared.db', sharedKey)
  await db.attachDatabase('workspace', '/workspace-1.db', sharedKey)
  const { sharedMigrations } = await import('../../services/database/sharedMigrations')
  const { workspaceMigrations } = await import('../../services/database/workspaceMigrations')
  for (const statements of Object.values(sharedMigrations)) for (const sql of statements) await db.execSQL(sql)
  for (const statements of Object.values(workspaceMigrations)) for (const sql of statements) await db.execSQL(sql)
  const { TEMP_VIEW_STATEMENTS } = await import('../../services/database/tempViews')
  for (const sql of TEMP_VIEW_STATEMENTS) await db.execSQL(sql)
  await db.execSQL(`
    CREATE TABLE main.sync_deletions(table_name TEXT, entity_id TEXT, deleted_at INTEGER);
    INSERT INTO shared.tag(id,name) VALUES(1,'system'),(2,'default'),(3,'initial'),(7,'exchange'),(11,'context');
    INSERT INTO shared.currency(id,code,name,symbol,decimal_places) VALUES(1,'USD','Dollar','$',2),(2,'EUR','Euro','E',2);
    INSERT INTO workspace.wallet(id,name) VALUES(1,'Synthetic');
    INSERT INTO workspace.account(id,wallet_id,currency_id) VALUES(1,1,1),(2,1,2);
    INSERT INTO shared.counterparty(id,name) VALUES(1,'Synthetic counterparty');
  `)
  repository = (await import('../../services/repositories/transactionRepository')).transactionRepository
  importer = (await import('../../services/sync/syncImport')).importSyncPackage
  input = { timestamp: 1000, counterparty_id: 1, note: 'Synthetic note', lines: [
    { account_id: 1, tag_id: 7, tag_context_id: 11, sign: '-', amount_int: 20, amount_frac: 0, rate_int: 1, rate_frac: 0 },
    { account_id: 2, tag_id: 7, sign: '+', amount_int: 18, amount_frac: 0, rate_int: 1, rate_frac: 0 },
  ] }
})
afterEach(async () => { failSql = undefined; pauseSql = undefined; await db?.closeDatabase(); vi.unstubAllGlobals() })

it('creates independently and deletes all split-database dependents with exactly one balance reversal', async () => {
  const writes = vi.fn()
  const unsubscribe = db.onDbWrite(writes)
  const [first, second] = await Promise.all([repository.create(input), repository.create({ ...input, timestamp: 2000 })])
  expect(first.id).not.toEqual(second.id)
  expect(first.lines).toHaveLength(2)
  expect(second.lines).toHaveLength(2)
  expect(writes).toHaveBeenCalledTimes(2)
  await repository.delete(first.id)
  expect(await db.querySQL('SELECT balance_int FROM account ORDER BY id')).toEqual([{ balance_int: -20 }, { balance_int: 18 }])
  for (const table of ['trx_base','trx_note','trx_to_counterparty']) {
    expect(await db.queryOne(`SELECT count(*) AS n FROM ${table} WHERE trx_id=?`, [first.id])).toEqual({ n: 0 })
  }
  expect(await db.queryOne('SELECT count(*) AS n FROM trx_base_tag_context')).toEqual({ n: 1 })
  expect(await db.queryOne('SELECT count FROM shared.tag_references WHERE tag_id=7')).toEqual({ count: 2 })
  expect(await db.queryOne('SELECT count FROM shared.tag_references WHERE tag_id=11')).toEqual({ count: 1 })
  expect(await db.queryOne('SELECT count FROM shared.counterparty_sort_order WHERE counterparty_id=1')).toEqual({ count: 1 })
  expect(await db.queryOne('SELECT count(*) AS n FROM workspace.sync_deletions WHERE table_name=\'trx\'')).toEqual({ n: 1 })
  expect(await db.querySQL('SELECT * FROM main.sync_deletions')).toEqual([])
  expect(await db.querySQL('SELECT * FROM shared.sync_deletions')).toEqual([])
  expect(await db.querySQL('PRAGMA workspace.foreign_key_check')).toEqual([])
  unsubscribe()
})

it('queues deletion until a sync import restores foreign keys and timestamp triggers', async () => {
  const trx = await repository.create(input)
  let entered!: () => void
  const paused = new Promise<void>(resolve => { entered = resolve })
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  pauseSql = async sql => { if (sql === 'BEGIN TRANSACTION') { entered(); await gate } }
  const importing = importer({ version: 2, sender_id: 'test', created_at: 1, since: 0, icons: [], tags: [], wallets: [], accounts: [], counterparties: [], currencies: [], transactions: [], budgets: [], deletions: [] })
  await paused
  expect(live.selectValue('PRAGMA foreign_keys')).toBe(0)
  let deleted = false
  const deleting = repository.delete(trx.id).then(() => { deleted = true })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(deleted).toBe(false)
  release()
  expect((await importing).errors).toEqual([])
  await deleting
  expect(await db.queryOne('SELECT count(*) AS n FROM trx_base')).toEqual({ n: 0 })
  expect(await db.querySQL('SELECT balance_int FROM account ORDER BY id')).toEqual([{ balance_int: 0 }, { balance_int: 0 }])
  expect(await db.queryOne('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 })
  expect((await repository.create(input)).lines).toHaveLength(2)
})

it('rolls back a failed mutation without notifying observers and remains usable', async () => {
  const trx = await repository.create(input)
  const before = await db.querySQL('SELECT * FROM account ORDER BY id')
  const writes = vi.fn()
  const unsubscribe = db.onDbWrite(writes)
  failSql = sql => sql.includes('INSERT INTO trx_base')
  await expect(repository.update(trx.id, { ...input, timestamp: 3000 })).rejects.toThrow('Injected')
  failSql = undefined
  expect(await db.querySQL('SELECT * FROM account ORDER BY id')).toEqual(before)
  expect((await repository.findById(trx.id))?.timestamp).toBe(1000)
  expect(writes).not.toHaveBeenCalled()
  await repository.delete(trx.id)
  expect(writes).toHaveBeenCalledTimes(1)
  unsubscribe()
})

it('fails closed when sync cannot restore its triggers', async () => {
  failSql = sql => sql.startsWith('CREATE TRIGGER IF NOT EXISTS shared.')
  await expect(importer({ version: 2, sender_id: 'test', created_at: 1, since: 0, icons: [], tags: [], wallets: [], accounts: [], counterparties: [], currencies: [], transactions: [], budgets: [], deletions: [] })).rejects.toThrow()
  await expect(db.querySQL('SELECT 1')).rejects.toThrow(/reinitialization/)
})

it('reopening after failed trigger restoration retains normal timestamp maintenance', async () => {
  const before = await db.querySQL("SELECT name FROM workspace.sqlite_master WHERE type='trigger' ORDER BY name")
  failSql = sql => sql.startsWith('CREATE TRIGGER IF NOT EXISTS shared.')
  await expect(importer({ version: 2, sender_id: 'test', created_at: 1, since: 0, icons: [], tags: [], wallets: [], accounts: [], counterparties: [], currencies: [], transactions: [], budgets: [], deletions: [] })).rejects.toThrow()
  failSql = undefined
  await db.initDatabase()
  await db.attachDatabase('shared', '/shared.db', sharedKey)
  await db.attachDatabase('workspace', '/workspace-1.db', sharedKey)
  expect(await db.querySQL("SELECT name FROM workspace.sqlite_master WHERE type='trigger' ORDER BY name")).toEqual(before)
  await db.execSQL("INSERT INTO workspace.trx(id,timestamp,updated_at) VALUES(x'99',1000,1)")
  await db.execSQL("UPDATE workspace.trx SET timestamp=2000 WHERE id=x'99'")
  expect((await db.queryOne<{ updated_at: number }>("SELECT updated_at FROM workspace.trx WHERE id=x'99'"))!.updated_at).toBeGreaterThan(1)
})

it('overlapping edits produce one complete replacement rather than mixed lines', async () => {
  const trx = await repository.create(input)
  const edited = (amount: number): TransactionInput => ({ ...input, timestamp: amount, lines: input.lines.map(line => ({ ...line, amount_int: amount })) })
  const [first, second] = await Promise.all([repository.update(trx.id, edited(30)), repository.update(trx.id, edited(40))])
  expect(first.lines?.map(line => line.amount_int)).toEqual([30, 30])
  expect(second.lines?.map(line => line.amount_int)).toEqual([40, 40])
  expect((await repository.findById(trx.id))?.lines?.map(line => line.amount_int)).toEqual([40, 40])
  expect(await db.querySQL('SELECT balance_int FROM account ORDER BY id')).toEqual([{ balance_int: -40 }, { balance_int: 40 }])
})

it.each(['updateLine', 'deleteLine'] as const)('rolls back every effect of a failed standalone %s', async method => {
  const trx = await repository.create(input)
  const line = trx.lines![0]
  const beforeAccounts = await db.querySQL('SELECT * FROM account ORDER BY id')
  const beforeReferences = await db.querySQL('SELECT * FROM shared.tag_references ORDER BY tag_id')
  const beforeTransaction = await repository.findById(trx.id)
  if (method === 'updateLine') {
    failSql = sql => sql.includes('INSERT OR IGNORE INTO trx_base_tag_context')
    await expect(repository.updateLine(line.id, { amount_int: 30, tag_context_id: 11 })).rejects.toThrow('Injected')
  } else {
    failSql = sql => sql.includes('DELETE FROM trx_base WHERE id')
    await expect(repository.deleteLine(line.id)).rejects.toThrow('Injected')
  }
  failSql = undefined
  expect(await db.querySQL('SELECT * FROM account ORDER BY id')).toEqual(beforeAccounts)
  expect(await db.querySQL('SELECT * FROM shared.tag_references ORDER BY tag_id')).toEqual(beforeReferences)
  expect(await repository.findById(trx.id)).toEqual(beforeTransaction)
})

it('a failed import rolls back financial writes and restores settings before another save', async () => {
  const before = await db.querySQL('SELECT * FROM account ORDER BY id')
  failSql = sql => sql.includes('INSERT INTO workspace.trx_base')
  const imported = await importer({ version: 2, sender_id: 'test', created_at: 1, since: 0, icons: [], tags: [], wallets: [], accounts: [], counterparties: [], currencies: [], budgets: [], deletions: [], transactions: [{ id: '0102030405060708', timestamp: 1000, updated_at: 1234, counterparty: null, note: null, lines: [{ id: '1112131415161718', account: 1, tag: 7, sign: '-', amount_int: 20, amount_frac: 0, rate_int: 1, rate_frac: 0 }] }] })
  failSql = undefined
  expect(imported.errors).toHaveLength(1)
  expect(await db.querySQL('SELECT * FROM account ORDER BY id')).toEqual(before)
  expect(await db.queryOne('SELECT count(*) AS n FROM trx')).toEqual({ n: 0 })
  expect(await db.queryOne('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 })
  expect((await repository.create(input)).lines).toHaveLength(2)
})
