import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Counterparty, CounterpartyInput } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  runSQL: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { counterpartyRepository } from '../../../services/repositories/counterpartyRepository'
import { execSQL, querySQL, queryOne, getLastInsertId } from '../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)
const mockGetLastInsertId = vi.mocked(getLastInsertId)

describe('counterpartyRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleCounterparty: Counterparty = {
    id: 1,
    name: 'Supermarket',
    notes: 'Weekly groceries',
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
    category_ids: [1, 2],
  }

  describe('findAll', () => {
    it('returns all counterparties with category IDs', async () => {
      mockQuerySQL
        .mockResolvedValueOnce([{ ...sampleCounterparty, category_ids: undefined }])
        .mockResolvedValueOnce([{ category_id: 1 }, { category_id: 2 }])

      const result = await counterpartyRepository.findAll()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        'SELECT * FROM counterparties ORDER BY name ASC'
      )
      expect(result[0].category_ids).toEqual([1, 2])
    })

    it('returns empty array when no counterparties exist', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await counterpartyRepository.findAll()

      expect(result).toEqual([])
    })

    it('handles counterparties without category links', async () => {
      mockQuerySQL
        .mockResolvedValueOnce([{ ...sampleCounterparty, category_ids: undefined }])
        .mockResolvedValueOnce([])

      const result = await counterpartyRepository.findAll()

      expect(result[0].category_ids).toEqual([])
    })
  })

  describe('findById', () => {
    it('returns counterparty with category IDs', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleCounterparty, category_ids: undefined })
      mockQuerySQL.mockResolvedValue([{ category_id: 1 }, { category_id: 2 }])

      const result = await counterpartyRepository.findById(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT * FROM counterparties WHERE id = ?',
        [1]
      )
      expect(result?.category_ids).toEqual([1, 2])
    })

    it('returns null when counterparty not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await counterpartyRepository.findById(999)

      expect(result).toBeNull()
    })
  })

  describe('findByName', () => {
    it('returns counterparty when found by name', async () => {
      mockQueryOne.mockResolvedValue(sampleCounterparty)

      const result = await counterpartyRepository.findByName('Supermarket')

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT * FROM counterparties WHERE name = ?',
        ['Supermarket']
      )
      expect(result).toEqual(sampleCounterparty)
    })

    it('returns null when name not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await counterpartyRepository.findByName('NonExistent')

      expect(result).toBeNull()
    })
  })

  describe('findByCategoryId', () => {
    it('returns counterparties linked to a category', async () => {
      mockQuerySQL.mockResolvedValue([sampleCounterparty])

      const result = await counterpartyRepository.findByCategoryId(1)

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('JOIN counterparty_categories'),
        [1]
      )
      expect(result).toEqual([sampleCounterparty])
    })

    it('returns empty array when no counterparties for category', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await counterpartyRepository.findByCategoryId(999)

      expect(result).toEqual([])
    })
  })

  describe('create', () => {
    it('creates counterparty with category links', async () => {
      const input: CounterpartyInput = {
        name: 'New Store',
        notes: 'Test notes',
        category_ids: [1, 2],
      }

      mockQueryOne.mockResolvedValueOnce(null) // findByName check
      mockGetLastInsertId.mockResolvedValue(2)
      mockQueryOne.mockResolvedValueOnce({ id: 2, ...input, category_ids: undefined })
      mockQuerySQL.mockResolvedValue([{ category_id: 1 }, { category_id: 2 }])

      const result = await counterpartyRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO counterparties'),
        ['New Store', 'Test notes']
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO counterparty_categories'),
        [2, 1]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO counterparty_categories'),
        [2, 2]
      )
      expect(result.name).toBe('New Store')
    })

    it('creates counterparty without category links', async () => {
      const input: CounterpartyInput = {
        name: 'New Store',
      }

      mockQueryOne.mockResolvedValueOnce(null)
      mockGetLastInsertId.mockResolvedValue(2)
      mockQueryOne.mockResolvedValueOnce({ id: 2, name: 'New Store', notes: null, category_ids: undefined })
      mockQuerySQL.mockResolvedValue([])

      await counterpartyRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledTimes(1) // Only INSERT, no category links
    })

    it('throws error when name already exists', async () => {
      mockQueryOne.mockResolvedValueOnce(sampleCounterparty)

      await expect(counterpartyRepository.create({ name: 'Supermarket' })).rejects.toThrow(
        'Counterparty with this name already exists'
      )
    })

    it('throws error if creation fails', async () => {
      mockQueryOne.mockResolvedValueOnce(null)
      mockGetLastInsertId.mockResolvedValue(2)
      mockQueryOne.mockResolvedValueOnce(null)

      await expect(counterpartyRepository.create({ name: 'Test' })).rejects.toThrow(
        'Failed to create counterparty'
      )
    })
  })

  describe('update', () => {
    it('updates name with uniqueness check', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // findByName check
        .mockResolvedValueOnce({ ...sampleCounterparty, name: 'Updated Store' })
      mockQuerySQL.mockResolvedValue([])

      const result = await counterpartyRepository.update(1, { name: 'Updated Store' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('name = ?'),
        expect.arrayContaining(['Updated Store'])
      )
      expect(result.name).toBe('Updated Store')
    })

    it('throws error when updating to existing name', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCounterparty, id: 2 })

      await expect(counterpartyRepository.update(1, { name: 'ExistingName' })).rejects.toThrow(
        'Counterparty with this name already exists'
      )
    })

    it('updates notes', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCounterparty, notes: 'New notes' })
      mockQuerySQL.mockResolvedValue([])

      await counterpartyRepository.update(1, { notes: 'New notes' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('notes = ?'),
        expect.arrayContaining(['New notes'])
      )
    })

    it('updates category links', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCounterparty })
      mockQuerySQL.mockResolvedValue([{ category_id: 3 }])

      await counterpartyRepository.update(1, { category_ids: [3] })

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM counterparty_categories WHERE counterparty_id = ?',
        [1]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO counterparty_categories'),
        [1, 3]
      )
    })

    it('clears category links when empty array provided', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCounterparty })
      mockQuerySQL.mockResolvedValue([])

      await counterpartyRepository.update(1, { category_ids: [] })

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM counterparty_categories WHERE counterparty_id = ?',
        [1]
      )
    })

    it('does not update category links if not provided', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCounterparty })
      mockQuerySQL.mockResolvedValue([{ category_id: 1 }])

      await counterpartyRepository.update(1, { notes: 'Updated' })

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('counterparty_categories'),
        expect.anything()
      )
    })

    it('throws error if counterparty not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      await expect(counterpartyRepository.update(999, { notes: 'Test' })).rejects.toThrow(
        'Counterparty not found'
      )
    })
  })

  describe('canDelete', () => {
    it('returns true when no transactions linked', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      const result = await counterpartyRepository.canDelete(1)

      expect(result).toEqual({ canDelete: true, transactionCount: 0 })
    })

    it('returns false when transactions exist', async () => {
      mockQueryOne.mockResolvedValue({ count: 5 })

      const result = await counterpartyRepository.canDelete(1)

      expect(result).toEqual({ canDelete: false, transactionCount: 5 })
    })
  })

  describe('delete', () => {
    it('deletes counterparty when no transactions exist', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      await counterpartyRepository.delete(1)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM counterparties WHERE id = ?',
        [1]
      )
    })

    it('throws error when transactions exist', async () => {
      mockQueryOne.mockResolvedValue({ count: 3 })

      await expect(counterpartyRepository.delete(1)).rejects.toThrow(
        'Cannot delete: 3 transactions linked to this counterparty'
      )
    })
  })
})
