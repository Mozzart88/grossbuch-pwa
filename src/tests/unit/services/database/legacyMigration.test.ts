import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database/connection', () => ({
  execSQL: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn().mockResolvedValue(null),
  attachDatabase: vi.fn().mockResolvedValue(undefined),
  detachDatabase: vi.fn().mockResolvedValue(undefined),
  finalizeMainRebuild: vi.fn().mockResolvedValue(undefined),
  deleteFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../services/database/sharedMigrations', () => ({
  runSharedMigrations: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../services/database/workspace', () => ({
  attachActiveWorkspace: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../services/database/workspaceMigrations', () => ({
  WORKSPACE_BULK_COPY_SENSITIVE_TRIGGERS: [
    { name: 'trg_default_wallet', sql: 'CREATE TRIGGER workspace.trg_default_wallet ...' },
    { name: 'trg_add_first_account', sql: 'CREATE TRIGGER workspace.trg_add_first_account ...' },
    { name: 'trg_set_default_account', sql: 'CREATE TRIGGER workspace.trg_set_default_account ...' },
    { name: 'trg_add_trx_base', sql: 'CREATE TRIGGER workspace.trg_add_trx_base ...' },
  ],
}))

import { needsLegacyMigration, migrateLegacyInstallation, TOPOLOGY_VERSION, NEW_MAIN_TEMP_FILENAME } from '../../../../services/database/legacyMigration'
import { execSQL, queryOne, attachDatabase, detachDatabase, finalizeMainRebuild, deleteFile } from '../../../../services/database/connection'

const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)
const mockAttachDatabase = vi.mocked(attachDatabase)
const mockDetachDatabase = vi.mocked(detachDatabase)
const mockFinalizeMainRebuild = vi.mocked(finalizeMainRebuild)
const mockDeleteFile = vi.mocked(deleteFile)

describe('legacyMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockQueryOne.mockResolvedValue(null)
  })

  describe('needsLegacyMigration', () => {
    it('returns true when no topology_version is stored (pre-split installation)', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      expect(await needsLegacyMigration()).toBe(true)
    })

    it('returns true when the stored version is older than the current one', async () => {
      mockQueryOne.mockResolvedValueOnce({ value: '1' })

      expect(await needsLegacyMigration()).toBe(true)
    })

    it('returns false when already on the current topology version', async () => {
      mockQueryOne.mockResolvedValueOnce({ value: String(TOPOLOGY_VERSION) })

      expect(await needsLegacyMigration()).toBe(false)
    })
  })

  describe('migrateLegacyInstallation', () => {
    it('wraps the bulk-copy/keep-data-build phase in BEGIN/COMMIT, then finalizes the swap and re-attaches shared/workspace', async () => {
      mockQueryOne.mockResolvedValueOnce(null) // linked_installations lookup

      await migrateLegacyInstallation(1, 'dek-app', 'dek-shared')

      const calls = mockExecSQL.mock.calls.map((c) => c[0])
      expect(calls[0]).toBe('BEGIN TRANSACTION')
      expect(calls[calls.length - 1]).toBe('COMMIT')

      expect(mockDeleteFile).toHaveBeenCalledWith(NEW_MAIN_TEMP_FILENAME)
      expect(mockFinalizeMainRebuild).toHaveBeenCalledWith(NEW_MAIN_TEMP_FILENAME, 'dek-app')
      expect(mockAttachDatabase).toHaveBeenCalledWith('shared', expect.any(String), 'dek-shared')
    })

    it('attaches new_main before BEGIN TRANSACTION — a database ATTACHed mid-transaction cannot be written to (regression: "database new_main is locked")', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await migrateLegacyInstallation(1, 'dek-app', 'dek-shared')

      const newMainAttachCall = mockAttachDatabase.mock.calls.find((c) => c[0] === 'new_main')
      expect(newMainAttachCall).toBeDefined()
      const attachOrder = mockAttachDatabase.mock.invocationCallOrder[
        mockAttachDatabase.mock.calls.indexOf(newMainAttachCall!)
      ]
      const beginOrder = mockExecSQL.mock.invocationCallOrder[
        mockExecSQL.mock.calls.findIndex((c) => c[0] === 'BEGIN TRANSACTION')
      ]
      expect(attachOrder).toBeLessThan(beginOrder)
    })

    it('detaches new_main even when the transaction rolls back, so a retry on the same connection can re-attach it', async () => {
      mockQueryOne.mockResolvedValueOnce(null)
      mockExecSQL.mockImplementation(async (sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO workspace.wallet')) {
          throw new Error('copy failed')
        }
      })

      await expect(migrateLegacyInstallation(1, 'dek-app', 'dek-shared')).rejects.toThrow('copy failed')

      expect(mockDetachDatabase).toHaveBeenCalledWith('new_main')
    })

    it('copies shared entities, then workspace entities in between dropping and recreating the sensitive triggers', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await migrateLegacyInstallation(1, 'dek-app', 'dek-shared')

      const calls = mockExecSQL.mock.calls.map((c) => c[0] as string)
      const sharedCopyIdx = calls.findIndex((sql) => sql.includes('INSERT INTO shared.tag '))
      const dropIdx = calls.findIndex((sql) => sql.includes('DROP TRIGGER workspace.trg_default_wallet'))
      const workspaceCopyIdx = calls.findIndex((sql) => sql.includes('INSERT INTO workspace.wallet '))
      const recreateIdx = calls.findIndex((sql) => sql.includes('CREATE TRIGGER workspace.trg_default_wallet'))

      expect(sharedCopyIdx).toBeGreaterThanOrEqual(0)
      expect(dropIdx).toBeGreaterThan(sharedCopyIdx)
      expect(workspaceCopyIdx).toBeGreaterThan(dropIdx)
      expect(recreateIdx).toBeGreaterThan(workspaceCopyIdx)
    })

    it('tags moved notifications with the given default workspace id', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await migrateLegacyInstallation(42, 'dek-app', 'dek-shared')

      const calls = mockExecSQL.mock.calls.map((c) => c[0] as string)
      const notificationCall = calls.find((sql) => sql.includes('INSERT INTO shared.notification'))
      expect(notificationCall).toContain('SELECT id, 42,')
    })

    it('backfills tag_references from workspace-qualified tables after the copy', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await migrateLegacyInstallation(1, 'dek-app', 'dek-shared')

      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('FROM workspace.trx_base'))
    })

    it('builds the new_main replacement schema/keep-data and sets the topology_version marker there, then swaps it in', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await migrateLegacyInstallation(1, 'dek-app', 'dek-shared')

      expect(mockAttachDatabase).toHaveBeenCalledWith('new_main', NEW_MAIN_TEMP_FILENAME, 'dek-app')
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE new_main.app_settings'))
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO new_main.app_settings'))
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringMatching(/new_main\.app_settings[\s\S]*topology_version/),
        [String(TOPOLOGY_VERSION)]
      )
      expect(mockDetachDatabase).toHaveBeenCalledWith('new_main')

      // The swap happens only after COMMIT
      const commitIdx = mockExecSQL.mock.calls.map((c) => c[0]).indexOf('COMMIT')
      expect(commitIdx).toBeGreaterThanOrEqual(0)
      expect(mockFinalizeMainRebuild).toHaveBeenCalled()
    })

    it('does nothing with linked installations when the blob is absent', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await migrateLegacyInstallation(1, 'dek-app', 'dek-shared')

      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO linked_device'), expect.anything())
      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining("DELETE FROM app_settings WHERE key = 'linked_installations'"))
    })

    it('converts an object-shaped linked_installations blob into linked_device rows', async () => {
      mockQueryOne.mockResolvedValueOnce({
        value: JSON.stringify({ 'device-1': 'pubkey-1', 'device-2': 'pubkey-2' }),
      })

      await migrateLegacyInstallation(1, 'dek-app', 'dek-shared')

      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO linked_device'), ['device-1', 'pubkey-1'])
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO linked_device'), ['device-2', 'pubkey-2'])
      expect(mockExecSQL).toHaveBeenCalledWith("DELETE FROM app_settings WHERE key = 'linked_installations'")
    })

    it('converts a legacy array-shaped linked_installations blob (no key material)', async () => {
      mockQueryOne.mockResolvedValueOnce({ value: JSON.stringify(['device-1', 'device-2']) })

      await migrateLegacyInstallation(1, 'dek-app', 'dek-shared')

      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO linked_device'), ['device-1', ''])
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO linked_device'), ['device-2', ''])
    })

    it('tolerates a malformed linked_installations blob by skipping conversion', async () => {
      mockQueryOne.mockResolvedValueOnce({ value: 'not-json' })

      await migrateLegacyInstallation(1, 'dek-app', 'dek-shared')

      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO linked_device'), expect.anything())
      expect(mockExecSQL).toHaveBeenCalledWith("DELETE FROM app_settings WHERE key = 'linked_installations'")
    })

    it('rolls back, rethrows, and never swaps the file when a statement fails', async () => {
      mockQueryOne.mockResolvedValueOnce(null)
      mockExecSQL.mockImplementation(async (sql: string) => {
        if (typeof sql === 'string' && sql.includes('INSERT INTO workspace.wallet')) {
          throw new Error('copy failed')
        }
      })

      await expect(migrateLegacyInstallation(1, 'dek-app', 'dek-shared')).rejects.toThrow('copy failed')

      const calls = mockExecSQL.mock.calls.map((c) => c[0])
      expect(calls[calls.length - 1]).toBe('ROLLBACK')
      expect(mockFinalizeMainRebuild).not.toHaveBeenCalled()
    })
  })
})
