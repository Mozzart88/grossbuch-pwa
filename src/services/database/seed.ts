import { execSQL, queryOne } from './connection'

const PRESET_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2 },
  { code: 'RUB', name: 'Russian Ruble', symbol: '₽', decimal_places: 2 },
  { code: 'ARS', name: 'Argentine Peso', symbol: '$', decimal_places: 2 },
  { code: 'USDT', name: 'Tether', symbol: '₮', decimal_places: 2 },
  { code: 'USDC', name: 'USD Coin', symbol: '$', decimal_places: 2 },
]

const PRESET_CATEGORIES = [
  // Expenses
  { name: 'Food & Dining', type: 'expense', icon: '🍔' },
  { name: 'Transport', type: 'expense', icon: '🚗' },
  { name: 'Utilities', type: 'expense', icon: '💡' },
  { name: 'Housing', type: 'expense', icon: '🏠' },
  { name: 'Healthcare', type: 'expense', icon: '🏥' },
  { name: 'Entertainment', type: 'expense', icon: '🎬' },
  { name: 'Shopping', type: 'expense', icon: '🛍️' },
  { name: 'Personal Care', type: 'expense', icon: '💅' },
  { name: 'Education', type: 'expense', icon: '📚' },
  { name: 'Travel', type: 'expense', icon: '✈️' },
  { name: 'Other Expense', type: 'expense', icon: '📝' },
  // Income
  { name: 'Salary', type: 'income', icon: '💰' },
  { name: 'Freelance', type: 'income', icon: '💻' },
  { name: 'Investment', type: 'income', icon: '📈' },
  { name: 'Dividends', type: 'income', icon: '💵' },
  { name: 'Refunds', type: 'income', icon: '↩️' },
  { name: 'Other Income', type: 'income', icon: '💲' },
  // Both
  { name: 'Gifts', type: 'both', icon: '🎁' },
]

export async function seedDatabase(): Promise<void> {
  // Check if already seeded
  const existingCurrency = await queryOne<{ id: number }>(`SELECT id FROM currencies LIMIT 1`)
  if (existingCurrency) {
    return // Already seeded
  }

  // Seed currencies
  for (const currency of PRESET_CURRENCIES) {
    await execSQL(
      `INSERT INTO currencies (code, name, symbol, decimal_places, is_preset) VALUES (?, ?, ?, ?, 1)`,
      [currency.code, currency.name, currency.symbol, currency.decimal_places]
    )
  }

  // Seed categories
  for (const category of PRESET_CATEGORIES) {
    await execSQL(
      `INSERT INTO categories (name, type, icon, is_preset) VALUES (?, ?, ?, 1)`,
      [category.name, category.type, category.icon]
    )
  }
}
