import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Spinner } from '../components/ui'
import { notificationRepository } from '../services/repositories'
import type { Notification, PlainNotificationPayload } from '../types'

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp * 1000))
}

export function NotificationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [notification, setNotification] = useState<Notification | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadNotification() {
      if (!id) {
        setLoading(false)
        return
      }
      try {
        const item = await notificationRepository.findByHexId(id)
        if (item?.type === 'plain') {
          await notificationRepository.markReaded(item.id)
          setNotification(item)
        }
      } finally {
        setLoading(false)
      }
    }
    void loadNotification()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  if (!notification || notification.type !== 'plain') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Notification not found</p>
        <Button onClick={() => navigate(-1)} className="mt-4">
          Go Back
        </Button>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Notification" showBack />
      <article className="p-4 space-y-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {notification.payload.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {formatTimestamp(notification.timestamp)}
          </p>
        </div>
        <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">
          {(notification.payload as PlainNotificationPayload).body}
        </p>
      </article>
    </div>
  )
}
