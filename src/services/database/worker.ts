import sqlite3InitModule from '../../sqlite-wasm'
import wasmUrl from '../../sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm?url'
import proxyUri from '../../sqlite-wasm/sqlite-wasm/jswasm/sqlite3-opfs-async-proxy.js?url'
import type { OpfsDatabase, Sqlite3Static } from '../../sqlite-wasm'
import { MAIN_DB_FILENAME, LEGACY_DB_FILENAME } from './paths'

declare type SqlValue =
  | string
  | number
  | null
  | bigint
  | Uint8Array
  | Int8Array
  | ArrayBuffer;

interface WorkerMessage {
  id: number
  type: 'init' | 'init_encrypted' | 'exec' | 'query' | 'close' | 'check_db_exists' | 'check_encrypted' | 'migrate_to_encrypted' | 'rekey' | 'wipe' | 'export_decrypted' | 'attach' | 'detach' | 'rekey_schema' | 'finalize_main_rebuild' | 'delete_file'
  sql?: string
  bind?: SqlValue[]
  key?: string      // Hex-encoded encryption key
  newKey?: string   // Hex-encoded new key for rekey operation
  filename?: string // Source filename for export_decrypted, or target file for attach/finalize_main_rebuild/delete_file
  schema?: string   // Schema name for attach/detach/rekey_schema (e.g. "shared")
}

interface WorkerResponse {
  id: number
  success: boolean
  data?: unknown
  error?: string
}

let db: OpfsDatabase | null = null
let sqlite3Module: Sqlite3Static | null = null

// The App DB's actual on-disk filename for the current session — MAIN_DB_FILENAME
// once a migrated/fresh install has completed its temp-build-and-swap, or
// LEGACY_DB_FILENAME while still on the pre-split topology (or mid-migration).
// Tracked so finalizeMainRebuild() knows which file to delete after swapping
// the freshly built replacement into place.
let currentMainFilename: string = LEGACY_DB_FILENAME

async function opfsFileExists(filename: string): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory()
    await root.getFileHandle(filename.replace('/', ''))
    return true
  } catch {
    return false
  }
}

// Bootstrap check: prefer MAIN_DB_FILENAME (a migrated/fresh install that has
// already completed its temp-build-and-swap — see legacyMigration.ts). Fall
// back to LEGACY_DB_FILENAME otherwise, whether that's a genuine pre-split
// installation or a brand new install that hasn't migrated yet (both go
// through the same legacy-migration-then-swap path — see design.md).
async function resolveMainFilename(): Promise<string> {
  if (await opfsFileExists(MAIN_DB_FILENAME)) return MAIN_DB_FILENAME
  return LEGACY_DB_FILENAME
}

async function getSqlite3(): Promise<Sqlite3Static> {
  if (sqlite3Module) return sqlite3Module

  sqlite3Module = await sqlite3InitModule({
    print: console.log,
    printErr: console.error,
    locateFile: () => wasmUrl,
    proxyUri
  })

  if (sqlite3Module.oo1.OpfsDb === undefined) {
    throw new Error('OPFS not available. Make sure COOP/COEP headers are set.')
  }

  return sqlite3Module
}

async function initDatabase(key?: string) {
  if (db) return

  const sqlite3 = await getSqlite3()
  currentMainFilename = await resolveMainFilename()

  let sqlite3OpenFlags = 'cw'
  if (import.meta.env.DEV) {
    sqlite3OpenFlags += 't'
  }
  db = new sqlite3.oo1.OpfsDb(currentMainFilename, sqlite3OpenFlags)


  // If encryption key provided, set it
  if (key) {
    // db.exec(`PRAGMA key = "x'${key}'"`)
    // Verify decryption by querying sqlite_master
    try {
      db.exec([
        `PRAGMA key = "x'${key}'";`,
        'SELECT count(*) FROM sqlite_master;'
      ].join(' '))
    } catch {
      db.close()
      db = null
      throw new Error('Invalid encryption key')
    }
  }

  db.exec('PRAGMA foreign_keys = ON')
}

async function checkDatabaseExists(): Promise<boolean> {
  return (await opfsFileExists(MAIN_DB_FILENAME)) || (await opfsFileExists(LEGACY_DB_FILENAME))
}

async function rekeyDatabase(_oldKey: string, newKey: string): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  // Rekey the database - oldKey is not needed since DB is already open with it
  db.exec(`PRAGMA rekey = "x'${newKey}'"`)
}

async function attachDatabase(schema: string, filename: string, key: string): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  try {
    db.exec([
      `ATTACH DATABASE '${filename}' AS ${schema} KEY "x'${key}'";`,
      `SELECT count(*) FROM ${schema}.sqlite_master;`
    ].join(' '))
  } catch {
    try {
      db.exec(`DETACH DATABASE ${schema}`)
    } catch {
      // Ignore detach errors — attach may not have partially succeeded
    }
    throw new Error(`Invalid encryption key for schema "${schema}"`)
  }
}

async function detachDatabase(schema: string): Promise<void> {
  if (!db) throw new Error('Database not initialized')
  db.exec(`DETACH DATABASE ${schema}`)
}

async function rekeyAttachedSchema(schema: string, newKey: string): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  // Schema-qualified PRAGMA rekey — the same "x'<hex>'" raw-key text form used
  // by every other key-setting call in this file (PRAGMA key/rekey, ATTACH ...
  // KEY). The sqlite3_rekey_v2() C API was tried first, but it takes the key
  // as a raw byte pointer rather than this "x'...'" text form, which this
  // SQLCipher build's raw-key detection doesn't recognize on that path — it
  // silently derives a *different* key via its passphrase KDF instead of
  // using the bytes verbatim, leaving the schema rekeyed to a key that the
  // "x'<hex>'" form (used on every subsequent ATTACH) can never reproduce.
  db.exec(`PRAGMA ${schema}.rekey = "x'${newKey}'"`)
}

async function wipeDatabase(): Promise<void> {
  // Close existing connection if any
  if (db) {
    db.close()
    db = null
  }

  // Remove every OPFS entry, not just the App DB filename — a real
  // installation also has a Shared DB file and one-or-more workspace files
  // (`shared.db`, `workspace-{n}.db`), none of which can be
  // enumerated by name without attaching/decrypting them first, which
  // defeats the point of a "forgot PIN" wipe. Nothing else is expected to
  // live in the OPFS root.
  try {
    const root = await navigator.storage.getDirectory()
    for await (const name of root.keys()) {
      try {
        await root.removeEntry(name, { recursive: true })
      } catch {
        // Ignore entries that can't be removed
      }
    }
  } catch {
    // Directory might not exist, which is fine
  }
}

async function checkIsEncrypted(): Promise<boolean> {
  const sqlite3 = await getSqlite3()

  // Close existing connection if any
  if (db) {
    db.close()
    db = null
  }

  const filename = await resolveMainFilename()

  let testDb = null
  try {
    // Try opening without encryption key
    testDb = new sqlite3.oo1.OpfsDb(filename, 'r')
    // If we can read schema without key, it's unencrypted
    testDb.exec('SELECT count(*) FROM sqlite_master')
    testDb.close()
    return false // Unencrypted - can read without key
  } catch {
    if (testDb) {
      try {
        testDb.close()
      } catch {
        // Ignore close errors
      }
    }
    return true // Encrypted (or corrupted) - cannot read without key
  }
}

async function migrateToEncrypted(encryptionKey: string): Promise<void> {
  const sqlite3 = await getSqlite3()
  const tempFilename = '/expense-tracker-temp.sqlite3'

  // Close existing connection if any
  if (db) {
    db.close()
    db = null
  }

  // Only reachable pre-topology-migration (an unencrypted DB predates the
  // App/Shared/Workspace split entirely), so the source is always the legacy
  // filename — never MAIN_DB_FILENAME, which is only ever created already-encrypted.
  // 1. Open unencrypted source database
  let sqlite3OpenFlags: string = 'rw'
  if (import.meta.env.DEV) {
    sqlite3OpenFlags += 't'
  }
  const sourceDb = new sqlite3.oo1.OpfsDb(LEGACY_DB_FILENAME, sqlite3OpenFlags)

  try {
    // 2. Create and attach encrypted database
    await createFile(tempFilename.replace('/', ''))
    sourceDb.exec(`ATTACH DATABASE '${tempFilename}' AS encrypted KEY "x'${encryptionKey}'"`)

    // 3. Export all data to encrypted database using sqlcipher_export
    sourceDb.exec(`SELECT sqlcipher_export('encrypted')`)

    // 4. Detach encrypted database
    sourceDb.exec('DETACH DATABASE encrypted')

    // 5. Close source database
    sourceDb.close()

    // 6. Now swap the files: delete old, rename temp to main
    const root = await navigator.storage.getDirectory()

    // Delete the old unencrypted file
    await root.removeEntry(LEGACY_DB_FILENAME.replace('/', ''))

    // Read the encrypted temp file
    const tempHandle = await root.getFileHandle(tempFilename.replace('/', ''))
    const tempFile = await tempHandle.getFile()
    const encryptedContent = await tempFile.arrayBuffer()

    // Write to the main filename
    const mainHandle = await root.getFileHandle(LEGACY_DB_FILENAME.replace('/', ''), { create: true })
    const writable = await mainHandle.createWritable()
    await writable.write(encryptedContent)
    await writable.close()

    // Delete the temp file
    await root.removeEntry(tempFilename.replace('/', ''))

  } catch (error) {
    try {
      sourceDb.close()
    } catch {
      // Ignore close errors
    }
    throw error
  }
}

async function createFile(fileName: string) {
  const root = await navigator.storage.getDirectory()
  return await root.getFileHandle(fileName, { create: true })
}

// Tolerant single-file delete — used to guarantee a clean slate before
// (re)building a temp file, so a retried migration never resumes into a
// partially-written leftover from an earlier crashed attempt (see
// legacyMigration.ts).
async function deleteFile(filename: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(filename.replace('/', ''))
  } catch {
    // Already absent — deletion is idempotent.
  }
}

/**
 * Completes legacyMigration.ts's temp-build-and-swap: the caller has already
 * built and fully populated `tempFilename` (attached to the still-open `db`
 * connection under some alias, now detached) with the App DB's replacement
 * schema/data. This closes `db`, writes `tempFilename`'s content to
 * MAIN_DB_FILENAME first (so a crash after this point still leaves a valid,
 * directly-openable main.db — see paths.ts), only then deletes the old
 * source file (currentMainFilename, e.g. the legacy single-file DB), cleans
 * up the temp file, and reopens `db` at MAIN_DB_FILENAME with `key`.
 * Attached schemas (shared/workspace) do not survive this — the caller must
 * re-attach them.
 */
async function finalizeMainRebuild(tempFilename: string, key: string): Promise<void> {
  if (!db) throw new Error('Database not initialized')
  const sqlite3 = await getSqlite3()
  const sourceFilename = currentMainFilename

  db.close()
  db = null

  const root = await navigator.storage.getDirectory()

  const tempHandle = await root.getFileHandle(tempFilename.replace('/', ''))
  const tempFile = await tempHandle.getFile()
  const content = await tempFile.arrayBuffer()

  const finalHandle = await root.getFileHandle(MAIN_DB_FILENAME.replace('/', ''), { create: true })
  const writable = await finalHandle.createWritable()
  await writable.write(content)
  await writable.close()

  if (sourceFilename !== MAIN_DB_FILENAME) {
    await deleteFile(sourceFilename)
  }
  await deleteFile(tempFilename)

  let sqlite3OpenFlags = 'cw'
  if (import.meta.env.DEV) {
    sqlite3OpenFlags += 't'
  }
  db = new sqlite3.oo1.OpfsDb(MAIN_DB_FILENAME, sqlite3OpenFlags)
  db.exec([
    `PRAGMA key = "x'${key}'";`,
    'SELECT count(*) FROM sqlite_master;'
  ].join(' '))
  db.exec('PRAGMA foreign_keys = ON')
  currentMainFilename = MAIN_DB_FILENAME
}

function execSQL(sql: string, bind?: SqlValue[]): void {
  if (!db) throw new Error('Database not initialized')

  db.exec({ sql, bind })
}

function querySQL<T>(sql: string, bind?: SqlValue[]): T[] {
  if (!db) throw new Error('Database not initialized')
  const results: T[] = []

  db.exec({
    sql,
    bind,
    rowMode: 'object',
    callback: (row: unknown) => {
      results.push(row as T)
    },
  })

  return results
}

function getLastInsertId(): number {
  const result = querySQL<{ id: number }>('SELECT last_insert_rowid() as id')
  return result[0]?.id ?? 0
}

function getChanges(): number {
  return db?.changes() ?? 0
}

function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

async function exportDecrypted(filename: string, key: string): Promise<ArrayBuffer> {
  const sqlite3 = await getSqlite3()
  const tempFilename = '/export-temp-decrypted.sqlite3'

  // Close existing connection if any
  if (db) {
    db.close()
    db = null
  }

  let sqlite3OpenFlags = 'cw'
  if (import.meta.env.DEV) {
    sqlite3OpenFlags += 't'
  }
  // 1. Open encrypted source database in read-only mode
  const sourceDb = new sqlite3.oo1.OpfsDb(filename, sqlite3OpenFlags)

  try {
    // Set encryption key and verify
    sourceDb.exec([
      `PRAGMA key = "x'${key}'";`,
      'SELECT count(*) FROM sqlite_master;'
    ].join(' '))

    // 2. Create temp file in OPFS for decrypted export
    await createFile(tempFilename.replace('/', ''))

    // 3. Attach temp as unencrypted database (empty key = no encryption)
    sourceDb.exec(`ATTACH DATABASE '${tempFilename}' AS plaintext KEY ''`)

    // 4. Export data to plaintext database
    sourceDb.exec(`SELECT sqlcipher_export('plaintext')`)

    // 5. Detach
    sourceDb.exec('DETACH DATABASE plaintext')

    // 6. Close source database
    sourceDb.close()

    // 7. Read temp file as ArrayBuffer from OPFS
    const root = await navigator.storage.getDirectory()
    const tempHandle = await root.getFileHandle(tempFilename.replace('/', ''))
    const tempFile = await tempHandle.getFile()
    const decryptedContent = await tempFile.arrayBuffer()

    // 8. Delete temp file from OPFS
    await root.removeEntry(tempFilename.replace('/', ''))

    // 9. Return ArrayBuffer
    return decryptedContent

  } catch (error) {
    try {
      sourceDb.close()
    } catch {
      // Ignore close errors
    }
    // Clean up temp file if it exists
    try {
      const root = await navigator.storage.getDirectory()
      await root.removeEntry(tempFilename.replace('/', ''))
    } catch {
      // Ignore cleanup errors
    }
    throw error
  }
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, sql, bind, key, newKey, filename, schema } = event.data
  const response: WorkerResponse = { id, success: false }

  try {
    switch (type) {
      case 'init':
        await initDatabase()
        response.success = true
        break

      case 'init_encrypted':
        await initDatabase(key)
        response.success = true
        break

      case 'check_db_exists':
        response.success = true
        response.data = await checkDatabaseExists()
        break

      case 'check_encrypted':
        response.success = true
        response.data = await checkIsEncrypted()
        break

      case 'migrate_to_encrypted':
        if (!key) throw new Error('Encryption key required for migration')
        await migrateToEncrypted(key)
        response.success = true
        break

      case 'rekey':
        if (!key || !newKey) throw new Error('Both key and newKey required for rekey')
        await rekeyDatabase(key, newKey)
        response.success = true
        break

      case 'wipe':
        await wipeDatabase()
        response.success = true
        break

      case 'attach':
        if (!schema || !filename || !key) throw new Error('Schema, filename, and key required for attach')
        await attachDatabase(schema, filename, key)
        response.success = true
        break

      case 'detach':
        if (!schema) throw new Error('Schema required for detach')
        await detachDatabase(schema)
        response.success = true
        break

      case 'rekey_schema':
        if (!schema || !newKey) throw new Error('Schema and newKey required for rekey_schema')
        await rekeyAttachedSchema(schema, newKey)
        response.success = true
        break

      case 'export_decrypted':
        if (!filename || !key) throw new Error('Filename and key required for export_decrypted')
        response.data = await exportDecrypted(filename, key)
        response.success = true
        break

      case 'finalize_main_rebuild':
        if (!filename || !key) throw new Error('Filename and key required for finalize_main_rebuild')
        await finalizeMainRebuild(filename, key)
        response.success = true
        break

      case 'delete_file':
        if (!filename) throw new Error('Filename required for delete_file')
        await deleteFile(filename)
        response.success = true
        break

      case 'exec':
        if (!sql) throw new Error('SQL required for exec')
        execSQL(sql, bind)
        response.success = true
        response.data = { changes: getChanges(), lastInsertId: getLastInsertId() }
        break

      case 'query':
        if (!sql) throw new Error('SQL required for query')
        response.success = true
        response.data = querySQL(sql, bind)
        break

      case 'close':
        closeDatabase()
        response.success = true
        break

      default:
        throw new Error(`Unknown message type: ${type}`)
    }
  } catch (error) {
    response.success = false
    response.error = error instanceof Error ? error.message : String(error)
  }

  self.postMessage(response)
}
