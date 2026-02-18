import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database module
vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  runSQL: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { settingsRepository } from '../../../services/repositories/settingsRepository'
import { execSQL, queryOne } from '../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)

describe('settingsRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('get', () => {
    it('returns theme as string', async () => {
      mockQueryOne.mockResolvedValue({ value: 'dark' })

      const result = await settingsRepository.get('theme')

      expect(result).toBe('dark')
    })

    it('returns null when setting not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await settingsRepository.get('theme')

      expect(result).toBeNull()
    })

    it('handles light theme', async () => {
      mockQueryOne.mockResolvedValue({ value: 'light' })

      const result = await settingsRepository.get('theme')

      expect(result).toBe('light')
    })

    it('handles system theme', async () => {
      mockQueryOne.mockResolvedValue({ value: 'system' })

      const result = await settingsRepository.get('theme')

      expect(result).toBe('system')
    })

    it('parses installation_id as JSON', async () => {
      const jsonValue = JSON.stringify({ id: 'uuid-123', jwt: 'token-456' })
      mockQueryOne.mockResolvedValue({ value: jsonValue })

      const result = await settingsRepository.get('installation_id')

      expect(result).toEqual({ id: 'uuid-123', jwt: 'token-456' })
    })

    it('returns raw string for installation_id when JSON parse fails', async () => {
      mockQueryOne.mockResolvedValue({ value: 'not-valid-json' })

      const result = await settingsRepository.get('installation_id')

      expect(result).toBe('not-valid-json')
    })
  })

  describe('set', () => {
    it('saves theme as string', async () => {
      await settingsRepository.set('theme', 'dark')

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO settings'),
        ['theme', 'dark']
      )
    })

    it('updates timestamp on save', async () => {
      await settingsRepository.set('theme', 'light')

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("datetime('now')"),
        expect.anything()
      )
    })
  })

  describe('getAll', () => {
    it('returns all settings', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ value: 'dark' }) // theme

      const result = await settingsRepository.getAll()

      expect(result).toEqual({
        theme: 'dark',
      })
    })

    it('returns empty object when no settings exist', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await settingsRepository.getAll()

      expect(result).toEqual({})
    })

    it('calls get for theme key', async () => {
      mockQueryOne.mockResolvedValue(null)

      await settingsRepository.getAll()

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.anything(),
        ['theme']
      )
    })
  })
})
