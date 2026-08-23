import { linkedDeviceRepository } from '../repositories/linkedDeviceRepository'

export async function saveLinkedInstallation(uuid: string, publicKey: string, name?: string): Promise<void> {
  try {
    if (name !== undefined) {
      await linkedDeviceRepository.upsert(uuid, publicKey, name)
    } else {
      await linkedDeviceRepository.upsert(uuid, publicKey)
    }
  } catch (error) {
    console.warn('[installationStore] Failed to save linked installation:', error)
  }
}
