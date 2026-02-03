import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Account, AccountInput } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { currencyRepository } from './currencyRepository'

// Interface for the 'accounts' view
interface AccountView {
  id: number
  wallet: string
  currency: string
  symbol: string
  decimal_places: number
  tags: string | null
  balance: number
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
    // Check if account has any non-INITIAL transactions
    const nonInitialCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM trx_base WHERE account_id = ? AND tag_id != ?',
      [id, SYSTEM_TAGS.INITIAL]
    )
    if (nonInitialCount && nonInitialCount.count > 0) {
      throw new Error(`Cannot delete: ${nonInitialCount.count} transactions linked to this account`)
    }

    // Delete any INITIAL transactions for this account (allowed)
    // First get the trx_ids to delete the parent trx records
    const initialTrxIds = await querySQL<{ trx_id: Uint8Array }>(
      'SELECT trx_id FROM trx_base WHERE account_id = ? AND tag_id = ?',
      [id, SYSTEM_TAGS.INITIAL]
    )
    for (const { trx_id } of initialTrxIds) {
      await execSQL('DELETE FROM trx WHERE id = ?', [trx_id])
    }

    // Triggers handle: setting new default, deleting wallet if last account
    await execSQL('DELETE FROM account WHERE id = ?', [id])
  },

  // Calculate total balance across all accounts in default currency
  // Rate stored as: value * 10^decimal_places (integer)
  // Conversion: (balance * divisor) / (rate * divisor) * 10^def_decimal_places
  async getTotalBalance(): Promise<number> {
    const result = await queryOne<{ total: number }>(`
      WITH curr_dec AS (
        SELECT c.id as currency_id, power(10.0, -c.decimal_places) as divisor
        FROM currency c
      )
      SELECT
        COALESCE(SUM(
          (a.balance * cd.divisor) / (COALESCE(
            (SELECT er.rate FROM exchange_rate er
             WHERE er.currency_id = a.currency_id
             ORDER BY er.updated_at DESC LIMIT 1),
            power(10, c.decimal_places)
          ) * cd.divisor) * power(10, def.decimal_places)
        ), 0) as total
      FROM account a
      JOIN currency c ON a.currency_id = c.id
      JOIN curr_dec cd ON a.currency_id = cd.currency_id
      CROSS JOIN (SELECT decimal_places FROM currency
        JOIN currency_to_tags ON currency.id = currency_to_tags.currency_id
        WHERE tag_id = ? LIMIT 1) def
    `, [SYSTEM_TAGS.DEFAULT])

    return result?.total ?? 0
  },

  // Get total balance for a specific wallet
  async getWalletBalance(walletId: number): Promise<number> {
    const result = await queryOne<{ total: number }>(`
      SELECT
        COALESCE(SUM(balance), 0) as total
      FROM account
      WHERE wallet_id = ?
    `, [walletId])

    return result?.total ?? 0
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
