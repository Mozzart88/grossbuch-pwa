import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, useToast } from '../components/ui'
import { settingsRepository } from '../services/repositories'

export function LinkedDevicesPage() {
  const { showToast } = useToast()
  const [installations, setInstallations] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadInstallations()
  }, [])

  const loadInstallations = async () => {
    try {
      const raw = await settingsRepository.get('linked_installations')
      if (raw) {
        const parsed = JSON.parse(raw)
        setInstallations(parsed)
      } else {
        setInstallations({})
      }
    } catch (error) {
      console.error('Failed to load linked installations:', error)
      setInstallations({})
    } finally {
      setLoading(false)
    }
  }

  const handleUnlink = async (installationId: string) => {
    if (!confirm(`Unlink device ${installationId.slice(0, 8)}…? This cannot be undone.`)) return

    try {
      const updated = { ...installations }
      delete updated[installationId]
      await settingsRepository.set('linked_installations', JSON.stringify(updated))
      setInstallations(updated)
      showToast('Device unlinked', 'success')
    } catch (error) {
      console.error('Failed to unlink device:', error)
      showToast('Failed to unlink device', 'error')
    }
  }

  const installationIds = Object.keys(installations)

  return (
    <div>
      <PageHeader title="Linked Devices" showBack />

      <div className="p-4 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">Loading...</p>
        ) : installationIds.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              No linked devices. Use the Share feature to pair another device.
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-gray-200 dark:divide-gray-700">
            {installationIds.map((id) => (
              <div key={id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">
                    {id.slice(0, 8)}…
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Installation ID</p>
                </div>
                <Button
                  variant="danger"
                  onClick={() => handleUnlink(id)}
                >
                  Unlink
                </Button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
