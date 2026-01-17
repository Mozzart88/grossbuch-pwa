import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Currency, CurrencyInput, ExchangeRate } from '../../types'
import { SYSTEM_TAGS } from '../../types'

export const currencyRepository = {
  async findAll(): Promise<Currency[]> {
    const currencies = await querySQL<Currency>(`
      SELECT
        c.*,
        EXISTS(SELECT 1 FROM currency_to_tags WHERE currency_id = c.id AND tag_id = ?) as is_default,
        EXISTS(SELECT 1 FROM currency_to_tags WHERE currency_id = c.id AND tag_id = ?) as is_fiat,
        EXISTS(SELECT 1 FROM currency_to_tags WHERE currency_id = c.id AND tag_id = ?) as is_crypto
      FROM currency c
      ORDER BY is_default DESC, name ASC
    `, [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.FIAT, SYSTEM_TAGS.CRYPTO])
    return currencies
  },

  async findById(id: number): Promise<Currency | null> {
    return queryOne<Currency>(`
      SELECT
        c.*,
        EXISTS(SELECT 1 FROM currency_to_tags WHERE currency_id = c.id AND tag_id = ?) as is_default,
        EXISTS(SELECT 1 FROM currency_to_tags WHERE currency_id = c.id AND tag_id = ?) as is_fiat,
        EXISTS(SELECT 1 FROM currency_to_tags WHERE currency_id = c.id AND tag_id = ?) as is_crypto
      FROM currency c
      WHERE c.id = ?
    `, [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.FIAT, SYSTEM_TAGS.CRYPTO, id])
  },

  async findByCode(code: string): Promise<Currency | null> {
    return queryOne<Currency>(`
      SELECT
        c.*,
        EXISTS(SELECT 1 FROM currency_to_tags WHERE currency_id = c.id AND tag_id = ?) as is_default,
        EXISTS(SELECT 1 FROM currency_to_tags WHERE currency_id = c.id AND tag_id = ?) as is_fiat,
        EXISTS(SELECT 1 FROM currency_to_tags WHERE currency_id = c.id AND tag_id = ?) as is_crypto
      FROM currency c
      WHERE c.code = ?
    `, [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.FIAT, SYSTEM_TAGS.CRYPTO, code])
  },

  async findDefault(): Promise<Currency | null> {
    return queryOne<Currency>(`
      SELECT c.*, 1 as is_default
      FROM currency c
      JOIN currency_to_tags ct ON ct.currency_id = c.id
      WHERE ct.tag_id = ?
    `, [SYSTEM_TAGS.DEFAULT])
  },

  async create(input: CurrencyInput): Promise<Currency> {
    await execSQL(
      `INSERT INTO currency (code, name, symbol, decimal_places) VALUES (?, ?, ?, ?)`,
      [input.code, input.name, input.symbol, input.decimal_places ?? 2]
    )
    const id = await getLastInsertId()

    // Add fiat/crypto tag
    if (input.is_fiat) {
      await execSQL('INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.FIAT])
    } else if (input.is_crypto) {
      await execSQL('INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.CRYPTO])
    }

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
      values.push(id)
      await execSQL(`UPDATE currency SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    // Update fiat/crypto tags
    if (input.is_fiat !== undefined || input.is_crypto !== undefined) {
      await execSQL('DELETE FROM currency_to_tags WHERE currency_id = ? AND tag_id IN (?, ?)',
        [id, SYSTEM_TAGS.FIAT, SYSTEM_TAGS.CRYPTO])

      if (input.is_fiat) {
        await execSQL('INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.FIAT])
      } else if (input.is_crypto) {
        await execSQL('INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.CRYPTO])
      }
    }

    const currency = await this.findById(id)
    if (!currency) throw new Error('Currency not found')
    return currency
  },

  async setDefault(id: number): Promise<void> {
    // The trigger will remove default from other currencies
    await execSQL('INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.DEFAULT])
  },

  async delete(id: number): Promise<void> {
    // Check if currency is used by any account
    const accountCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM account WHERE currency_id = ?',
      [id]
    )
    if (accountCount && accountCount.count > 0) {
      throw new Error(`Cannot delete: ${accountCount.count} accounts use this currency`)
    }

    await execSQL('DELETE FROM currency WHERE id = ?', [id])
  },

  // Exchange rate methods
  async getExchangeRate(currencyId: number): Promise<ExchangeRate | null> {
    return queryOne<ExchangeRate>(
      'SELECT * FROM exchange_rate WHERE currency_id = ? ORDER BY updated_at DESC LIMIT 1',
      [currencyId]
    )
  },

  async getAllExchangeRates(): Promise<ExchangeRate[]> {
    return querySQL<ExchangeRate>(`
      SELECT er.*
      FROM exchange_rate er
      WHERE er.updated_at = (
        SELECT MAX(er2.updated_at)
        FROM exchange_rate er2
        WHERE er2.currency_id = er.currency_id
      )
    `)
  },

  async setExchangeRate(currencyId: number, rate: number): Promise<void> {
    await execSQL(
      'INSERT INTO exchange_rate (currency_id, rate) VALUES (?, ?)',
      [currencyId, rate]
    )
  },
}
