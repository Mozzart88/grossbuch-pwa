import { getInstallationData } from '.'

const API_URL = import.meta.env.VITE_EXCHANGE_API_URL

export type SyncEventType = 'package' | 'handshake'
export type SyncEventListener = (type: SyncEventType) => void
export type SyncConnectionListener = (connected: boolean) => void

const listeners = new Set<SyncEventListener>()
const connectionListeners = new Set<SyncConnectionListener>()
let isConnected = false
let abortController: AbortController | null = null
let isRunning = false
let runCount = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let backoffMs = 1000

const BACKOFF_BASE_MS = 1000
const BACKOFF_MAX_MS = 30000
const BACKOFF_MULTIPLIER = 2

export function onSyncEvent(listener: SyncEventListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function onSyncConnection(listener: SyncConnectionListener): () => void {
  listener(isConnected)
  connectionListeners.add(listener)
  return () => { connectionListeners.delete(listener) }
}

function setConnected(connected: boolean): void {
  if (isConnected === connected) return
  isConnected = connected
  for (const listener of connectionListeners) listener(connected)
}

function notifyListeners(type: SyncEventType): void {
  for (const listener of listeners) {
    listener(type)
  }
}

export function startSyncEvents(): void {
  runCount++
  if (runCount > 1) return  // connection already running, just increment ref
  isRunning = true
  backoffMs = BACKOFF_BASE_MS
  void connect()
}

export function stopSyncEvents(): void {
  if (runCount > 0) runCount--
  if (runCount > 0) return  // other callers still hold a ref
  isRunning = false
  setConnected(false)
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  abortController?.abort()
  abortController = null
}

function scheduleReconnect(delayMs: number): void {
  if (!isRunning) return
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null
    await connect()
  }, delayMs)
}

async function connect(): Promise<void> {
  const installData = await getInstallationData()
  if (!installData?.jwt || !installData.id) {
    // Credentials not ready yet (registration still in progress) — retry shortly
    scheduleReconnect(BACKOFF_BASE_MS)
    return
  }

  abortController = new AbortController()
  const { signal } = abortController

  const params = new URLSearchParams({ installation_id: installData.id })
  const url = `${API_URL}/sync/events?${params}`

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${installData.jwt}` },
      signal,
    })

    if (!response.ok || !response.body) {
      throw new Error(`SSE connect failed: ${response.status}`)
    }

    backoffMs = BACKOFF_BASE_MS
    setConnected(true)
    notifyListeners('package')

    await readStream(response.body, signal)

    setConnected(false)
    scheduleReconnect(0)
  } catch (err) {
    if ((err as Error).name === 'AbortError') return
    if (!isRunning) return

    setConnected(false)
    console.warn('[syncEvents] SSE connection failed, reconnecting in', backoffMs, 'ms:', err)
    scheduleReconnect(backoffMs)
    backoffMs = Math.min(backoffMs * BACKOFF_MULTIPLIER, BACKOFF_MAX_MS)
  }
}

async function readStream(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal.aborted) break
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const messages = buffer.split('\n\n')
      buffer = messages.pop()!

      for (const message of messages) {
        parseAndDispatch(message)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseAndDispatch(rawMessage: string): void {
  let eventType = 'message'

  for (const line of rawMessage.split('\n')) {
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim()
    }
  }

  if (eventType === 'package') {
    notifyListeners('package')
  } else if (eventType === 'handshake') {
    notifyListeners('handshake')
  }
}
