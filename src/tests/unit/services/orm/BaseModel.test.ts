import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database', () => ({
  execSQL: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { BaseModel } from '../../../../services/orm/BaseModel'
import { execSQL, getLastInsertId } from '../../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockGetLastInsertId = vi.mocked(getLastInsertId)

// Concrete subclass for testing — uses ! so no initializers fire through the Proxy
class TestModel extends BaseModel {
  static tableName = 'things'
  static idColumn = 'id'
  id!: number
  name!: string
  value!: number | null
}

describe('BaseModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('isNew() returns true', () => {
      expect(new TestModel().isNew()).toBe(true)
    })

    it('isDirty() returns false', () => {
      expect(new TestModel().isDirty()).toBe(false)
    })

    it('isFieldDirty() returns false for all fields', () => {
      const m = new TestModel()
      expect(m.isFieldDirty('name')).toBe(false)
      expect(m.isFieldDirty('value')).toBe(false)
    })
  })

  describe('set()', () => {
    it('returns this for chaining', () => {
      const m = new TestModel()
      expect(m.set({ name: 'x' })).toBe(m)
    })

    it('marks touched fields dirty', () => {
      const m = new TestModel()
      m.set({ name: 'foo' })
      expect(m.isDirty()).toBe(true)
      expect(m.isFieldDirty('name')).toBe(true)
      expect(m.isFieldDirty('value')).toBe(false)
    })
  })

  describe('isFieldDirty()', () => {
    it('tracks individual fields independently', () => {
      const m = new TestModel()
      m.name = 'changed'
      expect(m.isFieldDirty('name')).toBe(true)
      expect(m.isFieldDirty('value')).toBe(false)
    })

    it('returns false after _hydrate', () => {
      const m = new TestModel()
      m.name = 'dirty'
      m._hydrate({ id: 1, name: 'clean', value: null })
      expect(m.isFieldDirty('name')).toBe(false)
    })
  })

  describe('_hydrate()', () => {
    it('populates all fields from row', () => {
      const m = new TestModel()
      m._hydrate({ id: 42, name: 'hydrated', value: 7 })
      expect(m.id).toBe(42)
      expect(m.name).toBe('hydrated')
      expect(m.value).toBe(7)
    })

    it('clears dirty state', () => {
      const m = new TestModel()
      m.name = 'dirty'
      m._hydrate({ id: 1, name: 'clean', value: null })
      expect(m.isDirty()).toBe(false)
    })

    it('marks instance as not new', () => {
      const m = new TestModel()
      m._hydrate({ id: 1, name: 'x', value: null })
      expect(m.isNew()).toBe(false)
    })

    it('returns this', () => {
      const m = new TestModel()
      expect(m._hydrate({ id: 1, name: 'x', value: null })).toBe(m)
    })
  })

  describe('rollback()', () => {
    it('reverts fields to values at last hydrate/save', () => {
      const m = new TestModel()
      m._hydrate({ id: 1, name: 'original', value: null })
      m.name = 'changed'
      m.rollback()
      expect(m.name).toBe('original')
      expect(m.isDirty()).toBe(false)
    })
  })

  describe('save() — INSERT', () => {
    it('inserts new record and sets id from getLastInsertId', async () => {
      mockGetLastInsertId.mockResolvedValue(7)
      const m = new TestModel()
      m.set({ name: 'new', value: 100 })
      await m.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO things'),
        expect.arrayContaining(['new', 100])
      )
      expect(m.id).toBe(7)
    })

    it('marks instance as not new after INSERT', async () => {
      mockGetLastInsertId.mockResolvedValue(1)
      const m = new TestModel()
      m.set({ name: 'x' })
      await m.save()
      expect(m.isNew()).toBe(false)
    })

    it('clears dirty state after INSERT', async () => {
      mockGetLastInsertId.mockResolvedValue(1)
      const m = new TestModel()
      m.set({ name: 'x' })
      await m.save()
      expect(m.isDirty()).toBe(false)
    })

    it('excludes idColumn from INSERT columns', async () => {
      mockGetLastInsertId.mockResolvedValue(1)
      const m = new TestModel()
      m.set({ name: 'x' })
      await m.save()
      const [sql] = mockExecSQL.mock.calls[0]
      expect(sql).not.toMatch(/\bid\b/)
    })
  })

  describe('save() — UPDATE', () => {
    it('updates only dirty fields', async () => {
      const m = new TestModel()
      m._hydrate({ id: 5, name: 'original', value: null })
      m.name = 'updated'
      await m.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE things SET name = ?'),
        ['updated', 5]
      )
    })

    it('clears dirty state after UPDATE', async () => {
      const m = new TestModel()
      m._hydrate({ id: 5, name: 'original', value: null })
      m.name = 'updated'
      await m.save()
      expect(m.isDirty()).toBe(false)
    })

    it('skips SQL when nothing is dirty', async () => {
      const m = new TestModel()
      m._hydrate({ id: 5, name: 'x', value: null })
      await m.save()
      expect(mockExecSQL).not.toHaveBeenCalled()
    })
  })

  describe('delete()', () => {
    it('throws when called on a new (unsaved) instance', async () => {
      const m = new TestModel()
      await expect(m.delete()).rejects.toThrow('Cannot delete an unsaved model instance')
    })

    it('deletes by primary key', async () => {
      const m = new TestModel()
      m._hydrate({ id: 3, name: 'bye', value: null })
      await m.delete()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM things WHERE id = ?',
        [3]
      )
    })
  })

  describe('static fields', () => {
    it('exposes selectSQL (undefined by default)', () => {
      expect((TestModel as any).selectSQL).toBeUndefined()
    })

    it('exposes filterPrefix (empty string by default)', () => {
      expect((TestModel as any).filterPrefix).toBe('')
    })
  })
})
