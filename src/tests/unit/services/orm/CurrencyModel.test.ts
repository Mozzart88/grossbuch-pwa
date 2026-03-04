import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { CurrencyModel } from '../../../../services/orm/CurrencyModel'
import { execSQL, getLastInsertId } from '../../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockGetLastInsertId = vi.mocked(getLastInsertId)

function makeCurrency(overrides: Record<string, unknown> = {}): CurrencyModel {
  return new CurrencyModel()._hydrate({
    id: 1,
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimal_places: 2,
    is_system: 1,
    is_payment_default: 0,
    is_fiat: 1,
    is_crypto: 0,
    ...overrides,
  })
}

describe('CurrencyModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockGetLastInsertId.mockResolvedValue(42)
  })

  // ── Static config ─────────────────────────────────────────────────────────

  describe('static config', () => {
    it('tableName is "currency"', () => {
      expect((CurrencyModel as any).tableName).toBe('currency')
    })

    it('idColumn is "id"', () => {
      expect((CurrencyModel as any).idColumn).toBe('id')
    })

    it('filterPrefix is "c."', () => {
      expect((CurrencyModel as any).filterPrefix).toBe('c.')
    })

    it('selectSQL JOINs currency_to_tags and computes boolean flags', () => {
      const sql = (CurrencyModel as any).selectSQL as string
      expect(sql).toContain('LEFT JOIN currency_to_tags ct ON ct.currency_id = c.id')
      expect(sql).toContain('GROUP BY c.id')
      expect(sql).toContain('is_system')
      expect(sql).toContain('is_payment_default')
      expect(sql).toContain('is_fiat')
      expect(sql).toContain('is_crypto')
    })
  })

  // ── Read-only getters (is_fiat / is_crypto) ───────────────────────────────

  describe('read-only getters', () => {
    it('is_fiat returns true when tag_id=4 is set', () => {
      expect(makeCurrency({ is_fiat: 1 }).is_fiat).toBe(true)
    })

    it('is_fiat returns false when tag_id=4 is absent', () => {
      expect(makeCurrency({ is_fiat: 0 }).is_fiat).toBe(false)
    })

    it('is_crypto returns true when tag_id=5 is set', () => {
      expect(makeCurrency({ is_crypto: 1 }).is_crypto).toBe(true)
    })

    it('is_crypto returns false when tag_id=5 is absent', () => {
      expect(makeCurrency({ is_crypto: 0 }).is_crypto).toBe(false)
    })

    it('is_fiat is not dirty after hydration', () => {
      expect(makeCurrency().isFieldDirty('is_fiat')).toBe(false)
    })

    it('is_crypto is not dirty after hydration', () => {
      expect(makeCurrency().isFieldDirty('is_crypto')).toBe(false)
    })
  })

  // ── is_system / is_payment_default hydration ──────────────────────────────

  describe('_hydrate casting', () => {
    it('converts is_system 1 → true', () => {
      expect(makeCurrency({ is_system: 1 }).is_system).toBe(true)
    })

    it('converts is_system 0 → false', () => {
      expect(makeCurrency({ is_system: 0 }).is_system).toBe(false)
    })

    it('converts is_payment_default 1 → true', () => {
      expect(makeCurrency({ is_payment_default: 1 }).is_payment_default).toBe(true)
    })

    it('converts is_payment_default 0 → false', () => {
      expect(makeCurrency({ is_payment_default: 0 }).is_payment_default).toBe(false)
    })

    it('is_system is not dirty after hydration', () => {
      expect(makeCurrency().isFieldDirty('is_system')).toBe(false)
    })

    it('is_payment_default is not dirty after hydration', () => {
      expect(makeCurrency().isFieldDirty('is_payment_default')).toBe(false)
    })
  })

  // ── INSERT (new instance) ─────────────────────────────────────────────────

  describe('INSERT (new instance)', () => {
    it('inserts only flat fields, excluding is_system and is_payment_default', async () => {
      const c = new CurrencyModel()
      c.set({ code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, is_system: true })
      await c.save()
      const [sql, params] = mockExecSQL.mock.calls[0]
      expect(sql).toContain('INSERT INTO currency')
      expect(sql).not.toContain('is_system')
      expect(sql).not.toContain('is_payment_default')
      expect(sql).not.toContain('is_fiat')
      expect(sql).not.toContain('is_crypto')
      expect(params).toContain('EUR')
    })

    it('assigns the new id from getLastInsertId', async () => {
      mockGetLastInsertId.mockResolvedValue(77)
      const c = new CurrencyModel()
      c.set({ code: 'GBP', name: 'Pound', symbol: '£', decimal_places: 2 })
      await c.save()
      expect(c.id).toBe(77)
      expect(c.isNew()).toBe(false)
    })
  })

  // ── UPDATE (hydrated instance) ────────────────────────────────────────────

  describe('UPDATE (hydrated instance)', () => {
    it('updates only changed flat fields', async () => {
      const c = makeCurrency()
      c.name = 'United States Dollar'
      await c.save()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE currency SET name = ? WHERE id = ?',
        ['United States Dollar', 1]
      )
    })

    it('does not issue UPDATE when nothing is dirty', async () => {
      const c = makeCurrency()
      await c.save()
      const updateCalls = mockExecSQL.mock.calls.filter(([sql]) =>
        String(sql).startsWith('UPDATE')
      )
      expect(updateCalls).toHaveLength(0)
    })

    it('excludes is_system and is_payment_default from UPDATE SQL', async () => {
      const c = makeCurrency({ is_system: 0 })
      c.is_system = true
      await c.save()
      const updateCall = mockExecSQL.mock.calls.find(([sql]) =>
        String(sql).startsWith('UPDATE')
      )
      expect(updateCall).toBeUndefined()
    })
  })

  // ── _saveRelations ────────────────────────────────────────────────────────

  describe('_saveRelations()', () => {
    it('skips currency_to_tags SQL when is_system and is_payment_default are not dirty', async () => {
      const c = makeCurrency()
      c.name = 'Renamed'
      await c.save()
      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      expect(sqls.some(s => s.includes('currency_to_tags'))).toBe(false)
    })

    it('DELETEs system/default tags and INSERTs system tag when is_system set to true', async () => {
      const c = makeCurrency({ is_system: 0, is_payment_default: 0 })
      c.is_system = true
      await c.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM currency_to_tags WHERE currency_id = ? AND tag_id IN (1, 2)',
        [1]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, 1)',
        [1]
      )
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, 2)',
        expect.anything()
      )
    })

    it('DELETEs system/default tags and INSERTs payment_default tag when is_payment_default set to true', async () => {
      const c = makeCurrency({ is_system: 0, is_payment_default: 0 })
      c.is_payment_default = true
      await c.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM currency_to_tags WHERE currency_id = ? AND tag_id IN (1, 2)',
        [1]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, 2)',
        [1]
      )
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, 1)',
        expect.anything()
      )
    })

    it('DELETEs both and INSERTs both when is_system and is_payment_default are both true', async () => {
      const c = makeCurrency({ is_system: 0, is_payment_default: 0 })
      c.is_system = true
      c.is_payment_default = true
      await c.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM currency_to_tags WHERE currency_id = ? AND tag_id IN (1, 2)',
        [1]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, 1)',
        [1]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, 2)',
        [1]
      )
    })

    it('DELETEs both and inserts nothing when both set to false', async () => {
      const c = makeCurrency({ is_system: 1, is_payment_default: 1 })
      c.is_system = false
      c.is_payment_default = false
      await c.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM currency_to_tags WHERE currency_id = ? AND tag_id IN (1, 2)',
        [1]
      )
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currency_to_tags'),
        expect.anything()
      )
    })

    it('triggers on is_payment_default dirty even when is_system is not dirty', async () => {
      const c = makeCurrency({ is_system: 1, is_payment_default: 0 })
      c.is_payment_default = true
      await c.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM currency_to_tags WHERE currency_id = ? AND tag_id IN (1, 2)',
        [1]
      )
    })
  })

  // ── _deleteRelations ──────────────────────────────────────────────────────

  describe('_deleteRelations()', () => {
    it('throws when deleting an unsaved instance', async () => {
      await expect(new CurrencyModel().delete()).rejects.toThrow('Cannot delete an unsaved model instance')
    })

    it('deletes all currency_to_tags rows before the main row', async () => {
      const c = makeCurrency()
      await c.delete()

      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      const junctionIdx = sqls.findIndex(s => s.includes('currency_to_tags'))
      const mainIdx = sqls.findIndex(s => s === 'DELETE FROM currency WHERE id = ?')

      expect(junctionIdx).toBeGreaterThanOrEqual(0)
      expect(mainIdx).toBeGreaterThan(junctionIdx)
    })

    it('deletes currency_to_tags by currency_id', async () => {
      const c = makeCurrency()
      await c.delete()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM currency_to_tags WHERE currency_id = ?',
        [1]
      )
    })

    it('deletes the main currency row', async () => {
      const c = makeCurrency()
      await c.delete()
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM currency WHERE id = ?', [1])
    })
  })
})
