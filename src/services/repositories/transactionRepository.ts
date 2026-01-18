import { querySQL, queryOne, execSQL } from '../database'
import type {
  Transaction,
  TransactionInput,
  TransactionLine,
  TransactionLineInput,
  TransactionLog,
  ExchangeView,
  TransferView,
} from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { currencyRepository } from './currencyRepository'
import { accountRepository } from './accountRepository'

// Helper to convert Uint8Array to hex string for SQL
// function blobToHex(blob: Uint8Array): string {
//   return Array.from(blob)
//     .map((b) => b.toString(16).padStart(2, '0'))
//     .join('')
// }

export const transactionRepository = {
  // Get transactions for a month using the view
  async findByMonth(yearMonth: string): Promise<TransactionLog[]> {
    // yearMonth format: "YYYY-MM"
    return querySQL<TransactionLog>(`
      SELECT * FROM trx_log
      WHERE date_time LIKE ?
      ORDER BY date_time DESC
    `, [`${yearMonth}%`])
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
    // const hexId = blobToHex(id)

    const trx = await queryOne<Transaction>(`
      SELECT
        t.*,
        c.name as counterparty,
        tc.counterparty_id
      FROM trx t
      LEFT JOIN trx_to_counterparty tc ON tc.trx_id = t.id
      LEFT JOIN counterparty c ON tc.counterparty_id = c.id
      WHERE t.id = ?
    `, [id])

    if (!trx) return null

    // Load transaction lines
    trx.lines = await querySQL<TransactionLine>(`
      SELECT
        tb.*,
        a.wallet,
        a.currency,
        tag.name as tag,
        tn.note
      FROM trx_base tb
      JOIN accounts a ON tb.account_id = a.id
      JOIN tag ON tb.tag_id = tag.id
      LEFT JOIN trx_note tn ON tn.trx_base_id = tb.id
      WHERE tb.trx_id = ?
    `, [id])

    return trx
  },

  // Get month summary with rate conversion to default currency
  // Rate stored as: value * 10^decimal_places (integer)
  // Conversion: amount / rate * 10^def_decimal_places
  async getMonthSummary(yearMonth: string): Promise<{ income: number; expenses: number }> {
    const startTs = Math.floor(new Date(`${yearMonth}-01T00:00:00`).getTime() / 1000)
    const endDate = new Date(`${yearMonth}-01`)
    endDate.setMonth(endDate.getMonth() + 1)
    const endTs = Math.floor(endDate.getTime() / 1000)

    const result = await queryOne<{ income: number; expenses: number }>(`
      WITH curr_dec AS (
        SELECT c.id as currency_id, power(10.0, -c.decimal_places) as divisor
        FROM currency c
      )
      SELECT
        COALESCE(SUM(CASE WHEN tb.sign = '+' AND tb.tag_id NOT IN (?, ?, ?)
          THEN (tb.amount * cd.divisor) / (tb.rate * cd.divisor) * power(10, def.decimal_places)
          ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN tb.sign = '-' AND tb.tag_id NOT IN (?, ?, ?)
          THEN (tb.amount * cd.divisor) / (tb.rate * cd.divisor) * power(10, def.decimal_places)
          ELSE 0 END), 0) as expenses
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      JOIN account a ON tb.account_id = a.id
      JOIN curr_dec cd ON a.currency_id = cd.currency_id
      CROSS JOIN (SELECT decimal_places FROM currency
        JOIN currency_to_tags ON currency.id = currency_to_tags.currency_id
        WHERE tag_id = ? LIMIT 1) def
      WHERE t.timestamp >= ? AND t.timestamp < ?
        AND tb.rate > 0
    `, [
      SYSTEM_TAGS.INITIAL, SYSTEM_TAGS.TRANSFER, SYSTEM_TAGS.EXCHANGE,
      SYSTEM_TAGS.INITIAL, SYSTEM_TAGS.TRANSFER, SYSTEM_TAGS.EXCHANGE,
      SYSTEM_TAGS.DEFAULT,
      startTs, endTs
    ])

    return {
      income: result?.income ?? 0,
      expenses: result?.expenses ?? 0,
    }
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
    // const hexId = blobToHex(trxId)

    // Link counterparty if provided
    if (input.counterparty_id) {
      await execSQL(
        'INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)',
        [trxId, input.counterparty_id]
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
      `, [trxId, input.counterparty_name])
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
    let rate = line.rate ?? 0
    if (rate === 0) {
      // Get account's currency_id and fetch the rate
      const account = await accountRepository.findById(line.account_id)
      if (account) {
        rate = await currencyRepository.getRateForCurrency(account.currency_id)
      }
    }

    await execSQL(`
      INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate)
      VALUES (randomblob(8), ?, ?, ?, ?, ?, ?)
    `, [trxId, line.account_id, line.tag_id, line.sign, line.amount, rate])

    // Get the created line ID
    const lineResult = await queryOne<{ id: Uint8Array }>(
      'SELECT id FROM trx_base ORDER BY rowid DESC LIMIT 1'
    )
    if (!lineResult) throw new Error('Failed to create transaction line')

    // Add note if provided
    if (line.note) {
      // const hexLineId = blobToHex(lineResult.id)
      await execSQL(
        'INSERT INTO trx_note (trx_base_id, note) VALUES (?, ?)',
        [lineResult.id, line.note]
      )
    }

    const result = await queryOne<TransactionLine>(`
      SELECT
        tb.*,
        a.wallet,
        a.currency,
        tag.name as tag,
        tn.note
      FROM trx_base tb
      JOIN accounts a ON tb.account_id = a.id
      JOIN tag ON tb.tag_id = tag.id
      LEFT JOIN trx_note tn ON tn.trx_base_id = tb.id
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
    // const hexId = blobToHex(lineId)
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
    if (input.amount !== undefined) {
      fields.push('amount = ?')
      values.push(input.amount)
    }
    if (input.rate !== undefined) {
      fields.push('rate = ?')
      values.push(input.rate)
    }

    if (fields.length > 0) {
      await execSQL(
        `UPDATE trx_base SET ${fields.join(', ')} WHERE id = ?`,
        [...values, lineId]
      )
    }

    // Update note
    if (input.note !== undefined) {
      await execSQL('DELETE FROM trx_note WHERE trx_base_id = ?', [lineId])
      if (input.note) {
        await execSQL(
          'INSERT INTO trx_note (trx_base_id, note) VALUES (?, ?)',
          [lineId, input.note]
        )
      }
    }

    const result = await queryOne<TransactionLine>(`
      SELECT
        tb.*,
        a.wallet,
        a.currency,
        tag.name as tag,
        tn.note
      FROM trx_base tb
      JOIN accounts a ON tb.account_id = a.id
      JOIN tag ON tb.tag_id = tag.id
      LEFT JOIN trx_note tn ON tn.trx_base_id = tb.id
      WHERE tb.id = ?
    `, [lineId])

    if (!result) throw new Error('Transaction line not found')
    return result
  },

  // Delete a transaction line
  async deleteLine(lineId: Uint8Array): Promise<void> {
    // const hexId = blobToHex(lineId)
    await execSQL('DELETE FROM trx_base WHERE id = ?', [lineId])
  },

  // Delete entire transaction
  async delete(id: Uint8Array): Promise<void> {
    // const hexId = blobToHex(id)
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

  // Helper to create income transaction
  async createIncome(
    accountId: number,
    tagId: number,
    amount: number,
    options?: {
      rate?: number
      counterpartyId?: number
      counterpartyName?: string
      note?: string
      timestamp?: number
    }
  ): Promise<Transaction> {
    return this.create({
      counterparty_id: options?.counterpartyId,
      counterparty_name: options?.counterpartyName,
      timestamp: options?.timestamp,
      lines: [
        {
          account_id: accountId,
          tag_id: tagId,
          sign: '+',
          amount: amount,
          rate: options?.rate,
          note: options?.note,
        },
      ],
    })
  },

  // Helper to create expense transaction
  async createExpense(
    accountId: number,
    tagId: number,
    amount: number,
    options?: {
      rate?: number
      counterpartyId?: number
      counterpartyName?: string
      note?: string
      timestamp?: number
    }
  ): Promise<Transaction> {
    return this.create({
      counterparty_id: options?.counterpartyId,
      counterparty_name: options?.counterpartyName,
      timestamp: options?.timestamp,
      lines: [
        {
          account_id: accountId,
          tag_id: tagId,
          sign: '-',
          amount: amount,
          rate: options?.rate,
          note: options?.note,
        },
      ],
    })
  },

  // Helper to create transfer transaction
  async createTransfer(
    fromAccountId: number,
    toAccountId: number,
    amount: number,
    options?: {
      fee?: number
      feeTagId?: number
      counterpartyId?: number
      note?: string
      timestamp?: number
    }
  ): Promise<Transaction> {
    const lines: TransactionLineInput[] = [
      {
        account_id: fromAccountId,
        tag_id: SYSTEM_TAGS.TRANSFER,
        sign: '-',
        amount: amount,
      },
      {
        account_id: toAccountId,
        tag_id: SYSTEM_TAGS.TRANSFER,
        sign: '+',
        amount: amount,
      },
    ]

    // Add fee line if applicable
    if (options?.fee && options.fee > 0) {
      lines.push({
        account_id: fromAccountId,
        tag_id: options.feeTagId ?? SYSTEM_TAGS.FEE,
        sign: '-',
        amount: options.fee,
      })
    }

    return this.create({
      counterparty_id: options?.counterpartyId,
      timestamp: options?.timestamp,
      lines,
      note: options?.note,
    })
  },

  // Helper to create exchange transaction
  async createExchange(
    fromAccountId: number,
    toAccountId: number,
    fromAmount: number,
    toAmount: number,
    options?: {
      counterpartyId?: number
      note?: string
      timestamp?: number
    }
  ): Promise<Transaction> {
    return this.create({
      counterparty_id: options?.counterpartyId,
      timestamp: options?.timestamp,
      lines: [
        {
          account_id: fromAccountId,
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '-',
          amount: fromAmount,
        },
        {
          account_id: toAccountId,
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '+',
          amount: toAmount,
        },
      ],
      note: options?.note,
    })
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
}
