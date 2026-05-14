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
      if (sql.includes('INSERT INTO icon')) return Promise.reject('boom')
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
        'INSERT INTO budget (id, start, end, tag_id, type, amount_int, amount_frac, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['blob:BB', 100, 200, 3, 'expense', 1000, 0, 5000]
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
        'UPDATE budget SET start = ?, end = ?, tag_id = ?, type = ?, amount_int = ?, amount_frac = ?, updated_at = ? WHERE hex(id) = ?',
        [100, 200, 3, 'expense', 1000, 0, 5000, 'BB']
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

    it('syncs currency_to_tags even when local currency is newer (updated_at guard removed)', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        // Local currency has a NEWER timestamp than sender
        if (sql.includes('FROM currency')) return Promise.resolve({ id: 5, updated_at: 9000 })
        if (sql.includes('FROM exchange_rate')) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [2, 4], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM currency_to_tags WHERE currency_id = ?',
        [5]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [5, 2]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
        [5, 4]
      )
    })

    it('does not update currency updated_at when sender timestamp is older', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        // Local currency has a NEWER timestamp
        if (sql.includes('FROM currency')) return Promise.resolve({ id: 5, updated_at: 9000 })
        if (sql.includes('FROM exchange_rate')) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [2], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      const updateCalls = mockExecSQL.mock.calls.filter(
        (c: unknown[]) => (c[0] as string).startsWith('UPDATE currency')
      )
      expect(updateCalls).toHaveLength(0)
    })

    it('writes payment default tag (tag_id=2) even when local currency is newer', async () => {
      mockQueryOne.mockImplementation((sql: string) => {
        // Local currency has a NEWER timestamp (e.g. freshly seeded device B)
        if (sql.includes('FROM currency')) return Promise.resolve({ id: 5, updated_at: 9000 })
        if (sql.includes('FROM exchange_rate')) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const pkg = emptyPackage()
      // Sender has payment default tag (tag_id=2) on this currency
      pkg.currencies = [{ id: 5, decimal_places: 2, updated_at: 5000, tags: [2], rate_int: null, rate_frac: null }]

      await importSyncPackage(pkg)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)',
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

  describe('tag name conflict resolution', () => {
    it('force-renames conflicting local IDs and inserts incoming tags (v16 migration scenario)', async () => {
      // Child has Tips=24, add-on=25 from v16 migration (fresh timestamps = very new).
      // Parent package has: Dividends=24 (old), Education=25 (old), Tips=44 (newer), add-on=56 (newer).
      // LWW alone would refuse to rename 24 and 25 (migration ts > parent ts),
      // leaving 'Tips' and 'add-on' taken → INSERT for 44 and 56 would fail.
      const MIGRATION_TS = 9999
      const PARENT_TS = 500

      mockQueryOne.mockImplementation((sql: string, params: unknown[]) => {
        if (sql === 'SELECT id FROM tag WHERE id = ?') {
          const id = params[0]
          if (id === 24 || id === 25) return Promise.resolve({ id })
          return Promise.resolve(null)
        }
        if (sql === 'SELECT id FROM tag WHERE name = ?') {
          const name = params[0]
          if (name === 'Tips') return Promise.resolve({ id: 24 })
          if (name === 'add-on') return Promise.resolve({ id: 25 })
          return Promise.resolve(null)
        }
        if (sql.includes('SELECT name, updated_at FROM tag WHERE id = ?')) {
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
        'UPDATE tag SET name = ?, updated_at = ? WHERE id = ?',
        ['Dividends', PARENT_TS, 24]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE tag SET name = ?, updated_at = ? WHERE id = ?',
        ['Education', PARENT_TS, 25]
      )

      // Freed names must now be inserted under the parent's canonical IDs
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO tag (id, name, updated_at) VALUES (?, ?, ?)',
        [44, 'Tips', PARENT_TS + 100]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO tag (id, name, updated_at) VALUES (?, ?, ?)',
        [56, 'add-on', PARENT_TS + 100]
      )

      expect(result.errors).toHaveLength(0)
    })

    it('remaps all FK references when the conflicting local ID is absent from the package', async () => {
      // Child has Tips=24 from migration; parent package only has Tips=44 (no id=24 at all).
      // Pre-flight should remap 24→44 across all reference tables then delete id=24.
      mockQueryOne.mockImplementation((sql: string, params: unknown[]) => {
        if (sql === 'SELECT id FROM tag WHERE id = ?') {
          if (params[0] === 24) return Promise.resolve({ id: 24 })
          return Promise.resolve(null)
        }
        if (sql === 'SELECT id FROM tag WHERE name = ?') {
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
        'UPDATE trx_base SET tag_id = ? WHERE tag_id = ?', [44, 24]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE budget SET tag_id = ? WHERE tag_id = ?', [44, 24]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM tag WHERE id = ?', [24]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO tag (id, name, updated_at) VALUES (?, ?, ?)',
        [44, 'Tips', 600]
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
          if (key === 'linked_installations') return Promise.resolve(JSON.stringify({ [INITIATOR_ID]: INITIATOR_PUB_KEY }))
          return Promise.resolve(null)
        })

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
          if (key === 'linked_installations') return Promise.resolve(JSON.stringify({ [INITIATOR_ID]: INITIATOR_PUB_KEY }))
          return Promise.resolve(null)
        })

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_device' as const, target_installation_id: OWN_ID, keep_data: true, initiator_id: INITIATOR_ID }],
        }
        await importSyncPackage(pkg)

        const setCall = mockSettingsSet.mock.calls.find((c: unknown[]) => c[0] === 'pending_self_unlink')
        const parsed = JSON.parse(setCall![1] as string)
        expect(parsed.keep_data).toBe(true)
      })

      it('removes target from linked_installations when target is another device', async () => {
        const linked = { [OTHER_ID]: 'other-pub-key', 'third-device': 'third-pub-key' }
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'installation_id') return Promise.resolve(JSON.stringify({ id: OWN_ID }))
          if (key === 'linked_installations') return Promise.resolve(JSON.stringify(linked))
          return Promise.resolve(null)
        })

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_device' as const, target_installation_id: OTHER_ID, keep_data: true, initiator_id: OWN_ID }],
        }
        await importSyncPackage(pkg)

        expect(mockSettingsSet).toHaveBeenCalledWith(
          'linked_installations',
          JSON.stringify({ 'third-device': 'third-pub-key' })
        )
      })

      it('does nothing to linked_installations when target is not present', async () => {
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'installation_id') return Promise.resolve(JSON.stringify({ id: OWN_ID }))
          if (key === 'linked_installations') return Promise.resolve(JSON.stringify({ 'third-device': 'third-pub-key' }))
          return Promise.resolve(null)
        })

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_device' as const, target_installation_id: OTHER_ID, keep_data: true, initiator_id: OWN_ID }],
        }
        await importSyncPackage(pkg)

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

      it('uses empty string for initiator_pub_key when initiator not in linked_installations', async () => {
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'installation_id') return Promise.resolve(JSON.stringify({ id: OWN_ID }))
          if (key === 'linked_installations') return Promise.resolve(JSON.stringify({}))
          return Promise.resolve(null)
        })

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
      it('removes target from linked_installations', async () => {
        const linked = { [OTHER_ID]: 'other-pub-key', 'third-device': 'third-pub-key' }
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'linked_installations') return Promise.resolve(JSON.stringify(linked))
          return Promise.resolve(null)
        })

        const pkg = {
          ...emptyPackage(),
          commands: [{ type: 'unlink_confirm' as const, target_installation_id: OTHER_ID }],
        }
        await importSyncPackage(pkg)

        expect(mockSettingsSet).toHaveBeenCalledWith(
          'linked_installations',
          JSON.stringify({ 'third-device': 'third-pub-key' })
        )
      })

      it('deletes pending_unlink_requests when only one request remains', async () => {
        const pending = [{ target_id: OTHER_ID, started_at: 0, keep_data: true }]
        mockSettingsGet.mockImplementation((key: string) => {
          if (key === 'linked_installations') return Promise.resolve(JSON.stringify({ [OTHER_ID]: 'pub-key' }))
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
          if (key === 'linked_installations') return Promise.resolve(JSON.stringify({ [OTHER_ID]: 'pub-key' }))
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

      it('does not throw when linked_installations is null', async () => {
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
        if (key === 'linked_installations') return Promise.resolve(JSON.stringify({ [OTHER_ID]: 'pub-key' }))
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
      expect(mockSettingsSet).toHaveBeenCalledWith(
        'linked_installations',
        JSON.stringify({})
      )
    })
  })
})
