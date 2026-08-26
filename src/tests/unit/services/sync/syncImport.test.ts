import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecSQL = vi.fn()
const mockExecBatch = vi.fn()
const mockQueryOne = vi.fn()
const mockQuerySQL = vi.fn()

vi.mock('../../../../services/database/connection', () => ({
  execSQL: (...args: unknown[]) => mockExecSQL(...args),
  execBatch: (...args: unknown[]) => mockExecBatch(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  querySQL: (...args: unknown[]) => mockQuerySQL(...args),
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
const mockLinkedDeviceRename = vi.fn()

vi.mock('../../../../services/repositories/linkedDeviceRepository', () => ({
  linkedDeviceRepository: {
    findById: (...args: unknown[]) => mockLinkedDeviceFindById(...args),
    remove: (...args: unknown[]) => mockLinkedDeviceRemove(...args),
    rename: (...args: unknown[]) => mockLinkedDeviceRename(...args),
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
    mockExecBatch.mockResolvedValue(undefined)
    mockQueryOne.mockResolvedValue(null)
    mockQuerySQL.mockResolvedValue([])
  })

  it('reports unknown import error for non-Error thrown values', async () => {
    mockExecBatch.mockImplementation((statements: { sql: string }[]) => {
      if (statements.some(s => s.sql.includes('INSERT INTO shared.icon'))) return Promise.reject('boom')
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

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'INSERT INTO shared.icon (id, value, updated_at) VALUES (?, ?, ?)', bind: [1, 'star', 5000] },
      ])
    })

    it('passes updated_at when inserting tags', async () => {
      const pkg = emptyPackage()
      pkg.tags = [{ id: 2, name: 'food', updated_at: 5000, parents: [], children: [], icon: null }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'INSERT INTO shared.tag (id, name, updated_at) VALUES (?, ?, ?)', bind: [2, 'food', 5000] },
      ])
    })

    it('passes updated_at when inserting wallets', async () => {
      const pkg = emptyPackage()
      pkg.wallets = [{ id: 1, name: 'Cash', color: '#fff', updated_at: 5000, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'INSERT INTO workspace.wallet (id, name, color, updated_at) VALUES (?, ?, ?, ?)', bind: [1, 'Cash', '#fff', 5000] },
      ])
    })

    it('passes updated_at when inserting accounts', async () => {
      const pkg = emptyPackage()
      pkg.accounts = [{ id: 1, wallet: 1, currency: 1, updated_at: 5000, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'INSERT INTO workspace.account (id, wallet_id, currency_id, updated_at) VALUES (?, ?, ?, ?)', bind: [1, 1, 1, 5000] },
      ])
    })

    it('passes updated_at when inserting counterparties', async () => {
      const pkg = emptyPackage()
      pkg.counterparties = [{ id: 1, name: 'Bob', updated_at: 5000, note: null, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'INSERT INTO shared.counterparty (id, name, updated_at) VALUES (?, ?, ?)', bind: [1, 'Bob', 5000] },
      ])
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

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'INSERT INTO workspace.trx (id, timestamp, updated_at) VALUES (?, ?, ?)', bind: ['blob:AA', 1000, 5000] },
      ])
    })

    it('passes updated_at when inserting budgets', async () => {
      const pkg = emptyPackage()
      pkg.budgets = [{ id: 'BB', start: 100, end: 200, tag: 3, amount_int: 1000, amount_frac: 0, updated_at: 5000 }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'INSERT INTO workspace.budget (id, start, end, tag_id, type, amount_int, amount_frac, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', bind: ['blob:BB', 100, 200, 3, 'expense', 1000, 0, 5000] },
      ])
    })
  })

  describe('updated_at preservation in UPDATE', () => {
    it('passes updated_at when updating icons', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.icon')) return Promise.resolve([{ id: 1, updated_at: 1000 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.icons = [{ id: 1, value: 'star', updated_at: 5000 }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'UPDATE shared.icon SET value = ?, updated_at = ? WHERE id = ?', bind: ['star', 5000, 1] },
      ])
    })

    it('passes updated_at when updating tags', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.tag')) return Promise.resolve([{ id: 2, updated_at: 1000 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.tags = [{ id: 2, name: 'food', updated_at: 5000, parents: [], children: [], icon: null }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'UPDATE shared.tag SET name = ?, updated_at = ? WHERE id = ?', bind: ['food', 5000, 2] },
      ])
    })

    it('passes updated_at when updating wallets', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('FROM workspace.wallet')) return Promise.resolve([{ id: 1, updated_at: 1000 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.wallets = [{ id: 1, name: 'Cash', color: '#fff', updated_at: 5000, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'UPDATE workspace.wallet SET name = ?, color = ?, updated_at = ? WHERE id = ?', bind: ['Cash', '#fff', 5000, 1] },
      ])
    })

    it('passes updated_at when updating accounts', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('FROM workspace.account')) return Promise.resolve([{ id: 1, updated_at: 1000 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.accounts = [{ id: 1, wallet: 1, currency: 1, updated_at: 5000, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'UPDATE workspace.account SET updated_at = ? WHERE id = ?', bind: [5000, 1] },
      ])
    })

    it('passes updated_at when updating counterparties', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.counterparty')) return Promise.resolve([{ id: 1, updated_at: 1000 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.counterparties = [{ id: 1, name: 'Bob', updated_at: 5000, note: null, tags: [] }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'UPDATE shared.counterparty SET name = ?, updated_at = ? WHERE id = ?', bind: ['Bob', 5000, 1] },
      ])
    })

    it('passes updated_at when updating transactions', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('FROM workspace.trx')) return Promise.resolve([{ id: 'AA', updated_at: 1000 }])
        return Promise.resolve([])
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

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'UPDATE workspace.trx SET timestamp = ?, updated_at = ? WHERE id = ?', bind: [2000, 5000, 'blob:AA'] },
      ])
    })

    it('passes updated_at when updating budgets', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('FROM workspace.budget')) return Promise.resolve([{ id: 'BB', updated_at: 1000 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.budgets = [{ id: 'BB', start: 100, end: 200, tag: 3, amount_int: 1000, amount_frac: 0, updated_at: 5000 }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'UPDATE workspace.budget SET start = ?, end = ?, tag_id = ?, type = ?, amount_int = ?, amount_frac = ?, updated_at = ? WHERE hex(id) = ?', bind: [100, 200, 3, 'expense', 1000, 0, 5000, 'BB'] },
      ])
    })
  })

  describe('currency import', () => {
    it('syncs currency_to_tags when remote is newer', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.currency')) return Promise.resolve([{ id: 5, updated_at: 1000 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [4], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'UPDATE shared.currency SET updated_at = ? WHERE id = ?', bind: [5000, 5] },
      ])
      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'DELETE FROM shared.currency_to_tags WHERE currency_id = ?', bind: [5] },
        { sql: 'INSERT OR IGNORE INTO shared.currency_to_tags (currency_id, tag_id) VALUES (?, ?)', bind: [5, 4] },
      ])
    })

    it('imports exchange rate when local has none', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.currency')) return Promise.resolve([{ id: 5, updated_at: 1000 }])
        if (sql.includes('FROM shared.exchange_rate')) return Promise.resolve([])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [], rate_int: 0, rate_frac: 920000000000000000 }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'INSERT INTO shared.exchange_rate (currency_id, rate_int, rate_frac) VALUES (?, ?, ?)', bind: [5, 0, 920000000000000000] },
      ])
    })

    it('skips exchange rate when local already has one', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.currency')) return Promise.resolve([{ id: 5, updated_at: 1000 }])
        if (sql.includes('FROM shared.exchange_rate')) return Promise.resolve([{ currency_id: 5 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [], rate_int: 0, rate_frac: 920000000000000000 }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).not.toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ sql: expect.stringContaining('exchange_rate') }),
      ]))
    })

    it('syncs currency_to_tags even when local currency is newer (updated_at guard removed)', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        // Local currency has a NEWER timestamp than sender
        if (sql.includes('FROM shared.currency')) return Promise.resolve([{ id: 5, updated_at: 9000 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [2, 4], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'DELETE FROM shared.currency_to_tags WHERE currency_id = ?', bind: [5] },
        { sql: 'INSERT OR IGNORE INTO shared.currency_to_tags (currency_id, tag_id) VALUES (?, ?)', bind: [5, 2] },
        { sql: 'INSERT OR IGNORE INTO shared.currency_to_tags (currency_id, tag_id) VALUES (?, ?)', bind: [5, 4] },
      ])
    })

    it('does not update currency updated_at when sender timestamp is older', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        // Local currency has a NEWER timestamp
        if (sql.includes('FROM shared.currency')) return Promise.resolve([{ id: 5, updated_at: 9000 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [2], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).not.toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ sql: expect.stringContaining('UPDATE shared.currency ') }),
      ]))
    })

    it('writes payment default tag (tag_id=2) even when local currency is newer', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        // Local currency has a NEWER timestamp (e.g. freshly seeded device B)
        if (sql.includes('FROM shared.currency')) return Promise.resolve([{ id: 5, updated_at: 9000 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      // Sender has payment default tag (tag_id=2) on this currency
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [2], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'INSERT OR IGNORE INTO shared.currency_to_tags (currency_id, tag_id) VALUES (?, ?)', bind: [5, 2] },
      ]))
    })

    it('skips unknown currencies (not pre-seeded)', async () => {
      // querySQL returns [] for unknown currency (default from beforeEach)
      const pkg = emptyPackage()
      pkg.currencies = [{ id: 999, decimal_places: 2, updated_at: 5000, tags: [4], rate_int: 0, rate_frac: 500000000000000000 }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).not.toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ sql: expect.stringContaining('currency') }),
      ]))
    })
  })

  describe('currency code conflict resolution', () => {
    it('skips reconciliation for legacy packages without a code field', async () => {
      mockQuerySQL.mockResolvedValue([]) // id=5 not found locally
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.currency')) return Promise.resolve({ id: 5, updated_at: 1000 })
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      // No code-based detection read issued — the codeless item never becomes a candidate.
      expect(mockQuerySQL).not.toHaveBeenCalledWith(expect.stringContaining('WHERE code IN'), expect.anything())
      expect(mockExecBatch).not.toHaveBeenCalled()
    })

    it('remaps FK references and renames the local orphan row to the incoming id', async () => {
      // Local has EUR seeded at id=2 (this device's migration order). Sender's package
      // has EUR at id=3 (a different seed order), with no incoming entry claiming id=2.
      mockQuerySQL.mockImplementation((sql: string, params: unknown[]) => {
        if (sql.includes('WHERE id IN')) return Promise.resolve([]) // id=3 not local yet
        if (sql.includes('WHERE code IN')) {
          if ((params as string[]).includes('EUR')) return Promise.resolve([{ id: 2, code: 'EUR' }])
          return Promise.resolve([])
        }
        return Promise.resolve([])
      })
      mockQueryOne.mockImplementation((sql: string, params: unknown[]) => {
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

      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'UPDATE shared.currency_to_tags SET currency_id = ? WHERE currency_id = ?', bind: [3, 2] },
        { sql: 'UPDATE shared.exchange_rate SET currency_id = ? WHERE currency_id = ?', bind: [3, 2] },
        { sql: 'UPDATE workspace.account SET currency_id = ? WHERE currency_id = ?', bind: [3, 2] },
        { sql: 'UPDATE shared.currency SET id = ? WHERE id = ?', bind: [3, 2] },
      ])
    })

    it('does nothing when the incoming id already exists locally', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        // The batch-upsert engine's own detection read (distinct from the conflict-resolution
        // pre-flight's plain existence check below) — local is newer, so no row write.
        if (sql.includes('updated_at FROM shared.currency WHERE id IN')) return Promise.resolve([{ id: 5, updated_at: 9000 }])
        if (sql.includes('WHERE id IN')) return Promise.resolve([{ id: 5 }]) // id already exists locally
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, code: 'USD', decimal_places: 2, updated_at: 5000, tags: [], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      // No code-based detection read issued, and no remap batch — id=5 was skipped entirely
      // by the conflict-resolution pre-flight (it already exists locally under its own id).
      expect(mockQuerySQL).not.toHaveBeenCalledWith(expect.stringContaining('WHERE code IN'), expect.anything())
      expect(mockExecBatch).not.toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ sql: expect.stringContaining('UPDATE shared.currency ') }),
      ]))
    })

    it('does nothing when the code is unknown locally (currency not pre-seeded)', async () => {
      mockQuerySQL.mockResolvedValue([]) // neither id nor code found locally
      mockQueryOne.mockImplementation((sql: string) => {
        if (sql === 'SELECT id, updated_at FROM shared.currency WHERE id = ?') return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 99, code: 'XYZ', decimal_places: 2, updated_at: 5000, tags: [], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).not.toHaveBeenCalled()
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
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('FROM workspace.account')) return Promise.resolve([{ id: 1, updated_at: 1000 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.accounts = [{ id: 1, wallet: 1, currency: 5, updated_at: 5000, tags: [] }]

      const result = await importSyncPackage(pkg)

      expect(result.newAccountCurrencyIds).toEqual([])
    })
  })

  describe('shared counter recompute', () => {
    it('recomputes shared counters exactly once, after all other imports, for an empty package', async () => {
      await importSyncPackage(emptyPackage())

      const recomputeCalls = mockExecSQL.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).includes('UPDATE shared.tag_sort_order')
      )
      expect(recomputeCalls).toHaveLength(1)

      const recomputeIndex = mockExecSQL.mock.calls.findIndex(
        (c: unknown[]) => (c[0] as string).includes('UPDATE shared.tag_sort_order')
      )
      const commitIndex = mockExecSQL.mock.calls.findIndex((c: unknown[]) => c[0] === 'COMMIT')
      expect(recomputeIndex).toBeGreaterThan(-1)
      expect(commitIndex).toBeGreaterThan(recomputeIndex)
    })

    it('recomputes shared counters exactly once when the package has transactions, budgets, wallets, and accounts', async () => {
      const pkg = emptyPackage()
      pkg.wallets = [{ id: 1, name: 'Wallet', color: null, updated_at: 1000, tags: [] }]
      pkg.accounts = [{ id: 1, wallet: 1, currency: 1, updated_at: 1000, tags: [], note: null, due_date: null, rate: null }]
      pkg.budgets = [{ id: 'aa', start: 0, end: 100, tag: 5, tag_context: null, type: 'expense', amount_int: 10, amount_frac: 0, updated_at: 1000 }]
      pkg.transactions = [{
        id: 'bb', timestamp: 1000, updated_at: 1000, counterparty: null, note: null,
        lines: [{ id: 'cc', account: 1, tag: 5, tag_context: null, sign: '-', amount_int: 10, amount_frac: 0, rate_int: 0, rate_frac: 0 }],
      }]

      await importSyncPackage(pkg)

      const recomputeCalls = mockExecSQL.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).includes('UPDATE shared.tag_sort_order')
      )
      expect(recomputeCalls).toHaveLength(1)
    })

    it('does not recompute when the import fails and rolls back', async () => {
      mockExecBatch.mockImplementation((statements: { sql: string }[]) => {
        if (statements.some(s => s.sql.includes('INSERT INTO shared.icon'))) return Promise.reject(new Error('boom'))
        return Promise.resolve(undefined)
      })

      const pkg = emptyPackage()
      pkg.icons = [{ id: 1, value: 'star', updated_at: 5000 }]

      await importSyncPackage(pkg)

      const recomputeCalls = mockExecSQL.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).includes('UPDATE shared.tag_sort_order')
      )
      expect(recomputeCalls).toHaveLength(0)
    })
  })

  describe('skip when local is newer', () => {
    it('does not update icon when local updated_at is newer', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('FROM shared.icon')) return Promise.resolve([{ id: 1, updated_at: 9000 }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.icons = [{ id: 1, value: 'star', updated_at: 5000 }]

      await importSyncPackage(pkg)

      expect(mockExecBatch).not.toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ sql: expect.stringContaining('UPDATE shared.icon') }),
      ]))
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

      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('WHERE name IN')) {
          return Promise.resolve([{ id: 24, name: 'Tips' }, { id: 25, name: 'add-on' }])
        }
        return Promise.resolve([])
      })
      mockQueryOne.mockImplementation((sql: string, params: unknown[]) => {
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

      // Pre-flight must force-rename the conflicting migration tags (batched into one call)
      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'UPDATE shared.tag SET name = ?, updated_at = ? WHERE id = ?', bind: ['Dividends', PARENT_TS, 24] },
      ]))
      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'UPDATE shared.tag SET name = ?, updated_at = ? WHERE id = ?', bind: ['Education', PARENT_TS, 25] },
      ]))

      // Freed names must now be inserted under the parent's canonical IDs
      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'INSERT INTO shared.tag (id, name, updated_at) VALUES (?, ?, ?)', bind: [44, 'Tips', PARENT_TS + 100] },
        { sql: 'INSERT INTO shared.tag (id, name, updated_at) VALUES (?, ?, ?)', bind: [56, 'add-on', PARENT_TS + 100] },
      ]))

      expect(result.errors).toHaveLength(0)
    })

    it('remaps all FK references when the conflicting local ID is absent from the package', async () => {
      // Child has Tips=24 from migration; parent package only has Tips=44 (no id=24 at all).
      // Pre-flight should remap 24→44 across all reference tables then delete id=24.
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('WHERE name IN')) return Promise.resolve([{ id: 24, name: 'Tips' }])
        if (sql.includes('WHERE id IN')) return Promise.resolve([]) // shared.tag existence check for newId=44
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.tags = [
        { id: 44, name: 'Tips', updated_at: 600, parents: [], children: [], icon: null },
      ]

      const result = await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'UPDATE workspace.trx_base SET tag_id = ? WHERE tag_id = ?', bind: [44, 24] },
        { sql: 'UPDATE workspace.budget SET tag_id = ? WHERE tag_id = ?', bind: [44, 24] },
        { sql: 'DELETE FROM shared.tag WHERE id = ?', bind: [24] },
      ]))
      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'INSERT INTO shared.tag (id, name, updated_at) VALUES (?, ?, ?)', bind: [44, 'Tips', 600] },
      ])
      expect(result.errors).toHaveLength(0)
    })

    it('resolves a rename cycle where both colliding IDs already exist locally (regression: previously skipped whenever the incoming tag\'s own ID already had a local row)', async () => {
      // Local: id=10 named 'Groceries', id=20 named 'Bills' (both pre-exist, e.g. two
      // independently-evolved real installs). Parent wants a straight swap: 10->Bills,
      // 20->Groceries. The old pre-flight bailed out via `if (localById) continue` for
      // BOTH of these (since 10 and 20 already exist locally), skipping conflict
      // detection entirely and leaving the plain UPDATE in the main loop to hit
      // `UNIQUE constraint failed: tag.name`.
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('WHERE name IN')) {
          return Promise.resolve([{ id: 10, name: 'Groceries' }, { id: 20, name: 'Bills' }])
        }
        return Promise.resolve([])
      })
      mockQueryOne.mockImplementation((sql: string, params: unknown[]) => {
        if (sql.includes('SELECT name, updated_at FROM shared.tag WHERE id = ?')) {
          const id = params[0]
          if (id === 10) return Promise.resolve({ name: 'Bills', updated_at: 200 })
          if (id === 20) return Promise.resolve({ name: 'Groceries', updated_at: 200 })
          return Promise.resolve(null)
        }
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.tags = [
        { id: 10, name: 'Bills', updated_at: 100, parents: [], children: [], icon: null },
        { id: 20, name: 'Groceries', updated_at: 100, parents: [], children: [], icon: null },
      ]

      const result = await importSyncPackage(pkg)

      // Pre-flight resolves the swap via force-rename on the OTHER side of each pair —
      // no INSERT is needed since both ids already exist locally.
      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'UPDATE shared.tag SET name = ?, updated_at = ? WHERE id = ?', bind: ['Groceries', 100, 20] },
      ]))
      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'UPDATE shared.tag SET name = ?, updated_at = ? WHERE id = ?', bind: ['Bills', 100, 10] },
      ]))
      expect(result.errors).toHaveLength(0)
    })

    it('merges an orphaned local tag into an incoming ID that already has its own local row', async () => {
      // Local: id=5 named 'Orphan' (not in the incoming package at all), id=10 named
      // 'WillBeRenamed' (already exists locally, e.g. structural tag seeded by
      // migrations). Incoming: {id:10, name:'Orphan'}. The old resolveTagIdConflict
      // did a bare `UPDATE tag_sort_order SET tag_id=10 WHERE tag_id=5`, which throws
      // `UNIQUE constraint failed: tag_sort_order.tag_id` since id=10 already has its
      // own tag_sort_order row (same shape for counterparty_to_tags/currency_to_tags).
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('WHERE name IN')) return Promise.resolve([{ id: 5, name: 'Orphan' }])
        if (sql.includes('WHERE id IN')) return Promise.resolve([{ id: 10 }]) // newId=10 already exists locally
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.tags = [
        { id: 10, name: 'Orphan', updated_at: 600, parents: [], children: [], icon: null },
      ]

      const result = await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'UPDATE OR IGNORE shared.tag_sort_order SET tag_id = ? WHERE tag_id = ?', bind: [10, 5] },
        { sql: 'DELETE FROM shared.tag_sort_order WHERE tag_id = ?', bind: [5] },
        { sql: 'UPDATE OR IGNORE shared.counterparty_to_tags SET tag_id = ? WHERE tag_id = ?', bind: [10, 5] },
        { sql: 'DELETE FROM shared.counterparty_to_tags WHERE tag_id = ?', bind: [5] },
        { sql: 'UPDATE OR IGNORE shared.currency_to_tags SET tag_id = ? WHERE tag_id = ?', bind: [10, 5] },
        { sql: 'DELETE FROM shared.currency_to_tags WHERE tag_id = ?', bind: [5] },
        { sql: 'DELETE FROM shared.tag WHERE id = ?', bind: [5] },
      ]))
      expect(result.errors).toHaveLength(0)
    })

    it('does not pre-move tag_sort_order when merging into an incoming ID that has no local tag row yet', async () => {
      // Local: id=5 named 'Orphan' only — id=10 (the incoming id) doesn't exist locally at
      // all yet. The main import loop creates it later via a plain INSERT, which fires
      // trg_tag_sort_order_new_tag and auto-creates a tag_sort_order row for it. If the
      // merge had already moved id=5's row onto id=10, that auto-insert would collide with
      // it (`UNIQUE constraint failed: tag_sort_order.tag_id`).
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('WHERE name IN')) return Promise.resolve([{ id: 5, name: 'Orphan' }])
        if (sql.includes('WHERE id IN')) return Promise.resolve([]) // id=10 does not exist locally yet
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.tags = [
        { id: 10, name: 'Orphan', updated_at: 600, parents: [], children: [], icon: null },
      ]

      const result = await importSyncPackage(pkg)

      const mergeCall = mockExecBatch.mock.calls.find((c: unknown[]) =>
        (c[0] as { sql: string }[]).some(s => s.sql.includes('DELETE FROM shared.tag WHERE id'))
      )
      expect(mergeCall![0]).not.toEqual(
        expect.arrayContaining([{ sql: 'UPDATE OR IGNORE shared.tag_sort_order SET tag_id = ? WHERE tag_id = ?', bind: [10, 5] }])
      )
      expect(mergeCall![0]).toEqual(expect.arrayContaining([
        { sql: 'DELETE FROM shared.tag_sort_order WHERE tag_id = ?', bind: [5] },
        { sql: 'DELETE FROM shared.tag WHERE id = ?', bind: [5] },
      ]))
      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'INSERT INTO shared.tag (id, name, updated_at) VALUES (?, ?, ?)', bind: [10, 'Orphan', 600] },
      ])
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('counterparty name conflict resolution', () => {
    it('force-renames conflicting local IDs and inserts incoming counterparties', async () => {
      const PARENT_TS = 500

      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('WHERE name IN')) return Promise.resolve([{ id: 10, name: 'Landlord' }])
        // Reflects real SQLite: by the time batchUpsert's own detection read runs, the
        // pre-flight rename phase has already committed id=10's row as {name:'Grocer',
        // updated_at:PARENT_TS} — exactly matching incoming item 10's own values.
        if (sql.includes('WHERE id IN')) return Promise.resolve([{ id: 10, updated_at: PARENT_TS }])
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.counterparties = [
        { id: 10, name: 'Grocer', updated_at: PARENT_TS, note: null, tags: [] },
        { id: 30, name: 'Landlord', updated_at: PARENT_TS + 100, note: null, tags: [] },
      ]

      const result = await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'UPDATE shared.counterparty SET name = ?, updated_at = ? WHERE id = ?', bind: ['Grocer', PARENT_TS, 10] },
      ]))
      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'INSERT INTO shared.counterparty (id, name, updated_at) VALUES (?, ?, ?)', bind: [30, 'Landlord', PARENT_TS + 100] },
      ])
      expect(result.errors).toHaveLength(0)
    })

    it('remaps all FK references when the conflicting local ID is absent from the package, and the target ID has no local row yet', async () => {
      // newId=30 doesn't exist locally yet (the main import loop creates it via a plain
      // INSERT later), so counterparty_sort_order must NOT be pre-moved onto it — that
      // INSERT's trg_counterparty_sort_order_new_counterparty auto-creates a fresh row for
      // 30, which would collide with a pre-moved one (see the analogous tag_sort_order case).
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('WHERE name IN')) return Promise.resolve([{ id: 10, name: 'Landlord' }])
        if (sql.includes('WHERE id IN')) return Promise.resolve([]) // id=30 does not exist locally yet
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.counterparties = [
        { id: 30, name: 'Landlord', updated_at: 600, note: null, tags: [] },
      ]

      const result = await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'UPDATE shared.counterparty_note SET counterparty_id = ? WHERE counterparty_id = ?', bind: [30, 10] },
        { sql: 'UPDATE OR IGNORE shared.counterparty_to_tags SET counterparty_id = ? WHERE counterparty_id = ?', bind: [30, 10] },
        { sql: 'DELETE FROM shared.counterparty_to_tags WHERE counterparty_id = ?', bind: [10] },
        { sql: 'DELETE FROM shared.counterparty_sort_order WHERE counterparty_id = ?', bind: [10] },
        { sql: 'UPDATE workspace.trx_to_counterparty SET counterparty_id = ? WHERE counterparty_id = ?', bind: [30, 10] },
        { sql: 'DELETE FROM shared.counterparty WHERE id = ?', bind: [10] },
      ]))
      const mergeCall = mockExecBatch.mock.calls.find((c: unknown[]) =>
        (c[0] as { sql: string }[]).some(s => s.sql.includes('DELETE FROM shared.counterparty WHERE id'))
      )
      expect(mergeCall![0]).not.toEqual(
        expect.arrayContaining([{ sql: 'UPDATE OR IGNORE shared.counterparty_sort_order SET counterparty_id = ? WHERE counterparty_id = ?', bind: [30, 10] }])
      )
      expect(mockExecBatch).toHaveBeenCalledWith([
        { sql: 'INSERT INTO shared.counterparty (id, name, updated_at) VALUES (?, ?, ?)', bind: [30, 'Landlord', 600] },
      ])
      expect(result.errors).toHaveLength(0)
    })

    it('pre-moves counterparty_sort_order when merging into a target ID that already has its own local row', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('WHERE name IN')) return Promise.resolve([{ id: 10, name: 'Landlord' }])
        if (sql.includes('WHERE id IN')) return Promise.resolve([{ id: 30 }]) // newId already exists locally
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.counterparties = [
        { id: 30, name: 'Landlord', updated_at: 600, note: null, tags: [] },
      ]

      const result = await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'UPDATE OR IGNORE shared.counterparty_sort_order SET counterparty_id = ? WHERE counterparty_id = ?', bind: [30, 10] },
        { sql: 'DELETE FROM shared.counterparty_sort_order WHERE counterparty_id = ?', bind: [10] },
      ]))
      expect(result.errors).toHaveLength(0)
    })

    it('resolves a rename cycle where both colliding IDs already exist locally', async () => {
      mockQuerySQL.mockImplementation((sql: string) => {
        if (sql.includes('WHERE name IN')) {
          return Promise.resolve([{ id: 20, name: 'Landlord' }, { id: 10, name: 'Grocer' }])
        }
        return Promise.resolve([])
      })

      const pkg = emptyPackage()
      pkg.counterparties = [
        { id: 10, name: 'Landlord', updated_at: 100, note: null, tags: [] },
        { id: 20, name: 'Grocer', updated_at: 100, note: null, tags: [] },
      ]

      const result = await importSyncPackage(pkg)

      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'UPDATE shared.counterparty SET name = ?, updated_at = ? WHERE id = ?', bind: ['Grocer', 100, 20] },
      ]))
      expect(mockExecBatch).toHaveBeenCalledWith(expect.arrayContaining([
        { sql: 'UPDATE shared.counterparty SET name = ?, updated_at = ? WHERE id = ?', bind: ['Landlord', 100, 10] },
      ]))
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
      mockLinkedDeviceRename.mockResolvedValue(undefined)
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

    describe('rename_device command', () => {
      it('updates local device_name when target is self', async () => {
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'installation_id') return Promise.resolve(JSON.stringify({ id: OWN_ID, jwt: 'token' }))
          return Promise.resolve(null)
        })

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'rename_device' as const, target_installation_id: OWN_ID, name: 'New Self Name' }],
        }
        await importSyncPackage(pkg)

        expect(mockSettingsSet).toHaveBeenCalledWith('device_name', 'New Self Name')
        expect(mockLinkedDeviceRename).not.toHaveBeenCalled()
      })

      it('renames the peer in linked_device when target is not self', async () => {
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'installation_id') return Promise.resolve(JSON.stringify({ id: OWN_ID }))
          return Promise.resolve(null)
        })

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'rename_device' as const, target_installation_id: OTHER_ID, name: 'New Peer Name' }],
        }
        await importSyncPackage(pkg)

        expect(mockLinkedDeviceRename).toHaveBeenCalledWith(OTHER_ID, 'New Peer Name')
        expect(mockSettingsSet).not.toHaveBeenCalledWith('device_name', expect.anything())
      })

      it('returns early when own installation_id is not found', async () => {
        mockSettingsGet.mockResolvedValue(null)

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'rename_device' as const, target_installation_id: OWN_ID, name: 'New Name' }],
        }
        await importSyncPackage(pkg)

        expect(mockSettingsSet).not.toHaveBeenCalled()
        expect(mockLinkedDeviceRename).not.toHaveBeenCalled()
      })
    })

    it('continues processing other commands after one fails', async () => {
      // First command no-ops: own id ('not-json', treated as an already-split plain id)
      // doesn't match OWN_ID as target, and the peer lookup for it returns null
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
