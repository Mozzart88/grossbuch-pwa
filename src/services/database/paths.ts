// Canonical App DB filename. Only ever created by the temp-build-and-swap
// migration in legacyMigration.ts (see MAIN_REBUILD_TEMP_FILENAME there) —
// never written to directly — so a crash mid-build can't leave a half-written
// file at this name (worker.ts's bootstrap treats its mere existence as proof
// of a completed migration).
export const MAIN_DB_FILENAME = '/main.db'

// Pre-split single-file installations (and brand new installs, before their
// first migration completes) use this name — the only physical predecessor
// `MAIN_DB_FILENAME` has. Never used for a fresh `main.db`-topology install.
export const LEGACY_DB_FILENAME = '/expense-tracker.sqlite3'

export const SHARED_DB_FILENAME = '/shared.db'

export function workspaceDbFilename(workspaceId: number): string {
  return `/workspace-${workspaceId}.db`
}
