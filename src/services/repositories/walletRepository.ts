import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Wallet, WalletInput, Account } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { transactionRepository } from './transactionRepository'
import { toIntFrac } from '../../utils/amount'

export const walletRepository = {
  async findAll(): Promise<Wallet[]> {
    const wallets = await querySQL<Wallet>(`
      SELECT
        w.*,
        EXISTS(SELECT 1 FROM wallet_to_tags WHERE wallet_id = w.id AND tag_id = ?) as is_default,
        EXISTS(SELECT 1 FROM wallet_to_tags WHERE wallet_id = w.id AND tag_id = ?) as is_archived,
        EXISTS(SELECT 1 FROM wallet_to_tags WHERE wallet_id = w.id AND tag_id = ?) as is_virtual
      FROM wallet w
      ORDER BY is_default DESC, name ASC
    `, [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.ARCHIVED, SYSTEM_TAGS.SYSTEM])

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
        AND NOT EXISTS(SELECT 1 FROM wallet_to_tags WHERE wallet_id = w.id AND tag_id = ?)
      ORDER BY is_default DESC, name ASC
    `, [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.ARCHIVED, SYSTEM_TAGS.SYSTEM])

    for (const wallet of wallets) {
      wallet.accounts = await querySQL<Account>(`
        SELECT
          a.*,
          c.code as currency,
          EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
        FROM account a
        JOIN currency c ON a.currency_id = c.id
        WHERE a.wallet_id = ?
          AND NOT EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?)
        ORDER BY is_default DESC, c.code ASC
      `, [SYSTEM_TAGS.DEFAULT, wallet.id, SYSTEM_TAGS.SYSTEM])
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
      `INSERT INTO wallet (name, color) VALUES (?, ?)`,
      [input.name, input.color ?? null]
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
    if (input.color !== undefined) {
      fields.push('color = ?')
      values.push(input.color)
    }

    if (fields.length > 0) {
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
  // If initialBalance is provided (> 0), creates an INITIAL transaction
  async addAccount(walletId: number, currencyId: number, initialBalance?: number): Promise<Account> {
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

    // Create INITIAL transaction if initialBalance > 0
    if (initialBalance && initialBalance > 0) {
      const { int: amount_int, frac: amount_frac } = toIntFrac(initialBalance)
      await transactionRepository.create({
        lines: [{
          account_id: account.id,
          tag_id: SYSTEM_TAGS.INITIAL,
          sign: '+',
          amount_int,
          amount_frac,
          rate_int: 0,
          rate_frac: 0,  // Will auto-populate from currency rate
        }]
      })
    }

    return account
  },

  // Find existing account in the same wallet with the target currency
  async findAccountByCurrency(walletId: number, currencyId: number): Promise<Account | null> {
    return queryOne<Account>(`
      SELECT
        a.*,
        c.code as currency,
        c.symbol,
        c.decimal_places,
        EXISTS(SELECT 1 FROM account_to_tags WHERE account_id = a.id AND tag_id = ?) as is_default
      FROM account a
      JOIN currency c ON a.currency_id = c.id
      WHERE a.wallet_id = ? AND a.currency_id = ?
    `, [SYSTEM_TAGS.DEFAULT, walletId, currencyId])
  },

  // Create a virtual account marked with SYSTEM tag
  async createVirtualAccount(currencyId: number): Promise<Account> {
    // Find or create "Virtual" wallet with SYSTEM tag
    let virtualWallet = await queryOne<Wallet>(`
      SELECT w.*
      FROM wallet w
      JOIN wallet_to_tags wt ON wt.wallet_id = w.id
      WHERE w.name = 'Virtual' AND wt.tag_id = ?
    `, [SYSTEM_TAGS.SYSTEM])

    if (!virtualWallet) {
      await execSQL('INSERT INTO wallet (name, color) VALUES (?, ?)', ['Virtual', '#808080'])
      const walletId = await getLastInsertId()
      await execSQL('INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)', [walletId, SYSTEM_TAGS.SYSTEM])
      virtualWallet = await this.findById(walletId)
      if (!virtualWallet) throw new Error('Failed to create virtual wallet')
    }

    // Check if virtual account for this currency already exists
    const existingVirtual = await queryOne<Account>(
      'SELECT * FROM account WHERE wallet_id = ? AND currency_id = ?',
      [virtualWallet.id, currencyId]
    )
    if (existingVirtual) {
      return existingVirtual
    }

    // Create the account
    await execSQL(
      'INSERT INTO account (wallet_id, currency_id) VALUES (?, ?)',
      [virtualWallet.id, currencyId]
    )
    const accountId = await getLastInsertId()

    // Mark account with SYSTEM tag
    await execSQL(
      'INSERT INTO account_to_tags (account_id, tag_id) VALUES (?, ?)',
      [accountId, SYSTEM_TAGS.SYSTEM]
    )

    const account = await queryOne<Account>(`
      SELECT
        a.*,
        c.code as currency,
        c.symbol,
        c.decimal_places
      FROM account a
      JOIN currency c ON a.currency_id = c.id
      WHERE a.id = ?
    `, [accountId])

    if (!account) throw new Error('Failed to create virtual account')
    return account
  },

  // Find or create: prefers existing account, falls back to virtual
  async findOrCreateAccountForCurrency(walletId: number, currencyId: number): Promise<Account> {
    // First check for existing account in the same wallet
    const sameWalletAccount = await this.findAccountByCurrency(walletId, currencyId)
    if (sameWalletAccount) {
      return sameWalletAccount
    }

    // Create virtual account as last resort
    return this.createVirtualAccount(currencyId)
  },
}
