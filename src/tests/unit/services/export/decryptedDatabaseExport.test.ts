import { beforeEach, expect, it, vi } from 'vitest'
import { exportDecryptedDatabase } from '../../../../services/export/decryptedDatabaseExport'
import * as connection from '../../../../services/database/connection'
import * as workspace from '../../../../services/database/workspace'
import { verifyPin } from '../../../../services/auth/verifyPin'
import { deriveEncryptionKey } from '../../../../services/auth/crypto'
import { AUTH_STORAGE_KEYS } from '../../../../types/auth'

vi.mock('../../../../services/database/connection', () => ({
  getExportSession: vi.fn(), exportDecryptedDatabase: vi.fn(), queryOne: vi.fn(),
}))
vi.mock('../../../../services/database/workspace', () => ({ getSessionDekShared: vi.fn() }))
vi.mock('../../../../services/auth/verifyPin', () => ({ verifyPin: vi.fn() }))
vi.mock('../../../../services/auth/crypto', () => ({ deriveEncryptionKey: vi.fn() }))
const getFileHandle = vi.fn()
const bytes = new ArrayBuffer(16)
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(connection.getExportSession).mockResolvedValue('session-7')
  vi.mocked(connection.exportDecryptedDatabase).mockResolvedValue(bytes)
  vi.mocked(connection.queryOne).mockResolvedValue({ id: 2 })
  vi.mocked(workspace.getSessionDekShared).mockReturnValue('22'.repeat(32))
  vi.mocked(deriveEncryptionKey).mockResolvedValue({ key: '11'.repeat(32), salt: 'salt' })
  getFileHandle.mockResolvedValue({})
  Object.defineProperty(navigator, 'storage', { configurable: true, value: {
    getDirectory: async () => ({ getFileHandle }),
  } })
  localStorage.setItem(AUTH_STORAGE_KEYS.PBKDF2_SALT, 'salt')
})

it.each([
  ['main.db', { kind: 'main' }, '11'],
  ['shared.db', { kind: 'shared' }, '22'],
  ['workspace-2.db', { kind: 'workspace', workspaceId: 2 }, '22'],
  ['expense-tracker.sqlite3', { kind: 'legacy' }, '11'],
])('authenticates and selects the appropriate key for %s', async (name, source, key) => {
  expect(await exportDecryptedDatabase(name, '123456')).toBe(bytes)
  expect(verifyPin).toHaveBeenCalledWith('123456')
  expect(connection.exportDecryptedDatabase).toHaveBeenCalledWith({ source, key: key.repeat(32), session: 'session-7' })
  expect(getFileHandle).toHaveBeenCalledWith(name)
})
it('rejects an invalid PIN before accessing the shared session key or exporting', async () => {
  vi.mocked(verifyPin).mockRejectedValue(new Error('Incorrect PIN'))
  await expect(exportDecryptedDatabase('shared.db', 'bad')).rejects.toThrow('Incorrect PIN')
  expect(workspace.getSessionDekShared).not.toHaveBeenCalled()
  expect(connection.exportDecryptedDatabase).not.toHaveBeenCalled()
})
it('rejects a missing session', async () => {
  vi.mocked(workspace.getSessionDekShared).mockReturnValue(null)
  await expect(exportDecryptedDatabase('main.db', '123456')).rejects.toThrow(/session/i)
  expect(connection.exportDecryptedDatabase).not.toHaveBeenCalled()
})
it.each(['other.db', '../main.db', 'workspace-0.db', 'workspace-01.db', 'workspace-9007199254740992.db'])('rejects unsupported source %s', async name => {
  await expect(exportDecryptedDatabase(name, '123456')).rejects.toThrow(/supported/i)
  expect(connection.exportDecryptedDatabase).not.toHaveBeenCalled()
})
it('rejects an unregistered workspace without creating it', async () => {
  vi.mocked(connection.queryOne).mockResolvedValue(null)
  await expect(exportDecryptedDatabase('workspace-2.db', '123456')).rejects.toThrow(/registered/i)
  expect(connection.exportDecryptedDatabase).not.toHaveBeenCalled()
})
it('rejects a missing file without create flags', async () => {
  getFileHandle.mockRejectedValue(new DOMException('missing', 'NotFoundError'))
  await expect(exportDecryptedDatabase('shared.db', '123456')).rejects.toThrow(/not found/i)
  expect(getFileHandle).toHaveBeenCalledWith('shared.db')
  expect(connection.exportDecryptedDatabase).not.toHaveBeenCalled()
})
it('rejects a session cleared during source resolution', async () => {
  getFileHandle.mockImplementation(async () => {
    vi.mocked(workspace.getSessionDekShared).mockReturnValue(null)
    return {}
  })
  await expect(exportDecryptedDatabase('shared.db', '123456')).rejects.toThrow(/session/i)
  expect(connection.exportDecryptedDatabase).not.toHaveBeenCalled()
})
it('does not return plaintext if the session changes while exporting', async () => {
  vi.mocked(connection.exportDecryptedDatabase).mockImplementation(async () => {
    vi.mocked(workspace.getSessionDekShared).mockReturnValue(null)
    return bytes
  })
  await expect(exportDecryptedDatabase('shared.db', '123456')).rejects.toThrow(/session/i)
})
