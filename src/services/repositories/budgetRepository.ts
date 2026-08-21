import { querySQL, queryOne, execSQL } from '../database'
import { currencyRepository } from './currencyRepository'
import { recurringRepository } from './recurringRepository'
import { tagReferences } from './tagReferences'
import type { Budget, BudgetInput, BudgetSummary } from '../../types'
import { SYSTEM_TAGS } from '../../types'

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

type BudgetForActual = Pick<Budget, 'id' | 'tag_id' | 'type' | 'start' | 'end' | 'tag_context_id'> & { tag?: string }

type ActualSpendRow = {
    tag_id: number
    sign: '+' | '-'
    // sqlite-wasm returns these as bigint once they exceed
    // Number.MAX_SAFE_INTEGER, which amount_frac/rate_frac (scaled by 1e18)
    // routinely do.
    amount_int: number | bigint
    amount_frac: number | bigint
    rate_int: number | bigint
    rate_frac: number | bigint
    currency_id: number
    account_id: number
    timestamp: number
    ctx_tag_id: number | null
}

/**
 * Computes `actual` spend for a batch of budgets in a fixed number of
 * queries, regardless of how many budgets are passed in — replacing what was
 * previously a correlated subquery (with up to three recursive tag_to_tag
 * walks) re-executed once per budget row. Preserves the exact matching rules
 * from that subquery: direct tag match, descendant-tag match (with explicit,
 * budget-own, or unambiguous-top-level-ancestor context resolution), and the
 * savings/credits inbound-transfer special case.
 */
async function computeActualSpend(budgets: BudgetForActual[]): Promise<Map<string, number>> {
    const actuals = new Map<string, number>()
    if (budgets.length === 0) return actuals
    for (const budget of budgets) actuals.set(toHex(budget.id), 0)

    const { rate: sysRate, currencyId: sysCurrencyId } = await currencyRepository.getSystemRateInfo()

    const edges = await querySQL<{ parent_id: number; child_id: number }>(
        'SELECT parent_id, child_id FROM tag_to_tag'
    )
    const childrenOf = new Map<number, number[]>()
    const parentsOf = new Map<number, number[]>()
    for (const { parent_id, child_id } of edges) {
        if (!childrenOf.has(parent_id)) childrenOf.set(parent_id, [])
        childrenOf.get(parent_id)!.push(child_id)
        if (!parentsOf.has(child_id)) parentsOf.set(child_id, [])
        parentsOf.get(child_id)!.push(parent_id)
    }

    const descendantsCache = new Map<number, Set<number>>()
    const descendantsOf = (tagId: number): Set<number> => {
        const cached = descendantsCache.get(tagId)
        if (cached) return cached
        const result = new Set<number>()
        descendantsCache.set(tagId, result)
        for (const child of childrenOf.get(tagId) ?? []) {
            if (!result.has(child)) {
                result.add(child)
                for (const d of descendantsOf(child)) result.add(d)
            }
        }
        return result
    }

    const ancestorsOrSelfCache = new Map<number, Set<number>>()
    const ancestorsOrSelfOf = (tagId: number): Set<number> => {
        const cached = ancestorsOrSelfCache.get(tagId)
        if (cached) return cached
        const result = new Set<number>([tagId])
        ancestorsOrSelfCache.set(tagId, result)
        for (const parent of parentsOf.get(tagId) ?? []) {
            for (const a of ancestorsOrSelfOf(parent)) result.add(a)
        }
        return result
    }

    const topLevelCategorySet = new Set<number>([
        ...(childrenOf.get(SYSTEM_TAGS.INCOME) ?? []),
        ...(childrenOf.get(SYSTEM_TAGS.EXPENSE) ?? []),
    ])

    // The unique top-level category ancestor of tagId, or null if there is
    // zero or more than one — mirrors the "1 = COUNT(DISTINCT ...)" fallback
    // used when neither the budget nor the transaction line specify a
    // context. Depends only on tagId (not on any particular budget), so it's
    // computed once per distinct tag encountered rather than once per
    // (budget, transaction) pair.
    const soleTopLevelMatchCache = new Map<number, number | null>()
    const soleTopLevelMatchOf = (tagId: number): number | null => {
        const cached = soleTopLevelMatchCache.get(tagId)
        if (cached !== undefined) return cached
        const matches = [...ancestorsOrSelfOf(tagId)].filter(id => topLevelCategorySet.has(id))
        const result = matches.length === 1 ? matches[0] : null
        soleTopLevelMatchCache.set(tagId, result)
        return result
    }

    const savingsCreditsBudgets = budgets.filter(b => b.tag === 'savings' || b.tag === 'credits')
    const transferExchangeTagIds = new Set<number>()
    const accountsTaggedWith = new Map<number, Set<number>>()
    if (savingsCreditsBudgets.length > 0) {
        const teRows = await querySQL<{ id: number }>("SELECT id FROM tag WHERE name IN ('transfer', 'exchange')")
        for (const row of teRows) transferExchangeTagIds.add(row.id)

        const budgetTagIds = [...new Set(savingsCreditsBudgets.map(b => b.tag_id))]
        const placeholders = budgetTagIds.map(() => '?').join(',')
        const a2tRows = await querySQL<{ account_id: number; tag_id: number }>(
            `SELECT account_id, tag_id FROM account_to_tags WHERE tag_id IN (${placeholders})`,
            budgetTagIds
        )
        for (const row of a2tRows) {
            if (!accountsTaggedWith.has(row.tag_id)) accountsTaggedWith.set(row.tag_id, new Set())
            accountsTaggedWith.get(row.tag_id)!.add(row.account_id)
        }
    }

    const minStart = Math.min(...budgets.map(b => b.start))
    const maxEnd = Math.max(...budgets.map(b => b.end))

    const rows = await querySQL<ActualSpendRow>(
        `
      SELECT tb.tag_id, tb.sign, tb.amount_int, tb.amount_frac, tb.rate_int, tb.rate_frac,
             a.currency_id, a.id as account_id, trx.timestamp,
             ctx.tag_id as ctx_tag_id
      FROM trx_base tb
      JOIN trx ON trx.id = tb.trx_id
      JOIN account a ON a.id = tb.account_id
      LEFT JOIN trx_base_tag_context ctx ON ctx.trx_base_id = tb.id
      WHERE trx.timestamp >= ? AND trx.timestamp < ?
        AND (tb.rate_int > 0 OR tb.rate_frac > 0)
    `,
        [minStart, maxEnd]
    )

    // sqlite-wasm returns INTEGER columns as BigInt once their value exceeds
    // Number.MAX_SAFE_INTEGER — amount_frac/rate_frac (scaled by 1e18) hit
    // that regularly, even though amount_int/rate_int normally don't. Coerce
    // all four before arithmetic (matches the Number(...) guard in
    // utils/amount.ts's fromIntFrac).
    const convert = (row: ActualSpendRow): number => {
        const amount = Number(row.amount_int) + Number(row.amount_frac) * 1e-18
        if (row.currency_id === sysCurrencyId) return amount
        const rate = Number(row.rate_int) + Number(row.rate_frac) * 1e-18
        return (amount / rate) * sysRate
    }

    for (const budget of budgets) {
        const isSavingsCredits = budget.tag === 'savings' || budget.tag === 'credits'
        const expectedSign = budget.type === 'income' ? '+' : '-'
        let total = 0

        for (const row of rows) {
            if (row.timestamp < budget.start || row.timestamp >= budget.end) continue

            if (isSavingsCredits) {
                if (
                    row.sign === '+' &&
                    transferExchangeTagIds.has(row.tag_id) &&
                    (accountsTaggedWith.get(budget.tag_id)?.has(row.account_id) ?? false)
                ) {
                    total += convert(row)
                }
                continue
            }

            if (row.sign !== expectedSign) continue

            const isDirect = row.tag_id === budget.tag_id
            if (isDirect) {
                const contextMatches =
                    (budget.tag_context_id == null && row.ctx_tag_id === null) ||
                    (row.ctx_tag_id !== null && row.ctx_tag_id === budget.tag_context_id)
                if (contextMatches) total += convert(row)
                continue
            }

            if (!descendantsOf(budget.tag_id).has(row.tag_id)) continue

            const contextMatches =
                (row.ctx_tag_id !== null && budget.tag_context_id != null && row.ctx_tag_id === budget.tag_context_id) ||
                (budget.tag_context_id == null && row.ctx_tag_id !== null && row.ctx_tag_id === budget.tag_id) ||
                (budget.tag_context_id == null && row.ctx_tag_id === null && soleTopLevelMatchOf(row.tag_id) === budget.tag_id)
            if (contextMatches) total += convert(row)
        }

        actuals.set(toHex(budget.id), total)
    }

    return actuals
}

async function withActual<T extends BudgetForActual>(budgets: T[]): Promise<(T & { actual: number })[]> {
    const actuals = await computeActualSpend(budgets)
    return budgets.map(b => ({ ...b, actual: actuals.get(toHex(b.id)) ?? 0 }))
}

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

        const budgets = await querySQL<Budget>(
            `
      SELECT
${budgetSelectFields}
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
${budgetContextJoins}
      WHERE b.start >= ? AND b.start < ?
      ORDER BY t.name ASC
    `,
            [startTimestamp, endTimestamp]
        )
        return withActual(budgets)
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
        const budget = await queryOne<Budget>(
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
        if (!budget) return null
        const [result] = await withActual([budget])
        return result
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
        await tagReferences.increment(input.tag_id)

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
            await tagReferences.increment(input.tag_context_id)
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

        let oldTagId: number | null = null
        if (input.tag_id !== undefined) {
            const current = await queryOne<{ tag_id: number }>('SELECT tag_id FROM budget WHERE hex(id) = ?', [toHex(id)])
            oldTagId = current?.tag_id ?? null
        }

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
        if (input.tag_id !== undefined && oldTagId !== null && oldTagId !== input.tag_id) {
            await tagReferences.move(oldTagId, input.tag_id)
        }
        if (input.tag_context_id !== undefined) {
            const oldContexts = await querySQL<{ tag_id: number }>(
                'SELECT tag_id FROM budget_tag_context WHERE hex(budget_id) = ?',
                [toHex(id)]
            )
            await execSQL(`DELETE FROM budget_tag_context WHERE hex(budget_id) = ?`, [toHex(id)])
            for (const ctx of oldContexts) {
                await tagReferences.decrement(ctx.tag_id)
            }
            if (input.tag_context_id !== null) {
                await execSQL(
                    `INSERT INTO budget_tag_context (budget_id, tag_id) VALUES (?, ?)`,
                    [id, input.tag_context_id]
                )
                await tagReferences.increment(input.tag_context_id)
            }
        }

        const budget = await this.findWithActual(id)
        if (!budget) throw new Error('Budget not found')
        if (input.amount_int !== undefined || input.amount_frac !== undefined) {
            await recurringRepository.syncDraftFromBudget(
                id,
                input.amount_int ?? budget.amount_int,
                input.amount_frac ?? budget.amount_frac
            )
        }
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
        const budget = await queryOne<{ tag_id: number }>('SELECT tag_id FROM budget WHERE hex(id) = ?', [toHex(id)])
        if (budget) await tagReferences.decrement(budget.tag_id)

        const contexts = await querySQL<{ tag_id: number }>(
            'SELECT tag_id FROM budget_tag_context WHERE hex(budget_id) = ?',
            [toHex(id)]
        )
        for (const ctx of contexts) {
            await tagReferences.decrement(ctx.tag_id)
        }

        await execSQL('DELETE FROM budget WHERE hex(id) = ?', [toHex(id)])
    },

    /**
     * Get active budgets (current month)
     */
    async findActive(): Promise<Budget[]> {
        const now = Math.floor(Date.now() / 1000)

        const budgets = await querySQL<Budget>(
            `
      SELECT
${budgetSelectFields}
      FROM budget b
      JOIN tag t ON b.tag_id = t.id
${budgetContextJoins}
      WHERE b.start <= ? AND b.end > ?
      ORDER BY t.name ASC
    `,
            [now, now]
        )
        return withActual(budgets)
    },
}
