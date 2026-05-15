import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificationRepository } from '../../services/repositories'
import { onDbWrite } from '../../services/database/connection'
import type { Notification } from '../../types'
import { blobToHex } from '../../utils/blobUtils'
import { Badge, Spinner } from '../ui'

interface NotificationDrawerProps {
  isOpen: boolean
  onClose: () => void
  onUnreadCountChange?: (count: number) => void
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000))
}

export function NotificationDrawer({ isOpen, onClose, onUnreadCountChange }: NotificationDrawerProps) {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const loadNotifications = useCallback(async () => {
    try {
      const [items, unread] = await Promise.all([
        notificationRepository.findAll(),
        notificationRepository.unreadCount(),
      ])
      setNotifications(items)
      onUnreadCountChange?.(unread)
    } finally {
      setLoading(false)
    }
  }, [onUnreadCountChange])

  useEffect(() => {
    void loadNotifications()
    return onDbWrite(() => { void loadNotifications() })
  }, [loadNotifications])

  useEffect(() => {
    if (isOpen) void loadNotifications()
  }, [isOpen, loadNotifications])

  const handleClick = async (notification: Notification) => {
    await notificationRepository.markReaded(notification.id)
    onClose()
    const id = blobToHex(notification.id)
    if (notification.type === 'plain') {
      navigate(`/notifications/${id}`)
    } else {
      navigate(`/add?notification=${id}`)
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 ${isOpen ? '' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      <div
        className={`fixed inset-0 bg-black/50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 shadow-xl flex flex-col
                    transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
      >
        <div className="flex items-center justify-between px-4 h-14 shrink-0 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Notifications</h2>
          <button
            onClick={onClose}
            aria-label="Close notifications"
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex justify-center p-8"><Spinner /></div>
          ) : notifications.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-500 dark:text-gray-400">No notifications</p>
          ) : notifications.map((notification) => (
            <button
              key={blobToHex(notification.id)}
              onClick={() => { void handleClick(notification) }}
              className="w-full px-5 py-4 text-left border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {notification.payload.title}
                </span>
                {notification.status === 'new' && <Badge variant="danger">New</Badge>}
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {formatTimestamp(notification.timestamp)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
