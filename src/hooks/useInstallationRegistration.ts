import { useEffect, useRef } from 'react'
import { registerInstallation } from '../services/installation'
import { settingsRepository } from '../services/repositories/settingsRepository'
import { useToast } from '../components/ui'
import { AUTH_STORAGE_KEYS } from '../types/auth'

async function saveLinkedInstallation(sharedUuid: string, publicKey: string): Promise<void> {
  try {
    const existing = await settingsRepository.get('linked_installations')
    let installations: Record<string, string> = {}
    if (existing) {
      const raw = typeof existing === 'string' ? existing : JSON.stringify(existing)
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        for (const uuid of parsed) {
          installations[uuid] = ''
        }
      } else {
        installations = parsed
      }
    }
    installations[sharedUuid] = publicKey
    await settingsRepository.set('linked_installations', JSON.stringify(installations))
  } catch (error) {
    console.warn('[useInstallationRegistration] Failed to save linked installation:', error)
  }
}

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
