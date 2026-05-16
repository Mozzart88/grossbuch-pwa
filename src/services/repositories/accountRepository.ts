import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Account, AccountInput, AccountType } from '../../types'
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
  balance_int: number
  balance_frac: number
  updated_at: number
}

const TYPE_TAG_NAMES: Record<Exclude<AccountType, 'plain'>, string> = {
  savings: 'savings',
  credits: 'credits',
}

async function getAccountTypeTagId(accountType: AccountType): Promise<number | null> {
  if (accountType === 'plain') return null
  const row = await queryOne<{ id: number }>('SELECT id FROM tag WHERE name = ?', [TYPE_TAG_NAMES[accountType]])
  return row?.id ?? null
}

function accountTypeSelect(alias = 'a') {
  return `CASE
        WHEN EXISTS(
          SELECT 1 FROM account_to_tags a2t
          JOIN tag atag ON atag.id = a2t.tag_id
          WHERE a2t.account_id = ${alias}.id AND atag.name = 'savings'
        ) THEN 'savings'
        WHEN EXISTS(
          SELECT 1 FROM account_to_tags a2t
          JOIN tag atag ON atag.id = a2t.tag_id
          WHERE a2t.account_id = ${alias}.id AND atag.name = 'credits'
        ) THEN 'credits'
        ELSE 'plain'
      END`
}

async function validateUniqueAccountType(accountId: number, accountType: AccountType): Promise<void> {
  const account = await queryOne<{ wallet_id: number; currency_id: number }>(
    'SELECT wallet_id, currency_id FROM account WHERE id = ?',
    [accountId]
  )
  if (!account) throw new Error('Account not found')

  const duplicate = await queryOne<{ id: number }>(`
    SELECT other.id
    FROM account other
    WHERE other.wallet_id = ?
      AND other.currency_id = ?
      AND other.id != ?
      AND ${accountTypeSelect('other')} = ?
    LIMIT 1
  `, [account.wallet_id, account.currency_id, accountId, accountType])

  if (duplicate) {
    throw new Error('This wallet already has an account with this currency and type')
  }
}

async function syncAccountType(accountId: number, accountType: AccountType): Promise<void> {
  await validateUniqueAccountType(accountId, accountType)

  await execSQL(`
    DELETE FROM account_to_tags
    WHERE account_id = ?
      AND tag_id IN (SELECT id FROM tag WHERE name IN ('savings', 'credits'))
  `, [accountId])

  const typeTagId = await getAccountTypeTagId(accountType)
  if (typeTagId) {
    await execSQL('INSERT OR IGNORE INTO account_to_tags (account_id, tag_id) VALUES (?, ?)', [accountId, typeTagId])
  }
}

async function upsertAccountData(accountId: number, input: Partial<AccountInput>): Promise<void> {
  const hasData = input.note !== undefined || input.due_date !== undefined || input.rate !== undefined
  if (!hasData) return

  const note = input.note ?? null
  const dueDate = input.due_date ?? null
  const rate = input.rate ?? null

  if (note || dueDate || rate !== null) {
    await execSQL(`
      INSERT INTO account_data (account_id, note, due_date, rate)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        note = excluded.note,
        due_date = excluded.due_date,
        rate = excluded.rate
    `, [accountId, note, dueDate, rate])
  } else {
    await execSQL('DELETE FROM account_data WHERE account_id = ?', [accountId])
  }
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
        c.symbol,
        c.decimal_places,
        ${accountTypeSelect('a')} as account_type,
        ad.note,
        ad.due_date,
        ad.rate,
        EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
      FROM account a
      JOIN wallet w ON a.wallet_id = w.id
      JOIN currency c ON a.currency_id = c.id
      LEFT JOIN account_data ad ON ad.account_id = a.id
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
        c.symbol,
        c.decimal_places,
        ${accountTypeSelect('a')} as account_type,
        ad.note,
        ad.due_date,
        ad.rate,
        EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
      FROM account a
      JOIN wallet w ON a.wallet_id = w.id
      JOIN currency c ON a.currency_id = c.id
      LEFT JOIN account_data ad ON ad.account_id = a.id
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
        c.symbol,
        c.decimal_places,
        ${accountTypeSelect('a')} as account_type,
        ad.note,
        ad.due_date,
        ad.rate,
        EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
      FROM account a
      JOIN wallet w ON a.wallet_id = w.id
      JOIN currency c ON a.currency_id = c.id
      LEFT JOIN account_data ad ON ad.account_id = a.id
      WHERE a.currency_id = ?
      ORDER BY w.name ASC
    `, [SYSTEM_TAGS.DEFAULT, currencyId])
  },

  async findByWalletAndCurrency(walletId: number, currencyId: number, accountType?: AccountType): Promise<Account | null> {
    const typeCondition = accountType ? `AND ${accountTypeSelect('a')} = ?` : ''
    const params = accountType
      ? [SYSTEM_TAGS.DEFAULT, walletId, currencyId, accountType]
      : [SYSTEM_TAGS.DEFAULT, walletId, currencyId]

    return queryOne<Account>(`
      SELECT
        a.*,
        w.name as wallet,
        c.code as currency,
        c.symbol,
        c.decimal_places,
        ${accountTypeSelect('a')} as account_type,
        ad.note,
        ad.due_date,
        ad.rate,
        EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
      FROM account a
      JOIN wallet w ON a.wallet_id = w.id
      JOIN currency c ON a.currency_id = c.id
      LEFT JOIN account_data ad ON ad.account_id = a.id
      WHERE a.wallet_id = ? AND a.currency_id = ?
        ${typeCondition}
    `, params)
  },

  async create(input: AccountInput): Promise<Account> {
    const accountType = input.account_type ?? 'plain'
    const existing = await this.findByWalletAndCurrency(input.wallet_id, input.currency_id, accountType)
    if (existing) {
      throw new Error('This wallet already has an account with this currency and type')
    }

    await execSQL(
      'INSERT INTO account (wallet_id, currency_id) VALUES (?, ?)',
      [input.wallet_id, input.currency_id]
    )
    const id = await getLastInsertId()
    if (input.account_type !== undefined) {
      await syncAccountType(id, accountType)
    }
    await upsertAccountData(id, input)

    const account = await this.findById(id)
    if (!account) throw new Error('Failed to create account')
    return account
  },

  async updateData(id: number, input: Pick<AccountInput, 'account_type' | 'note' | 'due_date' | 'rate'>): Promise<Account> {
    if (input.account_type !== undefined) {
      await syncAccountType(id, input.account_type)
    }
    await upsertAccountData(id, input)
    const account = await this.findById(id)
    if (!account) throw new Error('Account not found')
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
  async getTotalBalance(): Promise<number> {
    return this.getTotalBalanceWhere('')
  },

  async getPlainTotalBalance(): Promise<number> {
    return this.getTotalBalanceWhere(`
      WHERE NOT EXISTS (
        SELECT 1 FROM account_to_tags a2t
        JOIN tag account_tag ON account_tag.id = a2t.tag_id
        WHERE a2t.account_id = a.id
          AND account_tag.name IN ('savings', 'credits')
      )
    `)
  },

  async getTotalBalanceWhere(whereClause: string): Promise<number> {
    const { rate: sysRate, currencyId: sysCurrencyId } = await currencyRepository.getSystemRateInfo()

    const result = await queryOne<{ total: number }>(`
      SELECT
        COALESCE(SUM(
          CASE WHEN a.currency_id = ?
            THEN (a.balance_int + a.balance_frac * 1e-18)
            ELSE (a.balance_int + a.balance_frac * 1e-18)
                 / (COALESCE(
                   (SELECT (er.rate_int + er.rate_frac * 1e-18) FROM exchange_rate er
                    WHERE er.currency_id = a.currency_id
                    ORDER BY er.updated_at DESC LIMIT 1),
                   1.0
                 ))
                 * ?
      END
        ), 0) as total
      FROM account a
      JOIN currency c ON a.currency_id = c.id
      ${whereClause}
    `, [sysCurrencyId, sysRate])

    return result?.total ?? 0
  },

  async getWalletBalancesInSystemCurrency(): Promise<Record<number, number>> {
    const { rate: sysRate, currencyId: sysCurrencyId } = await currencyRepository.getSystemRateInfo()

    const rows = await querySQL<{ wallet_id: number; total: number }>(`
      SELECT
        a.wallet_id,
        COALESCE(SUM(
          CASE WHEN a.currency_id = ?
            THEN (a.balance_int + a.balance_frac * 1e-18)
            ELSE (a.balance_int + a.balance_frac * 1e-18)
                 / (COALESCE(
                   (SELECT (er.rate_int + er.rate_frac * 1e-18) FROM exchange_rate er
                    WHERE er.currency_id = a.currency_id
                    ORDER BY er.updated_at DESC LIMIT 1),
                   1.0
                 ))
                 * ?
          END
        ), 0) as total
      FROM account a
      GROUP BY a.wallet_id
    `, [sysCurrencyId, sysRate])

    return Object.fromEntries(rows.map(r => [r.wallet_id, r.total]))
  },

  // Get total balance for a specific wallet
  async getWalletBalance(walletId: number): Promise<number> {
    const result = await queryOne<{ total: number }>(`
      SELECT
        COALESCE(SUM(balance_int + balance_frac * 1e-18), 0) as total
      FROM account
      WHERE wallet_id = ?
    `, [walletId])

    return result?.total ?? 0
  },

  // Convert amount from one currency to another using exchange rates
  async convertAmount(
    amountInt: number,
    amountFrac: number,
    fromCurrencyId: number,
    toCurrencyId: number
  ): Promise<{ int: number; frac: number }> {
    if (fromCurrencyId === toCurrencyId) {
      return { int: amountInt, frac: amountFrac }
    }

    const fromRate = await currencyRepository.getExchangeRate(fromCurrencyId)
    const toRate = await currencyRepository.getExchangeRate(toCurrencyId)

    if (!fromRate || !toRate) {
      return { int: amountInt, frac: amountFrac }
    }

    const amount = amountInt + amountFrac / 1e18
    const fromRateVal = fromRate.rate_int + fromRate.rate_frac / 1e18
    const toRateVal = toRate.rate_int + toRate.rate_frac / 1e18
    const converted = amount * fromRateVal / toRateVal
    const resultInt = Math.floor(converted)
    const resultFrac = Math.round((converted - resultInt) * 1e18)
    return { int: resultInt, frac: resultFrac }
  },
}
