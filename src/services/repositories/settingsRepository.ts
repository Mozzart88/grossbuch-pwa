import { queryOne, execSQL } from '../database'
import type { Settings } from '../../types'

export const settingsRepository = {
  async get<K extends keyof Settings>(key: K): Promise<Settings[K] | null> {
    const result = await queryOne<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key])
    if (!result) return null

    // Type conversion based on key
    if (key === 'installation_id') {
      try {
        return JSON.parse(result.value) as Settings[K]
      } catch {
        return result.value as Settings[K]
      }
    }
    return result.value as Settings[K]
  },

  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    await execSQL(
      `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, unixepoch(CURRENT_TIMESTAMP))`,
      [key, String(value)]
    )
  },

  async getAll(): Promise<Partial<Settings>> {
    const settings: Partial<Settings> = {}

    const theme = await this.get('theme')
    if (theme !== null) {
      settings.theme = theme
    }

    return settings
  },

  async delete<K extends keyof Settings>(key: K): Promise<void> {
    await execSQL('DELETE FROM app_settings WHERE key = ?', [key])
  },
}
