import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Currency, CurrencyInput, ExchangeRate } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import type { IntFrac } from '../../utils/amount'

export const currencyRepository = {
  async findAll(): Promise<Currency[]> {
    const currencies = await querySQL<Currency>(`
      SELECT
        *
      FROM currencies
      ORDER BY is_system DESC, name ASC
    `)
    return currencies
  },

  // Find currencies that are linked to at least one account (active or virtual)
  async findUsedInAccounts(): Promise<Currency[]> {
    const currencies = await querySQL<Currency>(`
      SELECT DISTINCT
        c.*
      FROM currencies c
      INNER JOIN account a ON a.currency_id = c.id
      ORDER BY is_system DESC, name ASC
    `)
    return currencies
  },

  async findById(id: number): Promise<Currency | null> {
    return queryOne<Currency>(`
      SELECT
        *
      FROM currencies
      WHERE id = ?
    `, [id])
  },

  async findByCode(code: string): Promise<Currency | null> {
    return queryOne<Currency>(`
      SELECT
        *
      FROM currencies
      WHERE code = ?
    `, [code])
  },

  async findSystem(): Promise<Currency | null> {
    return queryOne<Currency>(`
      SELECT *
      FROM currencies
      WHERE is_system = 1
    `)
  },

  async findPaymentDefault(): Promise<Currency | null> {
    return queryOne<Currency>(`
      SELECT *
      FROM currencies
      WHERE is_payment_default = 1
    `)
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

  async setSystem(id: number): Promise<void> {
    // The trigger will remove system tag from other currencies
    await execSQL('INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.SYSTEM])
    // System currency also gets the default payment tag
    await execSQL('INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.DEFAULT])
  },

  async setPaymentDefault(id: number): Promise<void> {
    // The trigger will remove default tag from other currencies
    await execSQL('INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.DEFAULT])
  },

  async clearPaymentDefault(): Promise<void> {
    // Remove tag_id=2 from all currencies, then re-add to system currency
    await execSQL('DELETE FROM currency_to_tags WHERE tag_id = ?', [SYSTEM_TAGS.DEFAULT])
    await execSQL(
      'INSERT INTO currency_to_tags (currency_id, tag_id) SELECT currency_id, ? FROM currency_to_tags WHERE tag_id = ?',
      [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.SYSTEM]
    )
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

  async setExchangeRate(currencyId: number, rateInt: number, rateFrac: number): Promise<void> {
    await execSQL(
      'INSERT INTO exchange_rate (currency_id, rate_int, rate_frac) VALUES (?, ?, ?)',
      [currencyId, rateInt, rateFrac]
    )
  },

  /**
   * Get the exchange rate for a currency to convert to default currency.
   * Returns IntFrac:
   * - {int: 1, frac: 0} for the system currency (1.00 rate)
   * - Latest rate from exchange_rate table for non-system currencies
   * - {int: 1, frac: 0} as fallback if no rate exists
   */
  async getRateForCurrency(currencyId: number): Promise<IntFrac> {
    const currency = await this.findById(currencyId)
    if (!currency) {
      return { int: 1, frac: 0 }
    }

    // Check if this is the system currency
    if (currency.is_system) {
      return { int: 1, frac: 0 }
    }

    // Get latest rate from exchange_rate table
    const rate = await this.getExchangeRate(currencyId)
    if (rate) {
      return { int: rate.rate_int, frac: rate.rate_frac }
    }
    return { int: 1, frac: 0 }
  },
}
