import { querySQL } from '../database/connection'

// Generic engine behind resolveTagNameConflicts / resolveCounterpartyNameConflicts /
// resolveCounterpartyCodeConflicts's sibling resolveCurrencyCodeConflicts in syncImport.ts.
// See openspec/changes/sync-import-batching/design.md Decision 2 for the full rationale and
// the exact per-entity `remaps` tables (transcribed there from the pre-refactor code so they
// can be checked line-by-line against it).

export interface RemapStepPlain {
  mode: 'plain'
  table: string
  column: string
}

export interface RemapStepOrIgnoreThenDeleteOrphans {
  mode: 'or-ignore-then-delete-orphans'
  table: string
  column: string
}

export interface RemapStepConditionalSortOrder {
  mode: 'conditional-sort-order'
  table: string
  column: string
  existsCheckTable: string
}

export type RemapStep = RemapStepPlain | RemapStepOrIgnoreThenDeleteOrphans | RemapStepConditionalSortOrder

export interface ConflictConfig {
  table: string
  conflictColumn: 'name' | 'code'
  // true for currency (id-then-code detection, no rename phase); false for tag/counterparty
  // (name-based detection that runs for every incoming item regardless of id state).
  skipIfIdExistsLocally: boolean
  hasRenamePhase: boolean
  remaps: RemapStep[]
  finalize: 'delete-old-row' | 'rename-id'
}

export interface ConflictIncomingItem {
  id: number
  name?: string
  code?: string
  updated_at: number
}

export type RunBatch = (statements: { sql: string; bind?: unknown[] }[]) => Promise<void>

function placeholders(values: unknown[]): string {
  return values.map(() => '?').join(',')
}

// Detection is read-only relative to the writes phases 1-3 perform below, so batching every
// incoming item's lookup into one SELECT ... IN (...) observes exactly the same untouched
// local state a per-item query loop would (see design.md Decision 3). Returns, for each
// incoming item that has a conflict, the conflicting local row's id.
async function detectConflicts(config: ConflictConfig, incoming: ConflictIncomingItem[]): Promise<Map<number, number>> {
  const conflictingLocalIdByItemId = new Map<number, number>()

  if (config.skipIfIdExistsLocally) {
    const ids = incoming.map(i => i.id)
    const existingIdRows = await querySQL<{ id: number }>(
      `SELECT id FROM ${config.table} WHERE id IN (${placeholders(ids)})`, ids
    )
    const existingIds = new Set(existingIdRows.map(r => r.id))
    const candidates = incoming.filter(i => !existingIds.has(i.id) && i.code)
    if (candidates.length === 0) return conflictingLocalIdByItemId

    const codes = candidates.map(i => i.code as string)
    const codeRows = await querySQL<{ id: number; code: string }>(
      `SELECT id, ${config.conflictColumn} FROM ${config.table} WHERE ${config.conflictColumn} IN (${placeholders(codes)})`, codes
    )
    const localIdByCode = new Map(codeRows.map(r => [r.code, r.id]))
    for (const item of candidates) {
      const localId = localIdByCode.get(item.code as string)
      if (localId !== undefined) conflictingLocalIdByItemId.set(item.id, localId)
    }
  } else {
    const names = incoming.map(i => i.name as string)
    const rows = await querySQL<{ id: number; name: string }>(
      `SELECT id, ${config.conflictColumn} FROM ${config.table} WHERE ${config.conflictColumn} IN (${placeholders(names)})`, names
    )
    const localIdByName = new Map(rows.map(r => [r.name, r.id]))
    for (const item of incoming) {
      const localId = localIdByName.get(item.name as string)
      if (localId !== undefined && localId !== item.id) conflictingLocalIdByItemId.set(item.id, localId)
    }
  }

  return conflictingLocalIdByItemId
}

function buildMergeStatements(
  config: ConflictConfig,
  toMerge: { oldId: number; newId: number }[],
  existsByStep: Map<RemapStepConditionalSortOrder, Set<number>>,
): { sql: string; bind?: unknown[] }[] {
  const statements: { sql: string; bind?: unknown[] }[] = []

  for (const { oldId, newId } of toMerge) {
    for (const step of config.remaps) {
      if (step.mode === 'plain') {
        statements.push({ sql: `UPDATE ${step.table} SET ${step.column} = ? WHERE ${step.column} = ?`, bind: [newId, oldId] })
      } else if (step.mode === 'or-ignore-then-delete-orphans') {
        statements.push({ sql: `UPDATE OR IGNORE ${step.table} SET ${step.column} = ? WHERE ${step.column} = ?`, bind: [newId, oldId] })
        statements.push({ sql: `DELETE FROM ${step.table} WHERE ${step.column} = ?`, bind: [oldId] })
      } else {
        if (existsByStep.get(step)?.has(newId)) {
          statements.push({ sql: `UPDATE OR IGNORE ${step.table} SET ${step.column} = ? WHERE ${step.column} = ?`, bind: [newId, oldId] })
        }
        statements.push({ sql: `DELETE FROM ${step.table} WHERE ${step.column} = ?`, bind: [oldId] })
      }
    }

    if (config.finalize === 'delete-old-row') {
      statements.push({ sql: `DELETE FROM ${config.table} WHERE id = ?`, bind: [oldId] })
    } else {
      statements.push({ sql: `UPDATE ${config.table} SET id = ? WHERE id = ?`, bind: [newId, oldId] })
    }
  }

  return statements
}

// Resolves name/code conflicts for one entity type (tag, counterparty, or currency) ahead
// of that entity's own import loop. Must run inside the import transaction with
// foreign_keys = OFF, same as the pre-refactor per-entity functions this replaces.
//
// Phase order (vacate -> merge -> rename) is load-bearing — see design.md Context / Risks
// for why a direct two-way name swap and a merge-frees-a-name-a-rename-needs case both
// require every name-vacating write to land before any real target name is written.
export async function resolveConflicts(
  config: ConflictConfig,
  incoming: ConflictIncomingItem[],
  runBatch: RunBatch,
): Promise<void> {
  if (incoming.length === 0) return

  const incomingById = new Map(incoming.map(i => [i.id, i]))
  const conflictingLocalIdByItemId = await detectConflicts(config, incoming)
  if (conflictingLocalIdByItemId.size === 0) return

  const toRename: { id: number; finalValue: string; finalUpdatedAt: number }[] = []
  const toMerge: { oldId: number; newId: number }[] = []

  for (const [itemId, conflictingLocalId] of conflictingLocalIdByItemId) {
    // itemId always came from an entry in incomingById (detectConflicts only records
    // conflicts for incoming items), so this lookup always succeeds.
    const item = incomingById.get(itemId)!

    if (config.hasRenamePhase) {
      const incomingForConflictId = incomingById.get(conflictingLocalId)
      if (incomingForConflictId) {
        toRename.push({
          id: conflictingLocalId,
          finalValue: incomingForConflictId.name as string,
          finalUpdatedAt: incomingForConflictId.updated_at,
        })
      } else {
        toMerge.push({ oldId: conflictingLocalId, newId: item.id })
      }
    } else {
      toMerge.push({ oldId: conflictingLocalId, newId: item.id })
    }
  }

  // Phase 1: vacate every row about to be renamed to a placeholder, before any merge or
  // real-name write.
  if (toRename.length > 0) {
    await runBatch(toRename.map(({ id }) => ({
      sql: `UPDATE ${config.table} SET ${config.conflictColumn} = ? WHERE id = ?`,
      bind: [`__sync_tmp__${id}`, id],
    })))
  }

  // Phase 2: run every merge to completion (hoisting the conditional-sort-order existence
  // check into one read across all merges in this call, per design.md Decision 2).
  if (toMerge.length > 0) {
    const conditionalSteps = config.remaps.filter(
      (step): step is RemapStepConditionalSortOrder => step.mode === 'conditional-sort-order'
    )
    const existsByStep = new Map<RemapStepConditionalSortOrder, Set<number>>()
    if (conditionalSteps.length > 0) {
      const newIds = toMerge.map(m => m.newId)
      for (const step of conditionalSteps) {
        const rows = await querySQL<{ id: number }>(
          `SELECT id FROM ${step.existsCheckTable} WHERE id IN (${placeholders(newIds)})`, newIds
        )
        existsByStep.set(step, new Set(rows.map(r => r.id)))
      }
    }

    await runBatch(buildMergeStatements(config, toMerge, existsByStep))
  }

  // Phase 3: write the real target names, now that every name-vacating write has landed.
  if (toRename.length > 0) {
    await runBatch(toRename.map(({ id, finalValue, finalUpdatedAt }) => ({
      sql: `UPDATE ${config.table} SET ${config.conflictColumn} = ?, updated_at = ? WHERE id = ?`,
      bind: [finalValue, finalUpdatedAt, id],
    })))
  }
}
