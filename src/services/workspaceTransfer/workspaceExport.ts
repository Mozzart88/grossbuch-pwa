import { attachDatabase, detachDatabase, querySQL, queryOne } from '../database/connection'
import { workspaceDbFilename } from '../database/paths'
import { getActiveWorkspaceId, getSessionDekShared } from '../database/workspace'
import type {
  WorkspacePackage,
  WorkspaceIcon,
  WorkspaceTag,
  WorkspaceCurrency,
  WorkspaceCounterparty,
  WorkspaceWallet,
  WorkspaceAccount,
  WorkspaceTransaction,
  WorkspaceTransactionLine,
  WorkspaceBudget,
} from './workspaceTypes'

const TEMP_EXPORT_ALIAS = 'export_ws'

// Non-printable separator for GROUP_CONCAT-ing free-text names (tag/wallet
// names can contain almost any character, so a printable delimiter like ','
// would be ambiguous — char(31) is ASCII Unit Separator, never user-typeable).
const SEP_SQL = 'char(31)'
const SEP_JS = ''

function splitNames(raw: string): string[] {
  return raw ? raw.split(SEP_JS) : []
}

/**
 * Export a single workspace as a portable, self-contained WorkspacePackage —
 * the workspace's own data plus every shared entity (tag/currency/
 * counterparty/icon) it references, by natural key rather than id (see
 * workspaceTypes.ts). Excludes all App DB data (device identity, linked
 * devices, key material, session/auth state) by construction — it never
 * touches `main` at all.
 */
export async function exportWorkspacePackage(workspaceId: number): Promise<WorkspacePackage> {
  const workspaceRow = await queryOne<{ name: string }>(
    `SELECT name FROM shared.workspace WHERE id = ?`,
    [workspaceId]
  )
  if (!workspaceRow) throw new Error('Workspace not found')

  const isActive = getActiveWorkspaceId() === workspaceId
  if (!isActive) {
    const dekShared = getSessionDekShared()
    if (!dekShared) throw new Error('No active session — log in first')
    await attachDatabase(TEMP_EXPORT_ALIAS, workspaceDbFilename(workspaceId), dekShared)
  }
  const ws = isActive ? 'workspace' : TEMP_EXPORT_ALIAS

  try {
    const wallets = await exportWallets(ws)
    const accounts = await exportAccounts(ws)
    const transactions = await exportTransactions(ws)
    const budgets = await exportBudgets(ws)

    const referencedTagIds = await collectReferencedTagIds(ws)
    const referencedCurrencyCodes = await collectReferencedCurrencyCodes(ws)
    const referencedCounterpartyNames = await collectReferencedCounterpartyNames(ws)

    const tags = await exportTags(referencedTagIds)
    const currencies = await exportCurrencies(referencedCurrencyCodes)
    const counterparties = await exportCounterparties(referencedCounterpartyNames)
    const icons = await exportIcons(tags)

    return {
      version: 1,
      workspace_name: workspaceRow.name,
      created_at: Math.floor(Date.now() / 1000),
      icons,
      tags,
      currencies,
      counterparties,
      wallets,
      accounts,
      transactions,
      budgets,
    }
  } finally {
    if (!isActive) {
      await detachDatabase(TEMP_EXPORT_ALIAS)
    }
  }
}

async function exportWallets(ws: string): Promise<WorkspaceWallet[]> {
  return querySQL<WorkspaceWallet>(
    `SELECT
      w.id,
      w.name,
      w.color,
      COALESCE(
        (SELECT GROUP_CONCAT(t.name, ${SEP_SQL})
         FROM ${ws}.wallet_to_tags w2t
         JOIN shared.tag t ON t.id = w2t.tag_id
         WHERE w2t.wallet_id = w.id),
        ''
      ) as tags
    FROM ${ws}.wallet w`
  ).then(rows => rows.map(r => ({ ...r, tags: splitNames(r.tags as unknown as string) })))
}

async function exportAccounts(ws: string): Promise<WorkspaceAccount[]> {
  return querySQL<WorkspaceAccount>(
    `SELECT
      a.id,
      a.wallet_id AS wallet,
      c.code AS currency,
      a.balance_int,
      a.balance_frac,
      ad.note,
      ad.due_date,
      ad.rate,
      COALESCE(
        (SELECT GROUP_CONCAT(t.name, ${SEP_SQL})
         FROM ${ws}.account_to_tags a2t
         JOIN shared.tag t ON t.id = a2t.tag_id
         WHERE a2t.account_id = a.id),
        ''
      ) as tags
    FROM ${ws}.account a
    JOIN shared.currency c ON c.id = a.currency_id
    LEFT JOIN ${ws}.account_data ad ON ad.account_id = a.id`
  ).then(rows => rows.map(r => ({ ...r, tags: splitNames(r.tags as unknown as string) })))
}

interface TrxRow {
  id: string
  timestamp: number
  counterparty: string | null
  note: string | null
}

interface TrxLineRow {
  trx_id: string
  account: number
  tag: string
  tag_context: string | null
  sign: '+' | '-'
  amount_int: number
  amount_frac: number
  rate_int: number
  rate_frac: number
}

async function exportTransactions(ws: string): Promise<WorkspaceTransaction[]> {
  const trxRows = await querySQL<TrxRow>(
    `SELECT
      hex(t.id) as id,
      t.timestamp,
      (SELECT cp.name FROM ${ws}.trx_to_counterparty t2c
       JOIN shared.counterparty cp ON cp.id = t2c.counterparty_id
       WHERE t2c.trx_id = t.id) as counterparty,
      (SELECT tn.note FROM ${ws}.trx_note tn WHERE tn.trx_id = t.id) as note
    FROM ${ws}.trx t`
  )
  if (trxRows.length === 0) return []

  const trxIds = trxRows.map(t => t.id)
  const placeholders = new Array(trxIds.length).fill('?').join(',')
  const lineRows = await querySQL<TrxLineRow>(
    `SELECT
      hex(tb.trx_id) as trx_id,
      tb.account_id as account,
      tag.name as tag,
      ctxTag.name as tag_context,
      tb.sign,
      tb.amount_int,
      tb.amount_frac,
      tb.rate_int,
      tb.rate_frac
    FROM ${ws}.trx_base tb
    JOIN shared.tag tag ON tag.id = tb.tag_id
    LEFT JOIN ${ws}.trx_base_tag_context ctx ON ctx.trx_base_id = tb.id
    LEFT JOIN shared.tag ctxTag ON ctxTag.id = ctx.tag_id
    WHERE hex(tb.trx_id) IN (${placeholders})`,
    trxIds
  )

  const linesByTrx = new Map<string, WorkspaceTransactionLine[]>()
  for (const line of lineRows) {
    const lines = linesByTrx.get(line.trx_id) ?? []
    lines.push({
      account: line.account,
      tag: line.tag,
      tag_context: line.tag_context,
      sign: line.sign,
      amount_int: line.amount_int,
      amount_frac: line.amount_frac,
      rate_int: line.rate_int,
      rate_frac: line.rate_frac,
    })
    linesByTrx.set(line.trx_id, lines)
  }

  return trxRows.map(t => ({
    timestamp: t.timestamp,
    counterparty: t.counterparty,
    note: t.note,
    lines: linesByTrx.get(t.id) ?? [],
  }))
}

async function exportBudgets(ws: string): Promise<WorkspaceBudget[]> {
  return querySQL<WorkspaceBudget>(
    `SELECT
      b.start,
      b.end,
      tag.name as tag,
      ctxTag.name as tag_context,
      b.type,
      b.amount_int,
      b.amount_frac
    FROM ${ws}.budget b
    JOIN shared.tag tag ON tag.id = b.tag_id
    LEFT JOIN ${ws}.budget_tag_context bctx ON bctx.budget_id = b.id
    LEFT JOIN shared.tag ctxTag ON ctxTag.id = bctx.tag_id`
  )
}

function nonSystemTagFilter(column: string): string {
  return `(${column} BETWEEN 11 AND 21 OR ${column} > 23)`
}

async function collectReferencedTagIds(ws: string): Promise<number[]> {
  const rows = await querySQL<{ tag_id: number }>(`
    SELECT DISTINCT tag_id FROM (
      SELECT tag_id FROM ${ws}.wallet_to_tags
      UNION SELECT tag_id FROM ${ws}.account_to_tags
      UNION SELECT tag_id FROM ${ws}.trx_base
      UNION SELECT tag_id FROM ${ws}.trx_base_tag_context
      UNION SELECT tag_id FROM ${ws}.budget
      UNION SELECT tag_id FROM ${ws}.budget_tag_context
    )
    WHERE ${nonSystemTagFilter('tag_id')}
  `)
  const ids = new Set(rows.map(r => r.tag_id))
  if (ids.size === 0) return []

  // Expand one hop to direct non-system parents, so an exported subtag keeps its category link.
  const placeholders = new Array(ids.size).fill('?').join(',')
  const parentRows = await querySQL<{ parent_id: number }>(
    `SELECT DISTINCT parent_id FROM shared.tag_to_tag WHERE child_id IN (${placeholders}) AND ${nonSystemTagFilter('parent_id')}`,
    [...ids]
  )
  for (const row of parentRows) ids.add(row.parent_id)

  return [...ids]
}

async function collectReferencedCurrencyCodes(ws: string): Promise<string[]> {
  const rows = await querySQL<{ code: string }>(
    `SELECT DISTINCT c.code FROM ${ws}.account a JOIN shared.currency c ON c.id = a.currency_id`
  )
  return rows.map(r => r.code)
}

async function collectReferencedCounterpartyNames(ws: string): Promise<string[]> {
  const rows = await querySQL<{ name: string }>(
    `SELECT DISTINCT cp.name FROM ${ws}.trx_to_counterparty t2c JOIN shared.counterparty cp ON cp.id = t2c.counterparty_id`
  )
  return rows.map(r => r.name)
}

async function exportTags(tagIds: number[]): Promise<WorkspaceTag[]> {
  if (tagIds.length === 0) return []
  const placeholders = new Array(tagIds.length).fill('?').join(',')

  return querySQL<WorkspaceTag>(
    `SELECT
      t.name,
      COALESCE(
        (SELECT GROUP_CONCAT(pt.name, ${SEP_SQL})
         FROM shared.tag_to_tag rel
         JOIN shared.tag pt ON pt.id = rel.parent_id
         WHERE rel.child_id = t.id AND ${nonSystemTagFilter('rel.parent_id')}),
        ''
      ) as parents,
      COALESCE(
        (SELECT GROUP_CONCAT(ct.name, ${SEP_SQL})
         FROM shared.tag_to_tag rel
         JOIN shared.tag ct ON ct.id = rel.child_id
         WHERE rel.parent_id = t.id AND rel.child_id IN (${placeholders})),
        ''
      ) as children,
      (SELECT i.value FROM shared.tag_icon ti JOIN shared.icon i ON i.id = ti.icon_id WHERE ti.tag_id = t.id) as icon
    FROM shared.tag t
    WHERE t.id IN (${placeholders})`,
    [...tagIds, ...tagIds]
  ).then(rows => rows.map(r => ({
    ...r,
    parents: splitNames(r.parents as unknown as string),
    children: splitNames(r.children as unknown as string),
  })))
}

async function exportCurrencies(codes: string[]): Promise<WorkspaceCurrency[]> {
  if (codes.length === 0) return []
  const placeholders = new Array(codes.length).fill('?').join(',')
  return querySQL<WorkspaceCurrency>(
    `SELECT code, name, symbol, decimal_places FROM shared.currency WHERE code IN (${placeholders})`,
    codes
  )
}

async function exportCounterparties(names: string[]): Promise<WorkspaceCounterparty[]> {
  if (names.length === 0) return []
  const placeholders = new Array(names.length).fill('?').join(',')
  return querySQL<WorkspaceCounterparty>(
    `SELECT
      cp.name,
      (SELECT cn.note FROM shared.counterparty_note cn WHERE cn.counterparty_id = cp.id) as note,
      COALESCE(
        (SELECT GROUP_CONCAT(t.name, ${SEP_SQL})
         FROM shared.counterparty_to_tags c2t
         JOIN shared.tag t ON t.id = c2t.tag_id
         WHERE c2t.counterparty_id = cp.id),
        ''
      ) as tags
    FROM shared.counterparty cp
    WHERE cp.name IN (${placeholders})`,
    names
  ).then(rows => rows.map(r => ({ ...r, tags: splitNames(r.tags as unknown as string) })))
}

async function exportIcons(tags: WorkspaceTag[]): Promise<WorkspaceIcon[]> {
  const values = [...new Set(tags.map(t => t.icon).filter((v): v is string => v !== null))]
  return values.map(value => ({ value }))
}
