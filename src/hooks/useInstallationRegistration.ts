import { useEffect, useRef } from 'react'
import { registerInstallation } from '../services/installation'
import { settingsRepository } from '../services/repositories/settingsRepository'
import { saveLinkedInstallation } from '../services/installation/installationStore'
import { sendInit } from '../services/sync/syncInit'
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
        const existing = await settingsRepository.get('installation_id')
        if (existing) {
          // Already registered, check if we have a JWT
          const parsed = typeof existing === 'string' ? JSON.parse(existing) : existing
          if (parsed.jwt) {
            return // Fully registered
          }
          // Has ID but no JWT — retry registration
          try {
            const sharedUuid = localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_UUID) || undefined
            const result = await registerInstallation(parsed.id, sharedUuid)
            const fullData = JSON.stringify({
              id: parsed.id,
              jwt: result.jwt,
            })
            await settingsRepository.set('installation_id', fullData)
            if (sharedUuid) {
              const sharedPublicKey = localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY) || ''
              localStorage.removeItem(AUTH_STORAGE_KEYS.SHARED_UUID)
              localStorage.removeItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY)
              await saveLinkedInstallation(sharedUuid, sharedPublicKey)
              try {
                await sendInit(sharedUuid, sharedPublicKey)
              } catch (err) {
                console.warn('[useInstallationRegistration] sendInit failed:', err)
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

        try {
          const sharedUuid = localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_UUID) || undefined
          const result = await registerInstallation(id, sharedUuid)
          const fullData = JSON.stringify({
            id,
            jwt: result.jwt,
          })
          await settingsRepository.set('installation_id', fullData)
          if (sharedUuid) {
            const sharedPublicKey = localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY) || ''
            localStorage.removeItem(AUTH_STORAGE_KEYS.SHARED_UUID)
            localStorage.removeItem(AUTH_STORAGE_KEYS.SHARED_PUBLIC_KEY)
            await saveLinkedInstallation(sharedUuid, sharedPublicKey)
            try {
              await sendInit(sharedUuid, sharedPublicKey)
            } catch (err) {
              console.warn('[useInstallationRegistration] sendInit failed:', err)
            }
          }
          if (import.meta.env.DEV) {
            showToast('Installation registered', 'success')
          }
        } catch (error) {
          // API failed — save just the ID so we can retry later
          console.warn('[useInstallationRegistration] Registration failed:', error)
          await settingsRepository.set('installation_id', JSON.stringify({ id }))
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
