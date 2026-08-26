import { hexToBlob } from '../../utils/blobUtils'
import type { RemapStep } from './syncConflictResolution'

// Generic batch-upsert engine behind the 10 upsert-shaped entity import loops (icons, tags,
// wallets, accounts, counterparties, currencies, budgets, notifications, recurring
// plans/occurrences/budgets, goals). Replaces the per-item existence-check + insert-or-update +
// relation-resync loop with one batched detection read and one batched write call per phase.
// See openspec/changes/sync-import-entity-batching/design.md Decision 1.
//
// Not used for transactions (two-level fan-out, no equivalent RelationSync shape — Decision 2)
// or deletions (delete-only 12-way dispatch — Decision 3).

export type RunBatch = (statements: { sql: string; bind?: unknown[] }[]) => Promise<void>
export type QueryRows = <T>(sql: string, bind?: unknown[]) => Promise<T[]>

function placeholders(values: unknown[]): string {
  return values.map(() => '?').join(',')
}

function placeholdersSpaced(values: unknown[]): string {
  return values.map(() => '?').join(', ')
}

// Whether a relation table's resync must run unconditionally (ungated) rather than only for
// items whose own row was just inserted/updated (gated) — derived from whether the entity's
// existing ConflictConfig remaps that exact {table, column} during a merge. A merge never
// bumps the surviving row's own updated_at, so gating would leave merge-remapped relation rows
// uncleaned. See design.md Decision 4. Entities with no ConflictConfig (wallets, accounts,
// budgets, goals) pass `undefined` and always come back gated.
export function isGatedByConflictConfig(remaps: RemapStep[] | undefined, table: string, column: string): boolean {
  if (!remaps) return true
  return !remaps.some(r => r.table === table && r.column === column)
}

export interface RelationSyncManyToMany<TItem> {
  mode: 'many-to-many'
  table: string
  ownColumn: string
  ownColumnIsBlob: boolean
  otherColumn: string
  ownId: (item: TItem) => unknown
  values: (item: TItem) => unknown[]
  gated: boolean
}

export interface RelationSyncOptionalChildRow<TItem> {
  mode: 'optional-child-row'
  table: string
  ownColumn: string
  ownColumnIsBlob: boolean
  ownId: (item: TItem) => unknown
  // Column names beyond ownColumn, in the same order as row()'s array.
  extraColumns: string[]
  // Returns the extra-column values to insert, or null when this item has no row to write
  // (e.g. an empty note) — mirrors the existing `if (hasData) { INSERT ... }` guards.
  row: (item: TItem) => unknown[] | null
  // budget_tag_context uses INSERT OR IGNORE (UNIQUE-constrained, like a many-to-many junction
  // table); account_data/counterparty_note/goal_note/tag_icon use plain INSERT.
  insertOrIgnore?: boolean
  gated: boolean
}

export type RelationSync<TItem> = RelationSyncManyToMany<TItem> | RelationSyncOptionalChildRow<TItem>

export interface UpsertConfig<TItem extends { updated_at: number }> {
  table: string
  idColumn: string
  idIsBlob: boolean
  getId: (item: TItem) => unknown
  // null for update-only entities (currencies — pre-seeded, no insert path).
  insert: ((item: TItem) => { sql: string; bind: unknown[] }) | null
  update: (item: TItem) => { sql: string; bind: unknown[] }
  relations: RelationSync<TItem>[]
}

function relationOwnColumnExpr<TItem>(relation: RelationSync<TItem>): string {
  return relation.ownColumnIsBlob ? `hex(${relation.ownColumn})` : relation.ownColumn
}

function pushRelationStatements<TItem>(
  statements: { sql: string; bind?: unknown[] }[],
  relation: RelationSync<TItem>,
  item: TItem,
): void {
  const ownIdRaw = relation.ownId(item)
  statements.push({
    sql: `DELETE FROM ${relation.table} WHERE ${relationOwnColumnExpr(relation)} = ?`,
    bind: [ownIdRaw],
  })

  const insertOwnValue = relation.ownColumnIsBlob ? hexToBlob(ownIdRaw as string) : ownIdRaw

  if (relation.mode === 'many-to-many') {
    for (const value of relation.values(item)) {
      statements.push({
        sql: `INSERT OR IGNORE INTO ${relation.table} (${relation.ownColumn}, ${relation.otherColumn}) VALUES (?, ?)`,
        bind: [insertOwnValue, value],
      })
    }
  } else {
    const row = relation.row(item)
    if (row !== null) {
      const verb = relation.insertOrIgnore ? 'INSERT OR IGNORE' : 'INSERT'
      const bind = [insertOwnValue, ...row]
      statements.push({
        sql: `${verb} INTO ${relation.table} (${relation.ownColumn}, ${relation.extraColumns.join(', ')}) VALUES (${placeholdersSpaced(bind)})`,
        bind,
      })
    }
  }
}

export interface BatchUpsertResult<TItem> {
  count: number
  inserted: TItem[]
  updated: TItem[]
}

// Detection: one batched read replacing the per-item queryOne loop. Writes: one runBatch call
// for row inserts+updates combined, then one runBatch call per relation table (across every
// eligible item in the chunk) — see design.md Decision 1 and
// specs/sync-import-entity-performance/spec.md's per-relation-table round-trip requirement.
// Returns the classified item lists (not just a count) so callers needing per-item detail from
// the insert path (e.g. importAccounts' newAccountCurrencyIds) don't need a second detection read.
export async function batchUpsert<TItem extends { updated_at: number }>(
  config: UpsertConfig<TItem>,
  incoming: TItem[],
  runBatch: RunBatch,
  queryRows: QueryRows,
): Promise<BatchUpsertResult<TItem>> {
  if (incoming.length === 0) return { count: 0, inserted: [], updated: [] }

  const ids = incoming.map(config.getId)
  const idExpr = config.idIsBlob ? `hex(${config.idColumn})` : config.idColumn
  const localRows = await queryRows<{ id: unknown; updated_at: number }>(
    `SELECT ${idExpr} as id, updated_at FROM ${config.table} WHERE ${idExpr} IN (${placeholders(ids)})`,
    ids,
  )
  const localUpdatedAtById = new Map(localRows.map(r => [r.id, r.updated_at]))

  const toInsert: TItem[] = []
  const toUpdate: TItem[] = []

  for (const item of incoming) {
    const localUpdatedAt = localUpdatedAtById.get(config.getId(item))
    if (localUpdatedAt === undefined) {
      if (config.insert) toInsert.push(item)
    } else if (item.updated_at > localUpdatedAt) {
      toUpdate.push(item)
    }
  }

  const rowStatements: { sql: string; bind?: unknown[] }[] = []
  for (const item of toInsert) rowStatements.push(config.insert!(item))
  for (const item of toUpdate) rowStatements.push(config.update(item))
  if (rowStatements.length > 0) await runBatch(rowStatements)

  const written = new Set<TItem>([...toInsert, ...toUpdate])
  // Ungated relations run for every item that has (or will have) a row: everything, for
  // insert-capable entities; only items with a pre-existing local row otherwise (currencies).
  const relationEligible = config.insert
    ? incoming
    : incoming.filter(i => localUpdatedAtById.has(config.getId(i)))

  for (const relation of config.relations) {
    const items = relation.gated ? incoming.filter(i => written.has(i)) : relationEligible
    if (items.length === 0) continue
    const statements: { sql: string; bind?: unknown[] }[] = []
    for (const item of items) pushRelationStatements(statements, relation, item)
    await runBatch(statements)
  }

  return { count: toInsert.length + toUpdate.length, inserted: toInsert, updated: toUpdate }
}
