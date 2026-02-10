import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Set up environment before importing module
vi.stubEnv('VITE_EXCHANGE_API_URL', 'https://api.example.com')

// Dynamic import to pick up stubbed env vars
const { registerInstallation } =
  await import('../../../../services/installation/installationApi')

describe('installationApi', () => {
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

  describe('registerInstallation', () => {
    it('posts to /register endpoint with id', async () => {
      const responseData = {
        token: 'jwt-token-123',
        issued_at: '2026-02-10T00:00:00Z',
        expires_at: '2027-02-10T00:00:00Z',
      }
      mockFetch.mockReturnValue(mockResponse(responseData))

      const result = await registerInstallation('test-uuid-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/register',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ id: 'test-uuid-123' }),
        })
      )
      expect(result).toEqual(responseData)
    })

    it('throws error on non-ok response', async () => {
      mockFetch.mockReturnValue(mockResponse({}, false, 500))

      await expect(registerInstallation('test-uuid')).rejects.toThrow('API error: 500 Error')
    })

    it('passes abort signal to fetch', async () => {
      mockFetch.mockReturnValue(mockResponse({ token: 'x', issued_at: '', expires_at: '' }))

      await registerInstallation('test-uuid')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      )
    })
  })
})
