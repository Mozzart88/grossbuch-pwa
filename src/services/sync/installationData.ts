import { settingsRepository } from '../repositories/settingsRepository'
import { guessDeviceName } from '../../utils/deviceName'

export interface InstallationData {
  id: string
  jwt?: string
  device_name?: string
}

interface LegacyInstallationBlob {
  id: string
  jwt?: string
}

function parseLegacyInstallationBlob(raw: string): LegacyInstallationBlob | null {
  try {
    const parsed = JSON.parse(raw) as Partial<LegacyInstallationBlob>
    return typeof parsed?.id === 'string' ? (parsed as LegacyInstallationBlob) : null
  } catch {
    return null
  }
}

export interface InstallationDataRead {
  data: InstallationData
  /** True the one time the legacy `{ id, jwt }` blob was just split into the three keys. */
  migrated: boolean
}

/**
 * Reads installation identity from the split `installation_id`/`jwt`/`device_name`
 * settings keys. On the first read after upgrading from the old `{ id, jwt }` blob
 * format, splits it into the three keys and guesses a device name.
 *
 * Kept as a leaf module (no dependency on `./index`) so it can be imported by modules
 * that `./index` itself depends on (e.g. `exchangeRateSync.ts`) without a import cycle.
 */
export async function readInstallationData(): Promise<InstallationDataRead | null> {
  const rawId = await settingsRepository.get('installation_id')
  if (!rawId) return null

  const existingJwt = await settingsRepository.get('jwt')
  if (existingJwt === null) {
    const legacy = parseLegacyInstallationBlob(String(rawId))
    if (legacy) {
      const deviceName = guessDeviceName(navigator.userAgent)
      await settingsRepository.set('installation_id', legacy.id)
      if (legacy.jwt) await settingsRepository.set('jwt', legacy.jwt)
      await settingsRepository.set('device_name', deviceName)
      return { data: { id: legacy.id, jwt: legacy.jwt, device_name: deviceName }, migrated: true }
    }
  }

  const deviceName = await settingsRepository.get('device_name')
  return {
    data: {
      id: String(rawId),
      jwt: existingJwt ?? undefined,
      device_name: deviceName ?? undefined,
    },
    migrated: false,
  }
}
