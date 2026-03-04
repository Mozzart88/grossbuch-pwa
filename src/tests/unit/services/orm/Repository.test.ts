import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { Repository } from '../../../../services/orm/Repository'
import { BaseModel } from '../../../../services/orm/BaseModel'
import { querySQL, queryOne, execSQL, getLastInsertId } from '../../../../services/database'

const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)
const mockExecSQL = vi.mocked(execSQL)
const mockGetLastInsertId = vi.mocked(getLastInsertId)

class PlainModel extends BaseModel {
  static tableName = 'things'
  static idColumn = 'id'
  id: number | null = null
  name = ''
}

class JoinModel extends BaseModel {
  static tableName = 'tag'
  static idColumn = 'id'
  static selectSQL =
    'SELECT t.id, t.name FROM tag t LEFT JOIN extra e ON e.tag_id = t.id'
  static filterPrefix = 't.'
  id: number | null = null
  name = ''
}

describe('Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('find()', () => {
    it('uses SELECT * FROM tableName when no selectSQL', async () => {
      mockQuerySQL.mockResolvedValue([{ id: 1, name: 'foo' }])
      await Repository.find(PlainModel)
      expect(mockQuerySQL).toHaveBeenCalledWith('SELECT * FROM things', [])
    })

    it('returns hydrated model instances', async () => {
      mockQuerySQL.mockResolvedValue([{ id: 1, name: 'foo' }])
      const results = await Repository.find(PlainModel)
      expect(results).toHaveLength(1)
      expect(results[0]).toBeInstanceOf(PlainModel)
      expect(results[0].name).toBe('foo')
      expect(results[0].isNew()).toBe(false)
    })

    it('returns empty array when no rows match', async () => {
      mockQuerySQL.mockResolvedValue([])
      expect(await Repository.find(PlainModel)).toEqual([])
    })

    it('applies AND-joined equality filters', async () => {
      mockQuerySQL.mockResolvedValue([])
      await Repository.find(PlainModel, { id: 1, name: 'x' })
      const [sql, binds] = mockQuerySQL.mock.calls[0]
      expect(sql).toContain('WHERE id = ? AND name = ?')
      expect(binds).toEqual([1, 'x'])
    })

    it('uses selectSQL when set on the model', async () => {
      mockQuerySQL.mockResolvedValue([])
      await Repository.find(JoinModel)
      const [sql] = mockQuerySQL.mock.calls[0]
      expect(sql).toContain('FROM tag t LEFT JOIN extra e')
    })

    it('prefixes filter columns with filterPrefix', async () => {
      mockQuerySQL.mockResolvedValue([])
      await Repository.find(JoinModel, { id: 2 })
      const [sql, binds] = mockQuerySQL.mock.calls[0]
      expect(sql).toContain('WHERE t.id = ?')
      expect(binds).toEqual([2])
    })
  })

  describe('findOne()', () => {
    it('returns null when row not found', async () => {
      mockQueryOne.mockResolvedValue(null)
      expect(await Repository.findOne(PlainModel, { id: 99 })).toBeNull()
    })

    it('returns hydrated instance when found', async () => {
      mockQueryOne.mockResolvedValue({ id: 3, name: 'match' })
      const result = await Repository.findOne(PlainModel, { id: 3 })
      expect(result).toBeInstanceOf(PlainModel)
      expect(result?.name).toBe('match')
      expect(result?.isNew()).toBe(false)
    })

    it('appends LIMIT 1 to query', async () => {
      mockQueryOne.mockResolvedValue(null)
      await Repository.findOne(PlainModel)
      const [sql] = mockQueryOne.mock.calls[0]
      expect(sql).toMatch(/LIMIT 1$/)
    })

    it('uses selectSQL + filterPrefix', async () => {
      mockQueryOne.mockResolvedValue({ id: 5, name: 'x' })
      await Repository.findOne(JoinModel, { id: 5 })
      const [sql, binds] = mockQueryOne.mock.calls[0]
      expect(sql).toContain('FROM tag t LEFT JOIN extra e')
      expect(sql).toContain('WHERE t.id = ?')
      expect(binds).toEqual([5])
    })
  })

  describe('create()', () => {
    it('calls entity.save() and returns the same entity', async () => {
      mockGetLastInsertId.mockResolvedValue(10)
      const m = new PlainModel()
      m.set({ name: 'new' })
      const result = await Repository.create(m)
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO things'),
        expect.arrayContaining(['new'])
      )
      expect(result).toBe(m)
    })
  })

  describe('update()', () => {
    it('applies new values and persists', async () => {
      const m = new PlainModel()
      m._hydrate({ id: 1, name: 'old' })
      await Repository.update(m, { name: 'new' })
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE things SET name = ?'),
        expect.arrayContaining(['new', 1])
      )
    })

    it('returns the same entity', async () => {
      const m = new PlainModel()
      m._hydrate({ id: 1, name: 'old' })
      const result = await Repository.update(m, { name: 'new' })
      expect(result).toBe(m)
    })
  })

  describe('delete()', () => {
    it('delegates to entity.delete()', async () => {
      const m = new PlainModel()
      m._hydrate({ id: 2, name: 'bye' })
      await Repository.delete(m)
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM things WHERE id = ?', [2])
    })
  })
})
