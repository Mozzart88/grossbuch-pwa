import { useEffect, useRef } from 'react'
import { registerInstallation } from '../services/installation'
import { settingsRepository } from '../services/repositories/settingsRepository'
import { saveLinkedInstallation } from '../services/installation/installationStore'
import { getInstallationData } from '../services/sync'
import { sendInit } from '../services/sync/syncInit'
import { guessDeviceName } from '../utils/deviceName'
import { useToast } from '../components/ui'
import { AUTH_STORAGE_KEYS } from '../types/auth'

interface UseInstallationRegistrationOptions {
  enabled?: boolean
}

export function useInstallationRegistration({
  enabled = true,
}: UseInstallationRegistrationOptions = {}): void {
  const hasRunRef = useRef(false)
  const { showToast } = useToast()

  useEffect(() => {
    if (!enabled || hasRunRef.current) {
      return
    }

    const timeoutId = setTimeout(async () => {
      hasRunRef.current = true

      try {
        const existing = await getInstallationData()
        if (existing) {
          if (existing.jwt) {
            return // Fully registered
          }
          // Has ID but no JWT — retry registration
          try {
            const sharedUuid = localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_UUID) || undefined
            const result = await registerInstallation(existing.id, sharedUuid)
            await settingsRepository.set('installation_id', existing.id)
            await settingsRepository.set('jwt', result.jwt)
            if (!existing.device_name) {
              await settingsRepository.set('device_name', guessDeviceName(navigator.userAgent))
            }
            if (sharedUuid) {
              const sharedPublicKey = localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY) || ''
              localStorage.removeItem(AUTH_STORAGE_KEYS.SHARED_UUID)
              localStorage.removeItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY)
              await saveLinkedInstallation(sharedUuid, sharedPublicKey)
              try {
                await settingsRepository.set('pending_initial_sync', '1')
                await sendInit(sharedUuid, sharedPublicKey)
              } catch (err) {
                console.warn('[useInstallationRegistration] sendInit failed:', err)
                if (import.meta.env.DEV) {
                  showToast('Failed to send invitation responce', 'error')
                }
              }
            }
            if (import.meta.env.DEV) {
              showToast('Installation registered (retry)', 'success')
            }
          } catch (error) {
            console.warn('[useInstallationRegistration] Retry registration failed:', error)
            if (import.meta.env.DEV) {
              showToast(
                `Registration retry failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
              )
            }
          }
          return
        }

        // New installation — generate ID and register
        const id = crypto.randomUUID()
        const deviceName = guessDeviceName(navigator.userAgent)

        try {
          const sharedUuid = localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_UUID) || undefined
          const result = await registerInstallation(id, sharedUuid)
          await settingsRepository.set('installation_id', id)
          await settingsRepository.set('jwt', result.jwt)
          await settingsRepository.set('device_name', deviceName)
          if (sharedUuid) {
            const sharedPublicKey = localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY) || ''
            localStorage.removeItem(AUTH_STORAGE_KEYS.SHARED_UUID)
            localStorage.removeItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY)
            await saveLinkedInstallation(sharedUuid, sharedPublicKey)
            try {
              await settingsRepository.set('pending_initial_sync', '1')
              await sendInit(sharedUuid, sharedPublicKey)
            } catch (err) {
              console.warn('[useInstallationRegistration] sendInit failed:', err)
              if (import.meta.env.DEV) {
                showToast(`Failed to send invitation responce ${(err as Error).message}`, 'error')
              }
            }
          }
          if (import.meta.env.DEV) {
            showToast('Installation registered', 'success')
          }
        } catch (error) {
          // API failed — save just the ID (and guessed name) so we can retry later
          console.warn('[useInstallationRegistration] Registration failed:', error)
          await settingsRepository.set('installation_id', id)
          await settingsRepository.set('device_name', deviceName)
          if (import.meta.env.DEV) {
            showToast(
              `Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              'error'
            )
          }
        }
      } catch (error) {
        console.warn('[useInstallationRegistration] Error:', error)
      }
    }, 2000)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [enabled, showToast])
}
