import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Currency, CurrencyInput } from '../../types'

export const currencyRepository = {
  async findAll(): Promise<Currency[]> {
    return querySQL<Currency>('SELECT * FROM currencies ORDER BY is_preset DESC, name ASC')
  },

  async findById(id: number): Promise<Currency | null> {
    return queryOne<Currency>('SELECT * FROM currencies WHERE id = ?', [id])
  },

  async findByCode(code: string): Promise<Currency | null> {
    return queryOne<Currency>('SELECT * FROM currencies WHERE code = ?', [code])
  },

  async create(input: CurrencyInput): Promise<Currency> {
    await execSQL(
      `INSERT INTO currencies (code, name, symbol, decimal_places) VALUES (?, ?, ?, ?)`,
      [input.code, input.name, input.symbol, input.decimal_places ?? 2]
    )
    const id = await getLastInsertId()
    const currency = await this.findById(id)
    if (!currency) throw new Error('Failed to create currency')
    return currency
  },

  async update(id: number, input: Partial<CurrencyInput>): Promise<Currency> {
    const fields: string[] = []
    const values: unknown[] = []

    if (input.code !== undefined) {
      fields.push('code = ?')
      values.push(input.code)
    }
    if (input.name !== undefined) {
      fields.push('name = ?')
      values.push(input.name)
    }
    if (input.symbol !== undefined) {
      fields.push('symbol = ?')
      values.push(input.symbol)
    }
    if (input.decimal_places !== undefined) {
      fields.push('decimal_places = ?')
      values.push(input.decimal_places)
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      values.push(id)
      await execSQL(`UPDATE currencies SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    const currency = await this.findById(id)
    if (!currency) throw new Error('Currency not found')
    return currency
  },

  async delete(id: number): Promise<void> {
    // Check if currency is used by any account
    const accountCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM accounts WHERE currency_id = ?',
      [id]
    )
    if (accountCount && accountCount.count > 0) {
      throw new Error(`Cannot delete: ${accountCount.count} accounts use this currency`)
    }

    // Check if currency is used by any transaction
    const txCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM transactions WHERE currency_id = ? OR to_currency_id = ?',
      [id, id]
    )
    if (txCount && txCount.count > 0) {
      throw new Error(`Cannot delete: ${txCount.count} transactions use this currency`)
    }

    await execSQL('DELETE FROM currencies WHERE id = ?', [id])
  },
}
