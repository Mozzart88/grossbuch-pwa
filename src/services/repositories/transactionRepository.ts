import { querySQL, queryOne, execSQL } from '../database'
import type {
  Transaction,
  TransactionInput,
  TransactionLine,
  TransactionLineInput,
  TransactionLog,
  ExchangeView,
  TransferView,
  MonthlyTagSummary,
  MonthlyCounterpartySummary,
  MonthlyCategoryBreakdown,
  TransactionFilter,
} from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { currencyRepository } from './currencyRepository'
import { accountRepository } from './accountRepository'

export const transactionRepository = {
  // Get transactions for a month using the view
  // Excludes INITIAL transactions (tag_id=3) as they should not appear in TransactionsList
  async findByMonth(yearMonth: string): Promise<TransactionLog[]> {
    // yearMonth format: "YYYY-MM"
    return querySQL<TransactionLog>(`
      SELECT * FROM trx_log
      WHERE date_time LIKE ?
        AND tags NOT LIKE '%initial%'
      ORDER BY date_time DESC
    `, [`${yearMonth}%`])
  },

  // Get transactions for a month with optional filters
  async findByMonthFiltered(yearMonth: string, filter?: TransactionFilter): Promise<TransactionLog[]> {
    // If no filter, use the standard view query
    if (!filter || (!filter.tagId && filter.counterpartyId === undefined && !filter.type)) {
      return this.findByMonth(yearMonth)
    }

    // Build a query similar to trx_log view but with filters
    const conditions: string[] = [
      `datetime(t.timestamp, 'unixepoch', 'localtime') LIKE ?`,
      'tag_id NOT IN (?, ?, ?)'
    ]
    const params: unknown[] = [
      `${yearMonth}%`,
      SYSTEM_TAGS.EXCHANGE,
      SYSTEM_TAGS.TRANSFER,
      SYSTEM_TAGS.INITIAL
    ]

    // Filter by tag_id
    if (filter.tagId !== undefined) {
      conditions.push('tb.tag_id = ?')
      params.push(filter.tagId)
    }

    // Filter by counterparty_id (0 means "No counterparty" - NULL in database)
    if (filter.counterpartyId !== undefined) {
      if (filter.counterpartyId === 0) {
        conditions.push('t2c.counterparty_id IS NULL')
      } else {
        conditions.push('t2c.counterparty_id = ?')
        params.push(filter.counterpartyId)
      }
    }

    // Filter by type (income = '+', expense = '-')
    if (filter.type) {
      conditions.push(`tb.sign = ?`)
      params.push(filter.type === 'income' ? '+' : '-')
    }

    const sql = `
      SELECT
        t.id as id,
        datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
        c.name as counterparty,
        a.wallet as wallet,
        a.currency as currency,
        a.symbol as symbol,
        a.decimal_places as decimal_places,
        tag.name as tags,
        tb.amount_int as amount_int,
        tb.amount_frac as amount_frac,
        tb.sign as sign,
        tb.rate_int as rate_int,
        tb.rate_frac as rate_frac
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      JOIN accounts a ON tb.account_id = a.id
      JOIN tag ON tb.tag_id = tag.id
      LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
      LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.timestamp DESC
    `

    return querySQL<TransactionLog>(sql, params)
  },

  // Get full transaction log
  async getLog(limit?: number, offset?: number): Promise<TransactionLog[]> {
    let sql = 'SELECT * FROM trx_log ORDER BY date_time DESC'
    const params: unknown[] = []

    if (limit) {
      sql += ' LIMIT ?'
      params.push(limit)
    }
    if (offset) {
      sql += ' OFFSET ?'
      params.push(offset)
    }

    return querySQL<TransactionLog>(sql, params)
  },

  // Get transaction by ID with all lines
  async findById(id: Uint8Array): Promise<Transaction | null> {
    const trx = await queryOne<Transaction>(`
      SELECT
        t.*,
        c.name as counterparty,
        tc.counterparty_id,
        tn.note
      FROM trx t
      LEFT JOIN trx_to_counterparty tc ON tc.trx_id = t.id
      LEFT JOIN counterparty c ON tc.counterparty_id = c.id
      LEFT JOIN trx_note tn ON tn.trx_id = t.id
      WHERE t.id = ?
    `, [id])

    if (!trx) return null

    // Load transaction lines
    trx.lines = await querySQL<TransactionLine>(`
      SELECT
        tb.*,
        a.wallet,
        a.currency,
        tag.name as tag
      FROM trx_base tb
      JOIN accounts a ON tb.account_id = a.id
      JOIN tag ON tb.tag_id = tag.id
      WHERE tb.trx_id = ?
    `, [id])

    return trx
  },

  // Get month summary with rate conversion to default currency
  async getMonthSummary(yearMonth: string): Promise<{ income: number; expenses: number }> {
    const startTs = Math.floor(new Date(`${yearMonth}-01T00:00:00`).getTime() / 1000)
    const endDate = new Date(`${yearMonth}-01`)
    endDate.setMonth(endDate.getMonth() + 1)
    const endTs = Math.floor(endDate.getTime() / 1000)

    const result = await queryOne<{ income: number; expenses: number }>(`
      SELECT
        COALESCE(SUM(CASE WHEN tb.sign = '+' AND tb.tag_id NOT IN (?, ?, ?)
          THEN (tb.amount_int + tb.amount_frac * 1e-18)
               / (tb.rate_int + tb.rate_frac * 1e-18)
          ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN tb.sign = '-' AND tb.tag_id NOT IN (?, ?, ?)
          THEN (tb.amount_int + tb.amount_frac * 1e-18)
               / (tb.rate_int + tb.rate_frac * 1e-18)
          ELSE 0 END), 0) as expenses
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      WHERE t.timestamp >= ? AND t.timestamp < ?
        AND (tb.rate_int > 0 OR tb.rate_frac > 0)
    `, [
      SYSTEM_TAGS.INITIAL, SYSTEM_TAGS.TRANSFER, SYSTEM_TAGS.EXCHANGE,
      SYSTEM_TAGS.INITIAL, SYSTEM_TAGS.TRANSFER, SYSTEM_TAGS.EXCHANGE,
      startTs, endTs
    ])

    return {
      income: result?.income ?? 0,
      expenses: result?.expenses ?? 0,
    }
  },

  // Get day summary with rate conversion to default currency
  // Returns net amount (income - expenses) for a specific date
  async getDaySummary(date: string, filter?: TransactionFilter): Promise<number> {
    const startTs = Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000)
    const endTs = Math.floor(new Date(`${date}T23:59:59`).getTime() / 1000) + 1

    const conditions: string[] = [
      `t.timestamp >= ? AND t.timestamp < ?`,
      '(tb.rate_int > 0 OR tb.rate_frac > 0)'
    ]
    const params: unknown[] = [
      SYSTEM_TAGS.EXCHANGE,
      SYSTEM_TAGS.TRANSFER,
      SYSTEM_TAGS.INITIAL,
      startTs, endTs,
    ]

    if (filter) {
      if (filter.tagId !== undefined) {
        conditions.push('tb.tag_id = ?')
        params.push(filter.tagId)
      }
      if (filter.counterpartyId !== undefined) {
        if (filter.counterpartyId === 0) {
          conditions.push('t2c.counterparty_id IS NULL')
        } else {
          conditions.push('t2c.counterparty_id = ?')
          params.push(filter.counterpartyId)
        }
      }
      if (filter.type) {
        conditions.push(`tb.sign = ?`)
        params.push(filter.type === 'income' ? '+' : '-')
      }
    }

    const result = await queryOne<{ net: number }>(`
      SELECT
        COALESCE(SUM(CASE
          WHEN tb.tag_id NOT IN (?, ?, ?)
          THEN (CASE WHEN tb.sign = '+' THEN 1 ELSE -1 END)
               * (tb.amount_int + tb.amount_frac * 1e-18)
               / (tb.rate_int + tb.rate_frac * 1e-18)
          ELSE 0 END), 0) as net
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
      LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
      WHERE ${conditions.join(' AND ')}
    `, params)

    return result?.net ?? 0
  },

  // Get monthly tags summary with rate conversion to default currency
  async getMonthlyTagsSummary(yearMonth: string): Promise<MonthlyTagSummary[]> {
    const startTs = Math.floor(new Date(`${yearMonth}-01T00:00:00`).getTime() / 1000)
    const endDate = new Date(`${yearMonth}-01`)
    endDate.setMonth(endDate.getMonth() + 1)
    const endTs = Math.floor(endDate.getTime() / 1000)

    return querySQL<MonthlyTagSummary>(`
      SELECT
        tb.tag_id,
        tag.name as tag,
        COALESCE(SUM(CASE WHEN tb.sign = '+'
          THEN (tb.amount_int + tb.amount_frac * 1e-18)
               / (tb.rate_int + tb.rate_frac * 1e-18)
          ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN tb.sign = '-'
          THEN (tb.amount_int + tb.amount_frac * 1e-18)
               / (tb.rate_int + tb.rate_frac * 1e-18)
          ELSE 0 END), 0) as expense,
        COALESCE(SUM(CASE WHEN tb.sign = '+' THEN 1 ELSE -1 END
          * (tb.amount_int + tb.amount_frac * 1e-18)
          / (tb.rate_int + tb.rate_frac * 1e-18)), 0) as net
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      JOIN tag ON tb.tag_id = tag.id
      WHERE t.timestamp >= ? AND t.timestamp < ?
        AND (tb.rate_int > 0 OR tb.rate_frac > 0)
        AND tb.tag_id NOT IN (?, ?, ?)
      GROUP BY tb.tag_id, tag.name
      ORDER BY ABS(net) DESC
    `, [
      startTs, endTs,
      SYSTEM_TAGS.INITIAL, SYSTEM_TAGS.TRANSFER, SYSTEM_TAGS.EXCHANGE
    ])
  },

  // Get monthly counterparties summary with rate conversion to default currency
  async getMonthlyCounterpartiesSummary(yearMonth: string): Promise<MonthlyCounterpartySummary[]> {
    const startTs = Math.floor(new Date(`${yearMonth}-01T00:00:00`).getTime() / 1000)
    const endDate = new Date(`${yearMonth}-01`)
    endDate.setMonth(endDate.getMonth() + 1)
    const endTs = Math.floor(endDate.getTime() / 1000)

    return querySQL<MonthlyCounterpartySummary>(`
      SELECT
        COALESCE(tc.counterparty_id, 0) as counterparty_id,
        COALESCE(cp.name, 'No counterparty') as counterparty,
        COALESCE(SUM(CASE WHEN tb.sign = '+'
          THEN (tb.amount_int + tb.amount_frac * 1e-18)
               / (tb.rate_int + tb.rate_frac * 1e-18)
          ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN tb.sign = '-'
          THEN (tb.amount_int + tb.amount_frac * 1e-18)
               / (tb.rate_int + tb.rate_frac * 1e-18)
          ELSE 0 END), 0) as expense,
        COALESCE(SUM(CASE WHEN tb.sign = '+' THEN 1 ELSE -1 END
          * (tb.amount_int + tb.amount_frac * 1e-18)
          / (tb.rate_int + tb.rate_frac * 1e-18)), 0) as net
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      LEFT JOIN trx_to_counterparty tc ON tc.trx_id = t.id
      LEFT JOIN counterparty cp ON tc.counterparty_id = cp.id
      WHERE t.timestamp >= ? AND t.timestamp < ?
        AND (tb.rate_int > 0 OR tb.rate_frac > 0)
        AND tb.tag_id NOT IN (?, ?, ?)
      GROUP BY tc.counterparty_id, cp.name
      ORDER BY ABS(net) DESC
    `, [
      startTs, endTs,
      SYSTEM_TAGS.INITIAL, SYSTEM_TAGS.TRANSFER, SYSTEM_TAGS.EXCHANGE
    ])
  },

  // Get monthly category breakdown by income/expense type
  async getMonthlyCategoryBreakdown(yearMonth: string): Promise<MonthlyCategoryBreakdown[]> {
    const startTs = Math.floor(new Date(`${yearMonth}-01T00:00:00`).getTime() / 1000)
    const endDate = new Date(`${yearMonth}-01`)
    endDate.setMonth(endDate.getMonth() + 1)
    const endTs = Math.floor(endDate.getTime() / 1000)

    return querySQL<MonthlyCategoryBreakdown>(`
      SELECT
        tb.tag_id,
        tag.name as tag,
        COALESCE(SUM(
          (tb.amount_int + tb.amount_frac * 1e-18)
          / (tb.rate_int + tb.rate_frac * 1e-18)
        ), 0) as amount,
        CASE WHEN tb.sign = '+' THEN 'income' ELSE 'expense' END as type
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      JOIN tag ON tb.tag_id = tag.id
      WHERE t.timestamp >= ? AND t.timestamp < ?
        AND (tb.rate_int > 0 OR tb.rate_frac > 0)
        AND tb.tag_id NOT IN (?, ?, ?)
      GROUP BY tb.tag_id, tag.name, tb.sign
      ORDER BY amount DESC
    `, [
      startTs, endTs,
      SYSTEM_TAGS.INITIAL, SYSTEM_TAGS.TRANSFER, SYSTEM_TAGS.EXCHANGE
    ])
  },

  // Create a new transaction
  async create(input: TransactionInput): Promise<Transaction> {
    // Insert transaction header
    const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000)

    await execSQL(
      'INSERT INTO trx (id, timestamp) VALUES (randomblob(8), ?)',
      [timestamp]
    )

    // Get the created transaction ID
    const trxResult = await queryOne<{ id: Uint8Array }>(
      'SELECT id FROM trx ORDER BY rowid DESC LIMIT 1'
    )
    if (!trxResult) throw new Error('Failed to create transaction')
    const trxId = trxResult.id

    // Link counterparty if provided
    if (input.counterparty_id) {
      await execSQL(
        'INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)',
        [trxId, input.counterparty_id]
      )
    }

    // Insert note at transaction level if provided
    if (input.note) {
      await execSQL(
        'INSERT INTO trx_note (trx_id, note) VALUES (?, ?)',
        [trxId, input.note]
      )
    }

    // Insert transaction lines
    for (const line of input.lines) {
      await this.addLine(trxId, line)
    }

    const transaction = await this.findById(trxId)
    if (!transaction) throw new Error('Failed to create transaction')
    return transaction
  },

  // Add a line to an existing transaction
  async addLine(trxId: Uint8Array, line: TransactionLineInput): Promise<TransactionLine> {
    // Auto-populate rate if not provided or is 0
    let rateInt = line.rate_int ?? 0
    let rateFrac = line.rate_frac ?? 0
    if (rateInt === 0 && rateFrac === 0) {
      // Get account's currency_id and fetch the rate
      const account = await accountRepository.findById(line.account_id)
      if (account) {
        const rate = await currencyRepository.getRateForCurrency(account.currency_id)
        rateInt = rate.int
        rateFrac = rate.frac
      }
    }

    await execSQL(`
      INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac)
      VALUES (randomblob(8), ?, ?, ?, ?, ?, ?, ?, ?)
    `, [trxId, line.account_id, line.tag_id, line.sign, line.amount_int, line.amount_frac, rateInt, rateFrac])

    // Get the created line ID
    const lineResult = await queryOne<{ id: Uint8Array }>(
      'SELECT id FROM trx_base ORDER BY rowid DESC LIMIT 1'
    )
    if (!lineResult) throw new Error('Failed to create transaction line')

    const result = await queryOne<TransactionLine>(`
      SELECT
        tb.*,
        a.wallet,
        a.currency,
        tag.name as tag
      FROM trx_base tb
      JOIN accounts a ON tb.account_id = a.id
      JOIN tag ON tb.tag_id = tag.id
      WHERE tb.id = ?
    `, [lineResult.id])

    if (!result) throw new Error('Failed to retrieve transaction line')
    return result
  },

  // Update a transaction line
  async updateLine(
    lineId: Uint8Array,
    input: Partial<TransactionLineInput>
  ): Promise<TransactionLine> {
    const fields: string[] = []
    const values: unknown[] = []

    if (input.account_id !== undefined) {
      fields.push('account_id = ?')
      values.push(input.account_id)
    }
    if (input.tag_id !== undefined) {
      fields.push('tag_id = ?')
      values.push(input.tag_id)
    }
    if (input.sign !== undefined) {
      fields.push('sign = ?')
      values.push(input.sign)
    }
    if (input.amount_int !== undefined) {
      fields.push('amount_int = ?')
      values.push(input.amount_int)
    }
    if (input.amount_frac !== undefined) {
      fields.push('amount_frac = ?')
      values.push(input.amount_frac)
    }
    if (input.rate_int !== undefined) {
      fields.push('rate_int = ?')
      values.push(input.rate_int)
    }
    if (input.rate_frac !== undefined) {
      fields.push('rate_frac = ?')
      values.push(input.rate_frac)
    }

    if (fields.length > 0) {
      await execSQL(
        `UPDATE trx_base SET ${fields.join(', ')} WHERE id = ?`,
        [...values, lineId]
      )
    }

    const result = await queryOne<TransactionLine>(`
      SELECT
        tb.*,
        a.wallet,
        a.currency,
        tag.name as tag
      FROM trx_base tb
      JOIN accounts a ON tb.account_id = a.id
      JOIN tag ON tb.tag_id = tag.id
      WHERE tb.id = ?
    `, [lineId])

    if (!result) throw new Error('Transaction line not found')
    return result
  },

  // Delete a transaction line
  async deleteLine(lineId: Uint8Array): Promise<void> {
    await execSQL('DELETE FROM trx_base WHERE id = ?', [lineId])
  },

  // Delete entire transaction
  async delete(id: Uint8Array): Promise<void> {
    await execSQL('DELETE FROM trx WHERE id = ?', [id])
  },

  // Update an existing transaction
  async update(id: Uint8Array, input: TransactionInput): Promise<Transaction> {
    const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000)

    // Update transaction header
    await execSQL(
      'UPDATE trx SET timestamp = ? WHERE id = ?',
      [timestamp, id]
    )

    // Manage counterparty
    await execSQL('DELETE FROM trx_to_counterparty WHERE trx_id = ?', [id])
    if (input.counterparty_id) {
      await execSQL(
        'INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)',
        [id, input.counterparty_id]
      )
    } else if (input.counterparty_name) {
      // Auto-create counterparty if name provided
      await execSQL(`
        INSERT INTO counterparty (name)
        SELECT ?
        WHERE NOT EXISTS (SELECT 1 FROM counterparty WHERE name = ?)
      `, [input.counterparty_name, input.counterparty_name])

      await execSQL(`
        INSERT INTO trx_to_counterparty (trx_id, counterparty_id)
        VALUES (?, (SELECT id FROM counterparty WHERE name = ?))
      `, [id, input.counterparty_name])
    }

    // Update note at transaction level
    await execSQL('DELETE FROM trx_note WHERE trx_id = ?', [id])
    if (input.note) {
      await execSQL(
        'INSERT INTO trx_note (trx_id, note) VALUES (?, ?)',
        [id, input.note]
      )
    }

    // Wipe and recreate transaction lines
    await execSQL('DELETE FROM trx_base WHERE trx_id = ?', [id])
    for (const line of input.lines) {
      await this.addLine(id, line)
    }

    const transaction = await this.findById(id)
    if (!transaction) throw new Error('Failed to update transaction')
    return transaction
  },

  // Get exchanges view
  async getExchanges(limit?: number): Promise<ExchangeView[]> {
    let sql = 'SELECT * FROM exchanges ORDER BY date_time DESC'
    if (limit) {
      sql += ` LIMIT ${limit}`
    }
    return querySQL<ExchangeView>(sql)
  },

  // Get transfers view
  async getTransfers(limit?: number): Promise<TransferView[]> {
    let sql = 'SELECT * FROM transfers ORDER BY date_time DESC'
    if (limit) {
      sql += ` LIMIT ${limit}`
    }
    return querySQL<TransferView>(sql)
  },

  // Export all transactions for a date range
  async findAllForExport(startTs?: number, endTs?: number): Promise<TransactionLog[]> {
    let sql = 'SELECT * FROM trx_log'
    const conditions: string[] = []
    const params: unknown[] = []

    if (startTs) {
      conditions.push('date_time >= datetime(?, \'unixepoch\', \'localtime\')')
      params.push(startTs)
    }
    if (endTs) {
      conditions.push('date_time <= datetime(?, \'unixepoch\', \'localtime\')')
      params.push(endTs)
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }

    sql += ' ORDER BY date_time ASC'

    return querySQL<TransactionLog>(sql, params)
  },

  // Export all transactions with full detail columns and filters
  async findAllForExportDetailed(filters: {
    startDate?: string
    endDate?: string
    walletIds?: number[]
    accountIds?: number[]
    tagIds?: number[]
    counterpartyIds?: number[]
  }): Promise<{
    date_time: string
    trx_id: Uint8Array
    account_id: number
    wallet_name: string
    currency_code: string
    tag_id: number
    tag_name: string
    sign: '+' | '-'
    amount_int: number
    amount_frac: number
    decimal_places: number
    rate_int: number
    rate_frac: number
    counterparty_id: number | null
    counterparty_name: string | null
    note: string | null
  }[]> {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters.startDate) {
      const startTs = Math.floor(new Date(filters.startDate + 'T00:00:00').getTime() / 1000)
      conditions.push('t.timestamp >= ?')
      params.push(startTs)
    }
    if (filters.endDate) {
      const endTs = Math.floor(new Date(filters.endDate + 'T23:59:59').getTime() / 1000)
      conditions.push('t.timestamp <= ?')
      params.push(endTs)
    }
    if (filters.walletIds && filters.walletIds.length > 0) {
      conditions.push(`w.id IN (${filters.walletIds.map(() => '?').join(',')})`)
      params.push(...filters.walletIds)
    }
    if (filters.accountIds && filters.accountIds.length > 0) {
      conditions.push(`tb.account_id IN (${filters.accountIds.map(() => '?').join(',')})`)
      params.push(...filters.accountIds)
    }
    if (filters.tagIds && filters.tagIds.length > 0) {
      conditions.push(`tb.tag_id IN (${filters.tagIds.map(() => '?').join(',')})`)
      params.push(...filters.tagIds)
    }
    if (filters.counterpartyIds && filters.counterpartyIds.length > 0) {
      conditions.push(`t2c.counterparty_id IN (${filters.counterpartyIds.map(() => '?').join(',')})`)
      params.push(...filters.counterpartyIds)
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    return querySQL(`
      SELECT
        strftime('%Y-%m-%dT%H:%M:%S', t.timestamp, 'unixepoch', 'localtime') as date_time,
        t.id as trx_id,
        tb.account_id,
        w.name as wallet_name,
        c.code as currency_code,
        tb.tag_id,
        tag.name as tag_name,
        tb.sign,
        tb.amount_int,
        tb.amount_frac,
        c.decimal_places,
        tb.rate_int,
        tb.rate_frac,
        t2c.counterparty_id,
        cp.name as counterparty_name,
        tn.note
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      JOIN account a ON tb.account_id = a.id
      JOIN wallet w ON a.wallet_id = w.id
      JOIN currency c ON a.currency_id = c.id
      JOIN tag ON tb.tag_id = tag.id
      LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
      LEFT JOIN counterparty cp ON t2c.counterparty_id = cp.id
      LEFT JOIN trx_note tn ON tn.trx_id = t.id
      ${whereClause}
      ORDER BY t.timestamp ASC
    `, params)
  },

  // Check if a transaction exists by blob ID
  async existsByTrxId(trxId: Uint8Array): Promise<boolean> {
    const result = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM trx WHERE id = ?',
      [trxId]
    )
    return (result?.count ?? 0) > 0
  },

  // Create a transaction with a specific blob ID (for import)
  async createWithId(trxId: Uint8Array, timestamp: number): Promise<void> {
    await execSQL(
      'INSERT INTO trx (id, timestamp) VALUES (?, ?)',
      [trxId, timestamp]
    )
  },

  // Add a transaction line for import (uses exact rate from CSV, randomblob for trx_base.id)
  async addImportLine(trxId: Uint8Array, line: TransactionLineInput): Promise<void> {
    await execSQL(`
      INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac)
      VALUES (randomblob(8), ?, ?, ?, ?, ?, ?, ?, ?)
    `, [trxId, line.account_id, line.tag_id, line.sign, line.amount_int, line.amount_frac, line.rate_int ?? 0, line.rate_frac ?? 0])
  },

  // Get transactions for a specific account and month (includes ALL transaction types)
  async findByAccountAndMonth(accountId: number, yearMonth: string): Promise<TransactionLog[]> {
    const sql = `
      SELECT
        t.id as id,
        datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
        c.name as counterparty,
        a.wallet as wallet,
        a.currency as currency,
        a.symbol as symbol,
        a.decimal_places as decimal_places,
        tag.name as tags,
        tb.amount_int as amount_int,
        tb.amount_frac as amount_frac,
        tb.sign as sign,
        tb.rate_int as rate_int,
        tb.rate_frac as rate_frac
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      JOIN accounts a ON tb.account_id = a.id
      JOIN tag ON tb.tag_id = tag.id
      LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
      LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
      WHERE datetime(t.timestamp, 'unixepoch', 'localtime') LIKE ?
        AND t.id IN (
          SELECT DISTINCT trx_id FROM trx_base WHERE account_id = ?
        )
      ORDER BY t.timestamp DESC
    `
    return querySQL<TransactionLog>(sql, [`${yearMonth}%`, accountId])
  },

  // Get day summary for a specific account (net amount in account's currency)
  async getAccountDaySummary(accountId: number, date: string): Promise<number> {
    const startTs = Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000)
    const endTs = Math.floor(new Date(`${date}T23:59:59`).getTime() / 1000) + 1

    const result = await queryOne<{ net: number }>(`
      SELECT
        COALESCE(SUM(
          CASE WHEN tb.sign = '+'
          THEN (tb.amount_int + tb.amount_frac * 1e-18)
          ELSE -(tb.amount_int + tb.amount_frac * 1e-18)
          END
        ), 0) as net
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      WHERE t.timestamp >= ? AND t.timestamp < ?
        AND tb.account_id = ?
    `, [startTs, endTs, accountId])

    return result?.net ?? 0
  },

  // Get the net sum of all transactions for an account AFTER a given month
  async getAccountTransactionsAfterMonth(accountId: number, yearMonth: string): Promise<number> {
    const [year, month] = yearMonth.split('-').map(Number)
    const nextMonth = new Date(year, month, 1)
    const startTs = Math.floor(nextMonth.getTime() / 1000)

    const result = await queryOne<{ net: number }>(`
      SELECT
        COALESCE(SUM(
          CASE WHEN tb.sign = '+'
          THEN (tb.amount_int + tb.amount_frac * 1e-18)
          ELSE -(tb.amount_int + tb.amount_frac * 1e-18)
          END
        ), 0) as net
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      WHERE t.timestamp >= ?
        AND tb.account_id = ?
    `, [startTs, accountId])

    return result?.net ?? 0
  },

  // Check if account has an INITIAL transaction
  async hasInitialTransaction(accountId: number): Promise<boolean> {
    const result = await queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM trx_base
      WHERE account_id = ? AND tag_id = ?
    `, [accountId, SYSTEM_TAGS.INITIAL])
    return (result?.count ?? 0) > 0
  },

  // Get first transaction timestamp (excluding INITIAL/ADJUSTMENT)
  async getFirstTransactionTimestamp(accountId: number): Promise<number | null> {
    const result = await queryOne<{ timestamp: number }>(`
      SELECT MIN(t.timestamp) as timestamp
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      WHERE tb.account_id = ?
        AND tb.tag_id NOT IN (?, ?)
    `, [accountId, SYSTEM_TAGS.INITIAL, SYSTEM_TAGS.ADJUSTMENT])
    return result?.timestamp ?? null
  },

  // Create balance adjustment transaction
  async createBalanceAdjustment(
    accountId: number,
    currentBalanceInt: number,
    currentBalanceFrac: number,
    targetBalanceInt: number,
    targetBalanceFrac: number
  ): Promise<Transaction> {
    // Compute difference as float for sign determination
    const current = currentBalanceInt + Number(currentBalanceFrac) / 1e18
    const target = targetBalanceInt + targetBalanceFrac / 1e18
    const difference = target - current
    if (difference === 0) {
      throw new Error('No adjustment needed')
    }

    const sign: '+' | '-' = difference > 0 ? '+' : '-'
    // Compute absolute difference as IntFrac
    const absDiff = Math.abs(difference)
    const amountInt = Math.floor(absDiff)
    const amountFrac = Math.round((absDiff - amountInt) * 1e18)

    const hasInitial = await this.hasInitialTransaction(accountId)
    let tagId: number
    let timestamp: number

    if (hasInitial) {
      tagId = SYSTEM_TAGS.ADJUSTMENT
      timestamp = Math.floor(Date.now() / 1000)
    } else {
      tagId = SYSTEM_TAGS.INITIAL
      const firstTs = await this.getFirstTransactionTimestamp(accountId)
      if (firstTs) {
        const firstDate = new Date(firstTs * 1000)
        firstDate.setHours(0, 0, 0, 0)
        timestamp = Math.floor(firstDate.getTime() / 1000)
      } else {
        timestamp = Math.floor(Date.now() / 1000)
      }
    }

    return this.create({
      timestamp,
      lines: [
        {
          account_id: accountId,
          tag_id: tagId,
          sign,
          amount_int: amountInt,
          amount_frac: amountFrac,
          rate_int: 0,
          rate_frac: 0,
        },
      ],
    })
  },
}
