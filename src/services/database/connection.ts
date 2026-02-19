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
    listener()
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
    }
  }

  return worker
}

interface SendMessageOptions {
  sql?: string
  bind?: unknown[]
  key?: string
  newKey?: string
  filename?: string
}

function sendMessage(type: string, options: SendMessageOptions = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++messageId
    pendingRequests.set(id, { resolve, reject })
    getWorker().postMessage({ id, type, ...options })
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

export async function exportDecryptedDatabase(filename: string, key: string): Promise<ArrayBuffer> {
  const result = await sendMessage('export_decrypted', { filename, key })
  return result as ArrayBuffer
}

export async function execSQL(sql: string, bind?: unknown[]): Promise<void> {
  await sendMessage('exec', { sql, bind })
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
  }
}
