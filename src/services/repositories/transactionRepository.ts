import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Transaction, TransactionInput } from '../../types'
import { toLocalDateTime } from '../../utils/dateUtils'

export const transactionRepository = {
  async findByMonth(month: string): Promise<Transaction[]> {
    return querySQL<Transaction>(`
      SELECT
        t.*,
        c.name as category_name,
        c.icon as category_icon,
        a.name as account_name,
        cp.name as counterparty_name,
        cur.code as currency_code,
        cur.symbol as currency_symbol,
        ta.name as to_account_name,
        tcur.code as to_currency_code,
        tcur.symbol as to_currency_symbol
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN counterparties cp ON t.counterparty_id = cp.id
      LEFT JOIN currencies cur ON t.currency_id = cur.id
      LEFT JOIN accounts ta ON t.to_account_id = ta.id
      LEFT JOIN currencies tcur ON t.to_currency_id = tcur.id
      WHERE substr(t.date_time, 1, 7) = ?
      ORDER BY t.date_time DESC, t.id DESC
    `, [month])
  },

  async findById(id: number): Promise<Transaction | null> {
    const transactions = await querySQL<Transaction>(`
      SELECT
        t.*,
        c.name as category_name,
        c.icon as category_icon,
        a.name as account_name,
        cp.name as counterparty_name,
        cur.code as currency_code,
        cur.symbol as currency_symbol,
        ta.name as to_account_name,
        tcur.code as to_currency_code,
        tcur.symbol as to_currency_symbol
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN counterparties cp ON t.counterparty_id = cp.id
      LEFT JOIN currencies cur ON t.currency_id = cur.id
      LEFT JOIN accounts ta ON t.to_account_id = ta.id
      LEFT JOIN currencies tcur ON t.to_currency_id = tcur.id
      WHERE t.id = ?
    `, [id])
    return transactions[0] || null
  },

  async getMonthSummary(month: string, currencyId?: number): Promise<{ income: number; expenses: number }> {
    let sql = `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
      FROM transactions
      WHERE substr(date_time, 1, 7) = ?
    `
    const bind: unknown[] = [month]

    if (currencyId) {
      sql += ' AND currency_id = ?'
      bind.push(currencyId)
    }

    const result = await queryOne<{ income: number; expenses: number }>(sql, bind)

    return {
      income: result?.income ?? 0,
      expenses: result?.expenses ?? 0,
    }
  },

  async create(input: TransactionInput): Promise<Transaction> {
    const columns = [
      'type', 'amount', 'currency_id', 'account_id', 'category_id',
      'counterparty_id', 'to_account_id', 'to_amount', 'to_currency_id',
      'exchange_rate', 'date_time', 'notes'
    ]

    const values = [
      input.type,
      input.amount,
      input.currency_id,
      input.account_id,
      input.category_id ?? null,
      input.counterparty_id ?? null,
      input.to_account_id ?? null,
      input.to_amount ?? null,
      input.to_currency_id ?? null,
      input.exchange_rate ?? null,
      input.date_time ?? toLocalDateTime(new Date()),
      input.notes ?? null
    ]

    const placeholders = columns.map(() => '?').join(', ')
    await execSQL(`INSERT INTO transactions (${columns.join(', ')}) VALUES (${placeholders})`, values)

    const id = await getLastInsertId()
    const transaction = await this.findById(id)
    if (!transaction) throw new Error('Failed to create transaction')
    return transaction
  },

  async update(id: number, input: Partial<TransactionInput>): Promise<Transaction> {
    const fields: string[] = []
    const values: unknown[] = []

    if (input.type !== undefined) {
      fields.push('type = ?')
      values.push(input.type)
    }
    if (input.amount !== undefined) {
      fields.push('amount = ?')
      values.push(input.amount)
    }
    if (input.currency_id !== undefined) {
      fields.push('currency_id = ?')
      values.push(input.currency_id)
    }
    if (input.account_id !== undefined) {
      fields.push('account_id = ?')
      values.push(input.account_id)
    }
    if (input.category_id !== undefined) {
      fields.push('category_id = ?')
      values.push(input.category_id)
    }
    if (input.counterparty_id !== undefined) {
      fields.push('counterparty_id = ?')
      values.push(input.counterparty_id)
    }
    if (input.to_account_id !== undefined) {
      fields.push('to_account_id = ?')
      values.push(input.to_account_id)
    }
    if (input.to_amount !== undefined) {
      fields.push('to_amount = ?')
      values.push(input.to_amount)
    }
    if (input.to_currency_id !== undefined) {
      fields.push('to_currency_id = ?')
      values.push(input.to_currency_id)
    }
    if (input.exchange_rate !== undefined) {
      fields.push('exchange_rate = ?')
      values.push(input.exchange_rate)
    }
    if (input.date_time !== undefined) {
      fields.push('date_time = ?')
      values.push(input.date_time)
    }
    if (input.notes !== undefined) {
      fields.push('notes = ?')
      values.push(input.notes)
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      values.push(id)
      await execSQL(`UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    const transaction = await this.findById(id)
    if (!transaction) throw new Error('Transaction not found')
    return transaction
  },

  async delete(id: number): Promise<void> {
    await execSQL('DELETE FROM transactions WHERE id = ?', [id])
  },

  // Get latest exchange rates to convert any currency to the target currency
  // Returns Map<fromCurrencyId, rate> where rate * fromAmount = toAmount in target currency
  async getExchangeRates(toCurrencyId: number): Promise<Map<number, number>> {
    const rates = new Map<number, number>()

    // Rate for same currency is always 1
    rates.set(toCurrencyId, 1)

    // Get latest exchange transactions for each currency pair
    // Direct: from other currency to target currency
    const directRates = await querySQL<{
      currency_id: number
      rate: number
    }>(`
      SELECT
        t.currency_id,
        t.to_amount / t.amount as rate
      FROM transactions t
      WHERE t.type = 'exchange'
        AND t.to_currency_id = ?
        AND t.id = (
          SELECT t2.id FROM transactions t2
          WHERE t2.type = 'exchange'
            AND t2.currency_id = t.currency_id
            AND t2.to_currency_id = ?
          ORDER BY t2.date_time DESC
          LIMIT 1
        )
    `, [toCurrencyId, toCurrencyId])

    for (const row of directRates) {
      rates.set(row.currency_id, row.rate)
    }

    // Inverse: from target currency to other currency (need to invert the rate)
    const inverseRates = await querySQL<{
      to_currency_id: number
      rate: number
    }>(`
      SELECT
        t.to_currency_id,
        t.amount / t.to_amount as rate
      FROM transactions t
      WHERE t.type = 'exchange'
        AND t.currency_id = ?
        AND t.id = (
          SELECT t2.id FROM transactions t2
          WHERE t2.type = 'exchange'
            AND t2.currency_id = ?
            AND t2.to_currency_id = t.to_currency_id
          ORDER BY t2.date_time DESC
          LIMIT 1
        )
    `, [toCurrencyId, toCurrencyId])

    for (const row of inverseRates) {
      // Only add if we don't have a direct rate (direct rate is more accurate)
      if (!rates.has(row.to_currency_id)) {
        rates.set(row.to_currency_id, row.rate)
      }
    }

    return rates
  },

  async findAllForExport(startDate?: string, endDate?: string): Promise<Transaction[]> {
    let sql = `
      SELECT
        t.*,
        c.name as category_name,
        a.name as account_name,
        cp.name as counterparty_name,
        cur.code as currency_code,
        ta.name as to_account_name,
        tcur.code as to_currency_code
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN counterparties cp ON t.counterparty_id = cp.id
      LEFT JOIN currencies cur ON t.currency_id = cur.id
      LEFT JOIN accounts ta ON t.to_account_id = ta.id
      LEFT JOIN currencies tcur ON t.to_currency_id = tcur.id
    `

    const conditions: string[] = []
    const bind: unknown[] = []

    if (startDate) {
      conditions.push('t.date_time >= ?')
      bind.push(startDate)
    }
    if (endDate) {
      conditions.push('t.date_time <= ?')
      bind.push(endDate)
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }

    sql += ' ORDER BY t.date_time ASC'

    return querySQL<Transaction>(sql, bind)
  },
}
