import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Account, AccountInput } from '../../types'
import { transactionRepository } from './transactionRepository'

export const accountRepository = {
  async findAll(): Promise<Account[]> {
    return querySQL<Account>(`
      SELECT
        a.*,
        c.code as currency_code,
        c.symbol as currency_symbol,
        c.decimal_places as currency_decimal_places,
        a.initial_balance + COALESCE(
          (SELECT SUM(
            CASE
              WHEN t.type = 'income' AND t.account_id = a.id THEN t.amount
              WHEN t.type = 'expense' AND t.account_id = a.id THEN -t.amount
              WHEN t.type = 'transfer' AND t.account_id = a.id THEN -t.amount
              WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN t.amount
              WHEN t.type = 'exchange' AND t.account_id = a.id THEN -t.amount
              WHEN t.type = 'exchange' AND t.to_account_id = a.id THEN t.to_amount
              ELSE 0
            END
          ) FROM transactions t
          WHERE t.account_id = a.id OR t.to_account_id = a.id), 0
        ) as current_balance
      FROM accounts a
      JOIN currencies c ON a.currency_id = c.id
      WHERE a.is_active = 1
      ORDER BY a.sort_order ASC, a.name ASC
    `)
  },

  async findById(id: number): Promise<Account | null> {
    const accounts = await querySQL<Account>(`
      SELECT
        a.*,
        c.code as currency_code,
        c.symbol as currency_symbol,
        c.decimal_places as currency_decimal_places,
        a.initial_balance + COALESCE(
          (SELECT SUM(
            CASE
              WHEN t.type = 'income' AND t.account_id = a.id THEN t.amount
              WHEN t.type = 'expense' AND t.account_id = a.id THEN -t.amount
              WHEN t.type = 'transfer' AND t.account_id = a.id THEN -t.amount
              WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN t.amount
              WHEN t.type = 'exchange' AND t.account_id = a.id THEN -t.amount
              WHEN t.type = 'exchange' AND t.to_account_id = a.id THEN t.to_amount
              ELSE 0
            END
          ) FROM transactions t
          WHERE t.account_id = a.id OR t.to_account_id = a.id), 0
        ) as current_balance
      FROM accounts a
      JOIN currencies c ON a.currency_id = c.id
      WHERE a.id = ?
    `, [id])
    return accounts[0] || null
  },

  async create(input: AccountInput): Promise<Account> {
    await execSQL(
      `INSERT INTO accounts (name, currency_id, initial_balance, icon, color) VALUES (?, ?, ?, ?, ?)`,
      [input.name, input.currency_id, input.initial_balance ?? 0, input.icon ?? null, input.color ?? null]
    )
    const id = await getLastInsertId()
    const account = await this.findById(id)
    if (!account) throw new Error('Failed to create account')
    return account
  },

  async update(id: number, input: Partial<AccountInput>): Promise<Account> {
    const fields: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      values.push(input.name)
    }
    if (input.currency_id !== undefined) {
      fields.push('currency_id = ?')
      values.push(input.currency_id)
    }
    if (input.initial_balance !== undefined) {
      fields.push('initial_balance = ?')
      values.push(input.initial_balance)
    }
    if (input.icon !== undefined) {
      fields.push('icon = ?')
      values.push(input.icon)
    }
    if (input.color !== undefined) {
      fields.push('color = ?')
      values.push(input.color)
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      values.push(id)
      await execSQL(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    const account = await this.findById(id)
    if (!account) throw new Error('Account not found')
    return account
  },

  async delete(id: number): Promise<void> {
    // Check if account has transactions
    const txCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM transactions WHERE account_id = ? OR to_account_id = ?',
      [id, id]
    )
    if (txCount && txCount.count > 0) {
      throw new Error(`Cannot delete: ${txCount.count} transactions linked to this account`)
    }

    await execSQL('DELETE FROM accounts WHERE id = ?', [id])
  },

  async archive(id: number): Promise<void> {
    await execSQL("UPDATE accounts SET is_active = 0, updated_at = datetime('now') WHERE id = ?", [id])
  },

  // Calculate total balance across all accounts converted to display currency
  async getTotalBalance(displayCurrencyId: number): Promise<number> {
    // Get all account balances with their currency
    const accounts = await this.findAll()

    if (accounts.length === 0) return 0

    // Get exchange rates to convert to display currency
    const rates = await transactionRepository.getExchangeRates(displayCurrencyId)

    let totalBalance = 0

    for (const account of accounts) {
      const balance = account.current_balance ?? 0
      const rate = rates.get(account.currency_id) ?? 1 // Default to 1 if no rate found

      totalBalance += balance * rate
    }

    return totalBalance
  },
}
