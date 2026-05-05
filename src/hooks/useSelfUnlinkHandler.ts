import { useEffect, useRef } from 'react'
import { onDbWrite, wipeDatabase } from '../services/database/connection'
import { settingsRepository } from '../services/repositories/settingsRepository'
import { sendUnlinkConfirmation } from '../services/sync'
import { deleteInstallation } from '../services/installation/installationApi'

interface PendingSelfUnlink {
  initiator_id: string
  keep_data: boolean
  initiator_pub_key: string
}

/**
 * Listens for pending_self_unlink setting written by syncImport when this device
 * is the target of an unlink command. Handles cleanup and confirmation, then reloads.
 */
export function useSelfUnlinkHandler() {
  const processingRef = useRef(false)

  useEffect(() => {
    const check = async () => {
      if (processingRef.current) return
      processingRef.current = true

      const raw = await settingsRepository.get('pending_self_unlink')
      if (!raw) {
        processingRef.current = false
        return
      }

      let pending: PendingSelfUnlink
      try {
        pending = JSON.parse(String(raw)) as PendingSelfUnlink
      } catch {
        await settingsRepository.delete('pending_self_unlink')
        processingRef.current = false
        return
      }

      // Capture own credentials before any wipe
      let ownInstallationId = ''
      let ownJwt = ''
      try {
        const rawInstall = await settingsRepository.get('installation_id')
        if (rawInstall) {
          const install = typeof rawInstall === 'object'
            ? (rawInstall as { id: string; jwt?: string })
            : JSON.parse(String(rawInstall)) as { id: string; jwt?: string }
          ownInstallationId = install.id
          ownJwt = install.jwt ?? ''
        }
      } catch {
        // Continue with empty credentials — confirmation will fail gracefully
      }

      // Clear all linked devices and the pending flag
      await settingsRepository.set('linked_installations', '{}')
      await settingsRepository.delete('pending_self_unlink')

      // Wipe local DB first (credentials remain in memory variables above)
      if (!pending.keep_data) {
        await wipeDatabase()
      }

      // Send confirmation while JWT is still valid
      if (pending.initiator_pub_key && ownJwt && ownInstallationId) {
        try {
          await sendUnlinkConfirmation(ownInstallationId, ownJwt, pending.initiator_id, pending.initiator_pub_key)
        } catch {
          // Best-effort; initiator can force-unlink if confirmation never arrives
        }
      }

      // Revoke JWT server-side only after confirmation is sent
      if (!pending.keep_data && ownJwt) {
        try {
          await deleteInstallation(ownJwt)
        } catch {
          // Best-effort; server-side record will expire naturally
        }
      }

      window.location.reload()
    }

    return onDbWrite(() => { void check() })
  }, [])
}
