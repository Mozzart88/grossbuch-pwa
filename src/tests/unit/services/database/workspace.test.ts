import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database/connection', () => ({
  attachDatabase: vi.fn().mockResolvedValue(undefined),
  detachDatabase: vi.fn().mockResolvedValue(undefined),
  execSQL: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn().mockResolvedValue(null),
  validateReferenceExists: vi.fn().mockResolvedValue(false),
}))

vi.mock('../../../../services/database/workspaceMigrations', () => ({
  runWorkspaceMigrations: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../services/database/tempViews', () => ({
  createTempViews: vi.fn().mockResolvedValue(undefined),
}))

import {
  attachActiveWorkspace,
  switchWorkspace,
  setSessionDekShared,
  getActiveWorkspaceId,
  clearWorkspaceSession,
} from '../../../../services/database/workspace'
import { attachDatabase, detachDatabase, execSQL, queryOne, validateReferenceExists } from '../../../../services/database/connection'
import { runWorkspaceMigrations } from '../../../../services/database/workspaceMigrations'
import { createTempViews } from '../../../../services/database/tempViews'

const mockAttachDatabase = vi.mocked(attachDatabase)
const mockDetachDatabase = vi.mocked(detachDatabase)
const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)
const mockValidateReferenceExists = vi.mocked(validateReferenceExists)
const mockRunWorkspaceMigrations = vi.mocked(runWorkspaceMigrations)
const mockCreateTempViews = vi.mocked(createTempViews)

describe('workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAttachDatabase.mockResolvedValue(undefined)
    mockDetachDatabase.mockResolvedValue(undefined)
    mockExecSQL.mockResolvedValue(undefined)
    mockQueryOne.mockResolvedValue(null)
    mockValidateReferenceExists.mockResolvedValue(false)
    mockRunWorkspaceMigrations.mockResolvedValue(undefined)
    mockCreateTempViews.mockResolvedValue(undefined)
    clearWorkspaceSession()
  })

  describe('attachActiveWorkspace', () => {
    it('uses the stored active workspace id when it still exists', async () => {
      mockQueryOne.mockResolvedValueOnce({ value: '7' }) // active_workspace_id
      mockValidateReferenceExists.mockResolvedValueOnce(true)

      await attachActiveWorkspace('dekshared123')

      expect(mockAttachDatabase).toHaveBeenCalledWith('workspace', '/workspace-7.db', 'dekshared123')
      expect(mockRunWorkspaceMigrations).toHaveBeenCalled()
      expect(mockCreateTempViews).toHaveBeenCalled()
      expect(getActiveWorkspaceId()).toBe(7)
    })

    it('falls back to an existing workspace when no active id is stored', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // no stored active_workspace_id
        .mockResolvedValueOnce({ id: 3 }) // existing shared.workspace row

      await attachActiveWorkspace('dekshared123')

      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO shared.workspace'), expect.anything())
      expect(mockAttachDatabase).toHaveBeenCalledWith('workspace', '/workspace-3.db', 'dekshared123')
      expect(getActiveWorkspaceId()).toBe(3)
    })

    it('creates a default workspace when none exist at all', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // no stored active_workspace_id
        .mockResolvedValueOnce(null) // no existing shared.workspace row
        .mockResolvedValueOnce({ id: 1 }) // freshly created row

      await attachActiveWorkspace('dekshared123')

      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO shared.workspace (name) VALUES ('Personal')"))
      expect(mockAttachDatabase).toHaveBeenCalledWith('workspace', '/workspace-1.db', 'dekshared123')
      expect(getActiveWorkspaceId()).toBe(1)
    })

    it('falls back to default when the stored active id no longer exists', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ value: '99' }) // stale stored id
        .mockResolvedValueOnce({ id: 2 }) // existing workspace found on fallback
      mockValidateReferenceExists.mockResolvedValueOnce(false)

      await attachActiveWorkspace('dekshared123')

      expect(mockAttachDatabase).toHaveBeenCalledWith('workspace', '/workspace-2.db', 'dekshared123')
      expect(getActiveWorkspaceId()).toBe(2)
    })
  })

  describe('switchWorkspace', () => {
    it('throws when no session is active', async () => {
      await expect(switchWorkspace(2)).rejects.toThrow('No active session')
    })

    it('throws when the target workspace does not exist', async () => {
      mockQueryOne.mockResolvedValueOnce({ value: '1' })
      mockValidateReferenceExists.mockResolvedValueOnce(true)
      await attachActiveWorkspace('dekshared123')

      mockValidateReferenceExists.mockResolvedValueOnce(false)
      await expect(switchWorkspace(999)).rejects.toThrow('Workspace not found')
    })

    it('detaches, attaches the new workspace, and persists it as active', async () => {
      mockQueryOne.mockResolvedValueOnce({ value: '1' })
      mockValidateReferenceExists.mockResolvedValueOnce(true)
      await attachActiveWorkspace('dekshared123')

      mockValidateReferenceExists.mockResolvedValueOnce(true)
      await switchWorkspace(2)

      expect(mockDetachDatabase).toHaveBeenCalledWith('workspace')
      expect(mockAttachDatabase).toHaveBeenCalledWith('workspace', '/workspace-2.db', 'dekshared123')
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('active_workspace_id'),
        ['2', expect.any(Number)]
      )
      expect(getActiveWorkspaceId()).toBe(2)
    })

    it('never detaches or attaches `shared` — only the `workspace` alias moves between files (8.7, 8.16)', async () => {
      // switchWorkspace() only ever touches the 'workspace' alias (asserted
      // above). Since `shared` (tags/currencies/counterparties/notification)
      // is attached once at login and never detached/reattached here, edits
      // to shared entities are visible identically regardless of which
      // workspace is active (8.7) — and conversely, workspace-scoped data
      // (trx_base/budget/account/...) is only ever reachable through the
      // `workspace` alias, which always points at exactly one physical file,
      // so switching workspaces makes the previous workspace's data
      // structurally unreachable rather than merely filtered out (8.16).
      mockQueryOne.mockResolvedValueOnce({ value: '1' })
      mockValidateReferenceExists.mockResolvedValueOnce(true)
      await attachActiveWorkspace('dekshared123')

      mockValidateReferenceExists.mockResolvedValueOnce(true)
      await switchWorkspace(2)

      expect(mockDetachDatabase).not.toHaveBeenCalledWith('shared')
      expect(mockAttachDatabase).not.toHaveBeenCalledWith('shared', expect.anything(), expect.anything())
      expect(mockDetachDatabase).toHaveBeenCalledTimes(1)
      expect(mockDetachDatabase).toHaveBeenCalledWith('workspace')
    })
  })

  describe('setSessionDekShared', () => {
    it('updates the key used by a subsequent switchWorkspace call', async () => {
      mockQueryOne.mockResolvedValueOnce({ value: '1' })
      mockValidateReferenceExists.mockResolvedValueOnce(true)
      await attachActiveWorkspace('oldkey')

      setSessionDekShared('newkey')
      mockValidateReferenceExists.mockResolvedValueOnce(true)
      await switchWorkspace(2)

      expect(mockAttachDatabase).toHaveBeenCalledWith('workspace', '/workspace-2.db', 'newkey')
    })
  })

  describe('clearWorkspaceSession', () => {
    it('resets active workspace id and the session key', async () => {
      mockQueryOne.mockResolvedValueOnce({ value: '1' })
      mockValidateReferenceExists.mockResolvedValueOnce(true)
      await attachActiveWorkspace('dekshared123')
      expect(getActiveWorkspaceId()).toBe(1)

      clearWorkspaceSession()

      expect(getActiveWorkspaceId()).toBeNull()
      await expect(switchWorkspace(2)).rejects.toThrow('No active session')
    })
  })
})
