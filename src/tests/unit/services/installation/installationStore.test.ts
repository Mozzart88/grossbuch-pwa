import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUpsert = vi.fn()
vi.mock('../../../../services/repositories/linkedDeviceRepository', () => ({
  linkedDeviceRepository: {
    upsert: (...args: unknown[]) => mockUpsert(...args),
  },
}))

import { saveLinkedInstallation } from '../../../../services/installation/installationStore'

describe('installationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue(undefined)
  })

  describe('saveLinkedInstallation', () => {
    it('upserts without a name when none is given', async () => {
      await saveLinkedInstallation('uuid-1', 'pub-key-1')

      expect(mockUpsert).toHaveBeenCalledWith('uuid-1', 'pub-key-1')
    })

    it('upserts with the given name', async () => {
      await saveLinkedInstallation('uuid-1', 'pub-key-1', 'My Phone')

      expect(mockUpsert).toHaveBeenCalledWith('uuid-1', 'pub-key-1', 'My Phone')
    })

    it('swallows errors from the repository', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockUpsert.mockRejectedValueOnce(new Error('db error'))

      await expect(saveLinkedInstallation('uuid-1', 'pub-key-1')).resolves.toBeUndefined()

      expect(consoleWarn).toHaveBeenCalledWith('[installationStore] Failed to save linked installation:', expect.any(Error))
      consoleWarn.mockRestore()
    })
  })
})
