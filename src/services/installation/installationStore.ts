import { linkedDeviceRepository } from '../repositories/linkedDeviceRepository'

export async function saveLinkedInstallation(uuid: string, publicKey: string): Promise<void> {
  try {
    await linkedDeviceRepository.upsert(uuid, publicKey)
  } catch (error) {
    console.warn('[installationStore] Failed to save linked installation:', error)
  }
}
