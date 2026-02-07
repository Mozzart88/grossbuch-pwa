import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Tag, TagInput } from '../../../types'
import { SYSTEM_TAGS } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { tagRepository } from '../../../services/repositories/tagRepository'
import { execSQL, querySQL, queryOne, getLastInsertId } from '../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)
const mockGetLastInsertId = vi.mocked(getLastInsertId)

describe('tagRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleTag: Tag = {
    id: 23,
    name: 'Groceries',
    sort_order: 10
  }

  describe('findAll', () => {
    it('returns all tags ordered by id', async () => {
      const tags = [sampleTag, { ...sampleTag, id: 24, name: 'Utilities' }]
      mockQuerySQL.mockResolvedValue(tags)

      const result = await tagRepository.findAll()

      expect(mockQuerySQL).toHaveBeenCalledWith('SELECT * FROM tags ORDER BY id ASC')
      expect(result).toEqual(tags)
    })

    it('returns empty array when no tags exist', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await tagRepository.findAll()

      expect(result).toEqual([])
    })
  })

  describe('findById', () => {
    it('returns tag with parent and child relationships when found', async () => {
      mockQueryOne.mockResolvedValue(sampleTag)
      mockQuerySQL
        .mockResolvedValueOnce([{ parent_id: SYSTEM_TAGS.EXPENSE, name: 'expense' }])
        .mockResolvedValueOnce([])

      const result = await tagRepository.findById(23)

      expect(mockQueryOne).toHaveBeenCalledWith('SELECT * FROM tags WHERE id = ?', [23])
      expect(result).toEqual({
        ...sampleTag,
        parent_ids: [SYSTEM_TAGS.EXPENSE],
        parent_names: ['expense'],
        child_ids: [],
        child_names: [],
      })
    })

    it('returns null when tag not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await tagRepository.findById(999)

      expect(result).toBeNull()
    })
  })

  describe('findByName', () => {
    it('returns tag when found by name', async () => {
      mockQueryOne.mockResolvedValue(sampleTag)

      const result = await tagRepository.findByName('Groceries')

      expect(mockQueryOne).toHaveBeenCalledWith('SELECT * FROM tags WHERE name = ?', ['Groceries'])
      expect(result).toEqual(sampleTag)
    })

    it('returns null when tag name not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await tagRepository.findByName('NonExistent')

      expect(result).toBeNull()
    })
  })

  describe('findUserTags', () => {
    it('returns tags that are children of default tag', async () => {
      const userTags = [sampleTag]
      mockQuerySQL.mockResolvedValue(userTags)

      const result = await tagRepository.findUserTags()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('WHERE th.parent_id = ?'),
        [SYSTEM_TAGS.DEFAULT]
      )

      expect(result).toEqual(userTags)
    })
  })

  describe('findIncomeTags', () => {
    it('returns tags that are children of income tag', async () => {
      const incomeTags = [{ ...sampleTag, name: 'Salary' }]
      mockQuerySQL.mockResolvedValue(incomeTags)

      const result = await tagRepository.findIncomeTags()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('WHERE th.parent_id = ?'),
        [SYSTEM_TAGS.INCOME]
      )
      expect(result).toEqual(incomeTags)
    })
  })

  describe('findExpenseTags', () => {
    it('returns tags that are children of expense tag', async () => {
      const expenseTags = [sampleTag]
      mockQuerySQL.mockResolvedValue(expenseTags)

      const result = await tagRepository.findExpenseTags()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('WHERE th.parent_id = ?'),
        [SYSTEM_TAGS.EXPENSE]
      )
      expect(result).toEqual(expenseTags)
    })
  })

  describe('findSystemTags', () => {
    it('returns tags that are children of system tag', async () => {
      const systemTags = [{ id: SYSTEM_TAGS.DEFAULT, name: 'default', created_at: 0, updated_at: 0 }]
      mockQuerySQL.mockResolvedValue(systemTags)

      const result = await tagRepository.findSystemTags()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('WHERE th.parent_id = ?'),
        [SYSTEM_TAGS.SYSTEM]
      )
      expect(result).toEqual(systemTags)
    })
  })

  describe('isSystemTag', () => {
    it('returns true when tag is a system tag', async () => {
      mockQueryOne.mockResolvedValue({ is_system: 1 })

      const result = await tagRepository.isSystemTag(SYSTEM_TAGS.DEFAULT)

      expect(result).toBe(true)
    })

    it('returns false when tag is not a system tag', async () => {
      mockQueryOne.mockResolvedValue({ is_system: 0 })

      const result = await tagRepository.isSystemTag(23)

      expect(result).toBe(false)
    })
  })

  describe('create', () => {
    it('creates a new tag with parent relationships', async () => {
      const input: TagInput = {
        name: 'NewTag',
        parent_ids: [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.EXPENSE],
      }

      mockQueryOne
        .mockResolvedValueOnce(null) // findByName check
        .mockResolvedValueOnce({ ...sampleTag, id: 25, name: 'NewTag' }) // findById
      mockQuerySQL
        .mockResolvedValueOnce([{ parent_id: SYSTEM_TAGS.DEFAULT, name: 'default' }, { parent_id: SYSTEM_TAGS.EXPENSE, name: 'expense' }])
        .mockResolvedValueOnce([])
      mockGetLastInsertId.mockResolvedValue(25)

      const result = await tagRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith('INSERT INTO tag (name) VALUES (?)', ['NewTag'])
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [25, SYSTEM_TAGS.DEFAULT]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [25, SYSTEM_TAGS.EXPENSE]
      )
      expect(result.name).toBe('NewTag')
    })

    it('throws error when tag name already exists', async () => {
      const input: TagInput = { name: 'Groceries' }
      mockQueryOne.mockResolvedValueOnce(sampleTag)

      await expect(tagRepository.create(input)).rejects.toThrow('Tag with this name already exists')
    })
  })

  describe('update', () => {
    it('updates tag name', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ is_system: 0 }) // isSystemTag
        .mockResolvedValueOnce(null) // findByName
        .mockResolvedValueOnce({ ...sampleTag, name: 'Updated' }) // findById
      mockQuerySQL.mockResolvedValue([])

      const result = await tagRepository.update(23, { name: 'Updated' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tag SET name = ?'),
        ['Updated', 23]
      )
      expect(result.name).toBe('Updated')
    })

    it('throws error when updating system tag', async () => {
      mockQueryOne.mockResolvedValueOnce({ is_system: 1 })

      await expect(tagRepository.update(SYSTEM_TAGS.DEFAULT, { name: 'Hacked' })).rejects.toThrow(
        'Cannot modify system tags'
      )
    })

    it('throws error when name already exists', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ is_system: 0 }) // isSystemTag
        .mockResolvedValueOnce({ ...sampleTag, id: 99 }) // findByName - different id

      await expect(tagRepository.update(23, { name: 'ExistingName' })).rejects.toThrow(
        'Tag with this name already exists'
      )
    })

    it('updates parent relationships', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ is_system: 0 }) // isSystemTag
        .mockResolvedValueOnce({ ...sampleTag }) // findById
      mockQuerySQL.mockResolvedValue([])

      await tagRepository.update(23, { parent_ids: [SYSTEM_TAGS.INCOME] })

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM tag_to_tag WHERE child_id = ? AND parent_id != ?',
        [23, SYSTEM_TAGS.SYSTEM]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [23, SYSTEM_TAGS.INCOME]
      )
    })
  })

  describe('canDelete', () => {
    it('returns false for system tags', async () => {
      mockQueryOne.mockResolvedValueOnce({ is_system: 1 })

      const result = await tagRepository.canDelete(SYSTEM_TAGS.DEFAULT)

      expect(result).toEqual({ canDelete: false, reason: 'System tags cannot be deleted' })
    })

    it('returns false when tag is used in transactions', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ is_system: 0 })
        .mockResolvedValueOnce({ count: 5 })

      const result = await tagRepository.canDelete(23)

      expect(result).toEqual({ canDelete: false, reason: '5 transactions use this tag' })
    })

    it('returns false when tag is used in budgets', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ is_system: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 2 })

      const result = await tagRepository.canDelete(23)

      expect(result).toEqual({ canDelete: false, reason: '2 budgets use this tag' })
    })

    it('returns true when tag can be deleted', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ is_system: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })

      const result = await tagRepository.canDelete(23)

      expect(result).toEqual({ canDelete: true })
    })
  })

  describe('delete', () => {
    it('deletes tag and its relationships when allowed', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ is_system: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })

      await tagRepository.delete(23)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM tag_to_tag WHERE child_id = ? OR parent_id = ?',
        [23, 23]
      )
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM tag WHERE id = ?', [23])
    })

    it('throws error when tag cannot be deleted', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ is_system: 0 })
        .mockResolvedValueOnce({ count: 3 })

      await expect(tagRepository.delete(23)).rejects.toThrow(
        'Cannot delete: 3 transactions use this tag'
      )
    })
  })

  describe('getHierarchy', () => {
    it('returns tag hierarchy from view', async () => {
      const hierarchy = [{ parent_id: 9, parent: 'income', child_id: 11, child: 'sale' }]
      mockQuerySQL.mockResolvedValue(hierarchy)

      const result = await tagRepository.getHierarchy()

      expect(mockQuerySQL).toHaveBeenCalledWith('SELECT * FROM tags_hierarchy')
      expect(result).toEqual(hierarchy)
    })
  })

  describe('getGraph', () => {
    it('returns tag graph from view', async () => {
      const graph = [{ parent: 'expense', children: 'food,transport,house' }]
      mockQuerySQL.mockResolvedValue(graph)

      const result = await tagRepository.getGraph()

      expect(mockQuerySQL).toHaveBeenCalledWith('SELECT * FROM tags_graph')
      expect(result).toEqual(graph)
    })
  })

  describe('getSummary', () => {
    it('returns tag summary from view', async () => {
      const summary = [{ tag: 'food', amount: -5000 }]
      mockQuerySQL.mockResolvedValue(summary)

      const result = await tagRepository.getSummary()

      expect(mockQuerySQL).toHaveBeenCalledWith('SELECT * FROM tags_summary')
      expect(result).toEqual(summary)
    })
  })
})
