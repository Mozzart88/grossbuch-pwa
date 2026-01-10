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
    it('returns default_currency_id as number', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      const result = await settingsRepository.get('default_currency_id')

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT value FROM settings WHERE key = ?',
        ['default_currency_id']
      )
      expect(result).toBe(1)
    })

    it('returns theme as string', async () => {
      mockQueryOne.mockResolvedValue({ value: 'dark' })

      const result = await settingsRepository.get('theme')

      expect(result).toBe('dark')
    })

    it('returns null when setting not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await settingsRepository.get('default_currency_id')

      expect(result).toBeNull()
    })

    it('parses different currency ids correctly', async () => {
      mockQueryOne.mockResolvedValue({ value: '42' })

      const result = await settingsRepository.get('default_currency_id')

      expect(result).toBe(42)
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
  })

  describe('set', () => {
    it('saves default_currency_id as string', async () => {
      await settingsRepository.set('default_currency_id', 2)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO settings'),
        ['default_currency_id', '2']
      )
    })

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

    it('saves different currency ids', async () => {
      await settingsRepository.set('default_currency_id', 5)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.anything(),
        ['default_currency_id', '5']
      )
    })
  })

  describe('getAll', () => {
    it('returns all settings', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ value: '1' }) // default_currency_id
        .mockResolvedValueOnce({ value: 'dark' }) // theme

      const result = await settingsRepository.getAll()

      expect(result).toEqual({
        default_currency_id: 1,
        theme: 'dark',
      })
    })

    it('returns partial settings when some are missing', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ value: '1' })
        .mockResolvedValueOnce(null) // theme not set

      const result = await settingsRepository.getAll()

      expect(result).toEqual({
        default_currency_id: 1,
      })
    })

    it('returns empty object when no settings exist', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await settingsRepository.getAll()

      expect(result).toEqual({})
    })

    it('calls get for each setting key', async () => {
      mockQueryOne.mockResolvedValue(null)

      await settingsRepository.getAll()

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.anything(),
        ['default_currency_id']
      )
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.anything(),
        ['theme']
      )
    })
  })
})
