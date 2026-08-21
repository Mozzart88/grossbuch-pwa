import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  createDatabaseMock,
  getTestDatabase,
} from './setup'
import { CURRENT_VERSION } from '../../services/database/migrations'
import { hexToBlob } from '../../utils/blobUtils'

let dbMock: ReturnType<typeof createDatabaseMock>

describe('Notifications Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  beforeEach(() => {
    resetTestDatabase()
    dbMock = createDatabaseMock()
    vi.doMock('../../services/database', () => dbMock)
    vi.doMock('../../services/database/connection', () => dbMock)
    vi.doMock('../../services/database/workspace', () => ({
      getActiveWorkspaceId: () => 1,
    }))
  })

  it('creates, lists, marks readed, and cleans up plain notifications', async () => {
    const { notificationRepository } = await import('../../services/repositories/notificationRepository')
    const now = 1_700_000_000

    const item = await notificationRepository.createPlain({ title: 'Hello', body: 'World' }, now)
    await notificationRepository.createPlain({ title: 'Later', body: 'Second' }, now + 1)
    expect(item.type).toBe('plain')
    expect(item.status).toBe('new')
    expect(await notificationRepository.unreadCount()).toBe(2)

    const all = await notificationRepository.findAll()
    expect(all.map(notification => notification.payload.title)).toEqual(['Later', 'Hello'])
    const paged = await notificationRepository.findAll(1, 1)
    expect(paged[0].payload.title).toBe('Hello')

    await notificationRepository.markReaded(item.id, now + 10)
    const readed = await notificationRepository.findByHexId(notificationRepository.toHex(item))
    expect(readed?.status).toBe('readed')
    expect(readed?.readed_at).toBe(now + 10)

    await notificationRepository.cleanupExpiredPlain(now + 31 * 24 * 60 * 60)
    expect(await notificationRepository.findById(item.id)).toBeNull()

    await notificationRepository.deleteByHexId(notificationRepository.toHex(all[0]))
    expect(await notificationRepository.findById(all[0].id)).toBeNull()
  })

  it('keeps notifications visible when a different workspace becomes active (8.8)', async () => {
    // notification lives in `shared`, tagged with a `workspace_id` for
    // attribution only — findAll() never filters by it (see design.md's
    // "notification lives in shared with workspace_id" decision), so a
    // notification created under one workspace stays visible after the
    // active workspace changes.
    const { notificationRepository } = await import('../../services/repositories/notificationRepository')
    const created = await notificationRepository.createPlain({ title: 'Cross-workspace', body: 'Still here' }, 1_700_000_000)

    vi.doMock('../../services/database/workspace', () => ({
      getActiveWorkspaceId: () => 2,
    }))
    vi.resetModules()
    vi.doMock('../../services/database', () => dbMock)
    vi.doMock('../../services/database/connection', () => dbMock)
    const { notificationRepository: freshRepo } = await import('../../services/repositories/notificationRepository')

    const stillVisible = await freshRepo.findById(created.id)
    expect(stillVisible?.payload.title).toBe('Cross-workspace')
    expect((await freshRepo.findAll()).some(n => n.payload.title === 'Cross-workspace')).toBe(true)
  })

  it('has notification schema, indexes, triggers, and deletion tracking in shared', () => {
    const db = getTestDatabase()
    expect(CURRENT_VERSION).toBe(24)

    const columns = db.exec(`PRAGMA shared.table_info(notification)`)[0].values.map(row => row[1])
    expect(columns).toEqual(['id', 'workspace_id', 'type', 'status', 'timestamp', 'readed_at', 'updated_at', 'payload'])

    const indexes = db.exec(`PRAGMA shared.index_list(notification)`)[0].values.map(row => row[1])
    expect(indexes).toContain('idx_shared_notification_unread')
    expect(indexes).toContain('idx_shared_notification_list')
    expect(indexes).toContain('idx_shared_notification_cleanup_readed')
    expect(indexes).toContain('idx_shared_notification_cleanup_unread')

    db.run(
      `INSERT INTO shared.notification (id, workspace_id, type, status, timestamp, payload)
       VALUES (?, 1, 'plain', 'new', 100, ?)`,
      [hexToBlob('0102030405060708'), JSON.stringify({ title: 'x', body: 'y' })]
    )
    db.run(`DELETE FROM shared.notification WHERE hex(id) = '0102030405060708'`)
    const tombstone = db.exec(`SELECT table_name, entity_id FROM shared.sync_deletions WHERE table_name = 'notification'`)[0].values[0]
    expect(tombstone).toEqual(['notification', '0102030405060708'])
  })

  it('exports and imports notifications while accepting old packages without notifications', async () => {
    const { notificationRepository } = await import('../../services/repositories/notificationRepository')
    const { exportSyncPackage } = await import('../../services/sync/syncExport')
    const { importSyncPackage } = await import('../../services/sync/syncImport')

    const created = await notificationRepository.createTransactionDraft('Draft', 'expense', {
      timestamp: 123,
      lines: [{
        account_id: 1,
        tag_id: 11,
        sign: '-',
        amount_int: 10,
        amount_frac: 0,
        rate_int: 1,
        rate_frac: 0,
      }],
    }, 123)

    const pkg = await exportSyncPackage(0, 'sender')
    expect(pkg.notifications?.some(n => n.id.toLowerCase() === notificationRepository.toHex(created))).toBe(true)

    await notificationRepository.delete(created.id)
    const importResult = await importSyncPackage({
      ...pkg,
      notifications: pkg.notifications,
      deletions: [],
    })
    expect(importResult.errors).toEqual([])
    expect(importResult.imported.notifications).toBeGreaterThan(0)
    expect(await notificationRepository.findById(created.id)).not.toBeNull()

    const oldPackageResult = await importSyncPackage({
      version: 2,
      sender_id: 'old',
      created_at: 1,
      since: 0,
      icons: [],
      tags: [],
      wallets: [],
      accounts: [],
      counterparties: [],
      currencies: [],
      transactions: [],
      budgets: [],
      deletions: [],
    })
    expect(oldPackageResult.errors).toEqual([])
  })

  it('rejects unsupported stored types, statuses, and malformed payloads', async () => {
    const { notificationRepository } = await import('../../services/repositories/notificationRepository')
    const db = getTestDatabase()

    const insertRaw = (id: string, type: string, status: string, payload: unknown) => {
      db.run(
        `INSERT INTO shared.notification (id, workspace_id, type, status, timestamp, payload)
         VALUES (?, 1, ?, ?, 100, ?)`,
        [hexToBlob(id), type, status, JSON.stringify(payload)]
      )
    }

    insertRaw('0102030405060708', 'server', 'new', { title: 'Bad', body: 'Type' })
    await expect(notificationRepository.findById(hexToBlob('0102030405060708'))).rejects.toThrow('Unsupported notification type')

    insertRaw('0202030405060708', 'plain', 'archived', { title: 'Bad', body: 'Status' })
    await expect(notificationRepository.findById(hexToBlob('0202030405060708'))).rejects.toThrow('Unsupported notification status')

    insertRaw('0302030405060708', 'plain', 'new', { title: '   ', body: 'Empty title' })
    await expect(notificationRepository.findById(hexToBlob('0302030405060708'))).rejects.toThrow('Invalid notification payload title')

    insertRaw('0402030405060708', 'plain', 'new', { title: 'Missing body' })
    await expect(notificationRepository.findById(hexToBlob('0402030405060708'))).rejects.toThrow('Invalid plain notification payload body')

    insertRaw('0502030405060708', 'transaction', 'new', { title: 'Bad draft', mode: 'expense' })
    await expect(notificationRepository.findById(hexToBlob('0502030405060708'))).rejects.toThrow('Invalid transaction notification payload')
  })
})
