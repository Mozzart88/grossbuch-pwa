import { queryOne } from '../database/connection'
import { settingsRepository } from '../repositories/settingsRepository'
import { exportSyncPackage } from './syncExport'
import { importSyncPackage } from './syncImport'
import { encryptSyncPackage, decryptSyncPackage } from './syncCrypto'
import {
  ensureSyncState,
  updatePushTimestamp,
  updateSyncTimestamp,
  hasUnpushedChanges as checkUnpushed,
} from './syncRepository'
import * as syncApi from './syncApi'
import type { ImportResult } from './syncTypes'

interface InstallationData {
  id: string
  jwt?: string
}

export async function getInstallationData(): Promise<InstallationData | null> {
  const raw = await settingsRepository.get('installation_id')
  if (!raw) return null
  try {
    return JSON.parse(String(raw))
  } catch {
    return null
  }
}

export async function getPrivateKey(): Promise<string | null> {
  const row = await queryOne<{ value: string }>(
    `SELECT value FROM auth_settings WHERE key = 'private_key'`
  )
  return row?.value ?? null
}

export async function getLinkedInstallations(): Promise<Array<{ installation_id: string; public_key: string }>> {
  const raw = await settingsRepository.get('linked_installations')
  if (!raw) return []
  try {
    const parsed = JSON.parse(String(raw))
    if (typeof parsed !== 'object' || parsed === null) return []
    return Object.entries(parsed)
      .filter(([, pk]) => typeof pk === 'string' && pk.length > 0)
      .map(([id, pk]) => ({ installation_id: id, public_key: pk as string }))
  } catch {
    return []
  }
}

interface PushSyncOptions {
  targetUuid?: string
}

/**
 * Push local changes to the sync server.
 * Exports changes since last push, encrypts for all linked installations, uploads.
 * When targetUuid is set, pushes full history encrypted only for the target device.
 */
export async function pushSync(options: PushSyncOptions = {}): Promise<boolean> {
  const { targetUuid } = options
  const installData = await getInstallationData()
  if (!installData?.jwt || !installData.id) return false

  const allRecipients = await getLinkedInstallations()
  if (allRecipients.length === 0) return false

  if (targetUuid) {
    // Full-history push for a specific new device
    const target = allRecipients.find(r => r.installation_id === targetUuid)
    if (!target) return false

    const pkg = await exportSyncPackage(0, installData.id)
    const encrypted = await encryptSyncPackage(pkg, [target])
    await syncApi.push({ package: encrypted }, installData.jwt)
    return true
  }

  // Normal incremental push for all linked installations
  const state = await ensureSyncState(installData.id)
  const hasChanges = await checkUnpushed(installData.id)
  if (!hasChanges) return false

  const pkg = await exportSyncPackage(state.last_push_at, installData.id)
  const encrypted = await encryptSyncPackage(pkg, allRecipients)

  await syncApi.push({ package: encrypted }, installData.jwt)
  await updatePushTimestamp(installData.id)

  return true
}

/**
 * Pull pending sync packages from the server, decrypt, import, and acknowledge.
 */
export async function pullSync(): Promise<ImportResult[]> {
  const installData = await getInstallationData()
  if (!installData?.jwt || !installData.id) return []

  const privateKey = await getPrivateKey()
  if (!privateKey) return []

  const state = await ensureSyncState(installData.id)
  const response = await syncApi.pull(installData.id, state.last_sync_at, installData.jwt)

  if (response.packages.length === 0) return []

  const results: ImportResult[] = []
  const ackedIds: string[] = []

  for (const { id, package: encrypted } of response.packages) {
    try {
      const pkg = await decryptSyncPackage(encrypted, installData.id, privateKey)
      const result = await importSyncPackage(pkg)
      results.push(result)
      ackedIds.push(id)
    } catch (err) {
      console.error('[pullSync] Failed to process package:', id, err)
    }
  }

  if (ackedIds.length > 0) {
    await syncApi.ack({ package_ids: ackedIds }, installData.jwt)
    await updateSyncTimestamp(installData.id)
  }

  return results
}

/**
 * Quick check if there are unpushed local changes.
 */
export async function hasUnpushedChanges(): Promise<boolean> {
  const installData = await getInstallationData()
  if (!installData?.id) return false
  return checkUnpushed(installData.id)
}

export type { ImportResult } from './syncTypes'
