import { execSQL, querySQL, queryOne } from '../database/connection'
import type { SyncState, SyncDeletion } from './syncTypes'

export async function getSyncState(installationId: string): Promise<SyncState | null> {
  return queryOne<SyncState>(
    `SELECT installation_id, last_sync_at, last_push_at FROM sync_state WHERE installation_id = ?`,
    [installationId]
  )
}

export async function ensureSyncState(installationId: string): Promise<SyncState> {
  const existing = await getSyncState(installationId)
  if (existing) return existing

  await execSQL(
    `INSERT OR IGNORE INTO sync_state (installation_id) VALUES (?)`,
    [installationId]
  )
  return { installation_id: installationId, last_sync_at: 0, last_push_at: 0 }
}

export async function updatePushTimestamp(installationId: string, timestamp: number): Promise<void> {
  await execSQL(
    `UPDATE sync_state SET last_push_at = ? WHERE installation_id = ?`,
    [timestamp, installationId]
  )
}

export async function updateSyncTimestamp(installationId: string): Promise<void> {
  await execSQL(
    `UPDATE sync_state SET last_sync_at = unixepoch(CURRENT_TIMESTAMP) WHERE installation_id = ?`,
    [installationId]
  )
}

// sync_deletions exists in three schemas now: `shared` and `workspace` both have
// one (an unqualified reference always silently resolves to `shared`'s, never
// `workspace`'s — confirmed against the real engine, this is the one genuine
// cross-schema name collision in the whole sync system), and `main` still has
// its pre-split one holding tombstones recorded before this installation's
// legacy-data migration ran (see legacyMigration.ts / design.md) — those
// entities now live in `shared`/`workspace` but their tombstones were
// deliberately left behind in `main`, so they must still be read from there.
export async function getDeletionsSince(timestamp: number): Promise<SyncDeletion[]> {
  return querySQL<SyncDeletion>(
    `SELECT table_name AS entity, entity_id, deleted_at FROM main.sync_deletions WHERE deleted_at >= ?
     UNION ALL
     SELECT table_name AS entity, entity_id, deleted_at FROM shared.sync_deletions WHERE deleted_at >= ?
     UNION ALL
     SELECT table_name AS entity, entity_id, deleted_at FROM workspace.sync_deletions WHERE deleted_at >= ?`,
    [timestamp, timestamp, timestamp]
  )
}

const SHARED_DELETION_TABLES = new Set(['tag', 'currency', 'counterparty', 'icon', 'notification'])

export async function recordDeletion(tableName: string, entityId: string): Promise<void> {
  const schema = SHARED_DELETION_TABLES.has(tableName) ? 'shared' : 'workspace'
  await execSQL(
    `INSERT OR REPLACE INTO ${schema}.sync_deletions (table_name, entity_id, deleted_at) VALUES (?, ?, unixepoch(CURRENT_TIMESTAMP))`,
    [tableName, entityId]
  )
}

export async function getLastPushTimestamp(installationId: string): Promise<number> {
  const state = await getSyncState(installationId)
  return state?.last_push_at ?? 0
}

/**
 * Quick check if there are unpushed changes since last push.
 * Uses UNION ALL across all sync-tracked tables.
 */
export async function hasUnpushedChanges(installationId: string): Promise<boolean> {
  const state = await getSyncState(installationId)
  const since = state?.last_push_at ?? 0

  const result = await queryOne<{ cnt: number }>(`
    SELECT COUNT(*) as cnt FROM (
      SELECT 1 FROM ( SELECT * FROM shared.icon WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM shared.tag WHERE updated_at >= ? AND id > 10 AND id NOT IN (22, 23) LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM workspace.wallet WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM workspace.account WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM shared.counterparty WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM shared.currency WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM workspace.trx WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM workspace.budget WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM shared.notification WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM main.sync_deletions WHERE deleted_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM shared.sync_deletions WHERE deleted_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM workspace.sync_deletions WHERE deleted_at >= ? LIMIT 1 )
    )
  `, [since, since, since, since, since, since, since, since, since, since, since, since])

  return (result?.cnt ?? 0) > 0
}
