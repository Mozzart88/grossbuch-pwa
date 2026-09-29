import type { DecryptedExportRequest } from './decryptedExportTypes'

interface WorkerResponse {
  id: number
  success: boolean
  data?: unknown
  error?: string
}

interface ExecResult {
  changes: number
  lastInsertId: number
}

let worker: Worker | null = null
let messageId = 0
const pendingRequests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
let initPromise: Promise<void> | null = null

type DbWriteListener = () => void
const writeListeners = new Set<DbWriteListener>()
let suppressWriteNotifications = false

export function setSuppressWriteNotifications(suppress: boolean): void {
  suppressWriteNotifications = suppress
}

export function onDbWrite(listener: DbWriteListener): () => void {
  writeListeners.add(listener)
  return () => { writeListeners.delete(listener) }
}

function notifyWriteListeners() {
  if (suppressWriteNotifications) return
  for (const listener of writeListeners) {
    try { listener() } catch (error) { console.error('Database write observer failed:', error) }
  }
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, success, data, error } = event.data
      const pending = pendingRequests.get(id)

      if (pending) {
        pendingRequests.delete(id)
        if (success) {
          pending.resolve(data)
        } else {
          pending.reject(new Error(error || 'Unknown error'))
        }
      }
    }

    worker.onerror = (error) => {
      console.error('Worker error:', error)
      for (const pending of pendingRequests.values()) pending.reject(new Error('Database worker failed; reinitialize the connection'))
      pendingRequests.clear()
      worker?.terminate()
      worker = null
      initPromise = null
    }
  }

  return worker
}

interface SendMessageOptions {
  owner?: string
  exportRequest?: DecryptedExportRequest
  sql?: string
  bind?: unknown[]
  statements?: { sql: string; bind?: unknown[] }[]
  key?: string
  newKey?: string
  filename?: string
  schema?: string
}

function sendMessage(type: string, options: SendMessageOptions = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++messageId
    pendingRequests.set(id, { resolve, reject })
    try { getWorker().postMessage({ id, type, ...options }) } catch (error) {
      pendingRequests.delete(id)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export async function initDatabase(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = sendMessage('init') as Promise<void>
  return initPromise
}

export async function initEncryptedDatabase(key: string): Promise<void> {
  if (initPromise) {
    // Already initialized, close first
    await closeDatabase()
  }

  initPromise = sendMessage('init_encrypted', { key }) as Promise<void>
  return initPromise
}

export async function checkDatabaseExists(): Promise<boolean> {
  const result = await sendMessage('check_db_exists')
  return result as boolean
}

export async function checkIsEncrypted(): Promise<boolean> {
  const result = await sendMessage('check_encrypted')
  return result as boolean
}

export async function migrateToEncrypted(key: string): Promise<void> {
  await sendMessage('migrate_to_encrypted', { key })
}

export async function rekeyDatabase(key: string, newKey: string): Promise<void> {
  await sendMessage('rekey', { key, newKey })
}

export async function wipeDatabase(): Promise<void> {
  await sendMessage('wipe')
  initPromise = null
}

export async function attachDatabase(schema: string, filename: string, key: string): Promise<void> {
  await sendMessage('attach', { schema, filename, key })
}

export async function detachDatabase(schema: string): Promise<void> {
  await sendMessage('detach', { schema })
}

export async function rekeySchema(schema: string, newKey: string): Promise<void> {
  await sendMessage('rekey_schema', { schema, newKey })
}

export async function finalizeMainRebuild(tempFilename: string, key: string): Promise<void> {
  await sendMessage('finalize_main_rebuild', { filename: tempFilename, key })
}

export async function deleteFile(filename: string): Promise<void> {
  await sendMessage('delete_file', { filename })
}

export async function validateReferenceExists(qualifiedTable: string, idColumn: string, id: unknown): Promise<boolean> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT 1 FROM ${qualifiedTable} WHERE ${idColumn} = ?`,
    [id]
  )
  return row !== null
}

export async function getExportSession(): Promise<string> {
  return await sendMessage('export_session') as string
}

export async function exportDecryptedDatabase(exportRequest: DecryptedExportRequest): Promise<ArrayBuffer> {
  const result = await sendMessage('export_decrypted', { exportRequest })
  return result as ArrayBuffer
}

export async function execSQL(sql: string, bind?: unknown[]): Promise<void> {
  await sendMessage('exec', { sql, bind })
  notifyWriteListeners()
}

export async function execBatch(statements: { sql: string; bind?: unknown[] }[]): Promise<void> {
  if (statements.length === 0) return
  await sendMessage('exec_batch', { statements })
  notifyWriteListeners()
}

export async function querySQL<T>(sql: string, bind?: unknown[]): Promise<T[]> {
  const result = await sendMessage('query', { sql, bind })
  return result as T[]
}

export async function queryOne<T>(sql: string, bind?: unknown[]): Promise<T | null> {
  const results = await querySQL<T>(sql, bind)
  return results[0] || null
}

export async function runSQL(sql: string, bind?: unknown[]): Promise<ExecResult> {
  const result = await sendMessage('exec', { sql, bind })
  notifyWriteListeners()
  return result as ExecResult
}

export async function getLastInsertId(): Promise<number> {
  // This is now returned as part of exec result
  // For backwards compatibility, query it directly
  const result = await queryOne<{ id: number }>('SELECT last_insert_rowid() as id')
  return result?.id ?? 0
}

export async function closeDatabase(): Promise<void> {
  if (worker) {
    await sendMessage('close')
    worker.terminate()
    worker = null
    initPromise = null
    for (const pending of pendingRequests.values()) pending.reject(new Error('Database connection closed'))
    pendingRequests.clear()
  }
}


export interface DatabaseExecutor {
  execSQL(sql: string, bind?: unknown[]): Promise<void>
  execBatch(statements: { sql: string; bind?: unknown[] }[]): Promise<void>
  querySQL<T>(sql: string, bind?: unknown[]): Promise<T[]>
  queryOne<T>(sql: string, bind?: unknown[]): Promise<T | null>
}

export interface DatabaseOperation extends DatabaseExecutor {
  invalidate(): Promise<void>
}

// Ownership is carried explicitly, never inherited by unrelated async callers.
export async function withDatabaseOperation<T>(
  action: (db: DatabaseOperation) => Promise<T>,
  options: { notify?: boolean } = {},
): Promise<T> {
  const owner = await sendMessage('acquire_operation') as string
  const operationWorker = worker
  let active = true
  let dirty = false
  const send = (type: string, args: SendMessageOptions) => {
    if (!active || worker !== operationWorker) return Promise.reject(new Error('Database operation expired'))
    return sendMessage(type, { ...args, owner })
  }
  const scope: DatabaseOperation = {
    async execSQL(sql, bind) {
      await send('exec', { sql, bind })
      dirty = true
    },
    async execBatch(statements) {
      if (statements.length) {
        await send('exec_batch', { statements })
        dirty = true
      }
    },
    async querySQL<T>(sql: string, bind?: unknown[]) {
      const rows = await send('query', { sql, bind }) as T[]
      if (/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)) dirty = true
      return rows
    },
    async queryOne<T>(sql: string, bind?: unknown[]) { return (await scope.querySQL<T>(sql, bind))[0] ?? null },
    async invalidate() {
      if (!active) return
      try {
        if (worker === operationWorker) await sendMessage('invalidate_operation', { owner })
      } finally {
        active = false
        initPromise = null
      }
    },
  }
  let outcome: { value: T } | { error: unknown }
  try { outcome = { value: await action(scope) } } catch (error) { outcome = { error } }
  if (active) {
    try { await send('release_operation', {}) } catch (error) {
      await scope.invalidate()
      throw error
    } finally { active = false }
  }
  if ('error' in outcome) throw outcome.error
  if (dirty && options.notify !== false) notifyWriteListeners()
  return outcome.value
}

export async function withTransaction<T>(action: (db: DatabaseExecutor) => Promise<T>): Promise<T> {
  return withDatabaseOperation(async db => {
    await db.execSQL('BEGIN IMMEDIATE')
    try {
      const result = await action(db)
      await db.execSQL('COMMIT')
      return result
    } catch (error) {
      try { await db.execSQL('ROLLBACK') } catch {
        await db.invalidate()
      }
      throw error
    }
  })
}
