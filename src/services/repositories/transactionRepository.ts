import { querySQL, queryOne, execSQL } from '../database'
import type {
  Transaction,
  TransactionInput,
  TransactionLine,
  TransactionLineInput,
  TransactionView,
  TransactionLog,
  ExchangeView,
  TransferView,
} from '../../types'
import { SYSTEM_TAGS } from '../../types'

// Helper to convert Uint8Array to hex string for SQL
// function blobToHex(blob: Uint8Array): string {
//   return Array.from(blob)
//     .map((b) => b.toString(16).padStart(2, '0'))
//     .join('')
// }

export const transactionRepository = {
  // Get transactions for a month using the view
  async findByMonth(yearMonth: string): Promise<TransactionView[]> {
    // yearMonth format: "YYYY-MM"
    const startTs = Math.floor(new Date(`${yearMonth}-01T00:00:00`).getTime() / 1000)
    const endDate = new Date(`${yearMonth}-01`)
    endDate.setMonth(endDate.getMonth() + 1)
    const endTs = Math.floor(endDate.getTime() / 1000)
    console.log(startTs, endTs)

    return querySQL<TransactionView>(`
      SELECT * FROM transactions
      WHERE CAST(strftime('%s',created_at) as INTEGER) >= ? AND CAST(strftime('%s',created_at) as INTEGER) < ?
      ORDER BY created_at DESC
    `, [startTs, endTs])
  },

  // Get full transaction log
  async getLog(limit?: number, offset?: number): Promise<TransactionLog[]> {
    let sql = 'SELECT * FROM trx_log ORDER BY created_at DESC'
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

  // Get month summary
  async getMonthSummary(yearMonth: string): Promise<{ income: number; expenses: number }> {
    const startTs = Math.floor(new Date(`${yearMonth}-01T00:00:00`).getTime() / 1000)
    const endDate = new Date(`${yearMonth}-01`)
    endDate.setMonth(endDate.getMonth() + 1)
    const endTs = Math.floor(endDate.getTime() / 1000)

    const result = await queryOne<{ income: number; expenses: number }>(`
      SELECT
        COALESCE(SUM(CASE WHEN tb.sign = '+' AND tb.tag_id NOT IN (?, ?, ?) THEN tb.actual_amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN tb.sign = '-' AND tb.tag_id NOT IN (?, ?, ?) THEN tb.actual_amount ELSE 0 END), 0) as expenses
      FROM trx t
      JOIN trx_base tb ON tb.trx_id = t.id
      WHERE t.created_at >= ? AND t.created_at < ?
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

  // Create a new transaction
  async create(input: TransactionInput): Promise<Transaction> {
    // Insert transaction header
    const createdAt = input.created_at ?? Math.floor(Date.now() / 1000)

    await execSQL(
      'INSERT INTO trx (id, created_at, updated_at) VALUES (randomblob(16), ?, ?)',
      [createdAt, createdAt]
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
    // const hexTrxId = blobToHex(trxId)

    await execSQL(`
      INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, real_amount, actual_amount)
      VALUES (randomblob(16), ?, ?, ?, ?, ?, ?)
    `, [trxId, line.account_id, line.tag_id, line.sign, line.real_amount, line.actual_amount])

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
    if (input.real_amount !== undefined) {
      fields.push('real_amount = ?')
      values.push(input.real_amount)
    }
    if (input.actual_amount !== undefined) {
      fields.push('actual_amount = ?')
      values.push(input.actual_amount)
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

  // Get exchanges view
  async getExchanges(limit?: number): Promise<ExchangeView[]> {
    let sql = 'SELECT * FROM exchanges ORDER BY created_at DESC'
    if (limit) {
      sql += ` LIMIT ${limit}`
    }
    return querySQL<ExchangeView>(sql)
  },

  // Get transfers view
  async getTransfers(limit?: number): Promise<TransferView[]> {
    let sql = 'SELECT * FROM transfers ORDER BY created_at DESC'
    if (limit) {
      sql += ` LIMIT ${limit}`
    }
    return querySQL<TransferView>(sql)
  },

  // Helper to create income transaction
  async createIncome(
    accountId: number,
    tagId: number,
    realAmount: number,
    actualAmount: number,
    options?: {
      counterpartyId?: number
      counterpartyName?: string
      note?: string
      createdAt?: number
    }
  ): Promise<Transaction> {
    return this.create({
      counterparty_id: options?.counterpartyId,
      counterparty_name: options?.counterpartyName,
      created_at: options?.createdAt,
      lines: [
        {
          account_id: accountId,
          tag_id: tagId,
          sign: '+',
          real_amount: realAmount,
          actual_amount: actualAmount,
          note: options?.note,
        },
      ],
    })
  },

  // Helper to create expense transaction
  async createExpense(
    accountId: number,
    tagId: number,
    realAmount: number,
    actualAmount: number,
    options?: {
      counterpartyId?: number
      counterpartyName?: string
      note?: string
      createdAt?: number
    }
  ): Promise<Transaction> {
    return this.create({
      counterparty_id: options?.counterpartyId,
      counterparty_name: options?.counterpartyName,
      created_at: options?.createdAt,
      lines: [
        {
          account_id: accountId,
          tag_id: tagId,
          sign: '-',
          real_amount: realAmount,
          actual_amount: actualAmount,
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
      createdAt?: number
    }
  ): Promise<Transaction> {
    const lines: TransactionLineInput[] = [
      {
        account_id: fromAccountId,
        tag_id: SYSTEM_TAGS.TRANSFER,
        sign: '-',
        real_amount: amount,
        actual_amount: amount,
      },
      {
        account_id: toAccountId,
        tag_id: SYSTEM_TAGS.TRANSFER,
        sign: '+',
        real_amount: amount,
        actual_amount: amount,
      },
    ]

    // Add fee line if applicable
    if (options?.fee && options.fee > 0) {
      lines.push({
        account_id: fromAccountId,
        tag_id: options.feeTagId ?? SYSTEM_TAGS.FEE,
        sign: '-',
        real_amount: options.fee,
        actual_amount: options.fee,
      })
    }

    return this.create({
      counterparty_id: options?.counterpartyId,
      created_at: options?.createdAt,
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
      createdAt?: number
    }
  ): Promise<Transaction> {
    return this.create({
      counterparty_id: options?.counterpartyId,
      created_at: options?.createdAt,
      lines: [
        {
          account_id: fromAccountId,
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '-',
          real_amount: fromAmount,
          actual_amount: fromAmount,
        },
        {
          account_id: toAccountId,
          tag_id: SYSTEM_TAGS.EXCHANGE,
          sign: '+',
          real_amount: toAmount,
          actual_amount: toAmount,
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
      conditions.push('created_at >= ?')
      params.push(startTs)
    }
    if (endTs) {
      conditions.push('created_at <= ?')
      params.push(endTs)
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }

    sql += ' ORDER BY created_at ASC'

    return querySQL<TransactionLog>(sql, params)
  },
}
