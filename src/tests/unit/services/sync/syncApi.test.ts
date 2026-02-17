import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.stubEnv('VITE_EXCHANGE_API_URL', 'https://api.example.com')

const { push, pull, ack, postInit, getInit, deleteInit } = await import('../../../../services/sync/syncApi')

describe('syncApi', () => {
  const mockFetch = vi.fn()
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  const mockResponse = (data: unknown, ok = true, status = 200) => {
    return Promise.resolve({
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: () => Promise.resolve(data),
    })
  }

  describe('push', () => {
    it('posts encrypted package to /sync/push', async () => {
      const responseData = { success: true, package_id: 'pkg-1' }
      mockFetch.mockReturnValue(mockResponse(responseData))

      const request = {
        package: {
          sender_id: 'sender-1',
          iv: 'test-iv',
          ciphertext: 'test-ct',
          recipient_keys: [],
        },
      }

      const result = await push(request, 'jwt-token')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/sync/push',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer jwt-token',
          }),
          body: JSON.stringify(request),
        })
      )
      expect(result).toEqual(responseData)
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockReturnValue(mockResponse({}, false, 500))

      await expect(
        push({ package: { sender_id: '', iv: '', ciphertext: '', recipient_keys: [] } }, 'jwt')
      ).rejects.toThrow('Sync push failed: 500 Error')
    })

    it('passes abort signal for timeout', async () => {
      mockFetch.mockReturnValue(mockResponse({ success: true, package_id: '1' }))

      await push({ package: { sender_id: '', iv: '', ciphertext: '', recipient_keys: [] } }, 'jwt')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })
  })

  describe('pull', () => {
    it('fetches packages from /sync/pull with query params', async () => {
      const responseData = { packages: [] }
      mockFetch.mockReturnValue(mockResponse(responseData))

      const result = await pull('install-1', 1000, 'jwt-token')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/sync/pull?installation_id=install-1&since=1000',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-token',
          }),
        })
      )
      expect(result).toEqual(responseData)
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockReturnValue(mockResponse({}, false, 403))

      await expect(pull('id', 0, 'jwt')).rejects.toThrow('Sync pull failed: 403 Error')
    })
  })

  describe('ack', () => {
    it('posts package ids to /sync/ack', async () => {
      const responseData = { success: true }
      mockFetch.mockReturnValue(mockResponse(responseData))

      const request = { package_ids: ['pkg-1', 'pkg-2'] }
      const result = await ack(request, 'jwt-token')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/sync/ack',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-token',
          }),
          body: JSON.stringify(request),
        })
      )
      expect(result).toEqual(responseData)
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockReturnValue(mockResponse({}, false, 401))

      await expect(ack({ package_ids: [] }, 'jwt')).rejects.toThrow('Sync ack failed: 401 Error')
    })
  })

  describe('postInit', () => {
    it('posts init payload to /sync/init', async () => {
      mockFetch.mockReturnValue(mockResponse({}, true))

      await postInit(
        { uuid: 'target-1', payload: 'enc-payload' },
        'jwt-token'
      )

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/sync/init',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer jwt-token',
          }),
          body: JSON.stringify({ uuid: 'target-1', payload: 'enc-payload' }),
        })
      )
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockReturnValue(mockResponse({}, false, 500))

      await expect(
        postInit({ uuid: '', payload: '' }, 'jwt')
      ).rejects.toThrow('Sync init post failed: 500 Error')
    })
  })

  describe('getInit', () => {
    it('fetches init packages from /sync/init', async () => {
      const responseData = [
        { id: 1, sender_uuid: 'sender-1', encrypted_payload: 'enc', created_at: '2026-01-01' },
      ]
      mockFetch.mockReturnValue(mockResponse(responseData))

      const result = await getInit('jwt-token', 'sender-1')

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toMatch(/^https:\/\/api\.example\.com\/sync\/init\?uuid=sender-1&_t=\d+$/)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-token',
          }),
        })
      )
      expect(result).toEqual(responseData)
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockReturnValue(mockResponse({}, false, 403))

      await expect(getInit('jwt', 'some-id')).rejects.toThrow('Sync init get failed: 403 Error')
    })
  })

  describe('deleteInit', () => {
    it('sends delete request to /sync/init', async () => {
      mockFetch.mockReturnValue(mockResponse({}, true))

      await deleteInit({ uuid: 'my-uuid', ids: [1, 2, 3] }, 'jwt-token')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/sync/init',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-token',
          }),
          body: JSON.stringify({ uuid: 'my-uuid', ids: [1, 2, 3] }),
        })
      )
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockReturnValue(mockResponse({}, false, 500))

      await expect(deleteInit({ uuid: 'bad-uuid', ids: [1] }, 'jwt')).rejects.toThrow('Sync init delete failed: 500 Error')
    })
  })
})
