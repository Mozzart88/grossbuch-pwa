import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, useToast } from '../components/ui'
import { settingsRepository } from '../services/repositories'
import { onDbWrite } from '../services/database/connection'
import { sendUnlinkCommand } from '../services/sync'

interface PendingRequest {
  target_id: string
  started_at: number
  keep_data: boolean
}

export function LinkedDevicesPage() {
  const { showToast } = useToast()
  const [installations, setInstallations] = useState<Record<string, string>>({})
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [unlinkDialogId, setUnlinkDialogId] = useState<string | null>(null)
  const [unlinkInProgress, setUnlinkInProgress] = useState<string | null>(null)

  const loadInstallations = useCallback(async () => {
    try {
      const [rawInstalls, rawPending] = await Promise.all([
        settingsRepository.get('linked_installations'),
        settingsRepository.get('pending_unlink_requests'),
      ])
      setInstallations(rawInstalls ? JSON.parse(rawInstalls) : {})
      setPendingRequests(rawPending ? (JSON.parse(rawPending) as PendingRequest[]) : [])
    } catch (error) {
      console.error('Failed to load linked installations:', error)
      setInstallations({})
      setPendingRequests([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInstallations()
  }, [loadInstallations])

  useEffect(() => {
    return onDbWrite(() => { void loadInstallations() })
  }, [loadInstallations])

  const handleUnlinkConfirm = async (keepData: boolean) => {
    if (!unlinkDialogId) return
    const installationId = unlinkDialogId
    setUnlinkDialogId(null)
    setUnlinkInProgress(installationId)

    try {
      await sendUnlinkCommand(installationId, keepData)

      const newRequest: PendingRequest = {
        target_id: installationId,
        started_at: Math.floor(Date.now() / 1000),
        keep_data: keepData,
      }
      const updated = [
        ...pendingRequests.filter(p => p.target_id !== installationId),
        newRequest,
      ]
      await settingsRepository.set('pending_unlink_requests', JSON.stringify(updated))
      setPendingRequests(updated)

      showToast('Unlink request sent — waiting for device to confirm', 'success')
    } catch (error) {
      console.error('Failed to send unlink command:', error)
      showToast('Failed to send unlink request', 'error')
    } finally {
      setUnlinkInProgress(null)
    }
  }

  const handleForceUnlink = async (installationId: string) => {
    try {
      const updatedInstalls = { ...installations }
      delete updatedInstalls[installationId]
      await settingsRepository.set('linked_installations', JSON.stringify(updatedInstalls))

      const updatedPending = pendingRequests.filter(p => p.target_id !== installationId)
      if (updatedPending.length === 0) {
        await settingsRepository.delete('pending_unlink_requests')
      } else {
        await settingsRepository.set('pending_unlink_requests', JSON.stringify(updatedPending))
      }

      setInstallations(updatedInstalls)
      setPendingRequests(updatedPending)
      showToast('Device unlinked', 'success')
    } catch (error) {
      console.error('Failed to force unlink device:', error)
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
            {installationIds.map((id) => {
              const isPending = pendingRequests.some(p => p.target_id === id)
              return (
                <div key={id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">
                      {id.slice(0, 8)}…
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {isPending ? 'Waiting for confirmation…' : 'Installation ID'}
                    </p>
                  </div>
                  {isPending ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleForceUnlink(id)}
                    >
                      Force Unlink
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      onClick={() => setUnlinkDialogId(id)}
                      disabled={unlinkInProgress === id}
                    >
                      {unlinkInProgress === id ? 'Sending…' : 'Unlink'}
                    </Button>
                  )}
                </div>
              )
            })}
          </Card>
        )}
      </div>

      {unlinkDialogId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <Card className="mx-4 mb-4 sm:mb-0 max-w-sm w-full p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Unlink device
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                What should happen to the data on{' '}
                <span className="font-mono font-medium">{unlinkDialogId.slice(0, 8)}…</span>?
              </p>
            </div>
            <div className="space-y-2">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => handleUnlinkConfirm(true)}
              >
                Keep data — disconnect from sync only
              </Button>
              <Button
                variant="danger"
                className="w-full"
                onClick={() => handleUnlinkConfirm(false)}
              >
                Delete everything on that device
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setUnlinkDialogId(null)}
            >
              Cancel
            </Button>
          </Card>
        </div>
      )}
    </div>
  )
}
