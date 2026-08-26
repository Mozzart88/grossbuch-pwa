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

vi.mock('../../../../services/repositories/settingsRepository', () => ({
  settingsRepository: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}))

vi.mock('../../../../services/repositories/linkedDeviceRepository', () => ({
  linkedDeviceRepository: { findById: vi.fn(), remove: vi.fn(), rename: vi.fn() },
}))

const { importSyncPackage } = await import('../../../../services/sync/syncImport')

function hexId(i: number): string {
  return i.toString(16).padStart(16, '0')
}

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
    notifications: [],
    recurringPlans: [],
    recurringOccurrences: [],
    recurringBudgets: [],
    goals: [],
    deletions: [],
  }
}

describe('syncImport round-trip verification (sync-import-entity-performance)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockExecBatch.mockResolvedValue(undefined)
    mockQueryOne.mockResolvedValue(null)
    mockQuerySQL.mockResolvedValue([]) // every incoming item is "new" (not local) by default
  })

  describe('detection round-trips do not scale with incoming item count', () => {
    const cases: { name: string; build: (n: number) => Partial<ReturnType<typeof emptyPackage>> }[] = [
      { name: 'icons', build: (n) => ({ icons: Array.from({ length: n }, (_, i) => ({ id: i + 1, value: `v${i}`, updated_at: 100 })) }) },
      { name: 'tags', build: (n) => ({ tags: Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `tag${i}`, updated_at: 100, parents: [], children: [], icon: null })) }) },
      { name: 'wallets', build: (n) => ({ wallets: Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `w${i}`, color: null, updated_at: 100, tags: [] })) }) },
      { name: 'accounts', build: (n) => ({ accounts: Array.from({ length: n }, (_, i) => ({ id: i + 1, wallet: 1, currency: 1, updated_at: 100, tags: [] })) }) },
      { name: 'counterparties', build: (n) => ({ counterparties: Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `cp${i}`, updated_at: 100, note: null, tags: [] })) }) },
      { name: 'currencies', build: (n) => ({ currencies: Array.from({ length: n }, (_, i) => ({ id: i + 1, decimal_places: 2, updated_at: 100, tags: [], rate_int: null, rate_frac: null })) }) },
      { name: 'budgets', build: (n) => ({ budgets: Array.from({ length: n }, (_, i) => ({ id: hexId(i), start: 0, end: 100, tag: 1, amount_int: 0, amount_frac: 0, updated_at: 100 })) }) },
      { name: 'notifications', build: (n) => ({ notifications: Array.from({ length: n }, (_, i) => ({ id: hexId(i), type: 't', status: 's', timestamp: 100, readed_at: null, updated_at: 100, payload: '{}' })) }) },
      { name: 'recurringPlans', build: (n) => ({ recurringPlans: Array.from({ length: n }, (_, i) => ({ id: hexId(i), schedule: '{}', transaction_draft: '{}', mode: 'expense', start_date: '2024-01-01', next_due_date: null, until_policy: '{}', occurrence_count: 0, status: 'active', created_at: 100, updated_at: 100 })) }) },
      { name: 'recurringOccurrences', build: (n) => ({ recurringOccurrences: Array.from({ length: n }, (_, i) => ({ id: hexId(i), plan_id: hexId(0), due_date: '2024-01-01', notification_id: null, created_at: 100, updated_at: 100 })) }) },
      { name: 'recurringBudgets', build: (n) => ({ recurringBudgets: Array.from({ length: n }, (_, i) => ({ budget_id: hexId(i), plan_id: hexId(0), due_month: '2024-01', updated_at: 100 })) }) },
      { name: 'goals', build: (n) => ({ goals: Array.from({ length: n }, (_, i) => ({ id: hexId(i), name: `g${i}`, target_int: 0, target_frac: 0, due_date: null, wallet: 1, updated_at: 100, tags: [], note: null })) }) },
    ]

    it.each(cases)('$name: querySQL call count is the same for a small and a large incoming batch', async ({ build }) => {
      mockQuerySQL.mockClear()
      await importSyncPackage({ ...emptyPackage(), ...build(2) } as never)
      const smallCallCount = mockQuerySQL.mock.calls.length

      mockQuerySQL.mockClear()
      await importSyncPackage({ ...emptyPackage(), ...build(50) } as never)
      const largeCallCount = mockQuerySQL.mock.calls.length

      expect(largeCallCount).toBe(smallCallCount)
    })
  })

  describe('write phase is bounded per phase, not per item', () => {
    it('wallets: many inserts with relation tags issue a small bounded number of execBatch calls', async () => {
      const wallets = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `w${i}`, color: null, updated_at: 100, tags: [1, 2] }))

      await importSyncPackage({ ...emptyPackage(), wallets } as never)

      // 1 row-write batch (all 50 inserts) + 1 relation-write batch (wallet_to_tags across all 50).
      expect(mockExecBatch).toHaveBeenCalledTimes(2)
    })

    it('counterparties: many inserts with ungated relations issue a small bounded number of execBatch calls', async () => {
      const counterparties = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `cp${i}`, updated_at: 100, note: 'a note', tags: [1, 2] }))

      await importSyncPackage({ ...emptyPackage(), counterparties } as never)

      // 1 row-write batch + 1 counterparty_note batch + 1 counterparty_to_tags batch.
      expect(mockExecBatch.mock.calls.length).toBeLessThanOrEqual(3)
    })
  })

  it('transactions: a full chunk of new transactions issues a small bounded number of round-trips', async () => {
    const transactions = Array.from({ length: 50 }, (_, i) => ({
      id: hexId(i),
      timestamp: 100,
      updated_at: 100,
      counterparty: 1,
      note: 'a note',
      lines: [
        { id: hexId(1000 + i * 2), account: 1, tag: 1, tag_context: 2, sign: '-' as const, amount_int: 10, amount_frac: 0, rate_int: 0, rate_frac: 0 },
        { id: hexId(1000 + i * 2 + 1), account: 1, tag: 1, tag_context: null, sign: '-' as const, amount_int: 20, amount_frac: 0, rate_int: 0, rate_frac: 0 },
      ],
    }))

    await importSyncPackage({ ...emptyPackage(), transactions } as never)

    // 1 detection read (querySQL), plus row/line/relation write batches (execBatch) — none of
    // these should scale with the 50-transaction/100-line count.
    expect(mockQuerySQL.mock.calls.length).toBeLessThanOrEqual(2)
    expect(mockExecBatch.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('deletions: round-trips scale with the number of distinct entity types present, not the number of deletions', async () => {
    mockQuerySQL.mockImplementation((sql: string) => {
      // Every deletion's target "exists locally" with an old updated_at, so every one applies.
      if (sql.includes('WHERE id IN') || sql.includes('WHERE hex(id) IN')) {
        return Promise.resolve([])
      }
      return Promise.resolve([])
    })

    const deletions = [
      ...Array.from({ length: 10 }, (_, i) => ({ entity: 'tag', entity_id: String(i + 1), deleted_at: 9999 })),
      ...Array.from({ length: 10 }, (_, i) => ({ entity: 'wallet', entity_id: String(i + 1), deleted_at: 9999 })),
      ...Array.from({ length: 10 }, (_, i) => ({ entity: 'counterparty', entity_id: String(i + 1), deleted_at: 9999 })),
      ...Array.from({ length: 10 }, (_, i) => ({ entity: 'trx', entity_id: hexId(i), deleted_at: 9999 })),
    ]

    mockQuerySQL.mockClear()
    await importSyncPackage({ ...emptyPackage(), deletions } as never)

    // 4 distinct entity types -> 4 detection reads, regardless of 40 total deletions.
    const deletionDetectionCalls = mockQuerySQL.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('WHERE id IN') || (c[0] as string).includes('WHERE hex(id) IN')
    )
    expect(deletionDetectionCalls.length).toBe(4)
  })
})
