import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { AccountModel } from '../../../../services/orm/AccountModel'
import { execSQL, getLastInsertId } from '../../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockGetLastInsertId = vi.mocked(getLastInsertId)

function makeAccount(overrides: Record<string, unknown> = {}): AccountModel {
  return new AccountModel()._hydrate({
    id: 1,
    wallet_id: 10,
    currency_id: 3,
    balance_int: 100,
    balance_frac: 50,
    updated_at: 1700000000,
    currency: 'USD',
    symbol: '$',
    decimal_places: 2,
    is_default: 0,
    ...overrides,
  })
}

describe('AccountModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockGetLastInsertId.mockResolvedValue(42)
  })

  // ── Static config ─────────────────────────────────────────────────────────

  describe('static config', () => {
    it('tableName is "account"', () => {
      expect((AccountModel as any).tableName).toBe('account')
    })

    it('idColumn is "id"', () => {
      expect((AccountModel as any).idColumn).toBe('id')
    })

    it('filterPrefix is "a."', () => {
      expect((AccountModel as any).filterPrefix).toBe('a.')
    })

    it('selectSQL JOINs currency and account_to_tags with GROUP BY', () => {
      const sql = (AccountModel as any).selectSQL as string
      expect(sql).toContain('JOIN currency c ON a.currency_id = c.id')
      expect(sql).toContain('LEFT JOIN account_to_tags ato ON ato.account_id = a.id')
      expect(sql).toContain('GROUP BY a.id')
      expect(sql).toContain('is_default')
    })
  })

  // ── Hydration ─────────────────────────────────────────────────────────────

  describe('_hydrate casting', () => {
    it('converts is_default 1 → true', () => {
      expect(makeAccount({ is_default: 1 }).is_default).toBe(true)
    })

    it('converts is_default 0 → false', () => {
      expect(makeAccount({ is_default: 0 }).is_default).toBe(false)
    })

    it('is_default is not dirty after hydration', () => {
      expect(makeAccount().isFieldDirty('is_default')).toBe(false)
    })
  })

  // ── Read-only getters ─────────────────────────────────────────────────────

  describe('read-only getters', () => {
    it('currency returns joined value', () => {
      expect(makeAccount({ currency: 'EUR' }).currency).toBe('EUR')
    })

    it('symbol returns joined value', () => {
      expect(makeAccount({ symbol: '€' }).symbol).toBe('€')
    })

    it('decimal_places returns joined value', () => {
      expect(makeAccount({ decimal_places: 3 }).decimal_places).toBe(3)
    })

    it('currency is not dirty after hydration', () => {
      expect(makeAccount().isFieldDirty('currency')).toBe(false)
    })

    it('symbol is not dirty after hydration', () => {
      expect(makeAccount().isFieldDirty('symbol')).toBe(false)
    })

    it('decimal_places is not dirty after hydration', () => {
      expect(makeAccount().isFieldDirty('decimal_places')).toBe(false)
    })

    it('currency getter reflects hydrated value', () => {
      expect(makeAccount({ currency: 'EUR' }).currency).toBe('EUR')
    })
  })

  // ── getDirtyFields ────────────────────────────────────────────────────────

  describe('getDirtyFields()', () => {
    it('excludes is_default from dirty fields', async () => {
      const a = new AccountModel()
      a.set({ wallet_id: 10, currency_id: 3, balance_int: 0, balance_frac: 0, updated_at: 1, is_default: true })
      await a.save()
      const [sql] = mockExecSQL.mock.calls[0]
      expect(sql as string).not.toContain('is_default')
    })
  })

  // ── INSERT ────────────────────────────────────────────────────────────────

  describe('INSERT (new instance)', () => {
    it('inserts flat fields, excluding is_default, currency, symbol, decimal_places', async () => {
      const a = new AccountModel()
      a.set({ wallet_id: 10, currency_id: 3, balance_int: 0, balance_frac: 0, updated_at: 1 })
      await a.save()
      const [sql, params] = mockExecSQL.mock.calls[0]
      expect(sql as string).toContain('INSERT INTO account')
      expect(sql as string).not.toContain('is_default')
      // currency_id IS a real column; ensure the bare joined alias 'currency' is not a column
      expect(sql as string).not.toMatch(/\(([^)]*\bcurrency\b(?!_id)[^)]*)\)/)
      expect(sql as string).not.toContain('symbol')
      expect(sql as string).not.toContain('decimal_places')
      expect(params).toContain(10)
    })

    it('assigns new id from getLastInsertId', async () => {
      mockGetLastInsertId.mockResolvedValue(99)
      const a = new AccountModel()
      a.set({ wallet_id: 10, currency_id: 3, balance_int: 0, balance_frac: 0, updated_at: 1 })
      await a.save()
      expect(a.id).toBe(99)
      expect(a.isNew()).toBe(false)
    })
  })

  // ── _saveRelations ────────────────────────────────────────────────────────

  describe('_saveRelations()', () => {
    it('skips account_to_tags SQL when is_default is not dirty', async () => {
      const a = makeAccount()
      a.balance_int = 200
      await a.save()
      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      expect(sqls.some(s => s.includes('account_to_tags'))).toBe(false)
    })

    it('DELETEs and INSERTs when is_default set to true', async () => {
      const a = makeAccount({ is_default: 0 })
      a.is_default = true
      await a.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM account_to_tags WHERE account_id = ? AND tag_id = ?',
        [1, 2]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO account_to_tags (account_id, tag_id) VALUES (?, ?)',
        [1, 2]
      )
    })

    it('DELETEs and does not INSERT when is_default set to false', async () => {
      const a = makeAccount({ is_default: 1 })
      a.is_default = false
      await a.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM account_to_tags WHERE account_id = ? AND tag_id = ?',
        [1, 2]
      )
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO account_to_tags'),
        expect.anything()
      )
    })
  })

  // ── _deleteRelations ──────────────────────────────────────────────────────

  describe('_deleteRelations()', () => {
    it('throws when deleting an unsaved instance', async () => {
      await expect(new AccountModel().delete()).rejects.toThrow('Cannot delete an unsaved model instance')
    })

    it('deletes account_to_tags rows before the main row', async () => {
      const a = makeAccount()
      await a.delete()

      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      const junctionIdx = sqls.findIndex(s => s.includes('account_to_tags'))
      const mainIdx = sqls.findIndex(s => s === 'DELETE FROM account WHERE id = ?')

      expect(junctionIdx).toBeGreaterThanOrEqual(0)
      expect(mainIdx).toBeGreaterThan(junctionIdx)
    })

    it('deletes account_to_tags by account_id', async () => {
      const a = makeAccount()
      await a.delete()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM account_to_tags WHERE account_id = ?',
        [1]
      )
    })

    it('deletes the main account row', async () => {
      const a = makeAccount()
      await a.delete()
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM account WHERE id = ?', [1])
    })
  })
})
