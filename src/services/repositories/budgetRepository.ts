import { querySQL, queryOne, execSQL } from '../database'
import type { Budget, BudgetInput, BudgetSummary } from '../../types'
import { SYSTEM_TAGS } from '../../types'

// Helper to convert Uint8Array to hex string for SQL queries
function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
}

export const budgetRepository = {
    /**
     * Find all budgets with tag name and actual spending
     */
    async findAll(): Promise<Budget[]> {
        return querySQL<Budget>(`
      SELECT
        b.*,
        t.name as tag
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
      ORDER BY b.start DESC, t.name ASC
    `)
    },

    /**
     * Find budget by ID
     */
    async findById(id: Uint8Array): Promise<Budget | null> {
        return queryOne<Budget>(
            `
      SELECT
        b.*,
        t.name as tag
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
      WHERE hex(b.id) = ?
    `,
            [toHex(id)]
        )
    },

    /**
     * Find budgets for a specific month
     */
    async findByMonth(month: string): Promise<Budget[]> {
        // month format: 'YYYY-MM'
        const startOfMonth = new Date(`${month}-01T00:00:00`)
        const startTimestamp = Math.floor(startOfMonth.getTime() / 1000)

        const endOfMonth = new Date(startOfMonth)
        endOfMonth.setMonth(endOfMonth.getMonth() + 1)
        const endTimestamp = Math.floor(endOfMonth.getTime() / 1000)

        return querySQL<Budget>(
            `
      WITH curr_dec AS (
        SELECT c.id as currency_id, power(10.0, -c.decimal_places) as divisor
        FROM currency c
      )
      SELECT
        b.*,
        t.name as tag,
        (
          SELECT COALESCE(SUM(
            CASE WHEN tb.sign = '-' THEN 1 ELSE -1 END
            * (tb.amount * cd.divisor) / (tb.rate * cd.divisor)
            * power(10, def.decimal_places)
          ), 0)
          FROM trx_base tb
          JOIN trx ON trx.id = tb.trx_id
          JOIN account a ON tb.account_id = a.id
          JOIN curr_dec cd ON a.currency_id = cd.currency_id
          CROSS JOIN (SELECT decimal_places FROM currency
            JOIN currency_to_tags ON currency.id = currency_to_tags.currency_id
            WHERE tag_id = ? LIMIT 1) def
          WHERE tb.tag_id = b.tag_id
            AND trx.timestamp >= b.start
            AND trx.timestamp < b.end
            AND tb.rate > 0
        ) as actual
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
      WHERE b.start >= ? AND b.start < ?
      ORDER BY t.name ASC
    `,
            [SYSTEM_TAGS.DEFAULT, startTimestamp, endTimestamp]
        )
    },

    /**
     * Find all budgets for a specific tag
     */
    async findByTagId(tagId: number): Promise<Budget[]> {
        return querySQL<Budget>(
            `
      SELECT
        b.*,
        t.name as tag
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
      WHERE b.tag_id = ?
      ORDER BY b.start DESC
    `,
            [tagId]
        )
    },

    /**
     * Get budget summary from the summary view
     */
    async getSummary(): Promise<BudgetSummary[]> {
        return querySQL<BudgetSummary>('SELECT * FROM summary')
    },

    /**
     * Get budget with actual spending for current period
     */
    async findWithActual(id: Uint8Array): Promise<Budget | null> {
        return queryOne<Budget>(
            `
      WITH curr_dec AS (
        SELECT c.id as currency_id, power(10.0, -c.decimal_places) as divisor
        FROM currency c
      )
      SELECT
        b.*,
        t.name as tag,
        (
          SELECT COALESCE(SUM(
            CASE WHEN tb.sign = '-' THEN 1 ELSE -1 END
            * (tb.amount * cd.divisor) / (tb.rate * cd.divisor)
            * power(10, def.decimal_places)
          ), 0)
          FROM trx_base tb
          JOIN trx ON trx.id = tb.trx_id
          JOIN account a ON tb.account_id = a.id
          JOIN curr_dec cd ON a.currency_id = cd.currency_id
          CROSS JOIN (SELECT decimal_places FROM currency
            JOIN currency_to_tags ON currency.id = currency_to_tags.currency_id
            WHERE tag_id = ? LIMIT 1) def
          WHERE tb.tag_id = b.tag_id
            AND trx.timestamp >= b.start
            AND trx.timestamp < b.end
            AND tb.rate > 0
        ) as actual
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
      WHERE hex(b.id) = ?
    `,
            [SYSTEM_TAGS.DEFAULT, toHex(id)]
        )
    },

    /**
     * Create a new budget
     */
    async create(input: BudgetInput): Promise<Budget> {
        // Get start/end timestamps, defaulting to current month
        const now = new Date()
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1)
        const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

        const start = input.start ?? Math.floor(defaultStart.getTime() / 1000)
        const end = input.end ?? Math.floor(defaultEnd.getTime() / 1000)

        // Check if budget already exists for this tag and period
        const existing = await queryOne<Budget>(
            `
      SELECT b.*, t.name as tag
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
      WHERE b.tag_id = ? AND b.start = ? AND b.end = ?
    `,
            [input.tag_id, start, end]
        )

        if (existing) {
            throw new Error('A budget already exists for this tag and period')
        }

        await execSQL(
            `INSERT INTO budget (tag_id, amount, start, end) VALUES (?, ?, ?, ?)`,
            [input.tag_id, input.amount, start, end]
        )

        // Get the newly created budget by finding it with tag_id, start, end
        const budget = await queryOne<Budget>(
            `
      SELECT
        b.*,
        t.name as tag
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
      WHERE b.tag_id = ? AND b.start = ? AND b.end = ?
      ORDER BY b.rowid DESC
      LIMIT 1
    `,
            [input.tag_id, start, end]
        )

        if (!budget) throw new Error('Failed to create budget')
        return budget
    },

    /**
     * Update a budget
     */
    async update(id: Uint8Array, input: Partial<BudgetInput>): Promise<Budget> {
        const fields: string[] = []
        const values: unknown[] = []

        if (input.tag_id !== undefined) {
            fields.push('tag_id = ?')
            values.push(input.tag_id)
        }
        if (input.amount !== undefined) {
            fields.push('amount = ?')
            values.push(input.amount)
        }
        if (input.start !== undefined) {
            fields.push('start = ?')
            values.push(input.start)
        }
        if (input.end !== undefined) {
            fields.push('end = ?')
            values.push(input.end)
        }

        if (fields.length > 0) {
            values.push(toHex(id))
            await execSQL(`UPDATE budget SET ${fields.join(', ')} WHERE hex(id) = ?`, values)
        }

        const budget = await this.findWithActual(id)
        if (!budget) throw new Error('Budget not found')
        return budget
    },

    /**
     * Check if budget can be deleted
     */
    async canDelete(id: Uint8Array): Promise<{ canDelete: boolean; reason?: string }> {
        const budget = await this.findById(id)
        if (!budget) {
            return { canDelete: false, reason: 'Budget not found' }
        }
        // Budgets can always be deleted - they don't have foreign key constraints
        return { canDelete: true }
    },

    /**
     * Delete a budget
     */
    async delete(id: Uint8Array): Promise<void> {
        await execSQL('DELETE FROM budget WHERE hex(id) = ?', [toHex(id)])
    },

    /**
     * Get active budgets (current month)
     */
    async findActive(): Promise<Budget[]> {
        const now = Math.floor(Date.now() / 1000)

        return querySQL<Budget>(
            `
      WITH curr_dec AS (
        SELECT c.id as currency_id, power(10.0, -c.decimal_places) as divisor
        FROM currency c
      )
      SELECT
        b.*,
        t.name as tag,
        (
          SELECT COALESCE(SUM(
            CASE WHEN tb.sign = '-' THEN 1 ELSE -1 END
            * (tb.amount * cd.divisor) / (tb.rate * cd.divisor)
            * power(10, def.decimal_places)
          ), 0)
          FROM trx_base tb
          JOIN trx ON trx.id = tb.trx_id
          JOIN account a ON tb.account_id = a.id
          JOIN curr_dec cd ON a.currency_id = cd.currency_id
          CROSS JOIN (SELECT decimal_places FROM currency
            JOIN currency_to_tags ON currency.id = currency_to_tags.currency_id
            WHERE tag_id = ? LIMIT 1) def
          WHERE tb.tag_id = b.tag_id
            AND trx.timestamp >= b.start
            AND trx.timestamp < b.end
            AND tb.rate > 0
        ) as actual
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
      WHERE b.start <= ? AND b.end > ?
      ORDER BY t.name ASC
    `,
            [SYSTEM_TAGS.DEFAULT, now, now]
        )
    },
}
