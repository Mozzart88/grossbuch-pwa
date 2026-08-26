import { describe, it, expect, vi } from 'vitest'
import { batchUpsert, isGatedByConflictConfig, type UpsertConfig, type RelationSync } from '../../../../services/sync/syncBatchUpsert'

vi.mock('../../../../utils/blobUtils', () => ({
  hexToBlob: (hex: string) => `blob:${hex}`,
}))

interface Item {
  id: number
  name: string
  updated_at: number
  tags: number[]
  note: string | null
}

function baseConfig(relations: RelationSync<Item>[] = []): UpsertConfig<Item> {
  return {
    table: 'shared.thing',
    idColumn: 'id',
    idIsBlob: false,
    getId: (i) => i.id,
    insert: (i) => ({ sql: 'INSERT INTO shared.thing (id, name, updated_at) VALUES (?, ?, ?)', bind: [i.id, i.name, i.updated_at] }),
    update: (i) => ({ sql: 'UPDATE shared.thing SET name = ?, updated_at = ? WHERE id = ?', bind: [i.name, i.updated_at, i.id] }),
    relations,
  }
}

function manyToMany(gated: boolean): RelationSync<Item> {
  return {
    mode: 'many-to-many',
    table: 'shared.thing_to_tags',
    ownColumn: 'thing_id',
    ownColumnIsBlob: false,
    otherColumn: 'tag_id',
    ownId: (i) => i.id,
    values: (i) => i.tags,
    gated,
  }
}

function optionalChildRow(gated: boolean): RelationSync<Item> {
  return {
    mode: 'optional-child-row',
    table: 'shared.thing_note',
    ownColumn: 'thing_id',
    ownColumnIsBlob: false,
    ownId: (i) => i.id,
    extraColumns: ['note'],
    row: (i) => i.note ? [i.note] : null,
    gated,
  }
}

describe('batchUpsert', () => {
  it('returns 0 and issues no calls for an empty incoming list', async () => {
    const runBatch = vi.fn()
    const queryRows = vi.fn()
    const { count } = await batchUpsert(baseConfig(), [], runBatch, queryRows)
    expect(count).toBe(0)
    expect(runBatch).not.toHaveBeenCalled()
    expect(queryRows).not.toHaveBeenCalled()
  })

  it('issues exactly one detection round-trip regardless of incoming item count', async () => {
    const queryRows = vi.fn().mockResolvedValue([])
    const runBatch = vi.fn().mockResolvedValue(undefined)
    const items: Item[] = Array.from({ length: 50 }, (_, i) => ({ id: i, name: `n${i}`, updated_at: 100, tags: [], note: null }))

    await batchUpsert(baseConfig(), items, runBatch, queryRows)

    expect(queryRows).toHaveBeenCalledTimes(1)
    expect(queryRows).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id IN'),
      items.map(i => i.id),
    )
  })

  it('batches all inserts and updates into a single runBatch call for the row-write phase', async () => {
    const queryRows = vi.fn().mockResolvedValue([{ id: 2, updated_at: 50 }])
    const runBatch = vi.fn().mockResolvedValue(undefined)
    const items: Item[] = [
      { id: 1, name: 'new', updated_at: 100, tags: [], note: null }, // insert
      { id: 2, name: 'updated', updated_at: 100, tags: [], note: null }, // update (100 > 50)
      { id: 3, name: 'ignored', updated_at: 100, tags: [], note: null }, // insert too (not local)
    ]
    // local has id=2 (stale) only; id=1,3 are new
    const localFor = (id: number) => (id === 2 ? { id: 2, updated_at: 50 } : undefined)
    queryRows.mockImplementation(async () => [{ id: 2, updated_at: 50 }])
    void localFor

    const { count } = await batchUpsert(baseConfig(), items, runBatch, queryRows)

    expect(count).toBe(3)
    expect(runBatch).toHaveBeenCalledTimes(1)
    const [rowBatch] = runBatch.mock.calls[0] as [{ sql: string; bind?: unknown[] }[]]
    expect(rowBatch).toHaveLength(3)
    expect(rowBatch).toEqual(expect.arrayContaining([
      { sql: 'INSERT INTO shared.thing (id, name, updated_at) VALUES (?, ?, ?)', bind: [1, 'new', 100] },
      { sql: 'UPDATE shared.thing SET name = ?, updated_at = ? WHERE id = ?', bind: ['updated', 100, 2] },
      { sql: 'INSERT INTO shared.thing (id, name, updated_at) VALUES (?, ?, ?)', bind: [3, 'ignored', 100] },
    ]))
  })

  it('does not write or count an item whose local updated_at is not older', async () => {
    const queryRows = vi.fn().mockResolvedValue([{ id: 1, updated_at: 9000 }])
    const runBatch = vi.fn().mockResolvedValue(undefined)
    const items: Item[] = [{ id: 1, name: 'stale', updated_at: 100, tags: [], note: null }]

    const { count } = await batchUpsert(baseConfig(), items, runBatch, queryRows)

    expect(count).toBe(0)
    expect(runBatch).not.toHaveBeenCalled()
  })

  describe('many-to-many relation mode', () => {
    it('gated: only resyncs the relation for items whose row was written', async () => {
      const queryRows = vi.fn().mockResolvedValue([{ id: 2, updated_at: 9000 }]) // id=2 is newer locally, skipped
      const runBatch = vi.fn().mockResolvedValue(undefined)
      const items: Item[] = [
        { id: 1, name: 'a', updated_at: 100, tags: [10, 20], note: null }, // inserted
        { id: 2, name: 'b', updated_at: 100, tags: [30], note: null }, // skipped (local newer)
      ]

      await batchUpsert(baseConfig([manyToMany(true)]), items, runBatch, queryRows)

      // Call 0: row writes (id=1 insert). Call 1: relation writes (id=1 only).
      expect(runBatch).toHaveBeenCalledTimes(2)
      const relationBatch = runBatch.mock.calls[1][0] as { sql: string; bind?: unknown[] }[]
      expect(relationBatch).toEqual([
        { sql: 'DELETE FROM shared.thing_to_tags WHERE thing_id = ?', bind: [1] },
        { sql: 'INSERT OR IGNORE INTO shared.thing_to_tags (thing_id, tag_id) VALUES (?, ?)', bind: [1, 10] },
        { sql: 'INSERT OR IGNORE INTO shared.thing_to_tags (thing_id, tag_id) VALUES (?, ?)', bind: [1, 20] },
      ])
    })

    it('ungated: resyncs the relation for every incoming item, including one whose row was skipped', async () => {
      const queryRows = vi.fn().mockResolvedValue([{ id: 2, updated_at: 9000 }])
      const runBatch = vi.fn().mockResolvedValue(undefined)
      const items: Item[] = [
        { id: 1, name: 'a', updated_at: 100, tags: [10], note: null },
        { id: 2, name: 'b', updated_at: 100, tags: [30], note: null }, // row skipped, relation still resynced
      ]

      await batchUpsert(baseConfig([manyToMany(false)]), items, runBatch, queryRows)

      expect(runBatch).toHaveBeenCalledTimes(2)
      const relationBatch = runBatch.mock.calls[1][0] as { sql: string; bind?: unknown[] }[]
      expect(relationBatch).toEqual(expect.arrayContaining([
        { sql: 'DELETE FROM shared.thing_to_tags WHERE thing_id = ?', bind: [1] },
        { sql: 'DELETE FROM shared.thing_to_tags WHERE thing_id = ?', bind: [2] },
        { sql: 'INSERT OR IGNORE INTO shared.thing_to_tags (thing_id, tag_id) VALUES (?, ?)', bind: [2, 30] },
      ]))
    })

    it('issues one runBatch call per relation table covering every eligible item, not one per item', async () => {
      const queryRows = vi.fn().mockResolvedValue([])
      const runBatch = vi.fn().mockResolvedValue(undefined)
      const items: Item[] = Array.from({ length: 25 }, (_, i) => ({ id: i, name: `n${i}`, updated_at: 100, tags: [1, 2], note: null }))

      await batchUpsert(baseConfig([manyToMany(true)]), items, runBatch, queryRows)

      // 1 call for row writes + 1 call for the many-to-many relation, regardless of item count.
      expect(runBatch).toHaveBeenCalledTimes(2)
    })
  })

  describe('optional-child-row relation mode', () => {
    it('inserts the child row only when row() returns non-null', async () => {
      const queryRows = vi.fn().mockResolvedValue([])
      const runBatch = vi.fn().mockResolvedValue(undefined)
      const items: Item[] = [
        { id: 1, name: 'a', updated_at: 100, tags: [], note: 'hello' },
        { id: 2, name: 'b', updated_at: 100, tags: [], note: null },
      ]

      await batchUpsert(baseConfig([optionalChildRow(true)]), items, runBatch, queryRows)

      const relationBatch = runBatch.mock.calls[1][0] as { sql: string; bind?: unknown[] }[]
      expect(relationBatch).toEqual([
        { sql: 'DELETE FROM shared.thing_note WHERE thing_id = ?', bind: [1] },
        { sql: 'INSERT INTO shared.thing_note (thing_id, note) VALUES (?, ?)', bind: [1, 'hello'] },
        { sql: 'DELETE FROM shared.thing_note WHERE thing_id = ?', bind: [2] },
      ])
    })
  })

  describe('update-only entities (no insert path)', () => {
    it('never inserts, and skips items with no local row entirely (including for ungated relations)', async () => {
      const queryRows = vi.fn().mockResolvedValue([{ id: 1, updated_at: 50 }]) // id=2 has no local row
      const runBatch = vi.fn().mockResolvedValue(undefined)
      const config: UpsertConfig<Item> = { ...baseConfig([manyToMany(false)]), insert: null }
      const items: Item[] = [
        { id: 1, name: 'a', updated_at: 100, tags: [10], note: null }, // updated, local exists
        { id: 2, name: 'b', updated_at: 100, tags: [20], note: null }, // no local row: not inserted, not eligible for relation sync
      ]

      const { count } = await batchUpsert(config, items, runBatch, queryRows)

      expect(count).toBe(1)
      const rowBatch = runBatch.mock.calls[0][0] as { sql: string; bind?: unknown[] }[]
      expect(rowBatch).toEqual([
        { sql: 'UPDATE shared.thing SET name = ?, updated_at = ? WHERE id = ?', bind: ['a', 100, 1] },
      ])
      const relationBatch = runBatch.mock.calls[1][0] as { sql: string; bind?: unknown[] }[]
      // Only id=1 (has a local row) is relation-eligible; id=2 never appears.
      expect(relationBatch).toEqual([
        { sql: 'DELETE FROM shared.thing_to_tags WHERE thing_id = ?', bind: [1] },
        { sql: 'INSERT OR IGNORE INTO shared.thing_to_tags (thing_id, tag_id) VALUES (?, ?)', bind: [1, 10] },
      ])
    })
  })

  describe('blob-keyed tables', () => {
    it('uses hex(id) for detection and the raw blob for row writes', async () => {
      interface BlobItem { id: string; updated_at: number }
      const queryRows = vi.fn().mockResolvedValue([])
      const runBatch = vi.fn().mockResolvedValue(undefined)
      const config: UpsertConfig<BlobItem> = {
        table: 'workspace.trx',
        idColumn: 'id',
        idIsBlob: true,
        getId: (i) => i.id,
        insert: (i) => ({ sql: 'INSERT INTO workspace.trx (id, updated_at) VALUES (?, ?)', bind: ['blob', i.updated_at] }),
        update: (i) => ({ sql: 'UPDATE workspace.trx SET updated_at = ? WHERE id = ?', bind: [i.updated_at, 'blob'] }),
        relations: [],
      }
      const items: BlobItem[] = [{ id: 'aa', updated_at: 100 }]

      await batchUpsert(config, items, runBatch, queryRows)

      expect(queryRows).toHaveBeenCalledWith(expect.stringContaining('hex(id) as id'), ['aa'])
      expect(queryRows).toHaveBeenCalledWith(expect.stringContaining('WHERE hex(id) IN'), ['aa'])
    })

    it('deletes a blob-keyed relation via hex(column) and inserts via the raw blob value', async () => {
      interface BlobItem { id: string; updated_at: number; tags: number[] }
      const queryRows = vi.fn().mockResolvedValue([])
      const runBatch = vi.fn().mockResolvedValue(undefined)
      const relation: RelationSync<BlobItem> = {
        mode: 'many-to-many',
        table: 'workspace.goal_to_tags',
        ownColumn: 'goal_id',
        ownColumnIsBlob: true,
        otherColumn: 'tag_id',
        ownId: (i) => i.id,
        values: (i) => i.tags,
        gated: true,
      }
      const config: UpsertConfig<BlobItem> = {
        table: 'workspace.goal',
        idColumn: 'id',
        idIsBlob: true,
        getId: (i) => i.id,
        insert: (i) => ({ sql: 'INSERT INTO workspace.goal (id, updated_at) VALUES (?, ?)', bind: ['blob:aa', i.updated_at] }),
        update: (i) => ({ sql: 'UPDATE workspace.goal SET updated_at = ? WHERE id = ?', bind: [i.updated_at, 'blob:aa'] }),
        relations: [relation],
      }
      const items: BlobItem[] = [{ id: 'aa', updated_at: 100, tags: [5] }]

      await batchUpsert(config, items, runBatch, queryRows)

      const relationBatch = runBatch.mock.calls[1][0] as { sql: string; bind?: unknown[] }[]
      expect(relationBatch).toEqual([
        { sql: 'DELETE FROM workspace.goal_to_tags WHERE hex(goal_id) = ?', bind: ['aa'] },
        { sql: 'INSERT OR IGNORE INTO workspace.goal_to_tags (goal_id, tag_id) VALUES (?, ?)', bind: ['blob:aa', 5] },
      ])
    })
  })
})

describe('isGatedByConflictConfig', () => {
  it('returns true (gated) when no ConflictConfig remaps list exists at all', () => {
    expect(isGatedByConflictConfig(undefined, 'shared.wallet_to_tags', 'wallet_id')).toBe(true)
  })

  it('returns true (gated) when the table/column pair is not in remaps', () => {
    const remaps: import('../../../../services/sync/syncConflictResolution').RemapStep[] = [
      { mode: 'plain', table: 'shared.tag_icon', column: 'tag_id' },
    ]
    expect(isGatedByConflictConfig(remaps, 'shared.something_else', 'tag_id')).toBe(true)
  })

  it('returns false (ungated) when the table/column pair appears in remaps', () => {
    const remaps: import('../../../../services/sync/syncConflictResolution').RemapStep[] = [
      { mode: 'plain', table: 'shared.tag_icon', column: 'tag_id' },
    ]
    expect(isGatedByConflictConfig(remaps, 'shared.tag_icon', 'tag_id')).toBe(false)
  })

  it('derives gated: false for both counterparty_to_tags and counterparty_note against the real COUNTERPARTY_CONFLICT_CONFIG', async () => {
    // Regression guard for the bug this change fixes: both relation tables are remapped by
    // counterparty's own merge config, so both must derive to ungated.
    const remaps: import('../../../../services/sync/syncConflictResolution').RemapStep[] = [
      { mode: 'plain', table: 'shared.counterparty_note', column: 'counterparty_id' },
      { mode: 'or-ignore-then-delete-orphans', table: 'shared.counterparty_to_tags', column: 'counterparty_id' },
      { mode: 'conditional-sort-order', table: 'shared.counterparty_sort_order', column: 'counterparty_id', existsCheckTable: 'shared.counterparty' },
      { mode: 'plain', table: 'workspace.trx_to_counterparty', column: 'counterparty_id' },
    ]
    expect(isGatedByConflictConfig(remaps, 'shared.counterparty_to_tags', 'counterparty_id')).toBe(false)
    expect(isGatedByConflictConfig(remaps, 'shared.counterparty_note', 'counterparty_id')).toBe(false)
  })

  it('derives gated: false for currency_to_tags against the real CURRENCY_CONFLICT_CONFIG', () => {
    const remaps: import('../../../../services/sync/syncConflictResolution').RemapStep[] = [
      { mode: 'plain', table: 'shared.currency_to_tags', column: 'currency_id' },
      { mode: 'plain', table: 'shared.exchange_rate', column: 'currency_id' },
      { mode: 'plain', table: 'workspace.account', column: 'currency_id' },
    ]
    expect(isGatedByConflictConfig(remaps, 'shared.currency_to_tags', 'currency_id')).toBe(false)
  })
})
