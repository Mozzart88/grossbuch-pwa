import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestDatabase, closeTestDatabase, getTestDatabase } from './setup'

function tableNames(schema: string): string[] {
  const db = getTestDatabase()
  const result = db.exec(`SELECT name FROM ${schema}.sqlite_master WHERE type = 'table'`)
  return result[0]?.values.map(row => row[0] as string) ?? []
}

// App-local tables that must never leave `main` — device identity, auth
// material, key wrapping, and the linked-device registry (proposal.md's
// "BREAKING" list plus the Section 4 additions).
const APP_LOCAL_TABLES = ['app_settings', 'linked_device']

describe('Persistence Topology (schema separation)', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  it('keeps app-local state reachable only through `main` (8.4)', () => {
    const mainTables = tableNames('main')
    const sharedTables = tableNames('shared')
    const workspaceTables = tableNames('workspace')

    for (const table of APP_LOCAL_TABLES) {
      expect(mainTables).toContain(table)
      expect(sharedTables).not.toContain(table)
      expect(workspaceTables).not.toContain(table)
    }
  })

  it('excludes App DB data, device identity, linked devices, and key material from the Shared DB schema (8.9)', () => {
    // "Whole Shared DB export" (the dev-only Download DB path, task 7.5) runs
    // sqlcipher_export against whichever physical file is selected, verbatim
    // — it does no filtering of its own. The exclusion guarantee therefore
    // has to hold at the schema level: none of these tables (or the auth/key
    // material they hold — pin_hash, pbkdf2_salt, private_key,
    // shared_dek_wrapped, ...) can exist in the Shared DB file's schema at
    // all, because they're defined only by main's migrations (versions/v24.ts),
    // never by sharedMigrations.ts.
    const sharedTables = tableNames('shared')

    for (const table of APP_LOCAL_TABLES) {
      expect(sharedTables).not.toContain(table)
    }
    // sync_state (sync cursors/JWT) and workspace-scoped sync_deletions are
    // also main/workspace-only, not shared.
    expect(sharedTables).not.toContain('sync_state')
  })
})
