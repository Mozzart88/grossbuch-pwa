import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { TransactionModel } from '../../../../services/orm/TransactionModel'
import { TransactionLineModel } from '../../../../services/orm/TransactionLineModel'
import { execSQL, querySQL, queryOne } from '../../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)

const FAKE_ID = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
const FAKE_NEW = new Uint8Array([17, 18, 19, 20, 21, 22, 23, 24])
const FAKE_LINE_ID = new Uint8Array([33, 34, 35, 36, 37, 38, 39, 40])

function makeTrx(overrides: Record<string, unknown> = {}): TransactionModel {
  return new TransactionModel()._hydrate({
    id: FAKE_ID,
    timestamp: 1700000000,
    counterparty_id: null,
    counterparty: null,
    note: null,
    ...overrides,
  })
}

describe('TransactionModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockQuerySQL.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({ id: FAKE_NEW })
  })

  // ── Static config ─────────────────────────────────────────────────────────

  describe('static config', () => {
    it('tableName is "trx"', () => {
      expect((TransactionModel as any).tableName).toBe('trx')
    })

    it('idColumn is "id"', () => {
      expect((TransactionModel as any).idColumn).toBe('id')
    })

    it('filterPrefix is "t."', () => {
      expect((TransactionModel as any).filterPrefix).toBe('t.')
    })

    it('selectSQL JOINs counterparty and note tables', () => {
      const sql = (TransactionModel as any).selectSQL as string
      expect(sql).toContain('FROM trx t')
      expect(sql).toContain('LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id')
      expect(sql).toContain('LEFT JOIN counterparty c ON t2c.counterparty_id = c.id')
      expect(sql).toContain('LEFT JOIN trx_note tn ON tn.trx_id = t.id')
      expect(sql).toContain('counterparty_id')
      expect(sql).toContain('tn.note')
    })
  })

  // ── counterparty getter ───────────────────────────────────────────────────

  describe('counterparty getter', () => {
    it('returns the joined counterparty name', () => {
      expect(makeTrx({ counterparty: 'Acme' }).counterparty).toBe('Acme')
    })

    it('returns null when no counterparty', () => {
      expect(makeTrx({ counterparty: null }).counterparty).toBeNull()
    })

    it('is not dirty after hydration', () => {
      expect(makeTrx({ counterparty: 'Acme' }).isFieldDirty('counterparty')).toBe(false)
    })
  })

  // ── counterparty_id and note fields ───────────────────────────────────────

  describe('counterparty_id field', () => {
    it('is populated from the hydrated row', () => {
      expect(makeTrx({ counterparty_id: 5 }).counterparty_id).toBe(5)
    })

    it('is null when not present', () => {
      expect(makeTrx({ counterparty_id: null }).counterparty_id).toBeNull()
    })

    it('is tracked as dirty when changed after hydration', () => {
      const trx = makeTrx()
      trx.counterparty_id = 7
      expect(trx.isFieldDirty('counterparty_id')).toBe(true)
    })

    it('is excluded from flat UPDATE SQL', async () => {
      const trx = makeTrx()
      trx.counterparty_id = 7
      await trx.save()
      const updateCalls = mockExecSQL.mock.calls.filter(([sql]) =>
        String(sql).startsWith('UPDATE')
      )
      expect(updateCalls).toHaveLength(0)
    })

    it('is excluded from flat INSERT SQL', async () => {
      const trx = new TransactionModel()
      trx.timestamp = 1700000000
      trx.counterparty_id = 5
      await trx.save()
      const [insertSql] = mockExecSQL.mock.calls[0]
      expect(insertSql as string).toContain('INSERT INTO trx')
      expect(insertSql as string).not.toContain('counterparty_id')
    })
  })

  describe('note field', () => {
    it('is populated from the hydrated row', () => {
      expect(makeTrx({ note: 'A note' }).note).toBe('A note')
    })

    it('is null when not present', () => {
      expect(makeTrx({ note: null }).note).toBeNull()
    })

    it('is tracked as dirty when changed after hydration', () => {
      const trx = makeTrx()
      trx.note = 'New note'
      expect(trx.isFieldDirty('note')).toBe(true)
    })

    it('is excluded from flat UPDATE SQL', async () => {
      const trx = makeTrx()
      trx.note = 'Changed'
      await trx.save()
      const updateCalls = mockExecSQL.mock.calls.filter(([sql]) =>
        String(sql).startsWith('UPDATE')
      )
      expect(updateCalls).toHaveLength(0)
    })

    it('is excluded from flat INSERT SQL', async () => {
      const trx = new TransactionModel()
      trx.timestamp = 1700000000
      trx.note = 'Test note'
      await trx.save()
      const [insertSql] = mockExecSQL.mock.calls[0]
      expect(insertSql as string).toContain('INSERT INTO trx')
      expect(insertSql as string).not.toContain('note')
    })
  })

  // ── INSERT (new instance) ─────────────────────────────────────────────────

  describe('INSERT (new instance)', () => {
    it('uses randomblob(8) in INSERT SQL', async () => {
      const trx = new TransactionModel()
      trx.timestamp = 1700000000
      await trx.save()
      const [sql] = mockExecSQL.mock.calls[0]
      expect(sql as string).toContain('randomblob(8)')
      expect(sql as string).toContain('INSERT INTO trx')
    })

    it('assigns id from SELECT after INSERT', async () => {
      const trx = new TransactionModel()
      trx.timestamp = 1700000000
      await trx.save()
      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT id FROM trx ORDER BY rowid DESC LIMIT 1'
      )
      expect(trx.id).toBe(FAKE_NEW)
    })

    it('sets isNew() to false after INSERT', async () => {
      const trx = new TransactionModel()
      trx.timestamp = 1700000000
      expect(trx.isNew()).toBe(true)
      await trx.save()
      expect(trx.isNew()).toBe(false)
    })

    it('throws when SELECT returns null after INSERT', async () => {
      mockQueryOne.mockResolvedValue(null)
      const trx = new TransactionModel()
      trx.timestamp = 1700000000
      await expect(trx.save()).rejects.toThrow('Failed to create transaction')
    })

    it('excludes counterparty_id and note from INSERT SQL', async () => {
      const trx = new TransactionModel()
      trx.timestamp = 1700000000
      trx.counterparty_id = 3
      trx.note = 'Test'
      await trx.save()
      const [sql] = mockExecSQL.mock.calls[0]
      expect(sql as string).not.toContain('counterparty_id')
      expect(sql as string).not.toContain('note')
    })
  })

  // ── UPDATE (hydrated instance) ────────────────────────────────────────────

  describe('UPDATE (hydrated instance)', () => {
    it('updates timestamp when dirty', async () => {
      const trx = makeTrx()
      trx.timestamp = 9999999999
      await trx.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE trx SET timestamp = ? WHERE id = ?',
        [9999999999, FAKE_ID]
      )
    })

    it('does not issue UPDATE when nothing is dirty', async () => {
      const trx = makeTrx()
      await trx.save()
      const updateCalls = mockExecSQL.mock.calls.filter(([sql]) =>
        String(sql).startsWith('UPDATE')
      )
      expect(updateCalls).toHaveLength(0)
    })
  })

  // ── _saveRelations — counterparty_id ──────────────────────────────────────

  describe('_saveRelations() — counterparty_id', () => {
    it('skips counterparty SQL when counterparty_id is not dirty', async () => {
      const trx = makeTrx({ counterparty_id: 1 })
      trx.timestamp = 9999999999
      await trx.save()
      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      expect(sqls.some(s => s.includes('trx_to_counterparty'))).toBe(false)
    })

    it('deletes and re-inserts trx_to_counterparty when counterparty_id is set', async () => {
      const trx = makeTrx({ counterparty_id: null })
      trx.counterparty_id = 5
      await trx.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM trx_to_counterparty WHERE trx_id = ?',
        [FAKE_ID]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)',
        [FAKE_ID, 5]
      )
    })

    it('only deletes trx_to_counterparty when counterparty_id is cleared to null', async () => {
      const trx = makeTrx({ counterparty_id: 5 })
      trx.counterparty_id = null
      await trx.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM trx_to_counterparty WHERE trx_id = ?',
        [FAKE_ID]
      )
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_to_counterparty'),
        expect.anything()
      )
    })
  })

  // ── _saveRelations — note ─────────────────────────────────────────────────

  describe('_saveRelations() — note', () => {
    it('skips note SQL when note is not dirty', async () => {
      const trx = makeTrx({ note: 'Existing' })
      trx.timestamp = 9999999999
      await trx.save()
      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      expect(sqls.some(s => s.includes('trx_note'))).toBe(false)
    })

    it('deletes and re-inserts trx_note when note is set', async () => {
      const trx = makeTrx({ note: null })
      trx.note = 'New note'
      await trx.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM trx_note WHERE trx_id = ?',
        [FAKE_ID]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO trx_note (trx_id, note) VALUES (?, ?)',
        [FAKE_ID, 'New note']
      )
    })

    it('only deletes trx_note when note is cleared to null', async () => {
      const trx = makeTrx({ note: 'Old note' })
      trx.note = null
      await trx.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM trx_note WHERE trx_id = ?',
        [FAKE_ID]
      )
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trx_note'),
        expect.anything()
      )
    })
  })

  // ── _saveRelations — lines ────────────────────────────────────────────────

  describe('_saveRelations() — lines', () => {
    it('stamps trx_id on appended line and saves it', async () => {
      const trx = makeTrx()
      const line = new TransactionLineModel()
      line.account_id = 1
      line.tag_id = 2
      line.sign = '-'
      line.amount_int = 5
      line.amount_frac = 0
      line.rate_int = 1
      line.rate_frac = 0
      // mock queryOne for the line insert
      mockQueryOne.mockResolvedValue({ id: FAKE_LINE_ID })
      trx.lines.append(line)
      await trx.save()
      // line.trx_id should be stamped with trx.id
      expect(line.trx_id).toBe(FAKE_ID)
      // line.save() should have been called (INSERT INTO trx_base)
      const insertLineSql = mockExecSQL.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO trx_base')
      )
      expect(insertLineSql).toBeDefined()
    })

    it('calls delete on removed line', async () => {
      const trx = makeTrx()
      const line = new TransactionLineModel()._hydrate({
        id: FAKE_LINE_ID,
        trx_id: FAKE_ID,
        account_id: 1,
        tag_id: 2,
        sign: '-' as const,
        amount_int: 5,
        amount_frac: 0,
        rate_int: 1,
        rate_frac: 0,
        pct_value: null,
        wallet: 'Cash',
        currency: 'USD',
        symbol: '$',
        decimal_places: 2,
        tag: 'Food',
        is_common: 0,
      })
      trx.lines.remove(line)
      await trx.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM trx_base WHERE id = ?',
        [FAKE_LINE_ID]
      )
    })
  })

  // ── _deleteRelations ──────────────────────────────────────────────────────

  describe('_deleteRelations()', () => {
    it('throws when deleting an unsaved instance', async () => {
      await expect(new TransactionModel().delete()).rejects.toThrow(
        'Cannot delete an unsaved model instance'
      )
    })

    it('deletes trx_to_counterparty before the main row', async () => {
      const trx = makeTrx()
      await trx.delete()
      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      const cpIdx = sqls.findIndex(s => s.includes('trx_to_counterparty'))
      const mainIdx = sqls.findIndex(s => s === 'DELETE FROM trx WHERE id = ?')
      expect(cpIdx).toBeGreaterThanOrEqual(0)
      expect(mainIdx).toBeGreaterThan(cpIdx)
    })

    it('deletes trx_note before the main row', async () => {
      const trx = makeTrx()
      await trx.delete()
      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      const noteIdx = sqls.findIndex(s => s.includes('trx_note'))
      const mainIdx = sqls.findIndex(s => s === 'DELETE FROM trx WHERE id = ?')
      expect(noteIdx).toBeGreaterThanOrEqual(0)
      expect(mainIdx).toBeGreaterThan(noteIdx)
    })

    it('deletes trx_base before the main row', async () => {
      const trx = makeTrx()
      await trx.delete()
      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      const baseIdx = sqls.findIndex(s => s.includes('DELETE FROM trx_base'))
      const mainIdx = sqls.findIndex(s => s === 'DELETE FROM trx WHERE id = ?')
      expect(baseIdx).toBeGreaterThanOrEqual(0)
      expect(mainIdx).toBeGreaterThan(baseIdx)
    })

    it('deletes trx_to_counterparty by trx_id', async () => {
      const trx = makeTrx()
      await trx.delete()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM trx_to_counterparty WHERE trx_id = ?',
        [FAKE_ID]
      )
    })

    it('deletes trx_note by trx_id', async () => {
      const trx = makeTrx()
      await trx.delete()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM trx_note WHERE trx_id = ?',
        [FAKE_ID]
      )
    })

    it('deletes trx_base by trx_id', async () => {
      const trx = makeTrx()
      await trx.delete()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM trx_base WHERE trx_id = ?',
        [FAKE_ID]
      )
    })

    it('deletes the main trx row', async () => {
      const trx = makeTrx()
      await trx.delete()
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM trx WHERE id = ?', [FAKE_ID])
    })
  })

  // ── LazyRelation loader ───────────────────────────────────────────────────

  describe('LazyRelation — lines loader', () => {
    it('queries trx_base joined with accounts and tag by trx_id', async () => {
      mockQuerySQL.mockResolvedValue([])
      const trx = makeTrx()
      await trx.lines
      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('trx_base'),
        expect.arrayContaining([FAKE_ID])
      )
    })

    it('returns hydrated TransactionLineModel instances', async () => {
      mockQuerySQL.mockResolvedValue([{
        id: FAKE_LINE_ID,
        trx_id: FAKE_ID,
        account_id: 1,
        tag_id: 2,
        sign: '-',
        amount_int: 10,
        amount_frac: 0,
        rate_int: 1,
        rate_frac: 0,
        pct_value: null,
        wallet: 'Cash',
        currency: 'USD',
        symbol: '$',
        decimal_places: 2,
        tag: 'Food',
        is_common: 0,
      }])
      const trx = makeTrx()
      const lines = await trx.lines
      expect(lines).toHaveLength(1)
      expect(lines[0]).toBeInstanceOf(TransactionLineModel)
      expect(lines[0].account_id).toBe(1)
    })
  })
})
