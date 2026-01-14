import { execSQL, queryOne } from './connection'
import { SYSTEM_TAGS } from '../../types'

const PRESET_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, isCrypto: false },
  { code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, isCrypto: false },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', decimal_places: 2, isCrypto: false },
  { code: 'ARS', name: 'Argentine Peso', symbol: '$', decimal_places: 2, isCrypto: false },
  { code: 'USDT', name: 'Tether', symbol: '₮', decimal_places: 2, isCrypto: true },
  { code: 'USDC', name: 'USD Coin', symbol: '$', decimal_places: 2, isCrypto: true },
]

export async function seedDatabase(): Promise<void> {
  // Check if already seeded (using new currency table)
  const existingCurrency = await queryOne<{ id: number }>(`SELECT id FROM currency LIMIT 1`)
  if (existingCurrency) {
    return // Already seeded
  }

  // Seed currencies
  for (let i = 0; i < PRESET_CURRENCIES.length; i++) {
    const currency = PRESET_CURRENCIES[i]
    await execSQL(
      `INSERT INTO currency (code, name, symbol, decimal_places) VALUES (?, ?, ?, ?)`,
      [currency.code, currency.name, currency.symbol, currency.decimal_places]
    )

    const id = i + 1 // IDs start at 1

    // Tag as fiat or crypto
    const typeTag = currency.isCrypto ? SYSTEM_TAGS.CRYPTO : SYSTEM_TAGS.FIAT
    await execSQL(
      `INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)`,
      [id, typeTag]
    )

    // Set first currency (USD) as default
    if (i === 0) {
      await execSQL(
        `INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)`,
        [id, SYSTEM_TAGS.DEFAULT]
      )
    }
  }

  // Note: Categories are now tags, and system tags (1-22) are seeded in migration v2
  // User-defined tags will be created through the UI
}
