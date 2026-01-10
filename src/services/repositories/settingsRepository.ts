import { queryOne, execSQL } from '../database'
import type { Settings } from '../../types'

export const settingsRepository = {
  async get<K extends keyof Settings>(key: K): Promise<Settings[K] | null> {
    const result = await queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
    if (!result) return null

    // Type conversion based on key
    if (key === 'default_currency_id') {
      return parseInt(result.value, 10) as Settings[K]
    }
    return result.value as Settings[K]
  },

  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    await execSQL(
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [key, String(value)]
    )
  },

  async getAll(): Promise<Partial<Settings>> {
    const settings: Partial<Settings> = {}

    const defaultCurrencyId = await this.get('default_currency_id')
    if (defaultCurrencyId !== null) {
      settings.default_currency_id = defaultCurrencyId
    }

    const theme = await this.get('theme')
    if (theme !== null) {
      settings.theme = theme
    }

    return settings
  },
}
