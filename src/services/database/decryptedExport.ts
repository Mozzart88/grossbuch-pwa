import type { OpfsDatabase, Sqlite3Static } from '../../sqlite-wasm'
import type { DecryptedExportRequest } from './decryptedExportTypes'
import { MAIN_DB_FILENAME, SHARED_DB_FILENAME, LEGACY_DB_FILENAME, workspaceDbFilename } from './paths'

function sourceFilename(request: DecryptedExportRequest): string {
  switch (request.source?.kind) {
    case 'main': return MAIN_DB_FILENAME
    case 'shared': return SHARED_DB_FILENAME
    case 'legacy': return LEGACY_DB_FILENAME
    case 'workspace':
      if (Number.isSafeInteger(request.source.workspaceId) && request.source.workspaceId > 0) {
        return workspaceDbFilename(request.source.workspaceId)
      }
  }
  throw new Error('Unsupported database source.')
}

function metadata(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
    throw new Error('Invalid database metadata.')
  }
  return value
}

/** Runs only under the worker dispatcher’s exclusive export operation. */
export async function exportDecrypted(
  db: OpfsDatabase,
  sqlite: Sqlite3Static,
  request: DecryptedExportRequest,
): Promise<ArrayBuffer> {
  const filename = sourceFilename(request)
  if (!/^[a-f0-9]{64}$/i.test(request.key)) throw new Error('Export encryption context is unavailable.')
  const autocommit = () => sqlite.wasm.exports.sqlite3_get_autocommit(db.pointer) !== 0
  if (!autocommit()) throw new Error('A database transaction is active. Try exporting again after it finishes.')
  const databases = () => db.selectObjects('PRAGMA database_list') as { name: string; file: string }[]
  const attached = (name: string) => databases().some(row => row.name === name)
  if (attached('export_source') || attached('export_target')) {
    throw new Error('Export cleanup is incomplete. Temporary attachments are still in use.')
  }
  if (request.source.kind === 'workspace' && !db.selectValue(
    'SELECT id FROM shared.workspace WHERE id = ?', [request.source.workspaceId]
  )) throw new Error('Workspace is not registered.')

  const root = await navigator.storage.getDirectory()
  try { await root.getFileHandle(filename.slice(1)) } catch {
    throw new Error('Database file not found or unavailable.')
  }
  // Only trusted live aliases may be used in SQL; paths come from canonical IDs.
  const existing = databases().find(row =>
    ['main', 'shared', 'workspace'].includes(row.name) && row.file === filename
  )
  const source = existing?.name ?? 'export_source'
  const targetName = `export-decrypted-${crypto.randomUUID()}.db`
  const targetFiles = [targetName, `${targetName}-journal`, `${targetName}-wal`, `${targetName}-shm`]
  // A collision must never turn an unrelated file into request-owned state.
  for (const name of targetFiles) {
    try {
      await root.getFileHandle(name)
      throw new Error('Temporary export filename is already in use.')
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error
    }
  }

  let sourceAttempted = false
  let targetAttempted = false
  let targetCreated = false
  let transactionOwned = false
  let phase = 'setup'
  let failure: string | undefined
  let bytes: ArrayBuffer | undefined
  const cleanupFailures = new Set<string>()
  try {
    if (!existing) {
      phase = 'source attachment'
      sourceAttempted = true
      // Read-only URI also prevents SQLite from creating a source if it vanishes
      // after the existence check. Bound values keep keys out of SQL errors.
      db.exec({ sql: 'ATTACH DATABASE ? AS export_source KEY ?', bind: [`file:${filename}?mode=ro`, `x'${request.key}'`] })
      db.selectValue('SELECT count(*) FROM export_source.sqlite_master')
    }
    phase = 'destination creation'
    targetCreated = true
    await root.getFileHandle(targetName, { create: true })
    phase = 'destination attachment'
    targetAttempted = true
    db.exec({ sql: "ATTACH DATABASE ? AS export_target KEY ''", bind: ['/' + targetName] })
    phase = 'copy'
    db.exec('BEGIN')
    transactionOwned = true
    const version = metadata(db.selectValue(`PRAGMA ${source}.user_version`))
    const appId = metadata(db.selectValue(`PRAGMA ${source}.application_id`))
    db.exec({ sql: "SELECT sqlcipher_export('export_target', ?)", bind: [source] })
    db.exec(`PRAGMA export_target.user_version = ${version}`)
    db.exec(`PRAGMA export_target.application_id = ${appId}`)
    db.exec('COMMIT')
    transactionOwned = false
    phase = 'destination detachment'
    db.exec('DETACH DATABASE export_target')
    if (sourceAttempted) {
      phase = 'source detachment'
      db.exec('DETACH DATABASE export_source')
    }
    phase = 'file read'
    bytes = await (await (await root.getFileHandle(targetName)).getFile()).arrayBuffer()
  } catch {
    // SQLCipher and injected filesystem errors can contain keys/SQL. Only the
    // operation phase crosses the worker boundary, never the underlying error.
    failure = `Database export failed during ${phase}.`
  } finally {
    if (transactionOwned && !autocommit()) {
      try { db.exec('ROLLBACK') } catch { cleanupFailures.add('rollback') }
    }
    for (const [alias, attempted] of [['export_target', targetAttempted], ['export_source', sourceAttempted]] as const) {
      if (!attempted) continue
      // A transient detach failure can be retried. Even an ATTACH which threw
      // may have acquired the alias, so inspect actual topology in all paths.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attached(alias)) db.exec(`DETACH DATABASE ${alias}`)
          break
        } catch { cleanupFailures.add(`detach ${alias === 'export_target' ? 'destination' : 'source'}`) }
      }
    }
    if (targetCreated) {
      // Never unlink a destination that remains attached after failed cleanup.
      if (attached('export_target')) cleanupFailures.add('remove destination')
      else {
        for (const name of targetFiles) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              await root.removeEntry(name)
              break
            } catch (error) {
              if (error instanceof DOMException && error.name === 'NotFoundError') break
              cleanupFailures.add('remove destination')
            }
          }
        }
      }
    }
  }
  if (cleanupFailures.size) {
    throw new Error(`${failure ?? 'Database export could not complete.'} Cleanup failed: ${[...cleanupFailures].join(', ')}.`)
  }
  if (failure || !bytes) throw new Error(failure ?? 'Database export produced no data.')
  return bytes
}
