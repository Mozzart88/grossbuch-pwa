import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Wallet, WalletInput, Account } from '../../types'
import { SYSTEM_TAGS } from '../../types'

export const walletRepository = {
  async findAll(): Promise<Wallet[]> {
    const wallets = await querySQL<Wallet>(`
      SELECT
        w.*,
        EXISTS(SELECT 1 FROM wallet_to_tags WHERE wallet_id = w.id AND tag_id = ?) as is_default,
        EXISTS(SELECT 1 FROM wallet_to_tags WHERE wallet_id = w.id AND tag_id = ?) as is_archived
      FROM wallet w
      ORDER BY is_default DESC, name ASC
    `, [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.ARCHIVED])

    // Load accounts for each wallet
    for (const wallet of wallets) {
      wallet.accounts = await querySQL<Account>(`
        SELECT
          a.*,
          c.code as currency,
          EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
        FROM account a
        JOIN currency c ON a.currency_id = c.id
        WHERE a.wallet_id = ?
        ORDER BY is_default DESC, c.code ASC
      `, [SYSTEM_TAGS.DEFAULT, wallet.id])
    }

    return wallets
  },

  async findActive(): Promise<Wallet[]> {
    const wallets = await querySQL<Wallet>(`
      SELECT
        w.*,
        EXISTS(SELECT 1 FROM wallet_to_tags WHERE wallet_id = w.id AND tag_id = ?) as is_default
      FROM wallet w
      WHERE NOT EXISTS(SELECT 1 FROM wallet_to_tags WHERE wallet_id = w.id AND tag_id = ?)
      ORDER BY is_default DESC, name ASC
    `, [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.ARCHIVED])

    for (const wallet of wallets) {
      wallet.accounts = await querySQL<Account>(`
        SELECT
          a.*,
          c.code as currency,
          EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
        FROM account a
        JOIN currency c ON a.currency_id = c.id
        WHERE a.wallet_id = ?
        ORDER BY is_default DESC, c.code ASC
      `, [SYSTEM_TAGS.DEFAULT, wallet.id])
    }

    return wallets
  },

  async findById(id: number): Promise<Wallet | null> {
    const wallet = await queryOne<Wallet>(`
      SELECT
        w.*,
        EXISTS(SELECT 1 FROM wallet_to_tags WHERE wallet_id = w.id AND tag_id = ?) as is_default,
        EXISTS(SELECT 1 FROM wallet_to_tags WHERE wallet_id = w.id AND tag_id = ?) as is_archived
      FROM wallet w
      WHERE w.id = ?
    `, [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.ARCHIVED, id])

    if (!wallet) return null

    wallet.accounts = await querySQL<Account>(`
      SELECT
        a.*,
        c.code as currency,
        EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
      FROM account a
      JOIN currency c ON a.currency_id = c.id
      WHERE a.wallet_id = ?
      ORDER BY is_default DESC, c.code ASC
    `, [SYSTEM_TAGS.DEFAULT, id])

    return wallet
  },

  async findByName(name: string): Promise<Wallet | null> {
    return queryOne<Wallet>('SELECT * FROM wallet WHERE name = ?', [name])
  },

  async findDefault(): Promise<Wallet | null> {
    const wallet = await queryOne<Wallet>(`
      SELECT w.*, 1 as is_default
      FROM wallet w
      JOIN wallet_to_tags wt ON wt.wallet_id = w.id
      WHERE wt.tag_id = ?
    `, [SYSTEM_TAGS.DEFAULT])

    if (!wallet) return null

    wallet.accounts = await querySQL<Account>(`
      SELECT
        a.*,
        c.code as currency,
        EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
      FROM account a
      JOIN currency c ON a.currency_id = c.id
      WHERE a.wallet_id = ?
      ORDER BY is_default DESC, c.code ASC
    `, [SYSTEM_TAGS.DEFAULT, wallet.id])

    return wallet
  },

  async create(input: WalletInput): Promise<Wallet> {
    // Check for unique name
    const existing = await this.findByName(input.name)
    if (existing) {
      throw new Error('Wallet with this name already exists')
    }

    await execSQL(
      `INSERT INTO wallet (name, icon, color) VALUES (?, ?, ?)`,
      [input.name, input.icon ?? null, input.color ?? null]
    )
    const id = await getLastInsertId()

    const wallet = await this.findById(id)
    if (!wallet) throw new Error('Failed to create wallet')
    return wallet
  },

  async update(id: number, input: Partial<WalletInput>): Promise<Wallet> {
    // Check for unique name if updating name
    if (input.name) {
      const existing = await this.findByName(input.name)
      if (existing && existing.id !== id) {
        throw new Error('Wallet with this name already exists')
      }
    }

    const fields: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      values.push(input.name)
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
      fields.push("updated_at = strftime('%s', datetime('now', 'localtime'))")
      values.push(id)
      await execSQL(`UPDATE wallet SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    const wallet = await this.findById(id)
    if (!wallet) throw new Error('Wallet not found')
    return wallet
  },

  async setDefault(id: number): Promise<void> {
    // The trigger will remove default from other wallets
    await execSQL('INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.DEFAULT])
  },

  async archive(id: number): Promise<void> {
    await execSQL('INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)', [id, SYSTEM_TAGS.ARCHIVED])
  },

  async unarchive(id: number): Promise<void> {
    await execSQL('DELETE FROM wallet_to_tags WHERE wallet_id = ? AND tag_id = ?', [id, SYSTEM_TAGS.ARCHIVED])
  },

  async delete(id: number): Promise<void> {
    // Check if wallet has any transactions
    const txCount = await queryOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM trx_base tb
      JOIN account a ON tb.account_id = a.id
      WHERE a.wallet_id = ?
    `, [id])

    if (txCount && txCount.count > 0) {
      throw new Error(`Cannot delete: ${txCount.count} transactions linked to accounts in this wallet`)
    }

    // Accounts will be deleted by CASCADE
    await execSQL('DELETE FROM wallet WHERE id = ?', [id])
  },

  // Add an account (currency) to the wallet
  async addAccount(walletId: number, currencyId: number): Promise<Account> {
    // Check if this wallet already has an account with this currency
    const existing = await queryOne<Account>(
      'SELECT * FROM account WHERE wallet_id = ? AND currency_id = ?',
      [walletId, currencyId]
    )
    if (existing) {
      throw new Error('This wallet already has an account with this currency')
    }

    await execSQL(
      'INSERT INTO account (wallet_id, currency_id) VALUES (?, ?)',
      [walletId, currencyId]
    )
    const id = await getLastInsertId()

    const account = await queryOne<Account>(`
      SELECT
        a.*,
        c.code as currency,
        EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
      FROM account a
      JOIN currency c ON a.currency_id = c.id
      WHERE a.id = ?
    `, [SYSTEM_TAGS.DEFAULT, id])

    if (!account) throw new Error('Failed to create account')
    return account
  },
}
