import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Category, CategoryInput } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  runSQL: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { categoryRepository } from '../../../services/repositories/categoryRepository'
import { execSQL, querySQL, queryOne, getLastInsertId } from '../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)
const mockGetLastInsertId = vi.mocked(getLastInsertId)

describe('categoryRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleCategory: Category = {
    id: 1,
    name: 'Food',
    type: 'expense',
    icon: '🍔',
    color: '#FF0000',
    parent_id: null,
    is_preset: 0,
    sort_order: 0,
    created_at: '2025-01-01 00:00:00',
    updated_at: '2025-01-01 00:00:00',
  }

  describe('findAll', () => {
    it('returns all categories ordered by type and sort order', async () => {
      const categories = [sampleCategory, { ...sampleCategory, id: 2, name: 'Salary', type: 'income' as const }]
      mockQuerySQL.mockResolvedValue(categories)

      const result = await categoryRepository.findAll()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        'SELECT * FROM categories ORDER BY type ASC, sort_order ASC, name ASC'
      )
      expect(result).toEqual(categories)
    })

    it('returns empty array when no categories exist', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await categoryRepository.findAll()

      expect(result).toEqual([])
    })
  })

  describe('findByType', () => {
    it('returns all categories when type is "all"', async () => {
      const categories = [sampleCategory]
      mockQuerySQL.mockResolvedValue(categories)

      const result = await categoryRepository.findByType('all')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        'SELECT * FROM categories ORDER BY type ASC, sort_order ASC, name ASC'
      )
      expect(result).toEqual(categories)
    })

    it('returns expense categories including "both" type', async () => {
      const categories = [sampleCategory]
      mockQuerySQL.mockResolvedValue(categories)

      const result = await categoryRepository.findByType('expense')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining("type = ? OR type = 'both'"),
        ['expense']
      )
      expect(result).toEqual(categories)
    })

    it('returns income categories including "both" type', async () => {
      const categories = [{ ...sampleCategory, type: 'income' as const }]
      mockQuerySQL.mockResolvedValue(categories)

      const result = await categoryRepository.findByType('income')

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining("type = ? OR type = 'both'"),
        ['income']
      )
      expect(result).toEqual(categories)
    })
  })

  describe('findById', () => {
    it('returns category when found', async () => {
      mockQueryOne.mockResolvedValue(sampleCategory)

      const result = await categoryRepository.findById(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT * FROM categories WHERE id = ?',
        [1]
      )
      expect(result).toEqual(sampleCategory)
    })

    it('returns null when category not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await categoryRepository.findById(999)

      expect(result).toBeNull()
    })
  })

  describe('findByName', () => {
    it('returns category when found by name', async () => {
      mockQueryOne.mockResolvedValue(sampleCategory)

      const result = await categoryRepository.findByName('Food')

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT * FROM categories WHERE name = ?',
        ['Food']
      )
      expect(result).toEqual(sampleCategory)
    })

    it('returns null when category name not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await categoryRepository.findByName('NonExistent')

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('creates a new category with all fields', async () => {
      const input: CategoryInput = {
        name: 'Transport',
        type: 'expense',
        icon: '🚗',
        color: '#0000FF',
        parent_id: 1,
      }

      mockQueryOne.mockResolvedValueOnce(null) // findByName check
      mockGetLastInsertId.mockResolvedValue(2)
      mockQueryOne.mockResolvedValueOnce({ ...sampleCategory, id: 2, ...input })

      const result = await categoryRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        ['Transport', 'expense', '🚗', '#0000FF', 1]
      )
      expect(result.name).toBe('Transport')
    })

    it('creates category with default optional fields', async () => {
      const input: CategoryInput = {
        name: 'New Category',
        type: 'income',
      }

      mockQueryOne.mockResolvedValueOnce(null)
      mockGetLastInsertId.mockResolvedValue(3)
      mockQueryOne.mockResolvedValueOnce({ ...sampleCategory, id: 3, ...input })

      await categoryRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        ['New Category', 'income', null, null, null]
      )
    })

    it('throws error when category name already exists', async () => {
      const input: CategoryInput = {
        name: 'Food',
        type: 'expense',
      }

      mockQueryOne.mockResolvedValueOnce(sampleCategory)

      await expect(categoryRepository.create(input)).rejects.toThrow(
        'Category with this name already exists'
      )
    })

    it('throws error if creation fails', async () => {
      const input: CategoryInput = {
        name: 'New',
        type: 'expense',
      }

      mockQueryOne.mockResolvedValueOnce(null)
      mockGetLastInsertId.mockResolvedValue(2)
      mockQueryOne.mockResolvedValueOnce(null)

      await expect(categoryRepository.create(input)).rejects.toThrow('Failed to create category')
    })
  })

  describe('update', () => {
    it('updates category name with uniqueness check', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // findByName check
        .mockResolvedValueOnce({ ...sampleCategory, name: 'Updated Food' })

      const result = await categoryRepository.update(1, { name: 'Updated Food' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('name = ?'),
        expect.arrayContaining(['Updated Food', 1])
      )
      expect(result.name).toBe('Updated Food')
    })

    it('throws error when updating to existing name', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCategory, id: 2 }) // Different ID = name taken

      await expect(categoryRepository.update(1, { name: 'ExistingName' })).rejects.toThrow(
        'Category with this name already exists'
      )
    })

    it('allows keeping same name on update', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ ...sampleCategory, id: 1 }) // Same ID = own name
        .mockResolvedValueOnce(sampleCategory)

      await categoryRepository.update(1, { name: 'Food' })

      expect(mockExecSQL).toHaveBeenCalled()
    })

    it('updates category type', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCategory, type: 'both' as const })

      await categoryRepository.update(1, { type: 'both' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('type = ?'),
        expect.arrayContaining(['both'])
      )
    })

    it('updates icon and color', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCategory, icon: '🍕', color: '#00FF00' })

      await categoryRepository.update(1, { icon: '🍕', color: '#00FF00' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('icon = ?'),
        expect.arrayContaining(['🍕', '#00FF00'])
      )
    })

    it('updates parent_id', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleCategory, parent_id: 2 })

      await categoryRepository.update(1, { parent_id: 2 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('parent_id = ?'),
        expect.arrayContaining([2])
      )
    })

    it('does not execute SQL if no fields provided', async () => {
      mockQueryOne.mockResolvedValue(sampleCategory)

      await categoryRepository.update(1, {})

      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('throws error if category not found after update', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // findByName check passes
        .mockResolvedValueOnce(null) // findById returns null

      await expect(categoryRepository.update(999, { icon: '🎉' })).rejects.toThrow('Category not found')
    })
  })

  describe('canDelete', () => {
    it('returns true when no transactions linked', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      const result = await categoryRepository.canDelete(1)

      expect(result).toEqual({ canDelete: true, transactionCount: 0 })
    })

    it('returns false when transactions exist', async () => {
      mockQueryOne.mockResolvedValue({ count: 5 })

      const result = await categoryRepository.canDelete(1)

      expect(result).toEqual({ canDelete: false, transactionCount: 5 })
    })

    it('handles null result', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await categoryRepository.canDelete(1)

      expect(result).toEqual({ canDelete: true, transactionCount: 0 })
    })
  })

  describe('delete', () => {
    it('deletes category and counterparty links when no transactions exist', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      await categoryRepository.delete(1)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM counterparty_categories WHERE category_id = ?',
        [1]
      )
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM categories WHERE id = ?', [1])
    })

    it('throws error when transactions exist', async () => {
      mockQueryOne.mockResolvedValue({ count: 3 })

      await expect(categoryRepository.delete(1)).rejects.toThrow(
        'Cannot delete: 3 transactions linked to this category'
      )
    })

    it('deletes counterparty links before category', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      await categoryRepository.delete(1)

      const calls = mockExecSQL.mock.calls
      expect(calls[0][0]).toContain('counterparty_categories')
      expect(calls[1][0]).toContain('categories')
    })
  })
})
