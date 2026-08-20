import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database/connection', () => ({
  attachDatabase: vi.fn().mockResolvedValue(undefined),
  detachDatabase: vi.fn().mockResolvedValue(undefined),
  querySQL: vi.fn().mockResolvedValue([]),
  queryOne: vi.fn().mockResolvedValue({ name: 'Personal' }),
}))

vi.mock('../../../../services/database/workspace', () => ({
  getActiveWorkspaceId: vi.fn().mockReturnValue(1),
  getSessionDekShared: vi.fn().mockReturnValue('dek-shared'),
}))

import { exportWorkspacePackage } from '../../../../services/workspaceTransfer/workspaceExport'
import { attachDatabase, detachDatabase, querySQL } from '../../../../services/database/connection'
import { getActiveWorkspaceId } from '../../../../services/database/workspace'

const mockAttachDatabase = vi.mocked(attachDatabase)
const mockDetachDatabase = vi.mocked(detachDatabase)
const mockQuerySQL = vi.mocked(querySQL)
const mockGetActiveWorkspaceId = vi.mocked(getActiveWorkspaceId)

describe('exportWorkspacePackage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAttachDatabase.mockResolvedValue(undefined)
    mockDetachDatabase.mockResolvedValue(undefined)
    mockQuerySQL.mockResolvedValue([])
    mockGetActiveWorkspaceId.mockReturnValue(1)
  })

  it('reads directly from the `workspace` alias when exporting the active workspace, without attaching another file (8.10)', async () => {
    mockGetActiveWorkspaceId.mockReturnValue(1)

    await exportWorkspacePackage(1)

    expect(mockAttachDatabase).not.toHaveBeenCalled()
    expect(mockDetachDatabase).not.toHaveBeenCalled()
    expect(mockQuerySQL).toHaveBeenCalledWith(expect.stringContaining('FROM workspace.wallet'))
    expect(mockQuerySQL).not.toHaveBeenCalledWith(expect.stringContaining('FROM export_ws.wallet'))
  })

  it('attaches only the target workspace file under a temp alias when exporting a non-active workspace, and detaches it afterward (8.10)', async () => {
    mockGetActiveWorkspaceId.mockReturnValue(1) // some other workspace is active

    await exportWorkspacePackage(2)

    // Only workspace-2's own file is ever attached — no other workspace's
    // data is reachable through the export_ws alias, so it cannot leak in.
    expect(mockAttachDatabase).toHaveBeenCalledWith('export_ws', '/workspace-2.db', 'dek-shared')
    expect(mockQuerySQL).toHaveBeenCalledWith(expect.stringContaining('FROM export_ws.wallet'))
    expect(mockQuerySQL).not.toHaveBeenCalledWith(expect.stringContaining('FROM workspace.wallet'))
    expect(mockDetachDatabase).toHaveBeenCalledWith('export_ws')
  })

  it('detaches the temp alias even when export fails partway through', async () => {
    mockGetActiveWorkspaceId.mockReturnValue(1)
    mockQuerySQL.mockRejectedValueOnce(new Error('boom'))

    await expect(exportWorkspacePackage(2)).rejects.toThrow('boom')

    expect(mockDetachDatabase).toHaveBeenCalledWith('export_ws')
  })
})
