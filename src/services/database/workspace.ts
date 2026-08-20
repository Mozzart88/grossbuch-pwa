import { attachDatabase, detachDatabase, execSQL, queryOne, validateReferenceExists } from './connection'
import { workspaceDbFilename } from './paths'
import { runWorkspaceMigrations } from './workspaceMigrations'
import { createTempViews } from './tempViews'

/**
 * Module-level session state — the DEK used to key workspace files (shared
 * with the Shared DB, see design.md) and which workspace is attached.
 * Cleared on logout/wipe.
 */
let sessionDekShared: string | null = null
let activeWorkspaceId: number | null = null

async function getStoredActiveWorkspaceId(): Promise<number | null> {
  const row = await queryOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'active_workspace_id'`
  )
  return row ? parseInt(row.value, 10) : null
}

async function saveActiveWorkspaceId(id: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await execSQL(
    `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('active_workspace_id', ?, ?)`,
    [id.toString(), now]
  )
}

/**
 * Get the first known workspace, or create one if none exist yet. This is a
 * lazy fallback so Section 3 doesn't have to wait on Section 5's migration
 * (which will properly seed the default workspace for real upgrades).
 */
async function getOrCreateDefaultWorkspace(): Promise<number> {
  const existing = await queryOne<{ id: number }>(`SELECT id FROM shared.workspace ORDER BY id ASC LIMIT 1`)
  if (existing) return existing.id

  await execSQL(`INSERT INTO shared.workspace (name) VALUES ('Personal')`)
  const created = await queryOne<{ id: number }>(`SELECT id FROM shared.workspace ORDER BY id DESC LIMIT 1`)
  if (!created) throw new Error('Failed to create default workspace')
  return created.id
}

async function resolveActiveWorkspaceId(): Promise<number> {
  const stored = await getStoredActiveWorkspaceId()
  if (stored !== null && await validateReferenceExists('shared.workspace', 'id', stored)) {
    return stored
  }

  const fallback = await getOrCreateDefaultWorkspace()
  await saveActiveWorkspaceId(fallback)
  return fallback
}

/**
 * Attach the active workspace (creating a default one if none exist yet) using
 * the given DEK_shared. Called once per session, right after the Shared DB
 * itself is attached.
 */
export async function attachActiveWorkspace(dekShared: string): Promise<void> {
  sessionDekShared = dekShared
  const workspaceId = await resolveActiveWorkspaceId()

  await attachDatabase('workspace', workspaceDbFilename(workspaceId), dekShared)
  await runWorkspaceMigrations()
  await createTempViews()
  activeWorkspaceId = workspaceId
}

/**
 * Switch to a different workspace: detach the current one, attach the
 * selected one (creating its file/schema if needed), and persist it as active.
 */
export async function switchWorkspace(workspaceId: number): Promise<void> {
  if (!sessionDekShared) throw new Error('No active session — log in first')
  if (!(await validateReferenceExists('shared.workspace', 'id', workspaceId))) {
    throw new Error('Workspace not found')
  }

  await detachDatabase('workspace')
  await attachDatabase('workspace', workspaceDbFilename(workspaceId), sessionDekShared)
  await runWorkspaceMigrations()
  await createTempViews()
  await saveActiveWorkspaceId(workspaceId)
  activeWorkspaceId = workspaceId
}

/**
 * Rekey the attached workspace to a new DEK_shared (called from changePin,
 * alongside rekeying `shared` itself — workspace files share that key).
 */
export function setSessionDekShared(dekShared: string): void {
  sessionDekShared = dekShared
}

export function getActiveWorkspaceId(): number | null {
  return activeWorkspaceId
}

/**
 * The session's DEK_shared — workspace files share this key (see design.md).
 * Needed by workspace export/import to attach a workspace file other than the
 * currently-active one (under a temporary alias) without disturbing the session.
 */
export function getSessionDekShared(): string | null {
  return sessionDekShared
}

export function clearWorkspaceSession(): void {
  sessionDekShared = null
  activeWorkspaceId = null
}
