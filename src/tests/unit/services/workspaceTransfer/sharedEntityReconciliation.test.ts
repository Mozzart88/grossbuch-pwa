import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database/connection', () => ({
  execSQL: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn().mockResolvedValue(null),
  getLastInsertId: vi.fn().mockResolvedValue(1),
}))

import {
  reconcileIcons,
  reconcileTags,
  reconcileCurrencies,
  reconcileCounterparties,
} from '../../../../services/workspaceTransfer/sharedEntityReconciliation'
import { execSQL, queryOne, getLastInsertId } from '../../../../services/database/connection'

const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)
const mockGetLastInsertId = vi.mocked(getLastInsertId)

describe('sharedEntityReconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockQueryOne.mockResolvedValue(null)
    mockGetLastInsertId.mockResolvedValue(1)
  })

  describe('reconcileIcons', () => {
    it('reuses an existing icon by value', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 7 })

      const map = await reconcileIcons([{ value: 'basket' }])

      expect(map.get('basket')).toBe(7)
      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('INSERT'), expect.anything())
    })

    it('creates a new icon when none exists', async () => {
      mockQueryOne.mockResolvedValueOnce(null)
      mockGetLastInsertId.mockResolvedValueOnce(42)

      const map = await reconcileIcons([{ value: 'car' }])

      expect(mockExecSQL).toHaveBeenCalledWith(`INSERT INTO shared.icon (value) VALUES (?)`, ['car'])
      expect(map.get('car')).toBe(42)
    })
  })

  describe('reconcileTags', () => {
    it('reuses an existing tag by name', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 11 })

      const map = await reconcileTags(
        [{ name: 'Food', parents: [], children: [], icon: null }],
        new Map()
      )

      expect(map.get('Food')).toBe(11)
      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO shared.tag '), expect.anything())
    })

    it('creates a new tag and wires up its parent relation and icon', async () => {
      // Parent tag lookup, then child tag lookup — both miss (create)
      mockQueryOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      mockGetLastInsertId.mockResolvedValueOnce(20).mockResolvedValueOnce(21)

      const iconIdByValue = new Map([['basket', 5]])
      const map = await reconcileTags(
        [
          { name: 'Groceries', parents: [], children: ['Snacks'], icon: null },
          { name: 'Snacks', parents: ['Groceries'], children: [], icon: 'basket' },
        ],
        iconIdByValue
      )

      expect(map.get('Groceries')).toBe(20)
      expect(map.get('Snacks')).toBe(21)
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO shared.tag_to_tag'),
        [21, 20, 21, 20]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO shared.tag_icon'),
        [21, 5, 21, 5]
      )
    })

    it('skips a parent/icon reference that has no resolved id', async () => {
      mockQueryOne.mockResolvedValueOnce(null)
      mockGetLastInsertId.mockResolvedValueOnce(30)

      await reconcileTags(
        [{ name: 'Orphan', parents: ['Nonexistent'], children: [], icon: 'missing-icon' }],
        new Map()
      )

      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('tag_to_tag'), expect.anything())
      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('tag_icon'), expect.anything())
    })
  })

  describe('reconcileCurrencies', () => {
    it('reuses an existing currency by code', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 3 })

      const map = await reconcileCurrencies([{ code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2 }])

      expect(map.get('USD')).toBe(3)
      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('creates a new currency with full fields when the code is unknown', async () => {
      mockQueryOne.mockResolvedValueOnce(null)
      mockGetLastInsertId.mockResolvedValueOnce(9)

      const map = await reconcileCurrencies([{ code: 'ZZZ', name: 'Ficton', symbol: 'Z', decimal_places: 0 }])

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO shared.currency'),
        ['ZZZ', 'Ficton', 'Z', 0]
      )
      expect(map.get('ZZZ')).toBe(9)
    })
  })

  describe('reconcileCounterparties', () => {
    it('reuses an existing counterparty by name and does not re-insert note/tags', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 4 })

      const map = await reconcileCounterparties(
        [{ name: 'Grocery Store', note: 'note', tags: ['Food'] }],
        new Map([['Food', 1]])
      )

      expect(map.get('Grocery Store')).toBe(4)
      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('creates a new counterparty with note and reconciled tags', async () => {
      mockQueryOne.mockResolvedValueOnce(null)
      mockGetLastInsertId.mockResolvedValueOnce(50)

      const map = await reconcileCounterparties(
        [{ name: 'New Vendor', note: 'has a note', tags: ['Food'] }],
        new Map([['Food', 1]])
      )

      expect(map.get('New Vendor')).toBe(50)
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO shared.counterparty '), ['New Vendor'])
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('counterparty_note'), [50, 'has a note'])
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('counterparty_to_tags'), [50, 1])
    })

    it('skips a tag reference that has no resolved id', async () => {
      mockQueryOne.mockResolvedValueOnce(null)
      mockGetLastInsertId.mockResolvedValueOnce(51)

      await reconcileCounterparties([{ name: 'Vendor', note: null, tags: ['Unresolved'] }], new Map())

      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('counterparty_to_tags'), expect.anything())
    })
  })
})
