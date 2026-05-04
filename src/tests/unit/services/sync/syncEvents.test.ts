import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock getInstallationData before importing syncEvents
const mockGetInstallationData = vi.fn()
vi.mock('../../../../services/sync/index', () => ({
  getInstallationData: (...args: unknown[]) => mockGetInstallationData(...args),
}))

vi.stubEnv('VITE_EXCHANGE_API_URL', 'http://test-server')

// Drain the microtask queue enough for connect() to run through credential
// lookup, fetch, and fire the catch-up notifyListeners call before readStream hangs.
async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
}

function makeSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]))
      } else {
        controller.close()
      }
    },
  })
}

function makeHangingStream(): { stream: ReadableStream<Uint8Array>; close: () => void } {
  let resolveRead: (() => void) | null = null
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      return new Promise<void>((resolve) => {
        resolveRead = () => {
          controller.close()
          resolve()
        }
      })
    },
  })
  return {
    stream,
    close() { resolveRead?.() },
  }
}

describe('onSyncEvent', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('registers a listener and calls it on notify', async () => {
    const { onSyncEvent, startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')

    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })
    const { stream, close } = makeHangingStream()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)

    const listener = vi.fn()
    onSyncEvent(listener)

    startSyncEvents()
    await flushMicrotasks()

    expect(listener).toHaveBeenCalledWith('package')

    close()
    stopSyncEvents()
  })

  it('unsubscribed listener is not called after unsub', async () => {
    const { onSyncEvent, startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')

    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })
    const { stream, close } = makeHangingStream()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)

    const listener = vi.fn()
    const unsub = onSyncEvent(listener)

    startSyncEvents()
    await flushMicrotasks()
    const callsBefore = listener.mock.calls.length

    unsub()
    // No more events should arrive after unsubscribe
    expect(listener.mock.calls.length).toBe(callsBefore)

    close()
    stopSyncEvents()
  })

  it('multiple listeners all receive events', async () => {
    const { onSyncEvent, startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')

    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })
    const { stream, close } = makeHangingStream()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)

    const l1 = vi.fn()
    const l2 = vi.fn()
    onSyncEvent(l1)
    onSyncEvent(l2)

    startSyncEvents()
    await flushMicrotasks()

    expect(l1).toHaveBeenCalledWith('package')
    expect(l2).toHaveBeenCalledWith('package')

    close()
    stopSyncEvents()
  })
})

describe('startSyncEvents', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not call fetch immediately when getInstallationData returns null, retries later', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    const { stream, close } = makeHangingStream()
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)

    // First call: no credentials → schedules retry
    mockGetInstallationData.mockResolvedValueOnce(null)
    // Second call (after retry): credentials present → connects
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSpy).not.toHaveBeenCalled() // no immediate fetch

    await vi.advanceTimersByTimeAsync(1000) // retry fires with credentials now available
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSpy).toHaveBeenCalledTimes(1) // connected after retry

    close()
    stopSyncEvents()
  })

  it('does not call fetch immediately when credentials have no jwt, retries later', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    const { stream, close } = makeHangingStream()
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)

    mockGetInstallationData.mockResolvedValueOnce({ id: 'dev1', jwt: undefined })
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    close()
    stopSyncEvents()
  })

  it('calls fetch with correct URL and Authorization header', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'my-jwt' })

    const { stream, close } = makeHangingStream()
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://test-server/sync/events?installation_id=dev1',
      expect.objectContaining({
        headers: { Authorization: 'Bearer my-jwt' },
      })
    )

    close()
    stopSyncEvents()
  })

  it('is idempotent — calling twice does not create two connections', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    const { stream, close } = makeHangingStream()
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)

    startSyncEvents()
    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Two starts → need two stops to actually disconnect
    stopSyncEvents()
    expect(fetchSpy).toHaveBeenCalledTimes(1) // still running

    close()
    stopSyncEvents()
  })

  it('first stopSyncEvents does not kill connection when two callers started it', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    let capturedSignal: AbortSignal | null = null
    const { stream, close } = makeHangingStream()
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, opts) => {
      capturedSignal = (opts as RequestInit).signal as AbortSignal
      return { ok: true, status: 200, body: stream } as unknown as Response
    })

    startSyncEvents()  // caller A
    startSyncEvents()  // caller B
    await vi.advanceTimersByTimeAsync(0)

    stopSyncEvents()  // caller B leaves — SSE must survive
    expect(capturedSignal!.aborted).toBe(false)

    stopSyncEvents()  // caller A leaves — now SSE stops
    expect(capturedSignal!.aborted).toBe(true)

    close()
  })
})

describe('stopSyncEvents', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('aborts the in-progress fetch', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    let capturedSignal: AbortSignal | null = null
    const { stream } = makeHangingStream()
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, opts) => {
      capturedSignal = (opts as RequestInit).signal as AbortSignal
      return { ok: true, status: 200, body: stream } as unknown as Response
    })

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0)
    expect(capturedSignal!.aborted).toBe(false)

    stopSyncEvents()
    expect(capturedSignal!.aborted).toBe(true)
  })

  it('prevents reconnect after being stopped', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'))

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0) // first attempt fails, schedules 1s reconnect
    stopSyncEvents() // cancel timer

    await vi.runAllTimersAsync()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('connect() error handling', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules reconnect when server returns non-OK response', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    let callCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      callCount++
      if (callCount === 1) return { ok: false, status: 503, body: null } as unknown as Response
      const { stream } = makeHangingStream()
      return { ok: true, status: 200, body: stream } as unknown as Response
    })

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0)    // attempt 1: non-OK → throw → schedules 1s reconnect
    expect(callCount).toBe(1)

    await vi.advanceTimersByTimeAsync(1000) // reconnect fires
    await vi.advanceTimersByTimeAsync(0)
    expect(callCount).toBe(2)

    stopSyncEvents()
  })

  it('returns silently when fetch throws AbortError', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (_url, opts) => {
      const signal = (opts as RequestInit).signal!
      return new Promise<Response>((_, reject) => {
        signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
        )
      })
    })

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0) // connect() creates AbortController, fetch() pending

    stopSyncEvents() // aborts controller → fetch rejects with AbortError
    await vi.advanceTimersByTimeAsync(0) // catch: AbortError → return (no reconnect, no warn)

    await vi.runAllTimersAsync()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('returns without reconnect when stopped before AbortController is created', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'))

    // connect() is suspended at `await getInstallationData()` when stopSyncEvents runs,
    // so abortController is null → abort() is a no-op → connect() continues,
    // fetch throws a non-AbortError, catch sees !isRunning → return, no reconnect
    startSyncEvents()
    stopSyncEvents() // isRunning = false, abortController still null
    await vi.advanceTimersByTimeAsync(0) // connect() continues, fetch throws, !isRunning → return

    await vi.runAllTimersAsync()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('exits readStream loop when signal is aborted between reads', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    let resolveRead: ((val: { done: boolean; value: Uint8Array }) => void) | null = null
    const mockReader = {
      read: vi.fn(() => new Promise<{ done: boolean; value: Uint8Array }>(r => { resolveRead = r })),
      releaseLock: vi.fn(),
    }
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200,
      body: { getReader: () => mockReader } as unknown as ReadableStream<Uint8Array>,
    } as unknown as Response)

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0) // connect() → readStream → reader.read() pending

    stopSyncEvents() // signal.aborted = true

    // Resolve the pending read — next iteration will see signal.aborted
    resolveRead!({ done: false, value: new Uint8Array(0) })
    await vi.advanceTimersByTimeAsync(0) // loop: signal.aborted → break → readStream returns

    expect(mockReader.releaseLock).toHaveBeenCalled()
    await vi.runAllTimersAsync() // no reconnect (isRunning = false)
    expect(mockReader.read).toHaveBeenCalledTimes(1)
  })
})

describe('SSE stream parsing', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('dispatches package event from stream', async () => {
    const { startSyncEvents, stopSyncEvents, onSyncEvent } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    const stream = makeSSEStream(['event: package\ndata: {"package_id":"abc"}\n\n'])
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)
    vi.spyOn(global, 'setTimeout').mockReturnValue(0 as unknown as ReturnType<typeof setTimeout>)

    const listener = vi.fn()
    onSyncEvent(listener)

    startSyncEvents()
    await flushMicrotasks()

    const packageCalls = listener.mock.calls.filter(c => c[0] === 'package')
    // catch-up + stream event = at least 2
    expect(packageCalls.length).toBeGreaterThanOrEqual(2)

    stopSyncEvents()
  })

  it('dispatches handshake event from stream', async () => {
    const { startSyncEvents, stopSyncEvents, onSyncEvent } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    const stream = makeSSEStream(['event: handshake\ndata: \n\n'])
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)
    vi.spyOn(global, 'setTimeout').mockReturnValue(0 as unknown as ReturnType<typeof setTimeout>)

    const listener = vi.fn()
    onSyncEvent(listener)

    startSyncEvents()
    await flushMicrotasks()

    expect(listener).toHaveBeenCalledWith('handshake')

    stopSyncEvents()
  })

  it('ignores heartbeat comment lines', async () => {
    const { startSyncEvents, stopSyncEvents, onSyncEvent } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    const stream = makeSSEStream([': heartbeat\n\n'])
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)
    vi.spyOn(global, 'setTimeout').mockReturnValue(0 as unknown as ReturnType<typeof setTimeout>)

    const listener = vi.fn()
    onSyncEvent(listener)

    startSyncEvents()
    await flushMicrotasks()

    // Only the catch-up 'package' on connect — no handshake
    expect(listener).not.toHaveBeenCalledWith('handshake')
    // All calls should be the catch-up package
    expect(listener.mock.calls.every(c => c[0] === 'package')).toBe(true)

    stopSyncEvents()
  })

  it('ignores unknown event types', async () => {
    const { startSyncEvents, stopSyncEvents, onSyncEvent } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    const stream = makeSSEStream(['event: unknown\ndata: foo\n\n'])
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)
    vi.spyOn(global, 'setTimeout').mockReturnValue(0 as unknown as ReturnType<typeof setTimeout>)

    const listener = vi.fn()
    onSyncEvent(listener)

    startSyncEvents()
    await flushMicrotasks()

    expect(listener).not.toHaveBeenCalledWith('handshake')
    expect(listener.mock.calls.every(c => c[0] === 'package')).toBe(true)

    stopSyncEvents()
  })

  it('handles a message split across two chunks', async () => {
    const { startSyncEvents, stopSyncEvents, onSyncEvent } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    const stream = makeSSEStream(['event: handshake\n', 'data: \n\n'])
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)
    vi.spyOn(global, 'setTimeout').mockReturnValue(0 as unknown as ReturnType<typeof setTimeout>)

    const listener = vi.fn()
    onSyncEvent(listener)

    startSyncEvents()
    await flushMicrotasks()

    expect(listener).toHaveBeenCalledWith('handshake')

    stopSyncEvents()
  })
})

describe('catch-up pull on connect', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('fires a package event immediately on successful connection', async () => {
    const { startSyncEvents, stopSyncEvents, onSyncEvent } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    const { stream, close } = makeHangingStream()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)

    const listener = vi.fn()
    onSyncEvent(listener)

    startSyncEvents()
    await flushMicrotasks()

    expect(listener).toHaveBeenCalledWith('package')

    close()
    stopSyncEvents()
  })
})

describe('reconnection and backoff', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reconnects immediately (0ms) when stream ends cleanly', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    let callCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { ok: true, status: 200, body: makeSSEStream([]) } as unknown as Response
      }
      const { stream } = makeHangingStream()
      return { ok: true, status: 200, body: stream } as unknown as Response
    })

    startSyncEvents()
    // A 0ms reconnect fires within the same advance as the first connect
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)

    // Both the initial connect and the 0ms reconnect should have fired
    expect(callCount).toBe(2)

    stopSyncEvents()
  })

  it('reconnects with exponential backoff on error', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    let callCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      callCount++
      throw new Error('network error')
    })

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0) // attempt 1 fails → schedules 1s
    expect(callCount).toBe(1)

    await vi.advanceTimersByTimeAsync(1000) // attempt 2 fails → schedules 2s
    expect(callCount).toBe(2)

    await vi.advanceTimersByTimeAsync(2000) // attempt 3 fails → schedules 4s
    expect(callCount).toBe(3)

    stopSyncEvents()
  })

  it('backoff is capped at 30s', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const delays: number[] = []
    let callCount = 0
    const realSetTimeout = globalThis.setTimeout
    vi.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
      if (typeof delay === 'number') delays.push(delay)
      return realSetTimeout(fn as TimerHandler, delay)
    })

    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('err'))

    startSyncEvents()
    // Run enough cycles to hit the cap
    for (let i = 0; i < 8; i++) {
      await vi.advanceTimersByTimeAsync(30000)
      callCount++
    }

    const reconnectDelays = delays.filter(d => d > 0)
    expect(reconnectDelays.every(d => d <= 30000)).toBe(true)
    expect(reconnectDelays.some(d => d === 30000)).toBe(true)

    stopSyncEvents()
  })

  it('does not reconnect after stopSyncEvents', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('err'))

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0) // attempt 1 fails, schedules 1s reconnect
    stopSyncEvents()

    await vi.runAllTimersAsync()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('backoff resets to base after a successful connection', async () => {
    const { startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Use a mock reader that resolves immediately — avoids ReadableStream pull timing issues
    const makeFastCloseBody = () => ({
      getReader: () => ({
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }),
    })

    let callCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      callCount++
      if (callCount === 1) throw new Error('fail1') // first fails → 1s backoff
      if (callCount === 2) {
        // second succeeds, "stream" closes immediately → 0ms reconnect, backoff resets
        return { ok: true, status: 200, body: makeFastCloseBody() } as unknown as Response
      }
      throw new Error('fail3') // third: fails fast
    })

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0)    // attempt 1 fails → schedules 1s timer
    expect(callCount).toBe(1)

    // Advance 1s: attempt 2 fires (success), reader resolves fast, scheduleReconnect(0) queued
    await vi.advanceTimersByTimeAsync(1000)
    // The 0ms reconnect was scheduled at t=1000; advance by 1ms to ensure it fires
    await vi.advanceTimersByTimeAsync(1)    // fire 0ms reconnect → attempt 3 fails fast
    await vi.advanceTimersByTimeAsync(0)    // drain attempt 3

    // Attempt 3 must have fired at 0ms (backoff reset after success).
    // Without the reset, the next reconnect would be at 2s and wouldn't fire yet.
    expect(callCount).toBe(3)
    stopSyncEvents()
  })
})

describe('onSyncConnection', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls listener immediately with false (not connected) on registration', async () => {
    const { onSyncConnection, stopSyncEvents } = await import('../../../../services/sync/syncEvents')

    const listener = vi.fn()
    onSyncConnection(listener)

    expect(listener).toHaveBeenCalledWith(false)
    stopSyncEvents()
  })

  it('calls listener with true when connection is established', async () => {
    const { onSyncConnection, startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    const { stream, close } = makeHangingStream()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)

    const listener = vi.fn()
    onSyncConnection(listener)

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0)

    expect(listener).toHaveBeenCalledWith(true)

    close()
    stopSyncEvents()
  })

  it('calls listener with false when stream ends cleanly', async () => {
    const { onSyncConnection, startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    let callCount = 0
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { ok: true, status: 200, body: makeSSEStream([]) } as unknown as Response
      }
      const { stream } = makeHangingStream()
      return { ok: true, status: 200, body: stream } as unknown as Response
    })

    const connectedValues: boolean[] = []
    onSyncConnection((v) => connectedValues.push(v))

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0) // connect + stream closes → setConnected(false) + 0ms reconnect
    await vi.advanceTimersByTimeAsync(0) // reconnect fires → setConnected(true)

    expect(connectedValues).toContain(true)
    expect(connectedValues).toContain(false)

    stopSyncEvents()
  })

  it('calls listener with false when connection fails', async () => {
    const { onSyncConnection, startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'))

    const connectedValues: boolean[] = []
    onSyncConnection((v) => connectedValues.push(v))

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0)

    // Initial call on registration (false) + setConnected(false) in catch
    // Both are false, but deduplication means only one false after the initial
    expect(connectedValues.every(v => v === false)).toBe(true)

    stopSyncEvents()
  })

  it('calls listener with false when stopSyncEvents is called', async () => {
    const { onSyncConnection, startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    const { stream } = makeHangingStream()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)

    const connectedValues: boolean[] = []
    onSyncConnection((v) => connectedValues.push(v))

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0)
    expect(connectedValues).toContain(true)

    stopSyncEvents()
    expect(connectedValues[connectedValues.length - 1]).toBe(false)
  })

  it('unsubscribed connection listener is not called after unsub', async () => {
    const { onSyncConnection, startSyncEvents, stopSyncEvents } = await import('../../../../services/sync/syncEvents')
    mockGetInstallationData.mockResolvedValue({ id: 'dev1', jwt: 'tok1' })

    const { stream, close } = makeHangingStream()
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, body: stream,
    } as unknown as Response)

    const listener = vi.fn()
    const unsub = onSyncConnection(listener)
    unsub()

    startSyncEvents()
    await vi.advanceTimersByTimeAsync(0)

    // Only the initial call on registration
    expect(listener).toHaveBeenCalledTimes(1)

    close()
    stopSyncEvents()
  })
})
