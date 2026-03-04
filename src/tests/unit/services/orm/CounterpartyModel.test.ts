import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { CounterpartyModel } from '../../../../services/orm/CounterpartyModel'
import { execSQL, querySQL, getLastInsertId } from '../../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockGetLastInsertId = vi.mocked(getLastInsertId)

function makeCounterparty(overrides: Record<string, unknown> = {}): CounterpartyModel {
  return new CounterpartyModel()._hydrate({
    id: 1, name: 'Acme Corp', sort_order: 3, note: null,
    ...overrides,
  })
}

describe('CounterpartyModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockQuerySQL.mockResolvedValue([])
    mockGetLastInsertId.mockResolvedValue(42)
  })

  // ── Static config ────────────────────────────────────────────────────────

  describe('static config', () => {
    it('tableName is "counterparty"', () => {
      expect((CounterpartyModel as any).tableName).toBe('counterparty')
    })

    it('idColumn is "id"', () => {
      expect((CounterpartyModel as any).idColumn).toBe('id')
    })

    it('filterPrefix is "c."', () => {
      expect((CounterpartyModel as any).filterPrefix).toBe('c.')
    })

    it('selectSQL JOINs counterparty_sort_order and counterparty_note', () => {
      const sql = (CounterpartyModel as any).selectSQL as string
      expect(sql).toContain('LEFT JOIN counterparty_sort_order')
      expect(sql).toContain('LEFT JOIN counterparty_note')
      expect(sql).toContain('cso.count AS sort_order')
      expect(sql).toContain('cn.note')
    })
  })

  // ── sort_order ───────────────────────────────────────────────────────────

  describe('sort_order', () => {
    it('is populated from the hydrated row', () => {
      expect(makeCounterparty({ sort_order: 7 }).sort_order).toBe(7)
    })

    it('is null when the row has no sort_order', () => {
      expect(makeCounterparty({ sort_order: null }).sort_order).toBeNull()
    })

    it('is not dirty after hydration', () => {
      expect(makeCounterparty().isFieldDirty('sort_order')).toBe(false)
    })

    it('never appears in UPDATE SQL', async () => {
      const c = makeCounterparty({ sort_order: 3 })
      c.name = 'Updated'
      await c.save()
      const updateCall = mockExecSQL.mock.calls.find(([sql]) =>
        String(sql).startsWith('UPDATE')
      )
      expect(updateCall![0]).not.toContain('sort_order')
    })

    it('never appears in INSERT SQL', async () => {
      const c = new CounterpartyModel()
      c.set({ name: 'New Corp' })
      await c.save()
      const [insertSql] = mockExecSQL.mock.calls[0]
      expect(insertSql).not.toContain('sort_order')
    })
  })

  // ── note field ───────────────────────────────────────────────────────────

  describe('note field', () => {
    it('is populated from the hydrated row', () => {
      expect(makeCounterparty({ note: 'A note' }).note).toBe('A note')
    })

    it('is null when not present', () => {
      expect(makeCounterparty({ note: null }).note).toBeNull()
    })

    it('is tracked as dirty when changed after hydration', () => {
      const c = makeCounterparty({ note: null })
      c.note = 'New note'
      expect(c.isFieldDirty('note')).toBe(true)
    })

    it('is excluded from flat INSERT SQL', async () => {
      const c = new CounterpartyModel()
      c.set({ name: 'Acme', note: 'Some note' })
      await c.save()
      const [insertSql] = mockExecSQL.mock.calls[0]
      expect(insertSql).toContain('INSERT INTO counterparty')
      expect(insertSql).not.toContain('note')
    })

    it('is excluded from flat UPDATE SQL', async () => {
      const c = makeCounterparty({ note: null })
      c.note = 'Changed'
      await c.save()
      const updateCall = mockExecSQL.mock.calls.find(([sql]) =>
        String(sql).startsWith('UPDATE')
      )
      expect(updateCall).toBeUndefined()
    })
  })

  // ── INSERT (new instance) ─────────────────────────────────────────────────

  describe('INSERT (new instance)', () => {
    it('inserts only flat dirty fields, excluding id', async () => {
      const c = new CounterpartyModel().set({ name: 'Globex' })
      await c.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO counterparty (name) VALUES (?)',
        ['Globex']
      )
    })

    it('assigns the new id from getLastInsertId', async () => {
      mockGetLastInsertId.mockResolvedValue(99)
      const c = new CounterpartyModel().set({ name: 'Initech' })
      await c.save()
      expect(c.id).toBe(99)
      expect(c.isNew()).toBe(false)
    })

    it('does not include LazyRelation fields in INSERT', async () => {
      const c = new CounterpartyModel().set({ name: 'Misc' })
      await c.save()
      const [[sql]] = mockExecSQL.mock.calls
      expect(sql).not.toContain('tags')
    })
  })

  // ── UPDATE (hydrated instance) ────────────────────────────────────────────

  describe('UPDATE (hydrated instance)', () => {
    it('updates only the changed field', async () => {
      const c = makeCounterparty()
      c.name = 'Renamed Corp'
      await c.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE counterparty SET name = ? WHERE id = ?',
        ['Renamed Corp', 1]
      )
    })

    it('does not issue UPDATE when nothing is dirty', async () => {
      const c = makeCounterparty()
      await c.save()
      const updateCalls = mockExecSQL.mock.calls.filter(([sql]) =>
        String(sql).startsWith('UPDATE')
      )
      expect(updateCalls).toHaveLength(0)
    })
  })

  // ── _saveRelations — note ─────────────────────────────────────────────────

  describe('_saveRelations() — note', () => {
    it('skips note SQL when note is not dirty', async () => {
      const c = makeCounterparty({ note: 'Existing' })
      c.name = 'Renamed'
      await c.save()
      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      expect(sqls.some(s => s.includes('counterparty_note'))).toBe(false)
    })

    it('deletes and re-inserts counterparty_note when note is set', async () => {
      const c = makeCounterparty({ note: null })
      c.note = 'New note'
      await c.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM counterparty_note WHERE counterparty_id = ?',
        [1]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO counterparty_note (counterparty_id, note) VALUES (?, ?)',
        [1, 'New note']
      )
    })

    it('only deletes counterparty_note when note is cleared to null', async () => {
      const c = makeCounterparty({ note: 'Old note' })
      c.note = null
      await c.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM counterparty_note WHERE counterparty_id = ?',
        [1]
      )
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO counterparty_note'),
        expect.anything()
      )
    })
  })

  // ── _saveRelations — tags ─────────────────────────────────────────────────

  describe('_saveRelations() — tags', () => {
    it('inserts into counterparty_to_tags on tags.append', async () => {
      const c = makeCounterparty()
      const tag = new CounterpartyModel()._hydrate({ id: 5, name: 'VIP' }) as any
      c.tags.append(tag)
      await c.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)',
        [1, 5]
      )
    })

    it('deletes from counterparty_to_tags on tags.remove', async () => {
      const c = makeCounterparty()
      const tag = new CounterpartyModel()._hydrate({ id: 5, name: 'VIP' }) as any
      c.tags.remove(tag)
      await c.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM counterparty_to_tags WHERE counterparty_id = ? AND tag_id = ?',
        [1, 5]
      )
    })
  })

  // ── _deleteRelations ──────────────────────────────────────────────────────

  describe('_deleteRelations()', () => {
    it('throws when deleting an unsaved instance', async () => {
      await expect(new CounterpartyModel().delete()).rejects.toThrow('Cannot delete an unsaved model instance')
    })

    it('deletes counterparty_note before the main row', async () => {
      const c = makeCounterparty()
      await c.delete()
      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      const noteIdx = sqls.findIndex(s => s.includes('counterparty_note'))
      const mainIdx = sqls.findIndex(s => s === 'DELETE FROM counterparty WHERE id = ?')
      expect(noteIdx).toBeGreaterThanOrEqual(0)
      expect(mainIdx).toBeGreaterThan(noteIdx)
    })

    it('deletes counterparty_to_tags before the main row', async () => {
      const c = makeCounterparty()
      await c.delete()
      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      const tagsIdx = sqls.findIndex(s => s.includes('counterparty_to_tags'))
      const mainIdx = sqls.findIndex(s => s === 'DELETE FROM counterparty WHERE id = ?')
      expect(tagsIdx).toBeGreaterThanOrEqual(0)
      expect(mainIdx).toBeGreaterThan(tagsIdx)
    })

    it('deletes counterparty_note by counterparty_id', async () => {
      const c = makeCounterparty()
      await c.delete()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM counterparty_note WHERE counterparty_id = ?',
        [1]
      )
    })

    it('deletes counterparty_to_tags by counterparty_id', async () => {
      const c = makeCounterparty()
      await c.delete()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM counterparty_to_tags WHERE counterparty_id = ?',
        [1]
      )
    })

    it('deletes the main counterparty row', async () => {
      const c = makeCounterparty()
      await c.delete()
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM counterparty WHERE id = ?', [1])
    })
  })

  // ── LazyRelation loader ───────────────────────────────────────────────────

  describe('LazyRelation — tags loader', () => {
    it('queries counterparty_to_tags joined with tag by counterparty_id', async () => {
      mockQuerySQL.mockResolvedValue([])
      const c = makeCounterparty()
      await c.tags
      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('counterparty_to_tags'),
        [1]
      )
      const [sql] = mockQuerySQL.mock.calls[0]
      expect(sql).toContain('counterparty_id = ?')
    })

    it('returns hydrated TagModel instances', async () => {
      mockQuerySQL.mockResolvedValue([{ id: 10, name: 'Premium' }])
      const c = makeCounterparty()
      const tags = await c.tags
      expect(tags).toHaveLength(1)
      expect(tags[0].id).toBe(10)
      expect(tags[0].name).toBe('Premium')
    })
  })
})
