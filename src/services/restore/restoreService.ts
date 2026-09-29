import { requireDatabaseRecovery } from './lifecycle'
import { withRestoreAccess } from '../database/connection'
import { getSessionAppKey } from '../auth/authService'
import { getSessionDekShared, getActiveWorkspaceId } from '../database/workspace'
import { TEMP_VIEW_STATEMENTS } from '../database/tempViews'
import { prepareRestoreCredentials } from './credentials'
import { installRestore, recoverRestore } from './journal'
import { opfsRestoreStorage } from './opfsStorage'
import type { RestorePlan } from './inspection'
import type { PreparedRestore, RestoreInput } from './types'

export interface RestoreReview { plan: RestorePlan }
const selections = new WeakMap<RestoreReview, { inputs: RestoreInput[]; session?: string; plan: string }>()
export async function inspectDatabaseRestore(files: File[]): Promise<RestoreReview> {
  const inputs = await Promise.all(files.map(async file => ({ name: file.name, bytes: await file.arrayBuffer() })))
  return withRestoreAccess(async send => {
    const sharedKey = getSessionDekShared() ?? undefined
    const session = sharedKey ? await send('export_session', {}) as string : undefined
    const result = await send('restore_inspect', { restoreRequest: { inputs, sharedKey, session } }) as PreparedRestore
    const review = { plan: result.plan }
    selections.set(review, { inputs, session, plan: JSON.stringify(result.plan) })
    return review
  })
}
export async function restoreDatabases(review: RestoreReview, pin?: string): Promise<void> {
  const selection = selections.get(review)
  if (!selection || JSON.stringify(review.plan) !== selection.plan) throw new Error('Select and review the database files again')
  const credentials = review.plan.mode === 'full' ? await prepareRestoreCredentials(pin ?? '') : undefined
  await withRestoreAccess(async send => {
    const appKey = getSessionAppKey()
    const sharedKey = getSessionDekShared() ?? undefined
    const workspaceId = getActiveWorkspaceId()
    if (selection.session) {
      if (!sharedKey || await send('export_session', {}) !== selection.session) throw new Error('The session changed; review the restore again')
    } else if (review.plan.mode === 'partial') throw new Error('Unlock the existing installation for partial restore')
    const request = { inputs: selection.inputs, credentials, sharedKey, session: selection.session }
    const prepared = await send('restore_prepare', { restoreRequest: request }) as PreparedRestore
    if (JSON.stringify(prepared.plan) !== selection.plan) throw new Error('The database set changed; review the restore again')
    const storage = await opfsRestoreStorage()
    const reopen = async () => {
      if (!appKey || !sharedKey || workspaceId === null) return
      await send('init_encrypted', { key: appKey })
      await send('attach', { schema: 'shared', filename: '/shared.db', key: sharedKey })
      await send('attach', { schema: 'workspace', filename: `/workspace-${workspaceId}.db`, key: sharedKey })
      await send('exec_batch', { statements: TEMP_VIEW_STATEMENTS.map(sql => ({ sql })) })
    }
    await send('close', {})
    try {
      await installRestore(storage, prepared.files, credentials?.salt)
    } catch {
      try { await recoverRestore(storage) } catch {
        requireDatabaseRecovery()
        throw new Error('Restore recovery is pending. Reload to retry recovery before opening the database.')
      }
      // A failed cleanup may follow a durable commit. Only reopen with old keys
      // if the full restore did not publish the new salt.
      if (!credentials || storage.getSalt() !== credentials.salt) await reopen()
      throw new Error('Restore was interrupted. Reload to open the recovered installation.')
    }
    selections.delete(review)
    if (!credentials) {
      try { await reopen() } catch {
        requireDatabaseRecovery()
        throw new Error('Restored files are installed. Reload to reopen the database.')
      }
    }
  })
}
