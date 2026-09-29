import type { OpfsDatabase } from '../../sqlite-wasm'
import { databaseContents, encryptRestoreDatabase } from './conversion'
import { inspectRestoreDatabase, planRestore, type RestoreTarget, type RestoreFileInfo } from './inspection'
import type { PreparedRestore, RestoreRequest } from './types'

export interface RestoreIO {
  write(name: string, bytes: Uint8Array): Promise<void>
  read(name: string): Promise<Uint8Array>
  remove(name: string): Promise<void>
  open(name: string): OpfsDatabase
  reference(): OpfsDatabase
}
const header = 'SQLite format 3\0'
function unlock(db: OpfsDatabase, key: string) {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('Restore encryption context unavailable')
  try {
    db.exec(`PRAGMA key="x'${key}'"`)
    db.selectValue('SELECT count(*) FROM sqlite_master')
  } catch { throw new Error('Unable to open encrypted restore database') }
}

/** All IO is scoped to unique staging names; live sources are read only. */
export async function processRestore(io: RestoreIO, request: RestoreRequest, live?: OpfsDatabase, encrypt = false): Promise<PreparedRestore> {
  const reference = io.reference()
  const ownedNames: string[] = []
  const opened: OpfsDatabase[] = []
  const selected: { db: OpfsDatabase; info: RestoreFileInfo }[] = []
  const prefix = `gb-restore-input-${crypto.randomUUID()}`
  let outcome: { result: PreparedRestore } | { error: unknown }
  try {
    for (const [index, input] of request.inputs.entries()) {
      if (new TextDecoder().decode(input.bytes.slice(0, 16)) !== header) throw new Error(`${input.name}: select a decrypted SQLite database`)
      const name = `${prefix}-${index}.db`
      ownedNames.push(name)
      await io.write(name, new Uint8Array(input.bytes))
      const db = io.open(name)
      opened.push(db)
      // Uploaded triggers are retained but must not run during metadata edits.
      const info = inspectRestoreDatabase(db, input.name, 'main', reference)
      selected.push({ db, info })
    }
    const full = selected.some(source => source.info.role === 'main')
    let target: RestoreTarget | undefined
    const retainedFindings: string[] = []
    const resulting = new Map<string, { db: OpfsDatabase; schema: string }>()
    for (const source of selected) resulting.set(source.info.destination, { db: source.db, schema: 'main' })
    if (!full) {
      if (!live || !request.sharedKey) throw new Error('Unlock the existing installation for partial restore')
      try { inspectRestoreDatabase(live, 'main.db', 'main', reference) } catch { throw new Error('Partial restore requires a supported split installation') }
      const registered = (live.selectObjects('SELECT id FROM shared.workspace ORDER BY id') as { id: number }[]).map(row => row.id)
      const suppliedShared = selected.find(source => source.info.role === 'shared')
      const ids = suppliedShared?.info.workspaceIds ?? registered
      const available: number[] = []
      const attachments = live.selectObjects('PRAGMA database_list') as { name: string; file: string }[]
      if (!resulting.has('shared.db')) {
        retainedFindings.push(...inspectRestoreDatabase(live, 'shared.db', 'shared', reference).findings)
        resulting.set('shared.db', { db: live, schema: 'shared' })
      }
      for (const id of ids) {
        const name = `workspace-${id}.db`
        if (resulting.has(name)) continue
        const attached = attachments.find(row => row.file === '/' + name && row.name === 'workspace')
        try {
          if (attached) {
            retainedFindings.push(...inspectRestoreDatabase(live, name, 'workspace', reference).findings)
            resulting.set(name, { db: live, schema: 'workspace' })
          } else {
            // open() must refuse absent files rather than silently create them.
            const db = io.open(name)
            opened.push(db)
            unlock(db, request.sharedKey)
            retainedFindings.push(...inspectRestoreDatabase(db, name, 'main', reference).findings)
            resulting.set(name, { db, schema: 'main' })
          }
          available.push(id)
        } catch { throw new Error(`Missing or unreadable ${name}; include a decrypted replacement`) }
      }
      target = { workspaceIds: registered, availableWorkspaceIds: [...new Set([...available, ...registered])], activeWorkspaceId: Number(live.selectValue("SELECT value FROM main.app_settings WHERE key='active_workspace_id'")) }
    }
    const plan = planRestore(selected.map(source => source.info), target)
    plan.findings.push(...retainedFindings)
    // SQLite cannot check references crossing files. Inventory them explicitly.
    const shared = resulting.get('shared.db')!
    const ids = (table: string) => new Set((shared.db.selectObjects(`SELECT id FROM ${shared.schema}.${table}`) as { id: number }[]).map(row => String(row.id)))
    const tags = ids('tag'), currencies = ids('currency'), counterparties = ids('counterparty')
    for (const id of plan.workspaceIds) {
      const source = resulting.get(`workspace-${id}.db`)!
      for (const [table, column, valid] of [
        ['trx_base', 'tag_id', tags], ['trx_base_tag_context', 'tag_id', tags], ['wallet_to_tags', 'tag_id', tags],
        ['account_to_tags', 'tag_id', tags], ['budget', 'tag_id', tags], ['budget_tag_context', 'tag_id', tags], ['goal_to_tags', 'tag_id', tags], ['account', 'currency_id', currencies], ['trx_to_counterparty', 'counterparty_id', counterparties],
      ] as const) {
        const missing = source.db.selectObjects(`SELECT DISTINCT ${column} AS id FROM ${source.schema}.${table} WHERE ${column} IS NOT NULL`) as { id: number }[]
        for (const row of missing) if (!valid.has(String(row.id))) plan.findings.push(`workspace-${id}.db: ${table}.${column} references missing ${row.id}`)
      }
    }
    const files: PreparedRestore['files'] = []
    if (encrypt) {
      if (full && !request.credentials) throw new Error('Choose a new PIN for full restore')
      for (const [index, source] of selected.entries()) {
        if (source.info.role === 'main') {
          // Temporarily remove triggers inside the staging DB only, then restore
          // their original definitions so auth edits cannot touch other records.
          const triggers = source.db.selectObjects("SELECT name,sql FROM sqlite_master WHERE type='trigger'") as { name: string; sql: string }[]
          source.db.exec('BEGIN')
          try {
            for (const trigger of triggers) source.db.exec(`DROP TRIGGER "${trigger.name.replaceAll('"', '""')}"`)
            for (const [key, value] of Object.entries(request.credentials!.settings)) source.db.exec({ sql: 'INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES(?,?,unixepoch())', bind: [key, value] })
            for (const trigger of triggers) source.db.exec(trigger.sql)
            source.db.exec('COMMIT')
          } catch (error) { source.db.exec('ROLLBACK'); throw error }
        }
        const key = full ? source.info.role === 'main' ? request.credentials!.appKey : request.credentials!.sharedKey : request.sharedKey!
        const name = `${prefix}-${index}-encrypted.db`
        ownedNames.push(name)
        await io.write(name, new Uint8Array())
        await encryptRestoreDatabase(source.db, '/' + name, key)
        const verify = io.open(name)
        try {
          unlock(verify, key)
          if (databaseContents(verify) !== databaseContents(source.db)) throw new Error('Reopened encrypted database differs from source')
        } finally { verify.close() }
        files.push({ destination: source.info.destination, bytes: await io.read(name) })
      }
    }
    outcome = { result: { plan, files } }
  } catch (error) { outcome = { error } }
  {
    const failures: string[] = []
    for (const source of [...opened.reverse(), reference]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try { source.close(); break } catch { if (attempt === 1) failures.push('close') }
      }
    }
    for (const name of ownedNames) {
      for (const suffix of ['', '-journal', '-wal', '-shm']) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try { await io.remove(name + suffix); break } catch { if (attempt === 1) failures.push('remove') }
        }
      }
    }
    if (failures.length) outcome = { error: new Error('Restore temporary-file cleanup failed. Reload to retry cleanup before continuing.') }
  }
  if ('error' in outcome) throw outcome.error
  return outcome.result
}
