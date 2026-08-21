import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  runSQL: vi.fn(),
  getLastInsertId: vi.fn(),
}))

import { linkedDeviceRepository } from '../../../services/repositories/linkedDeviceRepository'
import { execSQL, querySQL, queryOne } from '../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)

const device = {
  id: 'device-1',
  name: 'My Phone',
  public_key: 'pubkey-1',
  linked_at: 1000,
  workspace_scope: null,
}

describe('linkedDeviceRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('findAll', () => {
    it('returns every linked device ordered by linked_at', async () => {
      mockQuerySQL.mockResolvedValue([device])

      const result = await linkedDeviceRepository.findAll()

      expect(result).toEqual([device])
      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY linked_at ASC')
      )
    })

    it('returns an empty array when none are linked', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await linkedDeviceRepository.findAll()

      expect(result).toEqual([])
    })
  })

  describe('findById', () => {
    it('returns the matching device', async () => {
      mockQueryOne.mockResolvedValue(device)

      const result = await linkedDeviceRepository.findById('device-1')

      expect(result).toEqual(device)
      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ?'),
        ['device-1']
      )
    })

    it('returns null when no device matches', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await linkedDeviceRepository.findById('missing')

      expect(result).toBeNull()
    })
  })

  describe('upsert', () => {
    it('inserts id/name/public_key and updates both on conflict when a name is given', async () => {
      await linkedDeviceRepository.upsert('device-1', 'pubkey-1', 'My Phone')

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO linked_device (id, name, public_key)'),
        ['device-1', 'My Phone', 'pubkey-1']
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('DO UPDATE SET public_key = excluded.public_key, name = excluded.name'),
        expect.anything()
      )
    })

    it('inserts id/public_key only and leaves name untouched on conflict when no name is given', async () => {
      await linkedDeviceRepository.upsert('device-1', 'pubkey-1')

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO linked_device (id, public_key)'),
        ['device-1', 'pubkey-1']
      )
      const [sql] = mockExecSQL.mock.calls[0]
      expect(sql).not.toContain('name')
    })
  })

  describe('remove', () => {
    it('deletes the device by id', async () => {
      await linkedDeviceRepository.remove('device-1')

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM linked_device WHERE id = ?'),
        ['device-1']
      )
    })
  })

  describe('removeAll', () => {
    it('deletes every linked device', async () => {
      await linkedDeviceRepository.removeAll()

      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM linked_device')
    })
  })
})
