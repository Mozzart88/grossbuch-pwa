import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Account, AccountInput } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { currencyRepository } from './currencyRepository'

// Interface for the 'accounts' view
interface AccountView {
  id: number
  wallet: string
  currency: string
  tags: string | null
  real_balance: number
  actual_balance: number
  created_at: number
  updated_at: number
}

export const accountRepository = {
  // Get all accounts using the view
  async findAll(): Promise<AccountView[]> {
    return querySQL<AccountView>('SELECT * FROM accounts')
  },

  async findById(id: number): Promise<Account | null> {
    const account = await queryOne<Account>(`
      SELECT
        a.*,
        w.name as wallet,
        c.code as currency,
        c.decimal_places,
        EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
      FROM account a
      JOIN wallet w ON a.wallet_id = w.id
      JOIN currency c ON a.currency_id = c.id
      WHERE a.id = ?
    `, [SYSTEM_TAGS.DEFAULT, id])
    return account
  },

  async findByWalletId(walletId: number): Promise<Account[]> {
    return querySQL<Account>(`
      SELECT
        a.*,
        w.name as wallet,
        c.code as currency,
        c.decimal_places,
        EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
      FROM account a
      JOIN wallet w ON a.wallet_id = w.id
      JOIN currency c ON a.currency_id = c.id
      WHERE a.wallet_id = ?
      ORDER BY is_default DESC, c.code ASC
    `, [SYSTEM_TAGS.DEFAULT, walletId])
  },

  async findByCurrencyId(currencyId: number): Promise<Account[]> {
    return querySQL<Account>(`
      SELECT
        a.*,
        w.name as wallet,
        c.code as currency,
        c.decimal_places,
        EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
      FROM account a
      JOIN wallet w ON a.wallet_id = w.id
      JOIN currency c ON a.currency_id = c.id
      WHERE a.currency_id = ?
      ORDER BY w.name ASC
    `, [SYSTEM_TAGS.DEFAULT, currencyId])
  },

  async findByWalletAndCurrency(walletId: number, currencyId: number): Promise<Account | null> {
    return queryOne<Account>(`
      SELECT
        a.*,
        w.name as wallet,
        c.code as currency,
        c.decimal_places,
        EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
      FROM account a
      JOIN wallet w ON a.wallet_id = w.id
      JOIN currency c ON a.currency_id = c.id
      WHERE a.wallet_id = ? AND a.currency_id = ?
    `, [SYSTEM_TAGS.DEFAULT, walletId, currencyId])
  },

  async create(input: AccountInput): Promise<Account> {
    // Check if this wallet already has an account with this currency
    const existing = await this.findByWalletAndCurrency(input.wallet_id, input.currency_id)
    if (existing) {
      throw new Error('This wallet already has an account with this currency')
    }

    await execSQL(
      'INSERT INTO account (wallet_id, currency_id) VALUES (?, ?)',
      [input.wallet_id, input.currency_id]
    )
    const id = await getLastInsertId()

    const account = await this.findById(id)
    if (!account) throw new Error('Failed to create account')
    return account
  },

  async setDefault(id: number): Promise<void> {
    // The trigger handles removing default from other accounts in same wallet
    await execSQL('INSERT INTO account_to_tags (account_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.DEFAULT])
  },

  async delete(id: number): Promise<void> {
    // Check if account has transactions (will fail due to RESTRICT on foreign key)
    const txCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM trx_base WHERE account_id = ?',
      [id]
    )
    if (txCount && txCount.count > 0) {
      throw new Error(`Cannot delete: ${txCount.count} transactions linked to this account`)
    }

    // Triggers handle: setting new default, deleting wallet if last account
    await execSQL('DELETE FROM account WHERE id = ?', [id])
  },

  // Calculate total balance across all accounts in default currency
  async getTotalBalance(): Promise<{ real: number; actual: number }> {
    const result = await queryOne<{ real_total: number; actual_total: number }>(`
      SELECT
        COALESCE(SUM(real_balance), 0) as real_total,
        COALESCE(SUM(actual_balance), 0) as actual_total
      FROM account
    `)

    return {
      real: result?.real_total ?? 0,
      actual: result?.actual_total ?? 0,
    }
  },

  // Get total balance for a specific wallet
  async getWalletBalance(walletId: number): Promise<{ real: number; actual: number }> {
    const result = await queryOne<{ real_total: number; actual_total: number }>(`
      SELECT
        COALESCE(SUM(real_balance), 0) as real_total,
        COALESCE(SUM(actual_balance), 0) as actual_total
      FROM account
      WHERE wallet_id = ?
    `, [walletId])

    return {
      real: result?.real_total ?? 0,
      actual: result?.actual_total ?? 0,
    }
  },

  // Convert amount from one currency to another using exchange rates
  async convertAmount(
    amount: number,
    fromCurrencyId: number,
    toCurrencyId: number
  ): Promise<number> {
    if (fromCurrencyId === toCurrencyId) {
      return amount
    }

    const fromRate = await currencyRepository.getExchangeRate(fromCurrencyId)
    const toRate = await currencyRepository.getExchangeRate(toCurrencyId)

    if (!fromRate || !toRate) {
      // No exchange rate available, return original amount
      return amount
    }

    // Convert: amount * (fromRate / toRate)
    return Math.round((amount * fromRate.rate) / toRate.rate)
  },
}
