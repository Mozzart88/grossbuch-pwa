import { querySQL, queryOne, execSQL } from '../database'
import { currencyRepository } from './currencyRepository'
import type { Budget, BudgetInput, BudgetSummary } from '../../types'

// Helper to convert Uint8Array to hex string for SQL queries
function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
}

const budgetSelectFields = `
        b.*,
        t.name as tag,
        bctx.tag_id as tag_context_id,
        ctx_tag.name as tag_context`

const budgetContextJoins = `
      LEFT JOIN budget_tag_context bctx ON bctx.budget_id = b.id
      LEFT JOIN tag ctx_tag ON ctx_tag.id = bctx.tag_id`

const actualSpendSubquery = `
        (
          SELECT COALESCE(SUM(
            CASE WHEN a.currency_id = ?
                THEN (tb.amount_int + tb.amount_frac * 1e-18)
                ELSE (tb.amount_int + tb.amount_frac * 1e-18) / (tb.rate_int + tb.rate_frac * 1e-18) * ?
              END
          ), 0)
          FROM trx_base tb
          JOIN trx ON trx.id = tb.trx_id
          JOIN account a ON a.id = tb.account_id
          LEFT JOIN trx_base_tag_context ctx ON ctx.trx_base_id = tb.id
          WHERE (
            (
              tb.tag_id = b.tag_id
              AND (
                (bctx.tag_id IS NULL AND ctx.tag_id IS NULL)
                OR ctx.tag_id = bctx.tag_id
              )
            )
            OR (
              tb.tag_id IN (
                WITH RECURSIVE descendants(id) AS (
                  SELECT child_id FROM tag_to_tag WHERE parent_id = b.tag_id
                  UNION
                  SELECT ttt.child_id FROM tag_to_tag ttt JOIN descendants d ON d.id = ttt.parent_id
                )
                SELECT id FROM descendants
              )
              AND (
                ctx.tag_id = bctx.tag_id
                OR (
                  bctx.tag_id IS NULL
                  AND ctx.tag_id = b.tag_id
                )
                OR (
                  bctx.tag_id IS NULL
                  AND ctx.tag_id IS NULL
                  AND 1 = (
                    SELECT COUNT(DISTINCT rel.child_id)
                    FROM tag_to_tag rel
                    WHERE rel.parent_id IN (9, 10)
                      AND rel.child_id IN (
                        WITH RECURSIVE ancestors(id) AS (
                          SELECT tb.tag_id
                          UNION
                          SELECT ttt.parent_id FROM tag_to_tag ttt JOIN ancestors a2 ON a2.id = ttt.child_id
                        )
                        SELECT id FROM ancestors
                      )
                  )
                  AND b.tag_id IN (
                    SELECT rel.child_id
                    FROM tag_to_tag rel
                    WHERE rel.parent_id IN (9, 10)
                      AND rel.child_id IN (
                        WITH RECURSIVE ancestors(id) AS (
                          SELECT tb.tag_id
                          UNION
                          SELECT ttt.parent_id FROM tag_to_tag ttt JOIN ancestors a2 ON a2.id = ttt.child_id
                        )
                        SELECT id FROM ancestors
                      )
                  )
                )
              )
            )
          )
            AND tb.sign = CASE b.type WHEN 'income' THEN '+' ELSE '-' END
            AND trx.timestamp >= b.start
            AND trx.timestamp < b.end
            AND (tb.rate_int > 0 OR tb.rate_frac > 0)
        ) as actual`

export const budgetRepository = {
    /**
     * Find all budgets with tag name and actual spending
     */
    async findAll(): Promise<Budget[]> {
        return querySQL<Budget>(`
      SELECT
${budgetSelectFields}
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
${budgetContextJoins}
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
${budgetSelectFields}
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
${budgetContextJoins}
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

        const { rate: sysRate, currencyId: sysCurrencyId } = await currencyRepository.getSystemRateInfo()

        return querySQL<Budget>(
            `
      SELECT
${budgetSelectFields},
${actualSpendSubquery}
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
${budgetContextJoins}
      WHERE b.start >= ? AND b.start < ?
      ORDER BY t.name ASC
    `,
            [sysCurrencyId, sysRate, startTimestamp, endTimestamp]
        )
    },

    /**
     * Find all budgets for a specific tag
     */
    async findByTagId(tagId: number, type?: 'income' | 'expense', tagContextId?: number | null): Promise<Budget[]> {
        const params: unknown[] = [tagId]
        if (type) params.push(type)
        if (tagContextId !== undefined) params.push(tagContextId)
        return querySQL<Budget>(
            `
      SELECT
${budgetSelectFields}
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
${budgetContextJoins}
      WHERE b.tag_id = ?${type ? ' AND b.type = ?' : ''}${tagContextId !== undefined ? ' AND COALESCE(bctx.tag_id, -1) = COALESCE(?, -1)' : ''}
      ORDER BY b.start DESC
    `,
            params
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
        const { rate: sysRate, currencyId: sysCurrencyId } = await currencyRepository.getSystemRateInfo()

        return queryOne<Budget>(
            `
      SELECT
${budgetSelectFields},
${actualSpendSubquery}
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
${budgetContextJoins}
      WHERE hex(b.id) = ?
    `,
            [sysCurrencyId, sysRate, toHex(id)]
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
        const type = input.type ?? 'expense'

        // Check if budget already exists for this tag and period
        const existing = await queryOne<Budget>(
            `
      SELECT b.*, t.name as tag
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
      LEFT JOIN budget_tag_context bctx ON bctx.budget_id = b.id
      WHERE b.tag_id = ? AND b.start = ? AND b.end = ? AND b.type = ?
        AND COALESCE(bctx.tag_id, -1) = COALESCE(?, -1)
    `,
            [input.tag_id, start, end, type, input.tag_context_id ?? null]
        )

        if (existing) {
            throw new Error('A budget already exists for this tag and period')
        }

        await execSQL(
            `INSERT INTO budget (tag_id, type, amount_int, amount_frac, start, end) VALUES (?, ?, ?, ?, ?, ?)`,
            [input.tag_id, type, input.amount_int, input.amount_frac, start, end]
        )

        // Get the newly created budget by finding it with tag_id, start, end
        const budget = await queryOne<Budget>(
            `
      SELECT
${budgetSelectFields}
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
${budgetContextJoins}
      WHERE b.tag_id = ? AND b.start = ? AND b.end = ? AND b.type = ?
      ORDER BY b.rowid DESC
      LIMIT 1
    `,
            [input.tag_id, start, end, type]
        )

        if (!budget) throw new Error('Failed to create budget')
        if (input.tag_context_id !== null && input.tag_context_id !== undefined) {
            await execSQL(
                `INSERT INTO budget_tag_context (budget_id, tag_id) VALUES (?, ?)`,
                [budget.id, input.tag_context_id]
            )
            return this.findById(budget.id) as Promise<Budget>
        }
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
        if (input.type !== undefined) {
            fields.push('type = ?')
            values.push(input.type)
        }
        if (input.amount_int !== undefined) {
            fields.push('amount_int = ?')
            values.push(input.amount_int)
        }
        if (input.amount_frac !== undefined) {
            fields.push('amount_frac = ?')
            values.push(input.amount_frac)
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
        if (input.tag_context_id !== undefined) {
            await execSQL(`DELETE FROM budget_tag_context WHERE hex(budget_id) = ?`, [toHex(id)])
            if (input.tag_context_id !== null) {
                await execSQL(
                    `INSERT INTO budget_tag_context (budget_id, tag_id) VALUES (?, ?)`,
                    [id, input.tag_context_id]
                )
            }
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
        const { rate: sysRate, currencyId: sysCurrencyId } = await currencyRepository.getSystemRateInfo()

        return querySQL<Budget>(
            `
      SELECT
${budgetSelectFields},
${actualSpendSubquery}
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
${budgetContextJoins}
      WHERE b.start <= ? AND b.end > ?
      ORDER BY t.name ASC
    `,
            [sysCurrencyId, sysRate, now, now]
        )
    },
}
