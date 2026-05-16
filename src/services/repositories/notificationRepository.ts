import { execSQL, queryOne, querySQL } from '../database'
import type {
  Notification,
  NotificationPayload,
  NotificationStatus,
  NotificationTransactionMode,
  NotificationType,
  PlainNotificationPayload,
  TransactionInput,
  TransactionNotificationPayload,
} from '../../types'
import { blobToHex, hexToBlob } from '../../utils/blobUtils'

interface NotificationRow {
  id: Uint8Array
  type: string
  status: string
  timestamp: number
  readed_at: number | null
  updated_at: number
  payload: string
}

const MONTH = 30 * 24 * 60 * 60
const NOTIFICATION_TYPES = new Set<NotificationType>(['plain', 'transaction'])
const NOTIFICATION_STATUSES = new Set<NotificationStatus>(['new', 'readed'])
const TRANSACTION_MODES = new Set<NotificationTransactionMode>(['expense', 'income', 'transfer', 'exchange'])

function assertType(type: string): NotificationType {
  if (NOTIFICATION_TYPES.has(type as NotificationType)) return type as NotificationType
  throw new Error(`Unsupported notification type: ${type}`)
}

function assertStatus(status: string): NotificationStatus {
  if (NOTIFICATION_STATUSES.has(status as NotificationStatus)) return status as NotificationStatus
  throw new Error(`Unsupported notification status: ${status}`)
}

function parsePayload(type: NotificationType, raw: string): NotificationPayload {
  const payload = JSON.parse(raw) as Partial<PlainNotificationPayload & TransactionNotificationPayload>
  if (typeof payload.title !== 'string' || payload.title.trim() === '') {
    throw new Error('Invalid notification payload title')
  }

  if (type === 'plain') {
    if (typeof payload.body !== 'string') throw new Error('Invalid plain notification payload body')
    return { title: payload.title, body: payload.body }
  }

  if (!TRANSACTION_MODES.has(payload.mode as NotificationTransactionMode) || !payload.draft || !Array.isArray(payload.draft.lines)) {
    throw new Error('Invalid transaction notification payload')
  }

  return {
    title: payload.title,
    mode: payload.mode as NotificationTransactionMode,
    draft: payload.draft,
    recurring: payload.recurring,
  }
}

function mapNotification(row: NotificationRow): Notification {
  const type = assertType(row.type)
  return {
    id: row.id,
    type,
    status: assertStatus(row.status),
    timestamp: row.timestamp,
    readed_at: row.readed_at,
    updated_at: row.updated_at,
    payload: parsePayload(type, row.payload),
  }
}

export const notificationRepository = {
  async findAll(limit = 50, offset = 0): Promise<Notification[]> {
    const rows = await querySQL<NotificationRow>(
      `SELECT id, type, status, timestamp, readed_at, updated_at, payload
       FROM notification
       ORDER BY timestamp DESC, updated_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    )
    return rows.map(mapNotification)
  },

  async unreadCount(): Promise<number> {
    const result = await queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM notification WHERE status = 'new'`
    )
    return result?.count ?? 0
  },

  async findById(id: Uint8Array): Promise<Notification | null> {
    const row = await queryOne<NotificationRow>(
      `SELECT id, type, status, timestamp, readed_at, updated_at, payload
       FROM notification
       WHERE id = ?`,
      [id]
    )
    return row ? mapNotification(row) : null
  },

  async findByHexId(id: string): Promise<Notification | null> {
    return this.findById(hexToBlob(id))
  },

  async createPlain(payload: PlainNotificationPayload, timestamp = Math.floor(Date.now() / 1000)): Promise<Notification> {
    return this.create('plain', payload, timestamp)
  },

  async createTransactionDraft(
    title: string,
    mode: NotificationTransactionMode,
    draft: TransactionInput,
    timestamp = Math.floor(Date.now() / 1000)
  ): Promise<Notification> {
    return this.create('transaction', { title, mode, draft }, timestamp)
  },

  async create(type: NotificationType, payload: NotificationPayload, timestamp = Math.floor(Date.now() / 1000)): Promise<Notification> {
    assertType(type)
    parsePayload(type, JSON.stringify(payload))
    await execSQL(
      `INSERT INTO notification (id, type, status, timestamp, payload)
       VALUES (randomblob(8), ?, 'new', ?, ?)`,
      [type, timestamp, JSON.stringify(payload)]
    )
    const row = await queryOne<{ id: Uint8Array }>(
      `SELECT id FROM notification ORDER BY rowid DESC LIMIT 1`
    )
    if (!row) throw new Error('Failed to create notification')
    const notification = await this.findById(row.id)
    if (!notification) throw new Error('Failed to load created notification')
    return notification
  },

  async markReaded(id: Uint8Array, readedAt = Math.floor(Date.now() / 1000)): Promise<void> {
    await execSQL(
      `UPDATE notification
       SET status = 'readed', readed_at = COALESCE(readed_at, ?)
       WHERE id = ?`,
      [readedAt, id]
    )
  },

  async delete(id: Uint8Array): Promise<void> {
    await execSQL(`DELETE FROM notification WHERE id = ?`, [id])
  },

  async deleteByHexId(id: string): Promise<void> {
    await this.delete(hexToBlob(id))
  },

  async cleanupExpiredPlain(now = Math.floor(Date.now() / 1000)): Promise<void> {
    await execSQL(
      `DELETE FROM notification
       WHERE type = 'plain'
         AND (
           (readed_at IS NOT NULL AND readed_at < ?)
           OR (readed_at IS NULL AND timestamp < ?)
         )`,
      [now - MONTH, now - 2 * MONTH]
    )
  },

  toHex(notification: Notification): string {
    return blobToHex(notification.id)
  },
}
