import { CURRENT_VERSION } from '../database/migrations'
import type { OpfsDatabase } from '../../sqlite-wasm'
import { CURRENT_SHARED_VERSION } from '../database/sharedMigrations'
import { CURRENT_WORKSPACE_VERSION } from '../database/workspaceMigrations'

export interface RestoreFileInfo {
  name: string
  destination: string
  role: 'main' | 'shared' | 'workspace'
  workspaceId?: number
  workspaceIds?: number[]
  activeWorkspaceId?: number
  findings: string[]
}
export interface RestoreTarget {
  workspaceIds: number[]
  availableWorkspaceIds: number[]
  activeWorkspaceId: number
}
export interface RestorePlan {
  mode: 'full' | 'partial'
  files: RestoreFileInfo[]
  retained: string[]
  workspaceIds: number[]
  findings: string[]
}
const requiredTables = {
  main: ['app_settings', 'linked_device', 'sync_state', 'sync_deletions'],
  shared: ['shared_meta', 'workspace', 'tag', 'currency', 'counterparty', 'tag_references', 'sync_deletions'],
  workspace: ['workspace_meta', 'wallet', 'account', 'trx', 'trx_base', 'trx_note', 'trx_to_counterparty', 'sync_deletions'],
}
export function restoreDestination(name: string): string {
  const match = /^(main|shared|workspace-([1-9]\d*))(-decrypted)?\.db$/.exec(name)
  if (!match || (match[2] && !Number.isSafeInteger(Number(match[2])))) throw new Error('Unsupported database filename')
  return `${match[1]}.db`
}
export function inspectRestoreDatabase(db: OpfsDatabase, name: string, schema: string, reference: OpfsDatabase): RestoreFileInfo {
  if (!['main', 'shared', 'workspace'].includes(schema)) throw new Error('Invalid inspection schema')
  const destination = restoreDestination(name)
  const tables = new Set((db.selectObjects(`SELECT name FROM ${schema}.sqlite_master WHERE type='table'`) as { name: string }[]).map(row => row.name))
  const roles = (['main', 'shared', 'workspace'] as const).filter(role => tables.has(role === 'main' ? 'app_settings' : `${role}_meta`))
  if (roles.length !== 1) throw new Error('Unsupported split database schema')
  const role = roles[0]
  if (!destination.startsWith(role === 'workspace' ? 'workspace-' : `${role}.`)) throw new Error('Filename does not match database role')
  if (requiredTables[role].some(table => !tables.has(table))) throw new Error('Incomplete database schema')
  const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`
  const objects = new Map((db.selectObjects(`SELECT name,type FROM ${schema}.sqlite_master`) as { name: string; type: string }[]).map(row => [row.name, row.type]))
  const expected = reference.selectObjects(`SELECT name,type FROM ${role}.sqlite_master`) as { name: string; type: string }[]
  for (const object of expected) {
    if (objects.get(object.name) !== object.type) throw new Error(`Incomplete database schema: missing ${object.type} ${object.name}`)
    if (object.type !== 'table') continue
    const columns = (source: OpfsDatabase, alias: string) => source.selectObjects(`PRAGMA ${alias}.table_info(${identifier(object.name)})`).map(row => {
      const column = row as { name: string; type: string; notnull: number; pk: number; dflt_value: unknown }
      return [column.name, column.type.toUpperCase(), column.notnull, column.pk, column.dflt_value]
    })
    if (JSON.stringify(columns(db, schema)) !== JSON.stringify(columns(reference, role))) throw new Error(`Incompatible database schema columns: ${object.name}`)
    const foreignKeys = (source: OpfsDatabase, alias: string) => source.selectObjects(`PRAGMA ${alias}.foreign_key_list(${identifier(object.name)})`)
    if (JSON.stringify(foreignKeys(db, schema)) !== JSON.stringify(foreignKeys(reference, role))) throw new Error(`Incompatible database schema constraints: ${object.name}`)
  }
  const meta = role === 'main' ? 'app_settings' : `${role}_meta`
  const setting = (key: string) => db.selectValue(`SELECT value FROM ${schema}.${meta} WHERE key=?`, [key])
  const version = Number(setting(role === 'main' ? 'topology_version' : 'schema_version'))
  const expectedVersion = role === 'main' ? 2 : role === 'shared' ? CURRENT_SHARED_VERSION : CURRENT_WORKSPACE_VERSION
  if (version !== expectedVersion) throw new Error('Unsupported database version; export with the current app version')
  if (role === 'main' && setting('db_version') !== String(CURRENT_VERSION)) throw new Error('Unsupported main database version')
  const integrity = db.selectObjects(`PRAGMA ${schema}.integrity_check`) as Record<string, unknown>[]
  if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') throw new Error('Database structural integrity check failed')
  const findings = (db.selectObjects(`PRAGMA ${schema}.foreign_key_check`) as Record<string, unknown>[]).map(row => `${destination}: orphan reference in ${String(row.table)} (row ${String(row.rowid)})`)
  const info: RestoreFileInfo = { name, destination, role, findings }
  if (role === 'workspace') info.workspaceId = Number(/^workspace-(\d+)/.exec(destination)![1])
  if (role === 'shared') {
    info.workspaceIds = (db.selectObjects(`SELECT id FROM ${schema}.workspace ORDER BY id`) as { id: number }[]).map(row => row.id)
    if (!info.workspaceIds.length || info.workspaceIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid workspace registry')
  }
  if (role === 'main') info.activeWorkspaceId = Number(setting('active_workspace_id'))
  return info
}
export function planRestore(files: RestoreFileInfo[], target?: RestoreTarget): RestorePlan {
  if (!files.length) throw new Error('Select database files to restore')
  if (new Set(files.map(file => file.destination)).size !== files.length) throw new Error('Duplicate database destination')
  const main = files.find(file => file.role === 'main')
  const shared = files.find(file => file.role === 'shared')
  const mode = main ? 'full' : 'partial'
  if (mode === 'partial' && !target) throw new Error('Unlock the existing installation for partial restore')
  if (main && !shared) throw new Error('Full restore requires shared.db')
  const workspaceIds = shared?.workspaceIds ?? target!.workspaceIds
  const active = main ? main.activeWorkspaceId : target!.activeWorkspaceId
  if (!active || !workspaceIds.includes(active)) throw new Error('Active workspace is not registered in the resulting set')
  for (const file of files) {
    if (file.role === 'workspace' && !workspaceIds.includes(file.workspaceId!)) throw new Error(`${file.destination} is not registered`)
  }
  const selected = new Set(files.filter(file => file.role === 'workspace').map(file => file.workspaceId))
  for (const id of workspaceIds) {
    if (!selected.has(id) && (main || !target?.availableWorkspaceIds.includes(id))) throw new Error(`Missing workspace-${id}.db`)
  }
  const destinations = new Set(files.map(file => file.destination))
  const retained = mode === 'full' ? [] : ['main.db', 'shared.db', ...target!.availableWorkspaceIds.map(id => `workspace-${id}.db`)].filter(name => !destinations.has(name))
  return { mode, files, retained, workspaceIds, findings: files.flatMap(file => file.findings) }
}
