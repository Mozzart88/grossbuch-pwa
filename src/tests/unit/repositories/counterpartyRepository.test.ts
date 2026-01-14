import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Counterparty, CounterpartyInput, CounterpartySummary } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
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
    note: 'Weekly groceries',
    created_at: 1704067200,
    updated_at: 1704067200,
    tag_ids: [12, 14],
    tags: ['food', 'transport'],
  }

  describe('findAll', () => {
    it('returns all counterparties with tag IDs', async () => {
      mockQuerySQL
        .mockResolvedValueOnce([{ ...sampleCounterparty, tag_ids: undefined, tags: undefined }])
        .mockResolvedValueOnce([{ tag_id: 12, name: 'food' }, { tag_id: 14, name: 'transport' }])

      const result = await counterpartyRepository.findAll()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        'SELECT * FROM counterparty ORDER BY name ASC'
      )
      expect(result[0].tag_ids).toEqual([12, 14])
      expect(result[0].tags).toEqual(['food', 'transport'])
    })

    it('returns empty array when no counterparties exist', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await counterpartyRepository.findAll()

      expect(result).toEqual([])
    })

    it('handles counterparties without tag links', async () => {
      mockQuerySQL
        .mockResolvedValueOnce([{ ...sampleCounterparty, tag_ids: undefined, tags: undefined }])
        .mockResolvedValueOnce([])

      const result = await counterpartyRepository.findAll()

      expect(result[0].tag_ids).toEqual([])
      expect(result[0].tags).toEqual([])
    })
  })

  describe('findById', () => {
    it('returns counterparty with tag IDs', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleCounterparty, tag_ids: undefined, tags: undefined })
      mockQuerySQL.mockResolvedValue([{ tag_id: 12, name: 'food' }, { tag_id: 14, name: 'transport' }])

      const result = await counterpartyRepository.findById(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT * FROM counterparty WHERE id = ?',
        [1]
      )
      expect(result?.tag_ids).toEqual([12, 14])
      expect(result?.tags).toEqual(['food', 'transport'])
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
        'SELECT * FROM counterparty WHERE name = ?',
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

  describe('findByTagId', () => {
    it('returns counterparties linked to a tag', async () => {
      mockQuerySQL.mockResolvedValue([sampleCounterparty])

      const result = await counterpartyRepository.findByTagId(12)

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('JOIN counterparty_to_tags'),
        [12]
      )
      expect(result).toEqual([sampleCounterparty])
    })

    it('returns empty array when no counterparties for tag', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await counterpartyRepository.findByTagId(999)

      expect(result).toEqual([])
    })
  })

  describe('create', () => {
    it('creates counterparty with tag links', async () => {
      const input: CounterpartyInput = {
        name: 'New Store',
        note: 'Test notes',
        tag_ids: [12, 14],
      }

      mockQueryOne.mockResolvedValueOnce(null) // findByName check
      mockGetLastInsertId.mockResolvedValue(2)
      mockQueryOne.mockResolvedValueOnce({ id: 2, ...input, tag_ids: undefined, tags: undefined })
      mockQuerySQL.mockResolvedValue([{ tag_id: 12, name: 'food' }, { tag_id: 14, name: 'transport' }])

      const result = await counterpartyRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO counterparty'),
        ['New Store', 'Test notes']
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO counterparty_to_tags'),
        [2, 12]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO counterparty_to_tags'),
        [2, 14]
      )
      expect(result.name).toBe('New Store')
    })

    it('creates counterparty without tag links', async () => {
      const input: CounterpartyInput = {
        name: 'New Store',
      }

      mockQueryOne.mockResolvedValueOnce(null)
      mockGetLastInsertId.mockResolvedValue(2)
      mockQueryOne.mockResolvedValueOnce({ id: 2, name: 'New Store', note: null, tag_ids: undefined, tags: undefined })
      mockQuerySQL.mockResolvedValue([])

      await counterpartyRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledTimes(1) // Only INSERT, no tag links
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

    it('updates note', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCounterparty, note: 'New note' })
      mockQuerySQL.mockResolvedValue([])

      await counterpartyRepository.update(1, { note: 'New note' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('note = ?'),
        expect.arrayContaining(['New note'])
      )
    })

    it('updates tag links', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCounterparty })
      mockQuerySQL.mockResolvedValue([{ tag_id: 13, name: 'fee' }])

      await counterpartyRepository.update(1, { tag_ids: [13] })

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM counterparty_to_tags WHERE counterparty_id = ?',
        [1]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO counterparty_to_tags'),
        [1, 13]
      )
    })

    it('clears tag links when empty array provided', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCounterparty })
      mockQuerySQL.mockResolvedValue([])

      await counterpartyRepository.update(1, { tag_ids: [] })

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM counterparty_to_tags WHERE counterparty_id = ?',
        [1]
      )
    })

    it('does not update tag links if not provided', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCounterparty })
      mockQuerySQL.mockResolvedValue([{ tag_id: 12, name: 'food' }])

      await counterpartyRepository.update(1, { note: 'Updated' })

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('counterparty_to_tags'),
        expect.anything()
      )
    })

    it('throws error if counterparty not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      await expect(counterpartyRepository.update(999, { note: 'Test' })).rejects.toThrow(
        'Counterparty not found'
      )
    })
  })

  describe('canDelete', () => {
    it('returns true when no transactions linked', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      const result = await counterpartyRepository.canDelete(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM trx_to_counterparty WHERE counterparty_id = ?',
        [1]
      )
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
        'DELETE FROM counterparty WHERE id = ?',
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

  describe('getSummary', () => {
    it('returns counterparty summary from view', async () => {
      const summary: CounterpartySummary[] = [
        { counterparty: 'Supermarket', amount: -50000 },
        { counterparty: 'Amazon', amount: -25000 },
      ]
      mockQuerySQL.mockResolvedValue(summary)

      const result = await counterpartyRepository.getSummary()

      expect(mockQuerySQL).toHaveBeenCalledWith('SELECT * FROM counterparties_summary')
      expect(result).toEqual(summary)
    })
  })
})
