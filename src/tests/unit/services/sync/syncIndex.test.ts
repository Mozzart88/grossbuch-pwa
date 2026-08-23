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
const mockSettingsSet = vi.fn()
const mockSettingsDelete = vi.fn()
vi.mock('../../../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: (...args: unknown[]) => mockSettingsGet(...args),
    set: (...args: unknown[]) => mockSettingsSet(...args),
    delete: (...args: unknown[]) => mockSettingsDelete(...args),
  },
}))

const mockLinkedDeviceFindAll = vi.fn()
vi.mock('../../../../services/repositories/linkedDeviceRepository', () => ({
  linkedDeviceRepository: {
    findAll: (...args: unknown[]) => mockLinkedDeviceFindAll(...args),
  },
}))

function linkedDevices(entries: Record<string, string>) {
  return Object.entries(entries).map(([id, public_key]) => ({
    id, name: 'x', public_key, linked_at: 0, workspace_scope: null,
  }))
}

const mockExportSyncPackage = vi.fn()
const mockExportChunkedSyncPackages = vi.fn()
vi.mock('../../../../services/sync/syncExport', () => ({
  exportSyncPackage: (...args: unknown[]) => mockExportSyncPackage(...args),
  exportChunkedSyncPackages: (...args: unknown[]) => mockExportChunkedSyncPackages(...args),
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

const { pushSync, pullSync, hasUnpushedChanges, sendUnlinkCommand, sendUnlinkConfirmation, sendRenameCommand, getInstallationData } = await import('../../../../services/sync/index')

describe('sync index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDropTriggers.mockResolvedValue(undefined)
    mockRestoreTriggers.mockResolvedValue(undefined)
    mockLinkedDeviceFindAll.mockResolvedValue([])
    mockSettingsSet.mockResolvedValue(undefined)
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

    it('returns false when no JWT', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        return null
      })

      const result = await pushSync()
      expect(result).toBe(false)
    })

    it('returns false when no linked installations', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue([])

      const result = await pushSync()
      expect(result).toBe(false)
    })

    it('returns false when no unpushed changes', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue(linkedDevices({ 'other-id': 'public-key' }))
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 100 })
      mockHasUnpushedChanges.mockResolvedValue(false)

      const result = await pushSync()
      expect(result).toBe(false)
    })

    it('exports, encrypts, and pushes when changes exist', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue(linkedDevices({ 'other-id': 'public-key' }))
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
      expect(mockEncryptSyncPackage).toHaveBeenCalledWith(mockPkg, [{ installation_id: 'other-id', public_key: 'public-key', name: 'x' }])
      expect(mockApiPush).toHaveBeenCalledWith({ package: mockEncrypted }, 'token')
      expect(mockUpdatePushTimestamp).toHaveBeenCalledWith('inst-1', expect.any(Number))
    })

    it('suppresses write notifications around updatePushTimestamp', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue(linkedDevices({ 'other-id': 'public-key' }))
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
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue(linkedDevices({ 'other-id': 'public-key' }))
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

    it('full-history push: encrypts for target only and skips hasChanges check', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue(linkedDevices({ 'target-device': 'target-pub-key' }))

      const chunk1 = { version: 2, sender_id: 'inst-1' }
      const chunk2 = { version: 2, sender_id: 'inst-1' }
      mockExportChunkedSyncPackages.mockResolvedValue([chunk1, chunk2])
      const mockEncrypted = { sender_id: 'inst-1', iv: 'iv', ciphertext: 'ct', recipient_keys: [{ installation_id: 'target-device', encrypted_key: 'key' }] }
      mockEncryptSyncPackage.mockResolvedValue(mockEncrypted)
      mockApiPush.mockResolvedValue({ success: true })

      const result = await pushSync({ targetUuid: 'target-device' })

      expect(result).toBe(true)
      expect(mockExportChunkedSyncPackages).toHaveBeenCalledWith('inst-1')
      expect(mockEncryptSyncPackage).toHaveBeenCalledTimes(2)
      expect(mockEncryptSyncPackage).toHaveBeenCalledWith(chunk1, [{ installation_id: 'target-device', public_key: 'target-pub-key', name: 'x' }])
      expect(mockApiPush).toHaveBeenCalledTimes(2)
      expect(mockHasUnpushedChanges).not.toHaveBeenCalled()
      expect(mockUpdatePushTimestamp).not.toHaveBeenCalled()
    })

    it('returns false when targetUuid not in linked installations', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue(linkedDevices({ 'other-device': 'other-key' }))

      const result = await pushSync({ targetUuid: 'unknown-device' })
      expect(result).toBe(false)
      expect(mockExportChunkedSyncPackages).not.toHaveBeenCalled()
    })

    it('returns false when pending_initial_sync is set', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        if (key === 'pending_initial_sync') return '1'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue(linkedDevices({ 'other-id': 'public-key' }))
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })
      mockHasUnpushedChanges.mockResolvedValue(true)

      const result = await pushSync()
      expect(result).toBe(false)
      expect(mockExportSyncPackage).not.toHaveBeenCalled()
    })

    it('does not skip full-history push when pending_initial_sync is set', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        if (key === 'pending_initial_sync') return '1'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue(linkedDevices({ 'target-device': 'target-pub-key' }))

      mockExportChunkedSyncPackages.mockResolvedValue([{ version: 2, sender_id: 'inst-1' }])
      mockEncryptSyncPackage.mockResolvedValue({ sender_id: 'inst-1', iv: 'iv', ciphertext: 'ct', recipient_keys: [] })
      mockApiPush.mockResolvedValue({ success: true })

      const result = await pushSync({ targetUuid: 'target-device' })
      expect(result).toBe(true)
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
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockQueryOne.mockResolvedValue(null) // no private key

      const result = await pullSync()
      expect(result).toEqual([])
    })

    it('returns empty when no packages available', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
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
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
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
      expect(mockApiAck).toHaveBeenCalledWith({ installation_id: 'inst-1', package_ids: ['pkg-1'] }, 'token')
      expect(mockUpdateSyncTimestamp).toHaveBeenCalledWith('inst-1')
    })

    it('drops and restores triggers once per pull cycle', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
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
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
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
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
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
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
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
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
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
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
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
      expect(mockApiAck).toHaveBeenCalledWith({ installation_id: 'inst-1', package_ids: ['pkg-ok'] }, 'token')
    })

    it('calls syncSingleRate for currencies without rates after import', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
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
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
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

    it('clears pending_initial_sync and updates push timestamp when packages imported (flag is set)', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        if (key === 'pending_initial_sync') return '1'
        return null
      })
      mockSettingsDelete.mockResolvedValue(undefined)
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })

      const encPkg = { sender_id: 'other', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockApiPull.mockResolvedValue({ packages: [{ id: 'pkg-1', package: encPkg }] })
      mockDecryptSyncPackage.mockResolvedValue({ version: 1, sender_id: 'other' })
      mockImportSyncPackage.mockResolvedValue({ imported: { transactions: 1 }, newAccountCurrencyIds: [], conflicts: 0, errors: [] })
      mockApiAck.mockResolvedValue({ success: true })

      await pullSync()

      expect(mockUpdatePushTimestamp).toHaveBeenCalledWith('inst-1', expect.any(Number))
      expect(mockSettingsDelete).toHaveBeenCalledWith('pending_initial_sync')
    })

    it('updates push timestamp even when pending_initial_sync is NOT set', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        // pending_initial_sync NOT set
        return null
      })
      mockSettingsDelete.mockResolvedValue(undefined)
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })

      const encPkg = { sender_id: 'other', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockApiPull.mockResolvedValue({ packages: [{ id: 'pkg-1', package: encPkg }] })
      mockDecryptSyncPackage.mockResolvedValue({ version: 1, sender_id: 'other' })
      mockImportSyncPackage.mockResolvedValue({ imported: { transactions: 1 }, newAccountCurrencyIds: [], conflicts: 0, errors: [] })
      mockApiAck.mockResolvedValue({ success: true })

      await pullSync()

      // Must update push timestamp even when flag is not set (prevents echo)
      expect(mockUpdatePushTimestamp).toHaveBeenCalledWith('inst-1', expect.any(Number))
      // Flag was not set, so delete should NOT be called
      expect(mockSettingsDelete).not.toHaveBeenCalled()
    })

    it('uses the pre-import timestamp for updatePushTimestamp', async () => {
      const beforeCall = Math.floor(Date.now() / 1000)

      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })

      const encPkg = { sender_id: 'other', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockApiPull.mockResolvedValue({ packages: [{ id: 'pkg-1', package: encPkg }] })
      mockDecryptSyncPackage.mockResolvedValue({ version: 1, sender_id: 'other' })
      mockImportSyncPackage.mockResolvedValue({ imported: { transactions: 1 }, newAccountCurrencyIds: [], conflicts: 0, errors: [] })
      mockApiAck.mockResolvedValue({ success: true })

      await pullSync()

      const afterCall = Math.floor(Date.now() / 1000)
      const [, timestamp] = mockUpdatePushTimestamp.mock.calls[0] as [string, number]
      // Timestamp must be captured before (or at) the start of the call, not after
      expect(timestamp).toBeGreaterThanOrEqual(beforeCall)
      expect(timestamp).toBeLessThanOrEqual(afterCall)
    })

    it('does not clear pending_initial_sync when no packages were imported', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        if (key === 'pending_initial_sync') return '1'
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })
      mockApiPull.mockResolvedValue({ packages: [] })

      await pullSync()

      expect(mockSettingsDelete).not.toHaveBeenCalled()
      expect(mockUpdatePushTimestamp).not.toHaveBeenCalled()
    })

    it('does not clear pending_initial_sync when all packages failed to ack', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        if (key === 'pending_initial_sync') return '1'
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })
      mockApiPull.mockResolvedValue({ packages: [{ id: 'pkg-fail', package: {} }] })
      mockDecryptSyncPackage.mockRejectedValue(new Error('decrypt error'))

      await pullSync()

      expect(mockSettingsDelete).not.toHaveBeenCalled()
    })

    it('setSuppressWriteNotifications(false) is called when restoreUpdatedAtTriggers throws', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })
      mockApiPull.mockResolvedValue({ packages: [{ id: 'pkg-1', package: {} }] })
      mockDecryptSyncPackage.mockResolvedValue({ version: 1 })
      mockImportSyncPackage.mockResolvedValue({ imported: {}, newAccountCurrencyIds: [], conflicts: 0, errors: [] })
      mockRestoreTriggers.mockRejectedValueOnce(new Error('restore error'))

      await expect(pullSync()).rejects.toThrow('restore error')

      expect(mockSetSuppressWriteNotifications).toHaveBeenCalledWith(true)
      expect(mockSetSuppressWriteNotifications).toHaveBeenCalledWith(false)
    })

    it('setSuppressWriteNotifications(false) is called when dropUpdatedAtTriggers throws', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockQueryOne.mockResolvedValue({ value: 'private-key-data' })
      mockEnsureSyncState.mockResolvedValue({ installation_id: 'inst-1', last_sync_at: 0, last_push_at: 0 })
      mockApiPull.mockResolvedValue({ packages: [{ id: 'pkg-1', package: {} }] })
      mockDropTriggers.mockRejectedValueOnce(new Error('drop error'))

      await expect(pullSync()).rejects.toThrow('drop error')

      expect(mockSetSuppressWriteNotifications).toHaveBeenCalledWith(true)
      expect(mockSetSuppressWriteNotifications).toHaveBeenCalledWith(false)
    })

    it('deduplicates currency IDs across multiple packages', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
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

  describe('sendUnlinkCommand', () => {
    it('returns early when no installation data', async () => {
      mockSettingsGet.mockResolvedValue(null)
      await sendUnlinkCommand('target-id', true)
      expect(mockApiPush).not.toHaveBeenCalled()
    })

    it('returns early when no linked installations', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue([])
      await sendUnlinkCommand('target-id', true)
      expect(mockApiPush).not.toHaveBeenCalled()
    })

    it('encrypts command for all recipients and pushes', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue(linkedDevices({ 'device-a': 'pub-key-a', 'device-b': 'pub-key-b' }))
      const mockEncrypted = { sender_id: 'inst-1', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockEncryptSyncPackage.mockResolvedValue(mockEncrypted)
      mockApiPush.mockResolvedValue({ success: true })

      await sendUnlinkCommand('device-a', false)

      expect(mockEncryptSyncPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [{ type: 'unlink_device', target_installation_id: 'device-a', keep_data: false, initiator_id: 'inst-1' }],
        }),
        [
          { installation_id: 'device-a', public_key: 'pub-key-a', name: 'x' },
          { installation_id: 'device-b', public_key: 'pub-key-b', name: 'x' },
        ]
      )
      expect(mockApiPush).toHaveBeenCalledWith({ package: mockEncrypted }, 'token')
    })

    it('sends command package with empty data arrays', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue(linkedDevices({ 'device-a': 'pub-key-a' }))
      mockEncryptSyncPackage.mockResolvedValue({ sender_id: 'inst-1', iv: 'iv', ciphertext: 'ct', recipient_keys: [] })
      mockApiPush.mockResolvedValue({ success: true })

      await sendUnlinkCommand('device-a', true)

      const [pkg] = mockEncryptSyncPackage.mock.calls[0] as [{ icons: unknown[]; transactions: unknown[] }]
      expect(pkg.icons).toHaveLength(0)
      expect(pkg.transactions).toHaveLength(0)
    })
  })

  describe('sendUnlinkConfirmation', () => {
    it('sends unlink_confirm command encrypted only for initiator', async () => {
      const mockEncrypted = { sender_id: 'own-id', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockEncryptSyncPackage.mockResolvedValue(mockEncrypted)
      mockApiPush.mockResolvedValue({ success: true })

      await sendUnlinkConfirmation('own-id', 'own-jwt', 'initiator-id', 'initiator-pub-key')

      expect(mockEncryptSyncPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [{ type: 'unlink_confirm', target_installation_id: 'own-id' }],
        }),
        [{ installation_id: 'initiator-id', public_key: 'initiator-pub-key' }]
      )
      expect(mockApiPush).toHaveBeenCalledWith({ package: mockEncrypted }, 'own-jwt')
    })

    it('uses the provided jwt directly (works without DB)', async () => {
      mockEncryptSyncPackage.mockResolvedValue({ sender_id: 'own-id', iv: 'iv', ciphertext: 'ct', recipient_keys: [] })
      mockApiPush.mockResolvedValue({ success: true })

      await sendUnlinkConfirmation('own-id', 'custom-jwt', 'initiator-id', 'pub-key')

      expect(mockApiPush).toHaveBeenCalledWith(expect.anything(), 'custom-jwt')
      expect(mockSettingsGet).not.toHaveBeenCalled()
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
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockHasUnpushedChanges.mockResolvedValue(true)

      const result = await hasUnpushedChanges()
      expect(result).toBe(true)
      expect(mockHasUnpushedChanges).toHaveBeenCalledWith('inst-1')
    })
  })

  describe('sendRenameCommand', () => {
    it('returns early when no installation data', async () => {
      mockSettingsGet.mockResolvedValue(null)
      await sendRenameCommand('target-id', 'New Name')
      expect(mockApiPush).not.toHaveBeenCalled()
    })

    it('returns early when no linked installations', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue([])
      await sendRenameCommand('target-id', 'New Name')
      expect(mockApiPush).not.toHaveBeenCalled()
    })

    it('encrypts a rename_device command for all recipients and pushes', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        return null
      })
      mockLinkedDeviceFindAll.mockResolvedValue(linkedDevices({ 'device-a': 'pub-key-a' }))
      const mockEncrypted = { sender_id: 'inst-1', iv: 'iv', ciphertext: 'ct', recipient_keys: [] }
      mockEncryptSyncPackage.mockResolvedValue(mockEncrypted)
      mockApiPush.mockResolvedValue({ success: true })

      await sendRenameCommand('inst-1', 'My Laptop')

      expect(mockEncryptSyncPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [{ type: 'rename_device', target_installation_id: 'inst-1', name: 'My Laptop' }],
        }),
        [{ installation_id: 'device-a', public_key: 'pub-key-a', name: 'x' }]
      )
      expect(mockApiPush).toHaveBeenCalledWith({ package: mockEncrypted }, 'token')
    })
  })

  describe('getInstallationData', () => {
    it('returns null when nothing stored', async () => {
      mockSettingsGet.mockResolvedValue(null)
      const result = await getInstallationData()
      expect(result).toBeNull()
    })

    it('reads the split keys directly when already migrated', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'inst-1'
        if (key === 'jwt') return 'token'
        if (key === 'device_name') return 'My Phone'
        return null
      })

      const result = await getInstallationData()

      expect(result).toEqual({ id: 'inst-1', jwt: 'token', device_name: 'My Phone' })
      expect(mockSettingsSet).not.toHaveBeenCalled()
    })

    it('splits the legacy { id, jwt } blob into the three keys and guesses a device name', async () => {
      // Stateful: readInstallationData() self-corrects after the split writes 'jwt', so
      // the nested getInstallationData() call inside sendRenameCommand doesn't re-migrate
      // (a static mock here would make that nested call see the same unmigrated blob forever).
      let jwtWritten: string | null = null
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'legacy-id', jwt: 'legacy-jwt' })
        if (key === 'jwt') return jwtWritten
        return null
      })
      mockSettingsSet.mockImplementation((key: string, value: string) => {
        if (key === 'jwt') jwtWritten = value
        return Promise.resolve(undefined)
      })
      mockLinkedDeviceFindAll.mockResolvedValue([]) // no peers — no propagation expected

      const result = await getInstallationData()

      expect(result?.id).toBe('legacy-id')
      expect(result?.jwt).toBe('legacy-jwt')
      expect(result?.device_name).toBeTruthy()
      expect(mockSettingsSet).toHaveBeenCalledWith('installation_id', 'legacy-id')
      expect(mockSettingsSet).toHaveBeenCalledWith('jwt', 'legacy-jwt')
      expect(mockSettingsSet).toHaveBeenCalledWith('device_name', result?.device_name)
      expect(mockApiPush).not.toHaveBeenCalled()
    })

    it('propagates the guessed name to existing linked peers after a legacy split', async () => {
      let jwtWritten: string | null = null
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return JSON.stringify({ id: 'legacy-id', jwt: 'legacy-jwt' })
        if (key === 'jwt') return jwtWritten
        return null
      })
      mockSettingsSet.mockImplementation((key: string, value: string) => {
        if (key === 'jwt') jwtWritten = value
        return Promise.resolve(undefined)
      })
      mockLinkedDeviceFindAll.mockResolvedValue(linkedDevices({ 'peer-1': 'peer-pub-key' }))
      mockEncryptSyncPackage.mockResolvedValue({ sender_id: 'legacy-id', iv: 'iv', ciphertext: 'ct', recipient_keys: [] })
      mockApiPush.mockResolvedValue({ success: true })

      const result = await getInstallationData()

      expect(mockEncryptSyncPackage).toHaveBeenCalledWith(
        expect.objectContaining({
          commands: [{ type: 'rename_device', target_installation_id: 'legacy-id', name: result?.device_name }],
        }),
        expect.anything()
      )
      expect(mockApiPush).toHaveBeenCalledWith(expect.anything(), 'legacy-jwt')
    })

    it('does not split when installation_id is already a plain (non-JSON) id', async () => {
      mockSettingsGet.mockImplementation((key: string) => {
        if (key === 'installation_id') return 'plain-id'
        return null
      })

      const result = await getInstallationData()

      expect(result).toEqual({ id: 'plain-id', jwt: undefined, device_name: undefined })
      expect(mockSettingsSet).not.toHaveBeenCalled()
    })
  })
})
