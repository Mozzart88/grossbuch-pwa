import sqlite3InitModule from '../../sqlite-wasm'
import wasmUrl from '../../sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm?url'
import proxyUri from '../../sqlite-wasm/sqlite-wasm/jswasm/sqlite3-opfs-async-proxy.js?url'

interface WorkerMessage {
  id: number
  type: 'init' | 'init_encrypted' | 'exec' | 'query' | 'close' | 'check_db_exists' | 'check_encrypted' | 'migrate_to_encrypted' | 'rekey' | 'wipe'
  sql?: string
  bind?: unknown[]
  key?: string      // Hex-encoded encryption key
  newKey?: string   // Hex-encoded new key for rekey operation
}

interface WorkerResponse {
  id: number
  success: boolean
  data?: unknown
  error?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite3Module: any = null

const DB_FILENAME = '/expense-tracker.sqlite3'

async function getSqlite3() {
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

  db = new sqlite3.oo1.OpfsDb(DB_FILENAME, 'cwt')

  // If encryption key provided, set it
  if (key) {
    db.exec(`PRAGMA key = "x'${key}'"`)
    // Verify decryption by querying sqlite_master
    try {
      db.exec('SELECT count(*) FROM sqlite_master')
    } catch {
      db.close()
      db = null
      throw new Error('Invalid encryption key')
    }
  }

  db.exec('PRAGMA foreign_keys = ON')
}

async function checkDatabaseExists(): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory()
    // Try to get the file handle - if it exists, return true
    try {
      await root.getFileHandle(DB_FILENAME.replace('/', ''))
      return true
    } catch {
      return false
    }
  } catch {
    return false
  }
}

async function rekeyDatabase(_oldKey: string, newKey: string): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  // Rekey the database - oldKey is not needed since DB is already open with it
  db.exec(`PRAGMA rekey = "x'${newKey}'"`)
}

async function wipeDatabase(): Promise<void> {
  // Close existing connection if any
  if (db) {
    db.close()
    db = null
  }

  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(DB_FILENAME.replace('/', ''))
  } catch {
    // File might not exist, which is fine
  }
}

async function checkIsEncrypted(): Promise<boolean> {
  const sqlite3 = await getSqlite3()

  // Close existing connection if any
  if (db) {
    db.close()
    db = null
  }

  let testDb = null
  try {
    // Try opening without encryption key
    testDb = new sqlite3.oo1.OpfsDb(DB_FILENAME, 'r')
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

  // 1. Open unencrypted source database
  const sourceDb = new sqlite3.oo1.OpfsDb(DB_FILENAME, 'r')

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
    await root.removeEntry(DB_FILENAME.replace('/', ''))

    // Read the encrypted temp file
    const tempHandle = await root.getFileHandle(tempFilename.replace('/', ''))
    const tempFile = await tempHandle.getFile()
    const encryptedContent = await tempFile.arrayBuffer()

    // Write to the main filename
    const mainHandle = await root.getFileHandle(DB_FILENAME.replace('/', ''), { create: true })
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

function execSQL(sql: string, bind?: unknown[]): void {
  if (!db) throw new Error('Database not initialized')
  db.exec({ sql, bind })
}

function querySQL<T>(sql: string, bind?: unknown[]): T[] {
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

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, sql, bind, key, newKey } = event.data
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
