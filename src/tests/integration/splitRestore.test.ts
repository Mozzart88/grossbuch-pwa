import { NEW_MAIN_SCHEMA_SQL } from '../../services/database/legacyMigration'
import { createRestoreSchemaReference } from '../../services/restore/schemaReference'
import { beforeEach, afterEach, expect, it } from 'vitest'
import { loadSqlcipher } from '../helpers/sqlcipher'
import { sharedMigrations, CURRENT_SHARED_VERSION } from '../../services/database/sharedMigrations'
import { workspaceMigrations, CURRENT_WORKSPACE_VERSION } from '../../services/database/workspaceMigrations'
import { inspectRestoreDatabase as inspect, planRestore } from '../../services/restore/inspection'

let sqlite: any
let reference: any
const inspectRestoreDatabase = (db: any, name: string, schema = 'main') => inspect(db, name, schema, reference)
let db: any
beforeEach(async () => { sqlite = await loadSqlcipher(); db = new sqlite.oo1.DB(':memory:'); reference = createRestoreSchemaReference(sqlite) })
afterEach(() => { db?.close(); reference?.close() })
function seed(role: 'main' | 'shared' | 'workspace') {
  if (role === 'main') {
    db.exec(NEW_MAIN_SCHEMA_SQL.replaceAll('new_main.', 'main.'))
    db.exec("INSERT INTO app_settings(key,value,updated_at) VALUES('topology_version','2',1),('db_version','24',1),('active_workspace_id','1',1)")
  } else {
    if (role === 'workspace' && !db.selectObjects('PRAGMA database_list').some((row: any) => row.name === 'shared')) seed('shared')
    db.exec(`ATTACH '${role === 'workspace' ? '/workspace-1.db' : ':memory:'}' AS ${role}`)
    for (const sql of Object.values(role === 'shared' ? sharedMigrations : workspaceMigrations).flat()) db.exec(sql)
    db.exec(`INSERT INTO ${role}.${role}_meta(key,value) VALUES('schema_version','${role === 'shared' ? CURRENT_SHARED_VERSION : CURRENT_WORKSPACE_VERSION}')`)
    if (role === 'shared') db.exec("INSERT INTO shared.workspace(id,name) VALUES(1,'Personal')")
    // Inspection accepts a schema argument so fixtures exercise the actual schema.
  }
  return role === 'main' ? 'main' : role
}
it('recognizes a full set using decrypted export filenames and requires every workspace', () => {
  const main = inspectRestoreDatabase(db, 'main-decrypted.db', seed('main'))
  const shared = inspectRestoreDatabase(db, 'shared-decrypted.db', seed('shared'))
  const workspace = inspectRestoreDatabase(db, 'workspace-1-decrypted.db', seed('workspace'))
  expect(planRestore([main, shared, workspace]).mode).toBe('full')
  expect(() => planRestore([main, shared])).toThrow(/workspace-1/)
  expect(() => planRestore([main, workspace])).toThrow(/shared/)
})
it('rejects duplicate destinations and misleading names', () => {
  const shared = inspectRestoreDatabase(db, 'shared.db', seed('shared'))
  expect(() => planRestore([shared, shared])).toThrow(/Duplicate/)
  expect(() => inspectRestoreDatabase(db, 'main.db', 'shared')).toThrow(/role/)
  expect(() => inspectRestoreDatabase(db, '../shared.db', 'shared')).toThrow(/filename/)
})
it('requires an unlocked partial target and preserves its active workspace mapping', () => {
  const workspace = inspectRestoreDatabase(db, 'workspace-1.db', seed('workspace'))
  expect(() => planRestore([workspace])).toThrow(/Unlock/)
  expect(planRestore([workspace], { workspaceIds: [1, 2], activeWorkspaceId: 1, availableWorkspaceIds: [1, 2] })).toMatchObject({ mode: 'partial', retained: ['main.db', 'shared.db', 'workspace-2.db'] })
  expect(() => planRestore([workspace], { workspaceIds: [2], activeWorkspaceId: 2, availableWorkspaceIds: [2] })).toThrow(/registered/)
})
it('rejects unsupported schema versions and non-split inputs', () => {
  seed('main')
  db.exec("UPDATE app_settings SET value='999' WHERE key='topology_version'")
  expect(() => inspectRestoreDatabase(db, 'main.db')).toThrow(/version/)
  db.exec('DROP TABLE app_settings')
  expect(() => inspectRestoreDatabase(db, 'main.db')).toThrow(/schema/)
})
it('reports historical orphan references without modifying them', () => {
  seed('shared')
  db.exec("PRAGMA foreign_keys=OFF; INSERT INTO shared.counterparty_to_tags(counterparty_id,tag_id) VALUES(900,901)")
  const info = inspectRestoreDatabase(db, 'shared.db', 'shared')
  expect(info.findings.length).toBeGreaterThan(0)
  expect(db.selectValue('SELECT count(*) FROM shared.counterparty_to_tags')).toBe(1)
})

it('encrypts a standalone database without changing exact values, metadata, or triggers', async () => {
  const { encryptRestoreDatabase } = await import('../../services/restore/conversion')
  const source = new sqlite.oo1.DB('/plain.db', 'c')
  source.exec(`CREATE TABLE evidence(id INTEGER PRIMARY KEY, amount INTEGER, label TEXT, payload BLOB);
    INSERT INTO evidence VALUES(1,987654321012345678,'a',x'0102');
    CREATE TRIGGER guard BEFORE DELETE ON evidence BEGIN SELECT RAISE(ABORT,'keep'); END;
    PRAGMA user_version=17; PRAGMA application_id=91;`)
  const key = 'ab'.repeat(32)
  await encryptRestoreDatabase(source, '/encrypted.db', key)
  source.close()
  const encrypted = new sqlite.oo1.DB('/encrypted.db', 'w')
  encrypted.exec(`PRAGMA key="x'${key}'"`)
  expect(encrypted.selectValue('SELECT CAST(amount AS TEXT) FROM evidence')).toBe('987654321012345678')
  expect(encrypted.selectValue('PRAGMA user_version')).toBe(17)
  expect(encrypted.selectValue('PRAGMA application_id')).toBe(91)
  expect(() => encrypted.exec('DELETE FROM evidence')).toThrow('keep')
  encrypted.close()
})

it('prepares a full encrypted set and rejects ciphertext and incomplete sets before output', async () => {
  const { processRestore } = await import('../../services/restore/engine')
  const { readCipherFile } = await import('../helpers/sqlcipher')
  const { prepareRestoreCredentials } = await import('../../services/restore/credentials')
  seed('main'); seed('shared'); seed('workspace')
  const inputs = ['main', 'shared', 'workspace'].map(role => ({ name: role === 'workspace' ? 'workspace-1-decrypted.db' : `${role}-decrypted.db`, bytes: sqlite.capi.sqlite3_js_db_export(db.pointer, role).buffer }))
  const io = {
    reference: () => createRestoreSchemaReference(sqlite),
    async write(name: string, bytes: Uint8Array) { sqlite.capi.sqlite3_js_posix_create_file('/' + name, bytes, bytes.length) },
    async read(name: string) { const opened = new sqlite.oo1.DB('/' + name, 'r'); try { return readCipherFile(sqlite, opened) } finally { opened.close() } },
    async remove() {},
    open(name: string) { return new sqlite.oo1.DB('/' + name, 'w') },
  }
  expect((await processRestore(io, { inputs })).plan.mode).toBe('full')
  await expect(processRestore(io, { inputs: inputs.slice(0, 2) })).rejects.toThrow(/workspace-1/)
  await expect(processRestore(io, { inputs: [{ name: 'main.db', bytes: new Uint8Array(100).buffer }] })).rejects.toThrow(/decrypted/)
  const credentials = await prepareRestoreCredentials('123456')
  const result = await processRestore(io, { inputs, credentials }, undefined, true)
  expect(result.files).toHaveLength(3)
  for (const file of result.files) {
    await io.write('check.db', file.bytes)
    const check = io.open('check.db')
    check.exec(`PRAGMA key="x'${file.destination === 'main.db' ? credentials.appKey : credentials.sharedKey}'"`)
    expect(check.selectValue('PRAGMA integrity_check')).toBe('ok')
    if (file.destination === 'main.db') {
      expect(check.selectValue("SELECT value FROM app_settings WHERE key='shared_dek_wrapped'")).toBe(credentials.settings.shared_dek_wrapped)
      expect(check.selectValue("SELECT value FROM app_settings WHERE key='active_workspace_id'")).toBe('1')
    }
    check.close()
  }
})

it('refuses a workspace with missing balance-maintenance triggers', () => {
  seed('workspace')
  db.exec('DROP TRIGGER workspace.trg_add_trx_base')
  expect(() => inspectRestoreDatabase(db, 'workspace-1.db', 'workspace')).toThrow(/schema|trigger/)
})

it('requires main to be a split database when restoring a partial set', async () => {
  const { processRestore } = await import('../../services/restore/engine')
  seed('shared'); seed('workspace')
  const input = { name: 'workspace-1.db', bytes: sqlite.capi.sqlite3_js_db_export(db.pointer, 'workspace').buffer }
  const io = {
    reference: () => createRestoreSchemaReference(sqlite),
    async write(name: string, bytes: Uint8Array) { sqlite.capi.sqlite3_js_posix_create_file('/' + name, bytes, bytes.length) },
    async read() { return new Uint8Array() }, async remove() {},
    open(name: string) { return new sqlite.oo1.DB('/' + name, 'w') },
  }
  await expect(processRestore(io, { inputs: [input], sharedKey: '22'.repeat(32) }, db)).rejects.toThrow(/split/)
})


it.each([{ roles: ['workspace'] }, { roles: ['shared'] }, { roles: ['shared', 'workspace'] }])('prepares partial %j replacement without changing live main or balances', async ({ roles }) => {
  const { processRestore } = await import('../../services/restore/engine')
  const { readCipherFile } = await import('../helpers/sqlcipher')
  const { databaseContents } = await import('../../services/restore/conversion')
  seed('main'); seed('shared'); seed('workspace')
  db.exec("INSERT INTO shared.tag(id,name) VALUES(7,'Exchange'); INSERT INTO shared.currency(id,code,name,symbol) VALUES(1,'USD','Dollar','$'); INSERT INTO workspace.wallet(id,name) VALUES(1,'Cash'); INSERT INTO workspace.account(id,wallet_id,currency_id) VALUES(1,1,1); INSERT INTO workspace.trx(id,timestamp) VALUES(x'0102',100); INSERT INTO workspace.trx_base(id,trx_id,account_id,tag_id,sign,amount_int,amount_frac,rate_int,rate_frac) VALUES(x'0304',x'0102',1,7,'+',17,987654321012345678,1,0)")
  const before = databaseContents(db)
  const inputs = roles.map(role => ({ name: role === 'workspace' ? 'workspace-1.db' : 'shared.db', bytes: sqlite.capi.sqlite3_js_db_export(db.pointer, role).buffer }))
  const io = {
    reference: () => createRestoreSchemaReference(sqlite),
    async write(name: string, bytes: Uint8Array) { sqlite.capi.sqlite3_js_posix_create_file('/' + name, bytes, bytes.length) },
    async read(name: string) { const opened = new sqlite.oo1.DB('/' + name, 'r'); try { return readCipherFile(sqlite, opened) } finally { opened.close() } },
    async remove() {}, open(name: string) { return new sqlite.oo1.DB('/' + name, 'w') },
  }
  const result = await processRestore(io, { inputs, sharedKey: '22'.repeat(32) }, db, true)
  expect(result.plan.mode).toBe('partial')
  expect(result.files.map(file => file.destination)).toEqual(roles.map(role => role === 'workspace' ? 'workspace-1.db' : 'shared.db'))
  expect(databaseContents(db)).toBe(before)
  expect(db.selectValue('SELECT CAST(balance_frac AS TEXT) FROM workspace.account')).toBe('987654321012345678')
})


it.each([null, '1', '999', 'bad'])('rejects unsupported main db_version %s before installing', value => {
  seed('main')
  if (value === null) db.exec("DELETE FROM app_settings WHERE key='db_version'")
  else db.exec({ sql: "UPDATE app_settings SET value=? WHERE key='db_version'", bind: [value] })
  expect(() => inspectRestoreDatabase(db, 'main.db')).toThrow(/version/)
})
it('rejects missing main columns used by normal sync', () => {
  seed('main')
  db.exec('ALTER TABLE linked_device DROP COLUMN public_key')
  expect(() => inspectRestoreDatabase(db, 'main.db')).toThrow(/schema|column/)
})
it('does not mistake a table for the required balance trigger', () => {
  seed('workspace')
  db.exec('DROP TRIGGER workspace.trg_add_trx_base; CREATE TABLE workspace.trg_add_trx_base(id INTEGER)')
  expect(() => inspectRestoreDatabase(db, 'workspace-1.db', 'workspace')).toThrow(/schema|trigger/)
})

it('cleans every plaintext source after a transient removal failure', async () => {
  const { processRestore } = await import('../../services/restore/engine')
  seed('main'); seed('shared'); seed('workspace')
  const inputs = ['main', 'shared', 'workspace'].map(role => ({ name: role === 'workspace' ? 'workspace-1.db' : `${role}.db`, bytes: sqlite.capi.sqlite3_js_db_export(db.pointer, role).buffer }))
  const staged = new Set<string>()
  let fail = true
  const io = {
    reference: () => createRestoreSchemaReference(sqlite),
    async write(name: string, bytes: Uint8Array) { staged.add(name); sqlite.capi.sqlite3_js_posix_create_file('/' + name, bytes, bytes.length) },
    async read() { return new Uint8Array() },
    async remove(name: string) { if (fail) { fail = false; throw new Error('transient removal failure') }; staged.delete(name) },
    open(name: string) { return new sqlite.oo1.DB('/' + name, 'w') },
  }
  await processRestore(io, { inputs })
  expect(staged.size).toBe(0)
})

it('includes foreign-key findings from retained workspaces in a shared-only preview', async () => {
  const { processRestore } = await import('../../services/restore/engine')
  seed('main'); seed('shared'); seed('workspace')
  db.exec("PRAGMA foreign_keys=OFF; INSERT INTO workspace.trx_note(trx_id,note) VALUES(x'9999','orphan')")
  const io = {
    reference: () => createRestoreSchemaReference(sqlite),
    async write(name: string, bytes: Uint8Array) { sqlite.capi.sqlite3_js_posix_create_file('/' + name, bytes, bytes.length) },
    async read() { return new Uint8Array() }, async remove() {},
    open(name: string) { return new sqlite.oo1.DB('/' + name, 'w') },
  }
  const result = await processRestore(io, { inputs: [{ name: 'shared.db', bytes: sqlite.capi.sqlite3_js_db_export(db.pointer, 'shared').buffer }], sharedKey: '22'.repeat(32) }, db)
  expect(result.plan.findings.some(finding => finding.includes('orphan reference in trx_note'))).toBe(true)
})
