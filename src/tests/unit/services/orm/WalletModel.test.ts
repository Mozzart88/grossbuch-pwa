import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { WalletModel } from '../../../../services/orm/WalletModel'
import { execSQL, getLastInsertId, querySQL } from '../../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockGetLastInsertId = vi.mocked(getLastInsertId)
const mockQuerySQL = vi.mocked(querySQL)

function makeWallet(overrides: Record<string, unknown> = {}): WalletModel {
  return new WalletModel()._hydrate({
    id: 5,
    name: 'My Wallet',
    color: '#ff0000',
    is_default: 0,
    is_archived: 0,
    is_virtual: 0,
    ...overrides,
  })
}

describe('WalletModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockGetLastInsertId.mockResolvedValue(42)
    mockQuerySQL.mockResolvedValue([])
  })

  // ── Static config ─────────────────────────────────────────────────────────

  describe('static config', () => {
    it('tableName is "wallet"', () => {
      expect((WalletModel as any).tableName).toBe('wallet')
    })

    it('idColumn is "id"', () => {
      expect((WalletModel as any).idColumn).toBe('id')
    })

    it('filterPrefix is "w."', () => {
      expect((WalletModel as any).filterPrefix).toBe('w.')
    })

    it('selectSQL JOINs wallet_to_tags with GROUP BY and boolean flags', () => {
      const sql = (WalletModel as any).selectSQL as string
      expect(sql).toContain('LEFT JOIN wallet_to_tags wt ON wt.wallet_id = w.id')
      expect(sql).toContain('GROUP BY w.id')
      expect(sql).toContain('is_default')
      expect(sql).toContain('is_archived')
      expect(sql).toContain('is_virtual')
    })
  })

  // ── Hydration ─────────────────────────────────────────────────────────────

  describe('_hydrate casting', () => {
    it('converts is_default 1 → true', () => {
      expect(makeWallet({ is_default: 1 }).is_default).toBe(true)
    })

    it('converts is_default 0 → false', () => {
      expect(makeWallet({ is_default: 0 }).is_default).toBe(false)
    })

    it('converts is_archived 1 → true', () => {
      expect(makeWallet({ is_archived: 1 }).is_archived).toBe(true)
    })

    it('converts is_archived 0 → false', () => {
      expect(makeWallet({ is_archived: 0 }).is_archived).toBe(false)
    })

    it('is_default is not dirty after hydration', () => {
      expect(makeWallet().isFieldDirty('is_default')).toBe(false)
    })

    it('is_archived is not dirty after hydration', () => {
      expect(makeWallet().isFieldDirty('is_archived')).toBe(false)
    })

    it('is_virtual is not dirty after hydration', () => {
      expect(makeWallet().isFieldDirty('is_virtual')).toBe(false)
    })
  })

  // ── Read-only is_virtual getter ───────────────────────────────────────────

  describe('read-only is_virtual getter', () => {
    it('returns true when tag_id=1 is set', () => {
      expect(makeWallet({ is_virtual: 1 }).is_virtual).toBe(true)
    })

    it('returns false when tag_id=1 is absent', () => {
      expect(makeWallet({ is_virtual: 0 }).is_virtual).toBe(false)
    })

    it('is_virtual getter reflects hydrated value', () => {
      expect(makeWallet({ is_virtual: 1 }).is_virtual).toBe(true)
      expect(makeWallet({ is_virtual: 0 }).is_virtual).toBe(false)
    })
  })

  // ── getDirtyFields ────────────────────────────────────────────────────────

  describe('getDirtyFields()', () => {
    it('excludes is_default and is_archived from INSERT SQL', async () => {
      const w = new WalletModel()
      w.set({ name: 'Test', color: null, is_default: true, is_archived: false })
      await w.save()
      const [sql] = mockExecSQL.mock.calls[0]
      expect(sql as string).not.toContain('is_default')
      expect(sql as string).not.toContain('is_archived')
    })

    it('excludes is_default and is_archived from UPDATE SQL', async () => {
      const w = makeWallet()
      w.is_default = true
      w.is_archived = true
      await w.save()
      const updateCall = mockExecSQL.mock.calls.find(([sql]) =>
        String(sql).startsWith('UPDATE')
      )
      expect(updateCall).toBeUndefined()
    })
  })

  // ── INSERT ────────────────────────────────────────────────────────────────

  describe('INSERT (new instance)', () => {
    it('assigns new id from getLastInsertId', async () => {
      mockGetLastInsertId.mockResolvedValue(55)
      const w = new WalletModel()
      w.set({ name: 'New Wallet', color: null })
      await w.save()
      expect(w.id).toBe(55)
      expect(w.isNew()).toBe(false)
    })
  })

  // ── _saveRelations: is_default ────────────────────────────────────────────

  describe('_saveRelations() — is_default', () => {
    it('skips wallet_to_tags SQL when neither flag is dirty', async () => {
      const w = makeWallet()
      w.name = 'Renamed'
      await w.save()
      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      expect(sqls.some(s => s.includes('wallet_to_tags'))).toBe(false)
    })

    it('DELETEs and INSERTs tag_id=2 when is_default set to true', async () => {
      const w = makeWallet({ is_default: 0 })
      w.is_default = true
      await w.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM wallet_to_tags WHERE wallet_id = ? AND tag_id = ?',
        [5, 2]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)',
        [5, 2]
      )
    })

    it('DELETEs tag_id=2 and does not INSERT when is_default set to false', async () => {
      const w = makeWallet({ is_default: 1 })
      w.is_default = false
      await w.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM wallet_to_tags WHERE wallet_id = ? AND tag_id = ?',
        [5, 2]
      )
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        'INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)',
        [5, 2]
      )
    })
  })

  // ── _saveRelations: is_archived ───────────────────────────────────────────

  describe('_saveRelations() — is_archived', () => {
    it('DELETEs and INSERTs tag_id=22 when is_archived set to true', async () => {
      const w = makeWallet({ is_archived: 0 })
      w.is_archived = true
      await w.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM wallet_to_tags WHERE wallet_id = ? AND tag_id = ?',
        [5, 22]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)',
        [5, 22]
      )
    })

    it('DELETEs tag_id=22 and does not INSERT when is_archived set to false', async () => {
      const w = makeWallet({ is_archived: 1 })
      w.is_archived = false
      await w.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM wallet_to_tags WHERE wallet_id = ? AND tag_id = ?',
        [5, 22]
      )
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        'INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)',
        [5, 22]
      )
    })

    it('handles both is_default and is_archived dirty simultaneously', async () => {
      const w = makeWallet({ is_default: 0, is_archived: 0 })
      w.is_default = true
      w.is_archived = true
      await w.save()

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM wallet_to_tags WHERE wallet_id = ? AND tag_id = ?',
        [5, 2]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)',
        [5, 2]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM wallet_to_tags WHERE wallet_id = ? AND tag_id = ?',
        [5, 22]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)',
        [5, 22]
      )
    })
  })

  // ── _deleteRelations ──────────────────────────────────────────────────────

  describe('_deleteRelations()', () => {
    it('throws when deleting an unsaved instance', async () => {
      await expect(new WalletModel().delete()).rejects.toThrow('Cannot delete an unsaved model instance')
    })

    it('deletes wallet_to_tags rows before the main row', async () => {
      const w = makeWallet()
      await w.delete()

      const sqls = mockExecSQL.mock.calls.map(([sql]) => sql as string)
      const junctionIdx = sqls.findIndex(s => s.includes('wallet_to_tags'))
      const mainIdx = sqls.findIndex(s => s === 'DELETE FROM wallet WHERE id = ?')

      expect(junctionIdx).toBeGreaterThanOrEqual(0)
      expect(mainIdx).toBeGreaterThan(junctionIdx)
    })

    it('deletes wallet_to_tags by wallet_id', async () => {
      const w = makeWallet()
      await w.delete()
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM wallet_to_tags WHERE wallet_id = ?',
        [5]
      )
    })

    it('deletes the main wallet row', async () => {
      const w = makeWallet()
      await w.delete()
      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM wallet WHERE id = ?', [5])
    })
  })

  // ── accounts LazyRelation ─────────────────────────────────────────────────

  describe('accounts LazyRelation', () => {
    it('calls Repository.find(AccountModel, { wallet_id }) with the wallet id', async () => {
      const w = makeWallet({ id: 5 })
      await w.accounts
      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.wallet_id = ?'),
        [5]
      )
    })

    it('returns an empty array when no accounts exist', async () => {
      const w = makeWallet()
      const result = await w.accounts
      expect(result).toEqual([])
    })
  })
})
