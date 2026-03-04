import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { TransactionLineModel } from '../../../../services/orm/TransactionLineModel'
import { execSQL, queryOne } from '../../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)

const FAKE_ID = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
const FAKE_TRX_ID = new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16])
const FAKE_NEW = new Uint8Array([17, 18, 19, 20, 21, 22, 23, 24])

function makeLine(overrides: Record<string, unknown> = {}): TransactionLineModel {
  return new TransactionLineModel()._hydrate({
    id: FAKE_ID,
    trx_id: FAKE_TRX_ID,
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
    ...overrides,
  })
}

describe('TransactionLineModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockQueryOne.mockResolvedValue({ id: FAKE_NEW })
  })

  // ── Static config ─────────────────────────────────────────────────────────

  describe('static config', () => {
    it('tableName is "trx_base"', () => {
      expect((TransactionLineModel as any).tableName).toBe('trx_base')
    })

    it('idColumn is "id"', () => {
      expect((TransactionLineModel as any).idColumn).toBe('id')
    })

    it('filterPrefix is "tb."', () => {
      expect((TransactionLineModel as any).filterPrefix).toBe('tb.')
    })

    it('selectSQL JOINs accounts view and tag with is_common subquery', () => {
      const sql = (TransactionLineModel as any).selectSQL as string
      expect(sql).toContain('FROM trx_base tb')
      expect(sql).toContain('JOIN accounts a ON tb.account_id = a.id')
      expect(sql).toContain('JOIN tag ON tb.tag_id = tag.id')
      expect(sql).toContain('tags_hierarchy')
      expect(sql).toContain('is_common')
      expect(sql).toContain('a.wallet')
      expect(sql).toContain('a.currency')
      expect(sql).toContain('a.symbol')
      expect(sql).toContain('a.decimal_places')
    })
  })

  // ── Read-only joined getters ───────────────────────────────────────────────

  describe('read-only joined getters', () => {
    it('wallet returns hydrated value', () => {
      expect(makeLine({ wallet: 'Savings' }).wallet).toBe('Savings')
    })

    it('currency returns hydrated value', () => {
      expect(makeLine({ currency: 'EUR' }).currency).toBe('EUR')
    })

    it('symbol returns hydrated value', () => {
      expect(makeLine({ symbol: '€' }).symbol).toBe('€')
    })

    it('decimal_places returns hydrated value', () => {
      expect(makeLine({ decimal_places: 3 }).decimal_places).toBe(3)
    })

    it('tag returns hydrated value', () => {
      expect(makeLine({ tag: 'Transport' }).tag).toBe('Transport')
    })

    it('is_common returns hydrated value', () => {
      expect(makeLine({ is_common: 1 }).is_common).toBe(1)
    })

    it('wallet is not dirty after hydration', () => {
      expect(makeLine().isFieldDirty('wallet')).toBe(false)
    })

    it('currency is not dirty after hydration', () => {
      expect(makeLine().isFieldDirty('currency')).toBe(false)
    })

    it('symbol is not dirty after hydration', () => {
      expect(makeLine().isFieldDirty('symbol')).toBe(false)
    })

    it('decimal_places is not dirty after hydration', () => {
      expect(makeLine().isFieldDirty('decimal_places')).toBe(false)
    })

    it('tag is not dirty after hydration', () => {
      expect(makeLine().isFieldDirty('tag')).toBe(false)
    })

    it('is_common is not dirty after hydration', () => {
      expect(makeLine().isFieldDirty('is_common')).toBe(false)
    })
  })

  // ── getDirtyFields ────────────────────────────────────────────────────────

  describe('getDirtyFields()', () => {
    it('excludes joined aliases from INSERT SQL', async () => {
      const line = new TransactionLineModel()
      line.trx_id = FAKE_TRX_ID
      line.account_id = 1
      line.tag_id = 2
      line.sign = '-'
      line.amount_int = 5
      line.amount_frac = 0
      line.rate_int = 1
      line.rate_frac = 0
      await line.save()
      const [sql] = mockExecSQL.mock.calls[0]
      expect(sql as string).not.toContain('wallet')
      expect(sql as string).not.toContain('symbol')
      expect(sql as string).not.toContain('decimal_places')
      expect(sql as string).not.toContain('is_common')
      expect(sql as string).not.toMatch(/\btag\b(?!\s*\.?\s*id)/)
    })
  })

  // ── INSERT (new instance) ─────────────────────────────────────────────────

  describe('INSERT (new instance)', () => {
    it('uses randomblob(8) in INSERT SQL for id', async () => {
      const line = new TransactionLineModel()
      line.trx_id = FAKE_TRX_ID
      line.account_id = 1
      line.tag_id = 2
      line.sign = '-'
      line.amount_int = 5
      line.amount_frac = 0
      line.rate_int = 1
      line.rate_frac = 0
      await line.save()
      const [sql] = mockExecSQL.mock.calls[0]
      expect(sql as string).toContain('randomblob(8)')
      expect(sql as string).toContain('INSERT INTO trx_base')
    })

    it('assigns id from SELECT after INSERT', async () => {
      const line = new TransactionLineModel()
      line.trx_id = FAKE_TRX_ID
      line.account_id = 1
      line.tag_id = 2
      line.sign = '-'
      line.amount_int = 5
      line.amount_frac = 0
      line.rate_int = 1
      line.rate_frac = 0
      await line.save()
      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT id FROM trx_base ORDER BY rowid DESC LIMIT 1'
      )
      expect(line.id).toBe(FAKE_NEW)
    })

    it('sets isNew() to false after INSERT', async () => {
      const line = new TransactionLineModel()
      line.trx_id = FAKE_TRX_ID
      line.account_id = 1
      line.tag_id = 2
      line.sign = '-'
      line.amount_int = 5
      line.amount_frac = 0
      line.rate_int = 1
      line.rate_frac = 0
      expect(line.isNew()).toBe(true)
      await line.save()
      expect(line.isNew()).toBe(false)
    })

    it('throws when SELECT returns null after INSERT', async () => {
      mockQueryOne.mockResolvedValue(null)
      const line = new TransactionLineModel()
      line.trx_id = FAKE_TRX_ID
      line.account_id = 1
      line.tag_id = 2
      line.sign = '-'
      line.amount_int = 5
      line.amount_frac = 0
      line.rate_int = 1
      line.rate_frac = 0
      await expect(line.save()).rejects.toThrow('Failed to create transaction line')
    })
  })

  // ── UPDATE (hydrated instance) ────────────────────────────────────────────

  describe('UPDATE (hydrated instance)', () => {
    it('updates changed flat fields', async () => {
      const line = makeLine()
      line.amount_int = 99
      await line.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE trx_base SET amount_int = ? WHERE id = ?',
        [99, FAKE_ID]
      )
    })

    it('does not issue UPDATE when nothing is dirty', async () => {
      const line = makeLine()
      await line.save()
      const updateCalls = mockExecSQL.mock.calls.filter(([sql]) =>
        String(sql).startsWith('UPDATE')
      )
      expect(updateCalls).toHaveLength(0)
    })
  })

  // ── delete() ──────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('throws when deleting an unsaved instance', async () => {
      await expect(new TransactionLineModel().delete()).rejects.toThrow(
        'Cannot delete an unsaved model instance'
      )
    })

    it('deletes the row by blob id', async () => {
      const line = makeLine()
      await line.delete()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM trx_base WHERE id = ?',
        [FAKE_ID]
      )
    })
  })
})
