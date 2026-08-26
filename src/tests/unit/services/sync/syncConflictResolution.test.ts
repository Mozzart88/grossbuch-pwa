import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuerySQL = vi.fn()

vi.mock('../../../../services/database/connection', () => ({
  querySQL: (...args: unknown[]) => mockQuerySQL(...args),
}))

import { resolveConflicts, type ConflictConfig } from '../../../../services/sync/syncConflictResolution'

// Mirrors the exact remaps/finalize tables transcribed in design.md Decision 2 from the
// pre-refactor resolveTagIdConflict / resolveCounterpartyIdConflict / resolveCurrencyIdConflict.
const tagConfig: ConflictConfig = {
  table: 'shared.tag',
  conflictColumn: 'name',
  skipIfIdExistsLocally: false,
  hasRenamePhase: true,
  remaps: [
    { mode: 'plain', table: 'shared.tag_to_tag', column: 'child_id' },
    { mode: 'plain', table: 'shared.tag_to_tag', column: 'parent_id' },
    { mode: 'plain', table: 'shared.tag_icon', column: 'tag_id' },
    { mode: 'conditional-sort-order', table: 'shared.tag_sort_order', column: 'tag_id', existsCheckTable: 'shared.tag' },
    { mode: 'or-ignore-then-delete-orphans', table: 'shared.counterparty_to_tags', column: 'tag_id' },
    { mode: 'or-ignore-then-delete-orphans', table: 'shared.currency_to_tags', column: 'tag_id' },
    { mode: 'plain', table: 'workspace.wallet_to_tags', column: 'tag_id' },
    { mode: 'plain', table: 'workspace.account_to_tags', column: 'tag_id' },
    { mode: 'plain', table: 'workspace.trx_base', column: 'tag_id' },
    { mode: 'plain', table: 'workspace.trx_base_tag_context', column: 'tag_id' },
    { mode: 'plain', table: 'workspace.budget', column: 'tag_id' },
    { mode: 'plain', table: 'workspace.budget_tag_context', column: 'tag_id' },
  ],
  finalize: 'delete-old-row',
}

const currencyConfig: ConflictConfig = {
  table: 'shared.currency',
  conflictColumn: 'code',
  skipIfIdExistsLocally: true,
  hasRenamePhase: false,
  remaps: [
    { mode: 'plain', table: 'shared.currency_to_tags', column: 'currency_id' },
    { mode: 'plain', table: 'shared.exchange_rate', column: 'currency_id' },
    { mode: 'plain', table: 'workspace.account', column: 'currency_id' },
  ],
  finalize: 'rename-id',
}

function fakeRunBatch() {
  const calls: { sql: string; bind?: unknown[] }[][] = []
  const runBatch = vi.fn(async (statements: { sql: string; bind?: unknown[] }[]) => {
    calls.push(statements)
  })
  return { runBatch, calls }
}

beforeEach(() => {
  mockQuerySQL.mockReset()
})

describe('resolveConflicts', () => {
  it('is a no-op when there are no incoming items', async () => {
    const { runBatch } = fakeRunBatch()
    await resolveConflicts(tagConfig, [], runBatch)
    expect(mockQuerySQL).not.toHaveBeenCalled()
    expect(runBatch).not.toHaveBeenCalled()
  })

  it('is a no-op when detection finds no conflicts', async () => {
    mockQuerySQL.mockResolvedValueOnce([]) // name IN (...) detection read
    const { runBatch } = fakeRunBatch()
    await resolveConflicts(tagConfig, [{ id: 1, name: 'Groceries', updated_at: 100 }], runBatch)
    expect(runBatch).not.toHaveBeenCalled()
  })

  it('merges an orphaned local id into an incoming id that already has its own local row (occupied target)', async () => {
    // Incoming tag id=5 "Rent"; local id=9 (orphaned, not in package) already holds "Rent".
    mockQuerySQL
      .mockResolvedValueOnce([{ id: 9, name: 'Rent' }]) // detection: name IN (...)
      .mockResolvedValueOnce([{ id: 5 }]) // conditional-sort-order existence check: shared.tag WHERE id IN (5)
    const { runBatch, calls } = fakeRunBatch()

    await resolveConflicts(tagConfig, [{ id: 5, name: 'Rent', updated_at: 200 }], runBatch)

    expect(runBatch).toHaveBeenCalledTimes(1) // merge only, no vacate/rename phase needed
    const mergeStatements = calls[0]
    // First remap (tag_to_tag child_id) uses [newId, oldId] = [5, 9]
    expect(mergeStatements[0]).toEqual({ sql: 'UPDATE shared.tag_to_tag SET child_id = ? WHERE child_id = ?', bind: [5, 9] })
    // conditional-sort-order: newId(5) exists in shared.tag -> UPDATE OR IGNORE then DELETE
    const sortOrderIdx = mergeStatements.findIndex(s => s.sql.includes('tag_sort_order') && s.sql.startsWith('UPDATE'))
    expect(sortOrderIdx).toBeGreaterThan(-1)
    expect(mergeStatements[sortOrderIdx]).toEqual({ sql: 'UPDATE OR IGNORE shared.tag_sort_order SET tag_id = ? WHERE tag_id = ?', bind: [5, 9] })
    expect(mergeStatements[sortOrderIdx + 1]).toEqual({ sql: 'DELETE FROM shared.tag_sort_order WHERE tag_id = ?', bind: [9] })
    // finalize: delete old row
    expect(mergeStatements[mergeStatements.length - 1]).toEqual({ sql: 'DELETE FROM shared.tag WHERE id = ?', bind: [9] })
  })

  it('does not pre-move tag_sort_order when merging into a target id with no local tag row yet', async () => {
    // Incoming tag id=5 "Rent"; local id=9 (orphaned) holds "Rent"; incoming id=5 has no local row yet.
    mockQuerySQL
      .mockResolvedValueOnce([{ id: 9, name: 'Rent' }]) // detection
      .mockResolvedValueOnce([]) // existence check: shared.tag WHERE id IN (5) -> not found
    const { runBatch, calls } = fakeRunBatch()

    await resolveConflicts(tagConfig, [{ id: 5, name: 'Rent', updated_at: 200 }], runBatch)

    const mergeStatements = calls[0]
    const sortOrderStatements = mergeStatements.filter(s => s.sql.includes('tag_sort_order'))
    // Only the DELETE cleanup, never the UPDATE OR IGNORE pre-move
    expect(sortOrderStatements).toEqual([{ sql: 'DELETE FROM shared.tag_sort_order WHERE tag_id = ?', bind: [9] }])
  })

  it('resolves a direct two-way rename swap without a transient name collision', async () => {
    // Local id=1 holds "Groceries", local id=2 holds "Rent". Incoming assigns id=1 "Rent" and id=2 "Groceries".
    mockQuerySQL.mockResolvedValueOnce([
      { id: 1, name: 'Groceries' },
      { id: 2, name: 'Rent' },
    ])
    const { runBatch, calls } = fakeRunBatch()

    await resolveConflicts(tagConfig, [
      { id: 1, name: 'Rent', updated_at: 100 },
      { id: 2, name: 'Groceries', updated_at: 200 },
    ], runBatch)

    expect(runBatch).toHaveBeenCalledTimes(2) // vacate, then rename (no merge)
    const [vacateStatements, renameStatements] = calls

    expect(vacateStatements).toHaveLength(2)
    for (const s of vacateStatements) {
      expect(s.sql).toBe('UPDATE shared.tag SET name = ? WHERE id = ?')
    }
    const vacatedIds = vacateStatements.map(s => s.bind?.[1])
    expect(new Set(vacatedIds)).toEqual(new Set([1, 2]))

    expect(renameStatements).toHaveLength(2)
    for (const s of renameStatements) {
      expect(s.sql).toBe('UPDATE shared.tag SET name = ?, updated_at = ? WHERE id = ?')
    }
    const renamed = new Map(renameStatements.map(s => [s.bind?.[2], s.bind?.[0]]))
    expect(renamed.get(1)).toBe('Rent')
    expect(renamed.get(2)).toBe('Groceries')
  })

  it('runs a merge deletion before the rename that needs the freed name (vacate -> merge -> rename order, same call)', async () => {
    // Incoming id=5 "OldNameOf28": local id=28 currently holds "OldNameOf28" -> id=28 must be
    // force-renamed to ITS OWN incoming target name, "Rent" (id=28 is itself an incoming id: tag A).
    // Incoming id=28 "Rent" (tag A): local id=12 (orphan, absent from the package) currently
    // holds "Rent" -> merged into 28. Id=28's rename (phase 3) writes "Rent" to id=28, which
    // would collide with orphan 12 still holding "Rent" unless 12's merge-delete (phase 2)
    // has already run.
    mockQuerySQL
      .mockResolvedValueOnce([
        { id: 28, name: 'OldNameOf28' },
        { id: 12, name: 'Rent' },
      ]) // detection: name IN (...)
      .mockResolvedValueOnce([{ id: 28 }]) // conditional-sort-order existence check: shared.tag WHERE id IN (28)
    const { runBatch, calls } = fakeRunBatch()

    await resolveConflicts(tagConfig, [
      { id: 5, name: 'OldNameOf28', updated_at: 100 },
      { id: 28, name: 'Rent', updated_at: 300 },
    ], runBatch)

    expect(runBatch).toHaveBeenCalledTimes(3) // vacate, merge, rename — in that call order
    const [vacateStatements, mergeStatements, renameStatements] = calls

    expect(vacateStatements).toEqual([{ sql: 'UPDATE shared.tag SET name = ? WHERE id = ?', bind: ['__sync_tmp__28', 28] }])
    expect(mergeStatements[mergeStatements.length - 1]).toEqual({ sql: 'DELETE FROM shared.tag WHERE id = ?', bind: [12] })
    expect(renameStatements).toEqual([{ sql: 'UPDATE shared.tag SET name = ?, updated_at = ? WHERE id = ?', bind: ['Rent', 300, 28] }])
  })

  it('for currency: skips ids that already exist locally, then batches a code-based detection read', async () => {
    mockQuerySQL
      .mockResolvedValueOnce([{ id: 3 }]) // SELECT id ... WHERE id IN (3, 4) -> id 3 already exists
      .mockResolvedValueOnce([{ id: 7, code: 'EUR' }]) // code detection for the remaining candidate (id=4)
    const { runBatch, calls } = fakeRunBatch()

    await resolveConflicts(currencyConfig, [
      { id: 3, code: 'USD', updated_at: 100 }, // already exists locally -> skipped
      { id: 4, code: 'EUR', updated_at: 100 }, // merges local orphan id=7 into id=4
    ], runBatch)

    expect(runBatch).toHaveBeenCalledTimes(1) // currency has no rename phase
    const statements = calls[0]
    expect(statements[0]).toEqual({ sql: 'UPDATE shared.currency_to_tags SET currency_id = ? WHERE currency_id = ?', bind: [4, 7] })
    expect(statements[statements.length - 1]).toEqual({ sql: 'UPDATE shared.currency SET id = ? WHERE id = ?', bind: [4, 7] })
  })

  it('for currency: skips items with no code (legacy packages predating code reconciliation)', async () => {
    mockQuerySQL.mockResolvedValueOnce([]) // SELECT id ... WHERE id IN (5) -> none exist locally
    const { runBatch } = fakeRunBatch()

    await resolveConflicts(currencyConfig, [{ id: 5, updated_at: 100 }], runBatch)

    expect(mockQuerySQL).toHaveBeenCalledTimes(1) // no second (code) query issued
    expect(runBatch).not.toHaveBeenCalled()
  })

  // Covers sync-import-performance's "Conflict detection uses a bounded number of
  // round-trips" requirement: the detection read count must not grow with package size.
  it('issues the same number of detection round-trips for a small and a large no-conflict package', async () => {
    mockQuerySQL.mockResolvedValue([]) // no local row matches any incoming name -> no conflicts
    const { runBatch: smallRunBatch } = fakeRunBatch()
    const smallPackage = Array.from({ length: 3 }, (_, i) => ({ id: i, name: `Tag ${i}`, updated_at: 100 }))
    await resolveConflicts(tagConfig, smallPackage, smallRunBatch)
    const callsForSmallPackage = mockQuerySQL.mock.calls.length

    mockQuerySQL.mockClear()
    mockQuerySQL.mockResolvedValue([])
    const { runBatch: largeRunBatch } = fakeRunBatch()
    const largePackage = Array.from({ length: 500 }, (_, i) => ({ id: i, name: `Tag ${i}`, updated_at: 100 }))
    await resolveConflicts(tagConfig, largePackage, largeRunBatch)
    const callsForLargePackage = mockQuerySQL.mock.calls.length

    expect(callsForSmallPackage).toBe(1)
    expect(callsForLargePackage).toBe(1)
    expect(smallRunBatch).not.toHaveBeenCalled()
    expect(largeRunBatch).not.toHaveBeenCalled()
  })

  // Covers sync-import-performance's "Conflict remap round-trips are bounded per phase"
  // requirement: several merges in one import still land in a single runBatch call.
  it('issues one runBatch call for the merge phase across several simultaneous tag merges', async () => {
    // Three unrelated orphans, each merging into a different incoming id.
    mockQuerySQL
      .mockResolvedValueOnce([
        { id: 101, name: 'Orphan A' },
        { id: 102, name: 'Orphan B' },
        { id: 103, name: 'Orphan C' },
      ]) // detection: name IN (...)
      .mockResolvedValueOnce([]) // conditional-sort-order existence check: none of the newIds exist yet
    const { runBatch, calls } = fakeRunBatch()

    await resolveConflicts(tagConfig, [
      { id: 1, name: 'Orphan A', updated_at: 100 },
      { id: 2, name: 'Orphan B', updated_at: 100 },
      { id: 3, name: 'Orphan C', updated_at: 100 },
    ], runBatch)

    expect(runBatch).toHaveBeenCalledTimes(1) // one call covering all three merges
    const deleteStatements = calls[0].filter(s => s.sql === 'DELETE FROM shared.tag WHERE id = ?')
    expect(deleteStatements.map(s => s.bind?.[0])).toEqual([101, 102, 103])
  })
})
