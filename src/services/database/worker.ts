import sqlite3InitModule from '../../sqlite-wasm'
import wasmUrl from '../../sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm?url'
import proxyUri from '../../sqlite-wasm/sqlite-wasm/jswasm/sqlite3-opfs-async-proxy.js?url'

interface WorkerMessage {
  id: number
  type: 'init' | 'exec' | 'query' | 'close'
  sql?: string
  bind?: unknown[]
}

interface WorkerResponse {
  id: number
  success: boolean
  data?: unknown
  error?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null

async function initDatabase() {
  if (db) return

  const sqlite3 = await sqlite3InitModule({
    print: console.log,
    printErr: console.error,
    locateFile: () => wasmUrl,
    proxyUri
  })

  if (sqlite3.oo1.OpfsDb === undefined) {
    throw new Error('OPFS not available. Make sure COOP/COEP headers are set.')
  }

  db = new sqlite3.oo1.OpfsDb('/expense-tracker.sqlite3', 'cwt')
  db.exec('PRAGMA foreign_keys = ON')
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
  const { id, type, sql, bind } = event.data
  const response: WorkerResponse = { id, success: false }

  try {
    switch (type) {
      case 'init':
        await initDatabase()
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
