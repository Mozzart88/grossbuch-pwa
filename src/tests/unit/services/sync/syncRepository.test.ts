import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecSQL = vi.fn()
const mockQuerySQL = vi.fn()
const mockQueryOne = vi.fn()

vi.mock('../../../../services/database/connection', () => ({
  execSQL: (...args: unknown[]) => mockExecSQL(...args),
  querySQL: (...args: unknown[]) => mockQuerySQL(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

const {
  getSyncState,
  ensureSyncState,
  updatePushTimestamp,
  updateSyncTimestamp,
  getDeletionsSince,
  recordDeletion,
  getLastPushTimestamp,
  hasUnpushedChanges,
} = await import('../../../../services/sync/syncRepository')

describe('syncRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSyncState', () => {
    it('queries sync_state by installation_id', async () => {
      const state = { installation_id: 'inst-1', last_sync_at: 100, last_push_at: 200 }
      mockQueryOne.mockResolvedValue(state)

      const result = await getSyncState('inst-1')

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['inst-1']
      )
      expect(result).toEqual(state)
    })

    it('returns null when no state exists', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await getSyncState('unknown')
      expect(result).toBeNull()
    })
  })

  describe('ensureSyncState', () => {
    it('returns existing state if found', async () => {
      const state = { installation_id: 'inst-1', last_sync_at: 100, last_push_at: 200 }
      mockQueryOne.mockResolvedValue(state)

      const result = await ensureSyncState('inst-1')
      expect(result).toEqual(state)
      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('inserts and returns default state if not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await ensureSyncState('inst-1')

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE'),
        ['inst-1']
      )
      expect(result).toEqual({
        installation_id: 'inst-1',
        last_sync_at: 0,
        last_push_at: 0,
      })
    })
  })

  describe('updatePushTimestamp', () => {
    it('updates last_push_at for installation with explicit timestamp', async () => {
      const timestamp = 1700000000
      await updatePushTimestamp('inst-1', timestamp)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sync_state SET last_push_at'),
        [timestamp, 'inst-1']
      )
    })
  })

  describe('updateSyncTimestamp', () => {
    it('updates last_sync_at for installation', async () => {
      await updateSyncTimestamp('inst-1')

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sync_state SET last_sync_at'),
        ['inst-1']
      )
    })
  })

  describe('getDeletionsSince', () => {
    it('queries sync_deletions with timestamp', async () => {
      const deletions = [{ entity: 'tag', entity_id: '12', deleted_at: 500 }]
      mockQuerySQL.mockResolvedValue(deletions)

      const result = await getDeletionsSince(100)

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('sync_deletions WHERE deleted_at >= ?'),
        [100]
      )
      expect(result).toEqual(deletions)
    })
  })

  describe('recordDeletion', () => {
    it('inserts or replaces deletion record', async () => {
      await recordDeletion('wallet', 'My Wallet')

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO sync_deletions'),
        ['wallet', 'My Wallet']
      )
    })
  })

  describe('getLastPushTimestamp', () => {
    it('returns last_push_at from sync_state', async () => {
      mockQueryOne.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 500 })

      const result = await getLastPushTimestamp('inst-1')
      expect(result).toBe(500)
    })

    it('returns 0 when no state exists', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await getLastPushTimestamp('unknown')
      expect(result).toBe(0)
    })
  })

  describe('hasUnpushedChanges', () => {
    it('returns true when changes exist', async () => {
      // First call: getSyncState
      mockQueryOne
        .mockResolvedValueOnce({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 100 })
        // Second call: UNION ALL count
        .mockResolvedValueOnce({ cnt: 3 })

      const result = await hasUnpushedChanges('inst-1')
      expect(result).toBe(true)
    })

    it('returns false when no changes', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 100 })
        .mockResolvedValueOnce({ cnt: 0 })

      const result = await hasUnpushedChanges('inst-1')
      expect(result).toBe(false)
    })

    it('returns false when no sync state exists', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // getSyncState returns null
        .mockResolvedValueOnce({ cnt: 0 })

      const result = await hasUnpushedChanges('inst-1')
      expect(result).toBe(false)
    })

    it('returns false when count query returns null', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 100 })
        .mockResolvedValueOnce(null) // COUNT returns null

      const result = await hasUnpushedChanges('inst-1')
      expect(result).toBe(false)
    })
  })
})
