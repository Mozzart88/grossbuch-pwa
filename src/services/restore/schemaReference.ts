import type { Sqlite3Static, OpfsDatabase } from '../../sqlite-wasm'
import { NEW_MAIN_SCHEMA_SQL } from '../database/legacyMigration'
import { sharedMigrations } from '../database/sharedMigrations'
import { workspaceMigrations } from '../database/workspaceMigrations'

/** Build the supported shape from the app's own DDL, never from uploaded SQL. */
export function createRestoreSchemaReference(sqlite: Sqlite3Static): OpfsDatabase {
  const db = new sqlite.oo1.DB(':memory:')
  try {
    db.exec(NEW_MAIN_SCHEMA_SQL.replaceAll('new_main.', 'main.'))
    db.exec("ATTACH ':memory:' AS shared; ATTACH ':memory:' AS workspace")
    for (const sql of Object.values(sharedMigrations).flat()) db.exec(sql)
    for (const sql of Object.values(workspaceMigrations).flat()) db.exec(sql)
    return db
  } catch (error) { db.close(); throw error }
}
