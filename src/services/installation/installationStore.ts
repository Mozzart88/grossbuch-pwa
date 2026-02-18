import { settingsRepository } from '../repositories/settingsRepository'

export async function saveLinkedInstallation(uuid: string, publicKey: string): Promise<void> {
  try {
    const existing = await settingsRepository.get('linked_installations')
    let installations: Record<string, string> = {}
    if (existing) {
      const raw = typeof existing === 'string' ? existing : JSON.stringify(existing)
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          installations[id] = ''
        }
      } else {
        installations = parsed
      }
    }
    installations[uuid] = publicKey
    await settingsRepository.set('linked_installations', JSON.stringify(installations))
  } catch (error) {
    console.warn('[installationStore] Failed to save linked installation:', error)
  }
}
