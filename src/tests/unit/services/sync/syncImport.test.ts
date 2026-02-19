import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecSQL = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('../../../../services/database/connection', () => ({
  execSQL: (...args: unknown[]) => mockExecSQL(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

vi.mock('../../../../utils/blobUtils', () => ({
  hexToBlob: (hex: string) => `blob:${hex}`,
}))

const { importSyncPackage } = await import('../../../../services/sync/syncImport')

function emptyPackage() {
  return {
    version: 2 as const,
    sender_id: 'sender',
    created_at: 1000,
    since: 0,
    icons: [],
    tags: [],
    wallets: [],
    accounts: [],
    counterparties: [],
    currencies: [],
    transactions: [],
    budgets: [],
    deletions: [],
  }
}

describe('syncImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockQueryOne.mockResolvedValue(null)
  })

  describe('updated_at preservation in INSERT', () => {
    it('passes updated_at when inserting icons', async () => {
      const pkg = emptyPackage()
      pkg.icons = [{ id: 1, value: 'star', updated_at: 5000 }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO icon (id, value, updated_at) VALUES (?, ?, ?)',
        [1, 'star', 5000]
      )
    })

    it('passes updated_at when inserting tags', async () => {
      const pkg = emptyPackage()
      pkg.tags = [{ id: 2, name: 'food', updated_at: 5000, parents: [], children: [], icon: null }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO tag (id, name, updated_at) VALUES (?, ?, ?)',
        [2, 'food', 5000]
      )
    })

    it('passes updated_at when inserting wallets', async () => {
      const pkg = emptyPackage()
      pkg.wallets = [{ id: 1, name: 'Cash', color: '#fff', updated_at: 5000, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO wallet (id, name, color, updated_at) VALUES (?, ?, ?, ?)',
        [1, 'Cash', '#fff', 5000]
      )
    })

    it('passes updated_at when inserting accounts', async () => {
      const pkg = emptyPackage()
      pkg.accounts = [{ id: 1, wallet: 1, currency: 1, updated_at: 5000, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO account (id, wallet_id, currency_id, updated_at) VALUES (?, ?, ?, ?)',
        [1, 1, 1, 5000]
      )
    })

    it('passes updated_at when inserting counterparties', async () => {
      const pkg = emptyPackage()
      pkg.counterparties = [{ id: 1, name: 'Bob', updated_at: 5000, note: null, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO counterparty (id, name, updated_at) VALUES (?, ?, ?)',
        [1, 'Bob', 5000]
      )
    })

    it('passes updated_at when inserting transactions', async () => {
      const pkg = emptyPackage()
      pkg.transactions = [{
        id: 'AA',
        timestamp: 1000,
        updated_at: 5000,
        counterparty: null,
        note: null,
        lines: [],
      }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO trx (id, timestamp, updated_at) VALUES (?, ?, ?)',
        ['blob:AA', 1000, 5000]
      )
    })

    it('passes updated_at when inserting budgets', async () => {
      const pkg = emptyPackage()
      pkg.budgets = [{ id: 'BB', start: 100, end: 200, tag: 3, amount_int: 1000, amount_frac: 0, updated_at: 5000 }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO budget (id, start, end, tag_id, amount_int, amount_frac, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['blob:BB', 100, 200, 3, 1000, 0, 5000]
      )
    })
  })

  describe('updated_at preservation in UPDATE', () => {
    it('passes updated_at when updating icons', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM icon')) return Promise.resolve({ updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.icons = [{ id: 1, value: 'star', updated_at: 5000 }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE icon SET value = ?, updated_at = ? WHERE id = ?',
        ['star', 5000, 1]
      )
    })

    it('passes updated_at when updating tags', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM tag')) return Promise.resolve({ name: 'old', updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.tags = [{ id: 2, name: 'food', updated_at: 5000, parents: [], children: [], icon: null }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE tag SET name = ?, updated_at = ? WHERE id = ?',
        ['food', 5000, 2]
      )
    })

    it('passes updated_at when updating wallets', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM wallet')) return Promise.resolve({ id: 1, updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.wallets = [{ id: 1, name: 'Cash', color: '#fff', updated_at: 5000, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE wallet SET name = ?, color = ?, updated_at = ? WHERE id = ?',
        ['Cash', '#fff', 5000, 1]
      )
    })

    it('passes updated_at when updating accounts', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM account')) return Promise.resolve({ id: 1, updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.accounts = [{ id: 1, wallet: 1, currency: 1, updated_at: 5000, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE account SET updated_at = ? WHERE id = ?',
        [5000, 1]
      )
    })

    it('passes updated_at when updating counterparties', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM counterparty')) return Promise.resolve({ id: 1, updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.counterparties = [{ id: 1, name: 'Bob', updated_at: 5000, note: null, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE counterparty SET name = ?, updated_at = ? WHERE id = ?',
        ['Bob', 5000, 1]
      )
    })

    it('passes updated_at when updating transactions', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM trx')) return Promise.resolve({ updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.transactions = [{
        id: 'AA',
        timestamp: 2000,
        updated_at: 5000,
        counterparty: null,
        note: null,
        lines: [],
      }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE trx SET timestamp = ?, updated_at = ? WHERE id = ?',
        [2000, 5000, 'blob:AA']
      )
    })

    it('passes updated_at when updating budgets', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM budget')) return Promise.resolve({ updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.budgets = [{ id: 'BB', start: 100, end: 200, tag: 3, amount_int: 1000, amount_frac: 0, updated_at: 5000 }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE budget SET start = ?, end = ?, tag_id = ?, amount_int = ?, amount_frac = ?, updated_at = ? WHERE hex(id) = ?',
        [100, 200, 3, 1000, 0, 5000, 'BB']
      )
    })
  })

  describe('currency import', () => {
    it('syncs currency_to_tags when remote is newer', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM currency')) return Promise.resolve({ id: 5, updated_at: 1000 })
        if (sql.includes('FROM exchange_rate')) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [4], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM currency_to_tags WHERE currency_id = ?',
        [5]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [5, 4]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE currency SET updated_at = ? WHERE id = ?',
        [5000, 5]
      )
    })

    it('imports exchange rate when local has none', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM currency')) return Promise.resolve({ id: 5, updated_at: 1000 })
        if (sql.includes('FROM exchange_rate')) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [], rate_int: 0, rate_frac: 920000000000000000 }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO exchange_rate (currency_id, rate_int, rate_frac) VALUES (?, ?, ?)',
        [5, 0, 920000000000000000]
      )
    })

    it('skips exchange rate when local already has one', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM currency')) return Promise.resolve({ id: 5, updated_at: 1000 })
        if (sql.includes('FROM exchange_rate')) return Promise.resolve({ rate_int: 1 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [], rate_int: 0, rate_frac: 920000000000000000 }]

      await importSyncPackage(pkg)

      const rateCalls = mockExecSQL.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).includes('exchange_rate')
      )
      expect(rateCalls).toHaveLength(0)
    })

    it('skips unknown currencies (not pre-seeded)', async () => {
      // queryOne returns null for unknown currency
      const pkg = emptyPackage()
      pkg.currencies = [{ id: 999, decimal_places: 2, updated_at: 5000, tags: [4], rate_int: 0, rate_frac: 500000000000000000 }]

      await importSyncPackage(pkg)

      const currCalls = mockExecSQL.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).includes('currency')
      )
      expect(currCalls).toHaveLength(0)
    })
  })

  describe('newAccountCurrencyIds', () => {
    it('contains currency IDs of newly inserted accounts', async () => {
      const pkg = emptyPackage()
      pkg.accounts = [
        { id: 1, wallet: 1, currency: 5, updated_at: 5000, tags: [] },
        { id: 2, wallet: 1, currency: 8, updated_at: 5000, tags: [] },
      ]

      const result = await importSyncPackage(pkg)

      expect(result.newAccountCurrencyIds).toEqual([5, 8])
    })

    it('is empty when accounts already exist (updates only)', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM account')) return Promise.resolve({ id: 1, updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.accounts = [{ id: 1, wallet: 1, currency: 5, updated_at: 5000, tags: [] }]

      const result = await importSyncPackage(pkg)

      expect(result.newAccountCurrencyIds).toEqual([])
    })
  })

  describe('skip when local is newer', () => {
    it('does not update icon when local updated_at is newer', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM icon')) return Promise.resolve({ updated_at: 9000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.icons = [{ id: 1, value: 'star', updated_at: 5000 }]

      await importSyncPackage(pkg)

      const updateCalls = mockExecSQL.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).startsWith('UPDATE icon')
      )
      expect(updateCalls).toHaveLength(0)
    })
  })
})
