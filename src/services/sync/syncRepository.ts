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

export async function getDeletionsSince(timestamp: number): Promise<SyncDeletion[]> {
  return querySQL<SyncDeletion>(
    `SELECT table_name AS entity, entity_id, deleted_at FROM sync_deletions WHERE deleted_at >= ?`,
    [timestamp]
  )
}

export async function recordDeletion(tableName: string, entityId: string): Promise<void> {
  await execSQL(
    `INSERT OR REPLACE INTO sync_deletions (table_name, entity_id, deleted_at) VALUES (?, ?, unixepoch(CURRENT_TIMESTAMP))`,
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
      SELECT 1 FROM ( SELECT * FROM icon WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM tag WHERE updated_at >= ? AND id > 10 AND id NOT IN (22, 23) LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM wallet WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM account WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM counterparty WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM currency WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM trx WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM budget WHERE updated_at >= ? LIMIT 1 )
      UNION ALL
      SELECT 1 FROM ( SELECT * FROM sync_deletions WHERE deleted_at >= ? LIMIT 1 )
    )
  `, [since, since, since, since, since, since, since, since, since])

  return (result?.cnt ?? 0) > 0
}
