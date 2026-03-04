import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { TagModel } from '../../../../services/orm/TagModel'
import { execSQL, querySQL, queryOne, getLastInsertId } from '../../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)
const mockGetLastInsertId = vi.mocked(getLastInsertId)

function makeTag(overrides: Record<string, unknown> = {}): TagModel {
  return new TagModel()._hydrate({
    id: 1, name: 'Food', updated_at: 100, sort_order: 5, icon: '🍔',
    ...overrides,
  })
}

describe('TagModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockQuerySQL.mockResolvedValue([])
    mockGetLastInsertId.mockResolvedValue(42)
  })

  // ── Static config ────────────────────────────────────────────────────────

  describe('static config', () => {
    it('selectSQL JOINs tag_sort_order, tag_icon, and icon', () => {
      const sql = (TagModel as any).selectSQL as string
      expect(sql).toContain('LEFT JOIN tag_sort_order')
      expect(sql).toContain('LEFT JOIN tag_icon')
      expect(sql).toContain('LEFT JOIN icon')
      expect(sql).toContain('tso.count AS sort_order')
      expect(sql).toContain('i.value   AS icon')
    })

    it('filterPrefix is "t."', () => {
      expect((TagModel as any).filterPrefix).toBe('t.')
    })
  })

  // ── sort_order ───────────────────────────────────────────────────────────

  describe('sort_order', () => {
    it('is populated from the hydrated row', () => {
      expect(makeTag({ sort_order: 7 }).sort_order).toBe(7)
    })

    it('is null when the row has no sort_order', () => {
      expect(makeTag({ sort_order: null }).sort_order).toBeNull()
    })

    it('is not dirty after hydration', () => {
      expect(makeTag().isFieldDirty('sort_order')).toBe(false)
    })

    it('never appears in UPDATE SQL', async () => {
      const t = makeTag({ sort_order: 3 })
      t.name = 'Updated'
      await t.save()
      const [sql] = mockExecSQL.mock.calls[0]
      expect(sql).not.toContain('sort_order')
    })
  })

  // ── icon ─────────────────────────────────────────────────────────────────

  describe('icon', () => {
    it('is populated from the hydrated row', () => {
      expect(makeTag({ icon: '🥗' }).icon).toBe('🥗')
    })

    it('is tracked as dirty when changed after hydration', () => {
      const t = makeTag({ icon: undefined })
      t.icon = '🥗'
      expect(t.isFieldDirty('icon')).toBe(true)
    })

    it('is excluded from the flat INSERT SQL', async () => {
      mockGetLastInsertId.mockResolvedValue(99)
      mockQueryOne.mockResolvedValue({ id: 1 })
      const t = new TagModel()
      t.set({ name: 'Test', icon: '🍔' })
      await t.save()
      const [insertSql] = mockExecSQL.mock.calls[0]
      expect(insertSql).toContain('INSERT INTO tag')
      expect(insertSql).not.toContain('icon')
    })

    it('is excluded from the flat UPDATE SQL', async () => {
      const t = makeTag({ icon: '🍔' })
      t.icon = '🥗'
      mockQueryOne.mockResolvedValue({ id: 1 })
      await t.save()
      const updateCall = mockExecSQL.mock.calls.find(([sql]) =>
        String(sql).startsWith('UPDATE')
      )
      // No UPDATE at all (only name/updated_at are flat fields)
      expect(updateCall).toBeUndefined()
    })
  })

  // ── INSERT (new instance) ─────────────────────────────────────────────────

  describe('INSERT (new instance)', () => {
    it('inserts only flat dirty fields, excluding id', async () => {
      const tag = new TagModel().set({ name: 'Food' })
      await tag.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO tag (name) VALUES (?)',
        ['Food']
      )
    })

    it('assigns the new id from getLastInsertId', async () => {
      mockGetLastInsertId.mockResolvedValue(99)
      const tag = new TagModel().set({ name: 'Travel' })
      await tag.save()
      expect(tag.id).toBe(99)
      expect(tag.isNew()).toBe(false)
    })

    it('does not include LazyRelation fields in INSERT', async () => {
      const tag = new TagModel().set({ name: 'Misc' })
      await tag.save()
      const [[sql]] = mockExecSQL.mock.calls
      expect(sql).not.toContain('parents')
      expect(sql).not.toContain('children')
    })
  })

  // ── UPDATE (hydrated instance) ────────────────────────────────────────────

  describe('UPDATE (hydrated instance)', () => {
    it('updates only the changed field', async () => {
      const tag = makeTag({ icon: undefined })
      tag.name = 'Groceries'
      await tag.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE tag SET name = ? WHERE id = ?',
        ['Groceries', 1]
      )
    })

    it('does not issue UPDATE when nothing is dirty', async () => {
      const tag = makeTag()
      await tag.save()
      const updateCalls = mockExecSQL.mock.calls.filter(([sql]) =>
        String(sql).startsWith('UPDATE')
      )
      expect(updateCalls).toHaveLength(0)
    })
  })

  // ── _saveRelations — icon ─────────────────────────────────────────────────

  describe('_saveRelations() — icon', () => {
    it('skips all icon SQL when icon is not dirty', async () => {
      const t = makeTag({ icon: '🍔' })
      t.name = 'Renamed'
      await t.save()
      const sqls = mockExecSQL.mock.calls.map(c => c[0] as string)
      expect(sqls.some(s => s.includes('tag_icon'))).toBe(false)
      expect(sqls.some(s => s.includes('INTO icon'))).toBe(false)
    })

    it('upserts icon and updates tag_icon when icon is set', async () => {
      const t = makeTag({ icon: undefined })
      t.icon = '🥗'
      mockQueryOne.mockResolvedValue({ id: 42 })
      await t.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO icon (value) VALUES (?)',
        ['🥗']
      )
      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT id FROM icon WHERE value = ?',
        ['🥗']
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM tag_icon WHERE tag_id = ?',
        [1]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO tag_icon (tag_id, icon_id) VALUES (?, ?)',
        [1, 42]
      )
    })

    it('only deletes from tag_icon when icon is cleared to undefined', async () => {
      const t = makeTag({ icon: '🍔' })
      t.icon = undefined
      await t.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM tag_icon WHERE tag_id = ?',
        [1]
      )
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO icon (value) VALUES (?)',
        expect.anything()
      )
    })

    it('skips tag_icon INSERT when icon row lookup returns null', async () => {
      const t = makeTag({ icon: undefined })
      t.icon = '🔥'
      mockQueryOne.mockResolvedValue(null)
      await t.save()

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tag_icon'),
        expect.anything()
      )
    })
  })

  // ── _saveRelations — parents / children ───────────────────────────────────

  describe('_saveRelations() — parents', () => {
    it('inserts into tag_to_tag on parents.append', async () => {
      const child = makeTag()
      const parent = makeTag({ id: 7, name: 'Parent' })
      child.parents.append(parent)
      await child.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [1, 7]
      )
    })

    it('deletes from tag_to_tag on parents.remove', async () => {
      const child = makeTag()
      const parent = makeTag({ id: 7, name: 'Parent' })
      child.parents.remove(parent)
      await child.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM tag_to_tag WHERE child_id = ? AND parent_id = ?',
        [1, 7]
      )
    })
  })

  describe('_saveRelations() — children', () => {
    it('inserts into tag_to_tag with reversed args on children.append', async () => {
      const parent = makeTag()
      const child = makeTag({ id: 20, name: 'Child' })
      parent.children.append(child)
      await parent.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [20, 1]
      )
    })

    it('deletes from tag_to_tag with reversed args on children.remove', async () => {
      const parent = makeTag()
      const child = makeTag({ id: 20, name: 'Child' })
      parent.children.remove(child)
      await parent.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM tag_to_tag WHERE child_id = ? AND parent_id = ?',
        [20, 1]
      )
    })
  })

  // ── delete() ──────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('throws when deleting an unsaved instance', async () => {
      await expect(new TagModel().delete()).rejects.toThrow('Cannot delete an unsaved model instance')
    })

    it('cleans up tag_icon and tag_to_tag before deleting the tag row', async () => {
      const tag = makeTag()
      await tag.delete()

      const sqls = mockExecSQL.mock.calls.map(c => c[0] as string)
      const tagIconIdx = sqls.findIndex(s => s.includes('tag_icon'))
      const tagToTagIdx = sqls.findIndex(s => s.includes('tag_to_tag'))
      const tagDeleteIdx = sqls.findIndex(s => s === 'DELETE FROM tag WHERE id = ?')

      expect(tagIconIdx).toBeGreaterThanOrEqual(0)
      expect(tagToTagIdx).toBeGreaterThanOrEqual(0)
      expect(tagDeleteIdx).toBeGreaterThan(tagIconIdx)
      expect(tagDeleteIdx).toBeGreaterThan(tagToTagIdx)
    })

    it('deletes tag_icon by tag_id', async () => {
      const tag = makeTag()
      await tag.delete()
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM tag_icon WHERE tag_id = ?', [1])
    })

    it('deletes tag_to_tag for both parent and child links', async () => {
      const tag = makeTag()
      await tag.delete()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM tag_to_tag WHERE child_id = ? OR parent_id = ?',
        [1, 1]
      )
    })

    it('deletes the main tag row', async () => {
      const tag = makeTag()
      await tag.delete()
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM tag WHERE id = ?', [1])
    })
  })

  // ── LazyRelation loaders ──────────────────────────────────────────────────

  describe('LazyRelation loaders', () => {
    it('parents loader queries tags_hierarchy by child_id', async () => {
      mockQuerySQL.mockResolvedValue([])
      const t = makeTag()
      await t.parents
      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('tags_hierarchy'),
        [1]
      )
      const [sql] = mockQuerySQL.mock.calls[0]
      expect(sql).toContain('child_id = ?')
    })

    it('children loader queries tags_hierarchy by parent_id', async () => {
      mockQuerySQL.mockResolvedValue([])
      const t = makeTag()
      await t.children
      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('tags_hierarchy'),
        [1]
      )
      const [sql] = mockQuerySQL.mock.calls[0]
      expect(sql).toContain('parent_id = ?')
    })
  })

  // ── Full save flow ────────────────────────────────────────────────────────

  describe('full save() flow — new tag with icon', () => {
    it('inserts the tag row then upserts icon junction', async () => {
      mockGetLastInsertId.mockResolvedValue(55)
      mockQueryOne.mockResolvedValue({ id: 7 })

      const t = new TagModel()
      t.set({ name: 'Pizza', icon: '🍕' })
      await t.save()

      expect(t.id).toBe(55)
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tag'),
        expect.arrayContaining(['Pizza'])
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO icon (value) VALUES (?)',
        ['🍕']
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO tag_icon (tag_id, icon_id) VALUES (?, ?)',
        [55, 7]
      )
    })
  })
})
