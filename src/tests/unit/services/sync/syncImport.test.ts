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

const mockSettingsGet = vi.fn()
const mockSettingsSet = vi.fn()
const mockSettingsDelete = vi.fn()

vi.mock('../../../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: (...args: unknown[]) => mockSettingsGet(...args),
    set: (...args: unknown[]) => mockSettingsSet(...args),
    delete: (...args: unknown[]) => mockSettingsDelete(...args),
  },
}))

const mockLinkedDeviceFindById = vi.fn()
const mockLinkedDeviceRemove = vi.fn()

vi.mock('../../../../services/repositories/linkedDeviceRepository', () => ({
  linkedDeviceRepository: {
    findById: (...args: unknown[]) => mockLinkedDeviceFindById(...args),
    remove: (...args: unknown[]) => mockLinkedDeviceRemove(...args),
  },
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

  it('reports unknown import error for non-Error thrown values', async () => {
    mockExecSQL.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO shared.icon')) return Promise.reject('boom')
      return Promise.resolve(undefined)
    })

    const pkg = emptyPackage()
    pkg.icons = [{ id: 1, value: 'star', updated_at: 5000 }]

    const result = await importSyncPackage(pkg)

    expect(result.errors).toEqual(['Unknown import error'])
    expect(mockExecSQL).toHaveBeenCalledWith('ROLLBACK')
    expect(mockExecSQL).toHaveBeenCalledWith('PRAGMA foreign_keys = ON')
  })

  describe('updated_at preservation in INSERT', () => {
    it('passes updated_at when inserting icons', async () => {
      const pkg = emptyPackage()
      pkg.icons = [{ id: 1, value: 'star', updated_at: 5000 }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO shared.icon (id, value, updated_at) VALUES (?, ?, ?)',
        [1, 'star', 5000]
      )
    })

    it('passes updated_at when inserting tags', async () => {
      const pkg = emptyPackage()
      pkg.tags = [{ id: 2, name: 'food', updated_at: 5000, parents: [], children: [], icon: null }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO shared.tag (id, name, updated_at) VALUES (?, ?, ?)',
        [2, 'food', 5000]
      )
    })

    it('passes updated_at when inserting wallets', async () => {
      const pkg = emptyPackage()
      pkg.wallets = [{ id: 1, name: 'Cash', color: '#fff', updated_at: 5000, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO workspace.wallet (id, name, color, updated_at) VALUES (?, ?, ?, ?)',
        [1, 'Cash', '#fff', 5000]
      )
    })

    it('passes updated_at when inserting accounts', async () => {
      const pkg = emptyPackage()
      pkg.accounts = [{ id: 1, wallet: 1, currency: 1, updated_at: 5000, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO workspace.account (id, wallet_id, currency_id, updated_at) VALUES (?, ?, ?, ?)',
        [1, 1, 1, 5000]
      )
    })

    it('passes updated_at when inserting counterparties', async () => {
      const pkg = emptyPackage()
      pkg.counterparties = [{ id: 1, name: 'Bob', updated_at: 5000, note: null, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO shared.counterparty (id, name, updated_at) VALUES (?, ?, ?)',
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
        'INSERT INTO workspace.trx (id, timestamp, updated_at) VALUES (?, ?, ?)',
        ['blob:AA', 1000, 5000]
      )
    })

    it('passes updated_at when inserting budgets', async () => {
      const pkg = emptyPackage()
      pkg.budgets = [{ id: 'BB', start: 100, end: 200, tag: 3, amount_int: 1000, amount_frac: 0, updated_at: 5000 }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO workspace.budget (id, start, end, tag_id, type, amount_int, amount_frac, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['blob:BB', 100, 200, 3, 'expense', 1000, 0, 5000]
      )
    })
  })

  describe('updated_at preservation in UPDATE', () => {
    it('passes updated_at when updating icons', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.icon')) return Promise.resolve({ updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.icons = [{ id: 1, value: 'star', updated_at: 5000 }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.icon SET value = ?, updated_at = ? WHERE id = ?',
        ['star', 5000, 1]
      )
    })

    it('passes updated_at when updating tags', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.tag')) return Promise.resolve({ name: 'old', updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.tags = [{ id: 2, name: 'food', updated_at: 5000, parents: [], children: [], icon: null }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.tag SET name = ?, updated_at = ? WHERE id = ?',
        ['food', 5000, 2]
      )
    })

    it('passes updated_at when updating wallets', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM workspace.wallet')) return Promise.resolve({ id: 1, updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.wallets = [{ id: 1, name: 'Cash', color: '#fff', updated_at: 5000, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE workspace.wallet SET name = ?, color = ?, updated_at = ? WHERE id = ?',
        ['Cash', '#fff', 5000, 1]
      )
    })

    it('passes updated_at when updating accounts', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM workspace.account')) return Promise.resolve({ id: 1, updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.accounts = [{ id: 1, wallet: 1, currency: 1, updated_at: 5000, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE workspace.account SET updated_at = ? WHERE id = ?',
        [5000, 1]
      )
    })

    it('passes updated_at when updating counterparties', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.counterparty')) return Promise.resolve({ id: 1, updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.counterparties = [{ id: 1, name: 'Bob', updated_at: 5000, note: null, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.counterparty SET name = ?, updated_at = ? WHERE id = ?',
        ['Bob', 5000, 1]
      )
    })

    it('passes updated_at when updating transactions', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM workspace.trx')) return Promise.resolve({ updated_at: 1000 })
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
        'UPDATE workspace.trx SET timestamp = ?, updated_at = ? WHERE id = ?',
        [2000, 5000, 'blob:AA']
      )
    })

    it('passes updated_at when updating budgets', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM workspace.budget')) return Promise.resolve({ updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.budgets = [{ id: 'BB', start: 100, end: 200, tag: 3, amount_int: 1000, amount_frac: 0, updated_at: 5000 }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE workspace.budget SET start = ?, end = ?, tag_id = ?, type = ?, amount_int = ?, amount_frac = ?, updated_at = ? WHERE hex(id) = ?',
        [100, 200, 3, 'expense', 1000, 0, 5000, 'BB']
      )
    })
  })

  describe('currency import', () => {
    it('syncs currency_to_tags when remote is newer', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.currency')) return Promise.resolve({ id: 5, updated_at: 1000 })
        if (sql.includes('FROM shared.exchange_rate')) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [4], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM shared.currency_to_tags WHERE currency_id = ?',
        [5]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO shared.currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [5, 4]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.currency SET updated_at = ? WHERE id = ?',
        [5000, 5]
      )
    })

    it('imports exchange rate when local has none', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.currency')) return Promise.resolve({ id: 5, updated_at: 1000 })
        if (sql.includes('FROM shared.exchange_rate')) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [], rate_int: 0, rate_frac: 920000000000000000 }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO shared.exchange_rate (currency_id, rate_int, rate_frac) VALUES (?, ?, ?)',
        [5, 0, 920000000000000000]
      )
    })

    it('skips exchange rate when local already has one', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.currency')) return Promise.resolve({ id: 5, updated_at: 1000 })
        if (sql.includes('FROM shared.exchange_rate')) return Promise.resolve({ rate_int: 1 })
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

    it('syncs currency_to_tags even when local currency is newer (updated_at guard removed)', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        // Local currency has a NEWER timestamp than sender
        if (sql.includes('FROM shared.currency')) return Promise.resolve({ id: 5, updated_at: 9000 })
        if (sql.includes('FROM shared.exchange_rate')) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [2, 4], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM shared.currency_to_tags WHERE currency_id = ?',
        [5]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO shared.currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [5, 2]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO shared.currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [5, 4]
      )
    })

    it('does not update currency updated_at when sender timestamp is older', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        // Local currency has a NEWER timestamp
        if (sql.includes('FROM shared.currency')) return Promise.resolve({ id: 5, updated_at: 9000 })
        if (sql.includes('FROM shared.exchange_rate')) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [2], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      const updateCalls = mockExecSQL.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).startsWith('UPDATE shared.currency')
      )
      expect(updateCalls).toHaveLength(0)
    })

    it('writes payment default tag (tag_id=2) even when local currency is newer', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        // Local currency has a NEWER timestamp (e.g. freshly seeded device B)
        if (sql.includes('FROM shared.currency')) return Promise.resolve({ id: 5, updated_at: 9000 })
        if (sql.includes('FROM shared.exchange_rate')) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      // Sender has payment default tag (tag_id=2) on this currency
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [2], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO shared.currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [5, 2]
      )
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

  describe('currency code conflict resolution', () => {
    it('skips reconciliation for legacy packages without a code field', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.currency')) return Promise.resolve({ id: 5, updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockQueryOne).not.toHaveBeenCalledWith('SELECT id FROM shared.currency WHERE code = ?', expect.anything())
    })

    it('remaps FK references and renames the local orphan row to the incoming id', async () => {
      // Local has EUR seeded at id=2 (this device's migration order). Sender's package
      // has EUR at id=3 (a different seed order), with no incoming entry claiming id=2.
      mockQueryOne.mockImplementation((sql: string, params: unknown[]) => {
        if (sql === 'SELECT id FROM shared.currency WHERE id = ?') {
          if (params[0] === 2) return Promise.resolve({ id: 2 })
          return Promise.resolve(null)
        }
        if (sql === 'SELECT id FROM shared.currency WHERE code = ?') {
          if (params[0] === 'EUR') return Promise.resolve({ id: 2 })
          return Promise.resolve(null)
        }
        if (sql === 'SELECT id, updated_at FROM shared.currency WHERE id = ?') {
          if (params[0] === 3) return Promise.resolve({ id: 3, updated_at: 4000 })
          return Promise.resolve(null)
        }
        if (sql.includes('FROM shared.exchange_rate')) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 3, code: 'EUR', decimal_places: 2, updated_at: 5000, tags: [4], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.currency_to_tags SET currency_id = ? WHERE currency_id = ?', [3, 2]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.exchange_rate SET currency_id = ? WHERE currency_id = ?', [3, 2]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE workspace.account SET currency_id = ? WHERE currency_id = ?', [3, 2]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.currency SET id = ? WHERE id = ?', [3, 2]
      )
    })

    it('does nothing when the incoming id already exists locally', async () => {
      mockQueryOne.mockImplementation((sql: string, params: unknown[]) => {
        if (sql === 'SELECT id FROM shared.currency WHERE id = ?') {
          if (params[0] === 5) return Promise.resolve({ id: 5 })
          return Promise.resolve(null)
        }
        if (sql === 'SELECT id, updated_at FROM shared.currency WHERE id = ?') {
          return Promise.resolve({ id: 5, updated_at: 1000 })
        }
        if (sql.includes('FROM shared.exchange_rate')) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, code: 'USD', decimal_places: 2, updated_at: 5000, tags: [], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockQueryOne).not.toHaveBeenCalledWith('SELECT id FROM shared.currency WHERE code = ?', expect.anything())
    })

    it('does nothing when the code is unknown locally (currency not pre-seeded)', async () => {
      mockQueryOne.mockImplementation((sql: string, params: unknown[]) => {
        if (sql === 'SELECT id FROM shared.currency WHERE id = ?') return Promise.resolve(null)
        if (sql === 'SELECT id FROM shared.currency WHERE code = ?') return Promise.resolve(null)
        if (sql === 'SELECT id, updated_at FROM shared.currency WHERE id = ?') return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 99, code: 'XYZ', decimal_places: 2, updated_at: 5000, tags: [], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      const idRenameCalls = mockExecSQL.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).startsWith('UPDATE shared.currency SET id')
      )
      expect(idRenameCalls).toHaveLength(0)
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
        if (sql.includes('FROM workspace.account')) return Promise.resolve({ id: 1, updated_at: 1000 })
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
        if (sql.includes('FROM shared.icon')) return Promise.resolve({ updated_at: 9000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.icons = [{ id: 1, value: 'star', updated_at: 5000 }]

      await importSyncPackage(pkg)

      const updateCalls = mockExecSQL.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).startsWith('UPDATE shared.icon')
      )
      expect(updateCalls).toHaveLength(0)
    })
  })

  describe('tag name conflict resolution', () => {
    it('force-renames conflicting local IDs and inserts incoming tags (v16 migration scenario)', async () => {
      // Child has Tips=24, add-on=25 from v16 migration (fresh timestamps = very new).
      // Parent package has: Dividends=24 (old), Education=25 (old), Tips=44 (newer), add-on=56 (newer).
      // LWW alone would refuse to rename 24 and 25 (migration ts > parent ts),
      // leaving 'Tips' and 'add-on' taken → INSERT for 44 and 56 would fail.
      const MIGRATION_TS = 9999
      const PARENT_TS = 500

      mockQueryOne.mockImplementation((sql: string, params: unknown[]) => {
        if (sql === 'SELECT id FROM shared.tag WHERE id = ?') {
          const id = params[0]
          if (id === 24 || id === 25) return Promise.resolve({ id })
          return Promise.resolve(null)
        }
        if (sql === 'SELECT id FROM shared.tag WHERE name = ?') {
          const name = params[0]
          if (name === 'Tips') return Promise.resolve({ id: 24 })
          if (name === 'add-on') return Promise.resolve({ id: 25 })
          return Promise.resolve(null)
        }
        if (sql.includes('SELECT name, updated_at FROM shared.tag WHERE id = ?')) {
          const id = params[0]
          if (id === 24) return Promise.resolve({ name: 'Tips', updated_at: MIGRATION_TS })
          if (id === 25) return Promise.resolve({ name: 'add-on', updated_at: MIGRATION_TS })
          return Promise.resolve(null)
        }
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.tags = [
        { id: 24, name: 'Dividends', updated_at: PARENT_TS, parents: [], children: [], icon: null },
        { id: 25, name: 'Education', updated_at: PARENT_TS, parents: [], children: [], icon: null },
        { id: 44, name: 'Tips', updated_at: PARENT_TS + 100, parents: [], children: [], icon: null },
        { id: 56, name: 'add-on', updated_at: PARENT_TS + 100, parents: [], children: [], icon: null },
      ]

      const result = await importSyncPackage(pkg)

      // Pre-flight must force-rename the conflicting migration tags
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.tag SET name = ?, updated_at = ? WHERE id = ?',
        ['Dividends', PARENT_TS, 24]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.tag SET name = ?, updated_at = ? WHERE id = ?',
        ['Education', PARENT_TS, 25]
      )

      // Freed names must now be inserted under the parent's canonical IDs
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO shared.tag (id, name, updated_at) VALUES (?, ?, ?)',
        [44, 'Tips', PARENT_TS + 100]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO shared.tag (id, name, updated_at) VALUES (?, ?, ?)',
        [56, 'add-on', PARENT_TS + 100]
      )

      expect(result.errors).toHaveLength(0)
    })

    it('remaps all FK references when the conflicting local ID is absent from the package', async () => {
      // Child has Tips=24 from migration; parent package only has Tips=44 (no id=24 at all).
      // Pre-flight should remap 24→44 across all reference tables then delete id=24.
      mockQueryOne.mockImplementation((sql: string, params: unknown[]) => {
        if (sql === 'SELECT id FROM shared.tag WHERE id = ?') {
          if (params[0] === 24) return Promise.resolve({ id: 24 })
          return Promise.resolve(null)
        }
        if (sql === 'SELECT id FROM shared.tag WHERE name = ?') {
          if (params[0] === 'Tips') return Promise.resolve({ id: 24 })
          return Promise.resolve(null)
        }
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.tags = [
        { id: 44, name: 'Tips', updated_at: 600, parents: [], children: [], icon: null },
      ]

      const result = await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE workspace.trx_base SET tag_id = ? WHERE tag_id = ?', [44, 24]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE workspace.budget SET tag_id = ? WHERE tag_id = ?', [44, 24]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM shared.tag WHERE id = ?', [24]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO shared.tag (id, name, updated_at) VALUES (?, ?, ?)',
        [44, 'Tips', 600]
      )
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('counterparty name conflict resolution', () => {
    it('force-renames conflicting local IDs and inserts incoming counterparties', async () => {
      const MIGRATION_TS = 9999
      const PARENT_TS = 500

      mockQueryOne.mockImplementation((sql: string, params: unknown[]) => {
        if (sql === 'SELECT id FROM shared.counterparty WHERE id = ?') {
          const id = params[0]
          if (id === 10) return Promise.resolve({ id })
          return Promise.resolve(null)
        }
        if (sql === 'SELECT id FROM shared.counterparty WHERE name = ?') {
          const name = params[0]
          if (name === 'Landlord') return Promise.resolve({ id: 10 })
          return Promise.resolve(null)
        }
        if (sql === 'SELECT id, updated_at FROM shared.counterparty WHERE id = ?') {
          const id = params[0]
          if (id === 10) return Promise.resolve({ id: 10, updated_at: MIGRATION_TS })
          return Promise.resolve(null)
        }
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.counterparties = [
        { id: 10, name: 'Grocer', updated_at: PARENT_TS, note: null, tags: [] },
        { id: 30, name: 'Landlord', updated_at: PARENT_TS + 100, note: null, tags: [] },
      ]

      const result = await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.counterparty SET name = ?, updated_at = ? WHERE id = ?',
        ['Grocer', PARENT_TS, 10]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO shared.counterparty (id, name, updated_at) VALUES (?, ?, ?)',
        [30, 'Landlord', PARENT_TS + 100]
      )
      expect(result.errors).toHaveLength(0)
    })

    it('remaps all FK references when the conflicting local ID is absent from the package', async () => {
      mockQueryOne.mockImplementation((sql: string, params: unknown[]) => {
        if (sql === 'SELECT id FROM shared.counterparty WHERE id = ?') {
          if (params[0] === 10) return Promise.resolve({ id: 10 })
          return Promise.resolve(null)
        }
        if (sql === 'SELECT id FROM shared.counterparty WHERE name = ?') {
          if (params[0] === 'Landlord') return Promise.resolve({ id: 10 })
          return Promise.resolve(null)
        }
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.counterparties = [
        { id: 30, name: 'Landlord', updated_at: 600, note: null, tags: [] },
      ]

      const result = await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.counterparty_note SET counterparty_id = ? WHERE counterparty_id = ?', [30, 10]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.counterparty_to_tags SET counterparty_id = ? WHERE counterparty_id = ?', [30, 10]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE shared.counterparty_sort_order SET counterparty_id = ? WHERE counterparty_id = ?', [30, 10]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE workspace.trx_to_counterparty SET counterparty_id = ? WHERE counterparty_id = ?', [30, 10]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM shared.counterparty WHERE id = ?', [10]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO shared.counterparty (id, name, updated_at) VALUES (?, ?, ?)',
        [30, 'Landlord', 600]
      )
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('command processing', () => {
    const OWN_ID = 'own-device-id'
    const OTHER_ID = 'other-device-id'
    const INITIATOR_ID = 'initiator-device-id'
    const INITIATOR_PUB_KEY = 'initiator-public-key-base64'

    beforeEach(() => {
      mockSettingsGet.mockResolvedValue(null)
      mockSettingsSet.mockResolvedValue(undefined)
      mockSettingsDelete.mockResolvedValue(undefined)
      mockLinkedDeviceFindById.mockResolvedValue(null)
      mockLinkedDeviceRemove.mockResolvedValue(undefined)
    })

    it('does nothing when commands array is absent', async () => {
      const pkg = emptyPackage()
      await importSyncPackage(pkg)
      expect(mockSettingsSet).not.toHaveBeenCalled()
    })

    it('does nothing when commands array is empty', async () => {
      const pkg = { ...emptyPackage(), commands: [] }
      await importSyncPackage(pkg)
      expect(mockSettingsSet).not.toHaveBeenCalled()
    })

    it('skips commands when data import has errors', async () => {
      mockExecSQL.mockRejectedValueOnce(new Error('db error'))
      const pkg = {
        ...emptyPackage(),
        commands: [{ type: 'unlink_device' as const, target_installation_id: OTHER_ID, keep_data: true, initiator_id: INITIATOR_ID }],
      }
      await importSyncPackage(pkg)
      expect(mockSettingsSet).not.toHaveBeenCalled()
    })

    describe('unlink_device command', () => {
      it('sets pending_self_unlink when this device is the target', async () => {
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'installation_id') return Promise.resolve(JSON.stringify({ id: OWN_ID, jwt: 'token' }))
          return Promise.resolve(null)
        })
        mockLinkedDeviceFindById.mockImplementation((id: string) =>
          Promise.resolve(id === INITIATOR_ID ? { id, name: 'x', public_key: INITIATOR_PUB_KEY, linked_at: 0, workspace_scope: null } : null)
        )

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_device' as const, target_installation_id: OWN_ID, keep_data: false, initiator_id: INITIATOR_ID }],
        }
        await importSyncPackage(pkg)

        expect(mockSettingsSet).toHaveBeenCalledWith(
          'pending_self_unlink',
          JSON.stringify({ initiator_id: INITIATOR_ID, keep_data: false, initiator_pub_key: INITIATOR_PUB_KEY })
        )
      })

      it('sets keep_data=true correctly in pending_self_unlink', async () => {
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'installation_id') return Promise.resolve(JSON.stringify({ id: OWN_ID }))
          return Promise.resolve(null)
        })
        mockLinkedDeviceFindById.mockImplementation((id: string) =>
          Promise.resolve(id === INITIATOR_ID ? { id, name: 'x', public_key: INITIATOR_PUB_KEY, linked_at: 0, workspace_scope: null } : null)
        )

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_device' as const, target_installation_id: OWN_ID, keep_data: true, initiator_id: INITIATOR_ID }],
        }
        await importSyncPackage(pkg)

        const setCall = mockSettingsSet.mock.calls.find((c: unknown[]) => c[0] === 'pending_self_unlink')
        const parsed = JSON.parse(setCall![1] as string)
        expect(parsed.keep_data).toBe(true)
      })

      it('removes target from linked_device when target is another device', async () => {
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'installation_id') return Promise.resolve(JSON.stringify({ id: OWN_ID }))
          return Promise.resolve(null)
        })
        mockLinkedDeviceFindById.mockResolvedValue({ id: OTHER_ID, name: 'x', public_key: 'other-pub-key', linked_at: 0, workspace_scope: null })

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_device' as const, target_installation_id: OTHER_ID, keep_data: true, initiator_id: OWN_ID }],
        }
        await importSyncPackage(pkg)

        expect(mockLinkedDeviceRemove).toHaveBeenCalledWith(OTHER_ID)
      })

      it('does nothing when target is not a known linked device', async () => {
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'installation_id') return Promise.resolve(JSON.stringify({ id: OWN_ID }))
          return Promise.resolve(null)
        })
        mockLinkedDeviceFindById.mockResolvedValue(null)

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_device' as const, target_installation_id: OTHER_ID, keep_data: true, initiator_id: OWN_ID }],
        }
        await importSyncPackage(pkg)

        expect(mockLinkedDeviceRemove).not.toHaveBeenCalled()
        expect(mockSettingsSet).not.toHaveBeenCalled()
      })

      it('returns early when own installation_id is not found', async () => {
        mockSettingsGet.mockResolvedValue(null)

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_device' as const, target_installation_id: OWN_ID, keep_data: true, initiator_id: INITIATOR_ID }],
        }
        await importSyncPackage(pkg)

        expect(mockSettingsSet).not.toHaveBeenCalled()
      })

      it('uses empty string for initiator_pub_key when initiator is not a known linked device', async () => {
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'installation_id') return Promise.resolve(JSON.stringify({ id: OWN_ID }))
          return Promise.resolve(null)
        })
        mockLinkedDeviceFindById.mockResolvedValue(null)

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_device' as const, target_installation_id: OWN_ID, keep_data: false, initiator_id: INITIATOR_ID }],
        }
        await importSyncPackage(pkg)

        const setCall = mockSettingsSet.mock.calls.find((c: unknown[]) => c[0] === 'pending_self_unlink')
        const parsed = JSON.parse(setCall![1] as string)
        expect(parsed.initiator_pub_key).toBe('')
      })
    })

    describe('unlink_confirm command', () => {
      it('removes target from linked_device', async () => {
        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_confirm' as const, target_installation_id: OTHER_ID }],
        }
        await importSyncPackage(pkg)

        expect(mockLinkedDeviceRemove).toHaveBeenCalledWith(OTHER_ID)
      })

      it('deletes pending_unlink_requests when only one request remains', async () => {
        const pending = [{ target_id: OTHER_ID, started_at: 0, keep_data: true }]
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'pending_unlink_requests') return Promise.resolve(JSON.stringify(pending))
          return Promise.resolve(null)
        })

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_confirm' as const, target_installation_id: OTHER_ID }],
        }
        await importSyncPackage(pkg)

        expect(mockSettingsDelete).toHaveBeenCalledWith('pending_unlink_requests')
      })

      it('filters pending_unlink_requests when multiple requests exist', async () => {
        const pending = [
          { target_id: OTHER_ID, started_at: 0, keep_data: true },
          { target_id: 'another-device', started_at: 1, keep_data: false },
        ]
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'pending_unlink_requests') return Promise.resolve(JSON.stringify(pending))
          return Promise.resolve(null)
        })

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_confirm' as const, target_installation_id: OTHER_ID }],
        }
        await importSyncPackage(pkg)

        expect(mockSettingsSet).toHaveBeenCalledWith(
          'pending_unlink_requests',
          JSON.stringify([{ target_id: 'another-device', started_at: 1, keep_data: false }])
        )
        expect(mockSettingsDelete).not.toHaveBeenCalled()
      })

      it('does not throw when the target device is unknown', async () => {
        mockSettingsGet.mockResolvedValue(null)

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_confirm' as const, target_installation_id: OTHER_ID }],
        }
        await expect(importSyncPackage(pkg)).resolves.not.toThrow()
      })
    })

    it('continues processing other commands after one fails', async () => {
      // First command fails due to JSON parse error in installation_id
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return Promise.resolve('not-json')
        return Promise.resolve(null)
      })

      const pkg = {
        ...emptyPackage(),
        commands: [
          { type: 'unlink_device' as const, target_installation_id: OWN_ID, keep_data: true, initiator_id: INITIATOR_ID },
          { type: 'unlink_confirm' as const, target_installation_id: OTHER_ID },
        ],
      }
      const result = await importSyncPackage(pkg)

      // No errors thrown overall (command errors are caught internally)
      expect(result.errors).toHaveLength(0)
      // unlink_confirm for OTHER_ID still ran
      expect(mockLinkedDeviceRemove).toHaveBeenCalledWith(OTHER_ID)
    })
  })
})
