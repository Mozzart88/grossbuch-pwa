import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all dependencies
const mockQueryOne = vi.fn()
const mockSetSuppressWriteNotifications = vi.fn()

vi.mock('../../../../services/database/connection', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  querySQL: vi.fn().mockResolvedValue([]),
  setSuppressWriteNotifications: (...args: unknown[]) => mockSetSuppressWriteNotifications(...args),
}))

const mockSettingsGet = vi.fn()
vi.mock('../../../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: (...args: unknown[]) => mockSettingsGet(...args),
  },
}))

const mockExportSyncPackage = vi.fn()
vi.mock('../../../../services/sync/syncExport', () => ({
  exportSyncPackage: (...args: unknown[]) => mockExportSyncPackage(...args),
}))

const mockImportSyncPackage = vi.fn()
vi.mock('../../../../services/sync/syncImport', () => ({
  importSyncPackage: (...args: unknown[]) => mockImportSyncPackage(...args),
}))

const mockEncryptSyncPackage = vi.fn()
const mockDecryptSyncPackage = vi.fn()
vi.mock('../../../../services/sync/syncCrypto', () => ({
  encryptSyncPackage: (...args: unknown[]) => mockEncryptSyncPackage(...args),
  decryptSyncPackage: (...args: unknown[]) => mockDecryptSyncPackage(...args),
}))

const mockEnsureSyncState = vi.fn()
const mockUpdatePushTimestamp = vi.fn()
const mockUpdateSyncTimestamp = vi.fn()
const mockHasUnpushedChanges = vi.fn()
vi.mock('../../../../services/sync/syncRepository', () => ({
  ensureSyncState: (...args: unknown[]) => mockEnsureSyncState(...args),
  updatePushTimestamp: (...args: unknown[]) => mockUpdatePushTimestamp(...args),
  updateSyncTimestamp: (...args: unknown[]) => mockUpdateSyncTimestamp(...args),
  hasUnpushedChanges: (...args: unknown[]) => mockHasUnpushedChanges(...args),
}))

const mockDropTriggers = vi.fn()
const mockRestoreTriggers = vi.fn()
vi.mock('../../../../services/sync/syncTriggers', () => ({
  dropUpdatedAtTriggers: (...args: unknown[]) => mockDropTriggers(...args),
  restoreUpdatedAtTriggers: (...args: unknown[]) => mockRestoreTriggers(...args),
}))

const mockApiPush = vi.fn()
const mockApiPull = vi.fn()
const mockApiAck = vi.fn()
vi.mock('../../../../services/sync/syncApi', () => ({
  push: (...args: unknown[]) => mockApiPush(...args),
  pull: (...args: unknown[]) => mockApiPull(...args),
  ack: (...args: unknown[]) => mockApiAck(...args),
}))

const mockSyncSingleRate = vi.fn()
vi.mock('../../../../services/exchangeRate/exchangeRateSync', () => ({
  syncSingleRate: (...args: unknown[]) => mockSyncSingleRate(...args),
}))

const { pushSync, pullSync, hasUnpushedChanges } = await import('../../../../services/sync/index')

describe('sync index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDropTriggers.mockResolvedValue(undefined)
    mockRestoreTriggers.mockResolvedValue(undefined)
  })

  describe('pushSync', () => {
    it('returns false when no installation data', async () => {
      mockSettingsGet.mockResolvedValue(null)

      const result = await pushSync()
      expect(result).toBe(false)
    })

    it('returns false when installation data is invalid JSON', async () => {
      mockSettingsGet.mockResolvedValue('not valid json')

      const result = await pushSync()
      expect(result).toBe(false)
    })

    it('returns false when linked_installations is invalid JSON', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        if (key === 'linked_installations') return 'not valid json'
        return null
      })

      const result = await pushSync()
      expect(result).toBe(false)
    })

    it('returns false when linked_installations is not an object', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        if (key === 'linked_installations') return '"just a string"'
        return null
      })

      const result = await pushSync()
      expect(result).toBe(false)
    })

    it('returns false when no JWT', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1' })
        return null
      })

      const result = await pushSync()
      expect(result).toBe(false)
    })

    it('returns false when no linked installations', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        if (key === 'linked_installations') return null
        return null
      })

      const result = await pushSync()
      expect(result).toBe(false)
    })

    it('returns false when no unpushed changes', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        if (key === 'linked_installations') return JSON.stringify({ 'other-id': 'public-key' })
        return null
      })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 100 })
      mockHasUnpushedChanges.mockResolvedValue(false)

      const result = await pushSync()
      expect(result).toBe(false)
    })

    it('exports, encrypts, and pushes when changes exist', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        if (key === 'linked_installations') return JSON.stringify({ 'other-id': 'public-key' })
        return null
      })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 100 })
      mockHasUnpushedChanges.mockResolvedValue(true)

      const mockPkg = { version: 1, sender_id: 'inst-1' }
      mockExportSyncPackage.mockResolvedValue(mockPkg)
      const mockEncrypted = { sender_id: 'inst-1', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockEncryptSyncPackage.mockResolvedValue(mockEncrypted)
      mockApiPush.mockResolvedValue({ success: true })

      const result = await pushSync()

      expect(result).toBe(true)
      expect(mockExportSyncPackage).toHaveBeenCalledWith(100, 'inst-1')
      expect(mockEncryptSyncPackage).toHaveBeenCalledWith(mockPkg, [{ installation_id: 'other-id', public_key: 'public-key' }])
      expect(mockApiPush).toHaveBeenCalledWith({ package: mockEncrypted }, 'token')
      expect(mockUpdatePushTimestamp).toHaveBeenCalledWith('inst-1', expect.any(Number))
    })

    it('suppresses write notifications around updatePushTimestamp', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        if (key === 'linked_installations') return JSON.stringify({ 'other-id': 'public-key' })
        return null
      })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 100 })
      mockHasUnpushedChanges.mockResolvedValue(true)
      mockExportSyncPackage.mockResolvedValue({ version: 1, sender_id: 'inst-1' })
      mockEncryptSyncPackage.mockResolvedValue({ sender_id: 'inst-1', iv: 'iv', ciphertext: 'ct', recipient_keys: [] })
      mockApiPush.mockResolvedValue({ success: true })

      await pushSync()

      const suppressCalls = mockSetSuppressWriteNotifications.mock.calls.map((c: unknown[]) => c[0])
      const trueIdx = suppressCalls.indexOf(true)
      const falseIdx = suppressCalls.lastIndexOf(false)
      expect(trueIdx).toBeGreaterThanOrEqual(0)
      expect(falseIdx).toBeGreaterThan(trueIdx)
    })

    it('restores write notifications even if updatePushTimestamp throws', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        if (key === 'linked_installations') return JSON.stringify({ 'other-id': 'public-key' })
        return null
      })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 100 })
      mockHasUnpushedChanges.mockResolvedValue(true)
      mockExportSyncPackage.mockResolvedValue({ version: 1, sender_id: 'inst-1' })
      mockEncryptSyncPackage.mockResolvedValue({ sender_id: 'inst-1', iv: 'iv', ciphertext: 'ct', recipient_keys: [] })
      mockApiPush.mockResolvedValue({ success: true })
      mockUpdatePushTimestamp.mockRejectedValueOnce(new Error('db error'))

      await expect(pushSync()).rejects.toThrow('db error')

      expect(mockSetSuppressWriteNotifications).toHaveBeenCalledWith(true)
      expect(mockSetSuppressWriteNotifications).toHaveBeenCalledWith(false)
    })
  })

  describe('pullSync', () => {
    it('returns empty when no installation data', async () => {
      mockSettingsGet.mockResolvedValue(null)

      const result = await pullSync()
      expect(result).toEqual([])
    })

    it('returns empty when no private key', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockQueryOne.mockResolvedValue(null) // no private key

      const result = await pullSync()
      expect(result).toEqual([])
    })

    it('returns empty when no packages available', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })
      mockApiPull.mockResolvedValue({ packages: [] })

      const result = await pullSync()
      expect(result).toEqual([])
    })

    it('decrypts, imports, and acknowledges packages', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })

      const encPkg = { sender_id: 'other', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockApiPull.mockResolvedValue({
        packages: [{ id: 'pkg-1', package: encPkg }],
      })

      const decryptedPkg = { version: 1, sender_id: 'other' }
      mockDecryptSyncPackage.mockResolvedValue(decryptedPkg)

      const importResult = { imported: {}, newAccountCurrencyIds: [], conflicts: 0, errors: [] }
      mockImportSyncPackage.mockResolvedValue(importResult)
      mockApiAck.mockResolvedValue({ success: true })

      const results = await pullSync()

      expect(results).toHaveLength(1)
      expect(mockDecryptSyncPackage).toHaveBeenCalledWith(encPkg, 'inst-1', 'private-key-data')
      expect(mockImportSyncPackage).toHaveBeenCalledWith(decryptedPkg)
      expect(mockApiAck).toHaveBeenCalledWith({ package_ids: ['pkg-1'] }, 'token')
      expect(mockUpdateSyncTimestamp).toHaveBeenCalledWith('inst-1')
    })

    it('drops and restores triggers once per pull cycle', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })

      const encPkg = { sender_id: 'other', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockApiPull.mockResolvedValue({
        packages: [
          { id: 'pkg-1', package: encPkg },
          { id: 'pkg-2', package: encPkg },
        ],
      })

      mockDecryptSyncPackage.mockResolvedValue({ version: 1, sender_id: 'other' })
      mockImportSyncPackage.mockResolvedValue({ imported: {}, newAccountCurrencyIds: [], conflicts: 0, errors: [] })
      mockApiAck.mockResolvedValue({ success: true })

      await pullSync()

      // Triggers should be dropped/restored exactly once, not once per package
      expect(mockDropTriggers).toHaveBeenCalledTimes(1)
      expect(mockRestoreTriggers).toHaveBeenCalledTimes(1)
      // But import should be called twice (once per package)
      expect(mockImportSyncPackage).toHaveBeenCalledTimes(2)
    })

    it('restores triggers even when all packages fail', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })

      mockApiPull.mockResolvedValue({
        packages: [{ id: 'pkg-1', package: {} }],
      })

      mockDecryptSyncPackage.mockRejectedValue(new Error('decrypt error'))

      await pullSync()

      expect(mockDropTriggers).toHaveBeenCalledTimes(1)
      expect(mockRestoreTriggers).toHaveBeenCalledTimes(1)
    })

    it('does not drop triggers when no packages', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })
      mockApiPull.mockResolvedValue({ packages: [] })

      await pullSync()

      expect(mockDropTriggers).not.toHaveBeenCalled()
      expect(mockRestoreTriggers).not.toHaveBeenCalled()
    })

    it('suppresses write notifications during import loop', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })

      const encPkg = { sender_id: 'other', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockApiPull.mockResolvedValue({
        packages: [{ id: 'pkg-1', package: encPkg }],
      })

      const decryptedPkg = { version: 1, sender_id: 'other' }
      mockDecryptSyncPackage.mockResolvedValue(decryptedPkg)

      const importResult = { imported: {}, newAccountCurrencyIds: [], conflicts: 0, errors: [] }
      mockImportSyncPackage.mockResolvedValue(importResult)
      mockApiAck.mockResolvedValue({ success: true })

      await pullSync()

      expect(mockSetSuppressWriteNotifications).toHaveBeenCalledWith(true)
      expect(mockSetSuppressWriteNotifications).toHaveBeenCalledWith(false)

      // true must be called before false
      const calls = mockSetSuppressWriteNotifications.mock.calls.map((c: unknown[]) => c[0])
      const trueIdx = calls.indexOf(true)
      const falseIdx = calls.lastIndexOf(false)
      expect(trueIdx).toBeLessThan(falseIdx)
    })

    it('restores write notifications even on import failure', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })

      mockApiPull.mockResolvedValue({
        packages: [{ id: 'pkg-1', package: {} }],
      })

      mockDecryptSyncPackage.mockRejectedValue(new Error('decrypt error'))

      await pullSync()

      expect(mockSetSuppressWriteNotifications).toHaveBeenCalledWith(true)
      expect(mockSetSuppressWriteNotifications).toHaveBeenCalledWith(false)
    })

    it('continues processing on individual package failure', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'pk' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })

      mockApiPull.mockResolvedValue({
        packages: [
          { id: 'pkg-fail', package: {} },
          { id: 'pkg-ok', package: {} },
        ],
      })

      mockDecryptSyncPackage
        .mockRejectedValueOnce(new Error('decrypt error'))
        .mockResolvedValueOnce({ version: 1 })

      const importResult = { imported: {}, conflicts: 0, errors: [], newAccountCurrencyIds: [] }
      mockImportSyncPackage.mockResolvedValue(importResult)
      mockApiAck.mockResolvedValue({ success: true })

      const results = await pullSync()

      expect(results).toHaveLength(1)
      expect(mockApiAck).toHaveBeenCalledWith({ package_ids: ['pkg-ok'] }, 'token')
    })

    it('calls syncSingleRate for currencies without rates after import', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockQueryOne
        .mockResolvedValueOnce({ value: 'private-key-data' }) // private key
        .mockResolvedValueOnce(null) // no rate for currency 5
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })

      const encPkg = { sender_id: 'other', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockApiPull.mockResolvedValue({
        packages: [{ id: 'pkg-1', package: encPkg }],
      })

      mockDecryptSyncPackage.mockResolvedValue({ version: 1, sender_id: 'other' })
      mockImportSyncPackage.mockResolvedValue({
        imported: { accounts: 1 },
        newAccountCurrencyIds: [5],
        conflicts: 0,
        errors: [],
      })
      mockApiAck.mockResolvedValue({ success: true })
      mockSyncSingleRate.mockResolvedValue({ synced: true })

      await pullSync()

      expect(mockSyncSingleRate).toHaveBeenCalledWith(5)
    })

    it('does not call syncSingleRate when rate already exists', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockQueryOne
        .mockResolvedValueOnce({ value: 'private-key-data' }) // private key
        .mockResolvedValueOnce({ rate: 92 }) // rate exists for currency 5
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })

      const encPkg = { sender_id: 'other', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockApiPull.mockResolvedValue({
        packages: [{ id: 'pkg-1', package: encPkg }],
      })

      mockDecryptSyncPackage.mockResolvedValue({ version: 1, sender_id: 'other' })
      mockImportSyncPackage.mockResolvedValue({
        imported: { accounts: 1 },
        newAccountCurrencyIds: [5],
        conflicts: 0,
        errors: [],
      })
      mockApiAck.mockResolvedValue({ success: true })

      await pullSync()

      expect(mockSyncSingleRate).not.toHaveBeenCalled()
    })

    it('deduplicates currency IDs across multiple packages', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockQueryOne
        .mockResolvedValueOnce({ value: 'private-key-data' }) // private key
        .mockResolvedValueOnce(null) // no rate for currency 5
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })

      const encPkg = { sender_id: 'other', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockApiPull.mockResolvedValue({
        packages: [
          { id: 'pkg-1', package: encPkg },
          { id: 'pkg-2', package: encPkg },
        ],
      })

      mockDecryptSyncPackage.mockResolvedValue({ version: 1, sender_id: 'other' })
      mockImportSyncPackage
        .mockResolvedValueOnce({ imported: { accounts: 1 }, newAccountCurrencyIds: [5], conflicts: 0, errors: [] })
        .mockResolvedValueOnce({ imported: { accounts: 1 }, newAccountCurrencyIds: [5], conflicts: 0, errors: [] })
      mockApiAck.mockResolvedValue({ success: true })
      mockSyncSingleRate.mockResolvedValue({ synced: true })

      await pullSync()

      // Should only call syncSingleRate once for currency 5, not twice
      expect(mockSyncSingleRate).toHaveBeenCalledTimes(1)
      expect(mockSyncSingleRate).toHaveBeenCalledWith(5)
    })
  })

  describe('hasUnpushedChanges', () => {
    it('returns false when no installation data', async () => {
      mockSettingsGet.mockResolvedValue(null)

      const result = await hasUnpushedChanges()
      expect(result).toBe(false)
    })

    it('delegates to syncRepository', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'inst-1', jwt: 'token' })
        return null
      })
      mockHasUnpushedChanges.mockResolvedValue(true)

      const result = await hasUnpushedChanges()
      expect(result).toBe(true)
      expect(mockHasUnpushedChanges).toHaveBeenCalledWith('inst-1')
    })
  })
})
