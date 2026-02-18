import { querySQL } from '../database/connection'
import { getDeletionsSince } from './syncRepository'
import type {
  SyncPackage,
  SyncIcon,
  SyncTag,
  SyncWallet,
  SyncAccount,
  SyncCounterparty,
  SyncCurrency,
  SyncTransaction,
  SyncTransactionLine,
  SyncBudget,
} from './syncTypes'

const TRX_BATCH_SIZE = 100

/**
 * Export full history as chunked SyncPackages for a full-history push.
 * Transactions are split into batches of TRX_BATCH_SIZE.
 * Reference data is duplicated in every chunk (idempotent import).
 */
export async function exportChunkedSyncPackages(
  senderId: string,
  batchSize = TRX_BATCH_SIZE
): Promise<SyncPackage[]> {
  const [icons, tags, wallets, accounts, counterparties, currencies, transactions, budgets, deletions] =
    await Promise.all([
      exportIcons(0),
      exportTags(0),
      exportWallets(0),
      exportAccounts(0),
      exportCounterparties(0),
      exportCurrencies(0),
      exportTransactions(0),
      exportBudgets(0),
      getDeletionsSince(0),
    ])

  const makePackage = (trxSlice: SyncTransaction[]): SyncPackage => ({
    version: 2,
    sender_id: senderId,
    created_at: Math.floor(Date.now() / 1000),
    since: 0,
    icons,
    tags,
    wallets,
    accounts,
    counterparties,
    currencies,
    transactions: trxSlice,
    budgets,
    deletions,
  })

  if (transactions.length <= batchSize) {
    return [makePackage(transactions)]
  }

  const packages: SyncPackage[] = []
  for (let i = 0; i < transactions.length; i += batchSize) {
    packages.push(makePackage(transactions.slice(i, i + batchSize)))
  }
  return packages
}

/**
 * Export all changes since `sinceTimestamp` into a SyncPackage.
 * All foreign keys are resolved to natural keys (names/codes).
 */
export async function exportSyncPackage(
  sinceTimestamp: number,
  senderId: string
): Promise<SyncPackage> {
  const [icons, tags, wallets, accounts, counterparties, currencies, transactions, budgets, deletions] =
    await Promise.all([
      exportIcons(sinceTimestamp),
      exportTags(sinceTimestamp),
      exportWallets(sinceTimestamp),
      exportAccounts(sinceTimestamp),
      exportCounterparties(sinceTimestamp),
      exportCurrencies(sinceTimestamp),
      exportTransactions(sinceTimestamp),
      exportBudgets(sinceTimestamp),
      getDeletionsSince(sinceTimestamp),
    ])

  return {
    version: 2,
    sender_id: senderId,
    created_at: Math.floor(Date.now() / 1000),
    since: sinceTimestamp,
    icons,
    tags,
    wallets,
    accounts,
    counterparties,
    currencies,
    transactions,
    budgets,
    deletions,
  }
}

async function exportIcons(since: number): Promise<SyncIcon[]> {
  return querySQL<SyncIcon>(
    `SELECT id, value, updated_at FROM icon WHERE updated_at >= ?`,
    [since]
  )
}

async function exportTags(since: number): Promise<SyncTag[]> {
  // Exclude core system tags (1-10) and ARCHIVED(22), ADJUSTMENT(23)
  // Include user category tags (11-21) and any user-created tags (>23)
  return querySQL<SyncTag>(
    `SELECT
      t.id,
      t.name,
      t.updated_at,
      COALESCE(
        (SELECT GROUP_CONCAT(parent_id, ',')
         FROM tag_to_tag
         WHERE child_id = t.id AND parent_id > 1),
        ''
      ) as parents,
      COALESCE(
        (SELECT GROUP_CONCAT(child_id, ',')
         FROM tag_to_tag
         WHERE parent_id = t.id),
        ''
      ) as children,
      (SELECT icon_id FROM tag_icon WHERE tag_id = t.id) as icon
    FROM tag t
    WHERE t.updated_at >= ?
      AND ((t.id BETWEEN 11 AND 21) OR t.id > 23)`,
    [since]
  ).then(rows => rows.map(r => ({
    ...r,
    parents: r.parents ? String(r.parents).split(',').map(id => parseInt(id)) : [],
    children: r.children ? String(r.children).split(',').map(id => parseInt(id)) : [],
  })))
}

async function exportWallets(since: number): Promise<SyncWallet[]> {
  return querySQL<SyncWallet>(
    `SELECT
      w.id,
      w.name,
      w.color,
      w.updated_at,
      COALESCE(
        (SELECT GROUP_CONCAT(tag_id, ',')
         FROM wallet_to_tags w2t
         WHERE w2t.wallet_id = w.id),
        ''
      ) as tags
    FROM wallet w
    WHERE w.updated_at >= ?`,
    [since]
  ).then(rows => rows.map(r => ({
    ...r,
    tags: r.tags ? String(r.tags).split(',').map(id => parseInt(id)) : [],
  })))
}

async function exportAccounts(since: number): Promise<SyncAccount[]> {
  return querySQL<SyncAccount>(
    `SELECT
      a.id,
      a.wallet_id AS wallet,
      a.currency_id AS currency,
      a.updated_at,
      COALESCE(
        (SELECT GROUP_CONCAT(tag_id, ',')
         FROM account_to_tags a2t
         WHERE a2t.account_id = a.id),
        ''
      ) as tags
    FROM account a
    WHERE a.updated_at >= ?`,
    [since]
  ).then(rows => rows.map(r => ({
    ...r,
    tags: r.tags ? String(r.tags).split(',').map(id => parseInt(id)) : [],
  })))
}

async function exportCounterparties(since: number): Promise<SyncCounterparty[]> {
  return querySQL<SyncCounterparty>(
    `SELECT
      cp.id,
      cp.name,
      cp.updated_at,
      (SELECT cn.note FROM counterparty_note cn WHERE cn.counterparty_id = cp.id) as note,
      COALESCE(
        (SELECT GROUP_CONCAT(c2t.tag_id, ',')
         FROM counterparty_to_tags c2t
         WHERE c2t.counterparty_id = cp.id),
        ''
      ) as tags
    FROM counterparty cp
    WHERE cp.updated_at >= ?`,
    [since]
  ).then(rows => rows.map(r => ({
    ...r,
    tags: r.tags ? String(r.tags).split(',').map(id => parseInt(id)) : [],
  })))
}

async function exportCurrencies(since: number): Promise<SyncCurrency[]> {
  return querySQL<SyncCurrency>(
    `SELECT
      c.id,
      c.decimal_places,
      c.updated_at,
      COALESCE(
        (SELECT GROUP_CONCAT(c2t.tag_id, ',')
         FROM currency_to_tags c2t
         WHERE c2t.currency_id = c.id),
        ''
      ) as tags,
      (SELECT er.rate_int FROM exchange_rate er
       WHERE er.currency_id = c.id
       ORDER BY er.updated_at DESC LIMIT 1) as rate_int,
      (SELECT er.rate_frac FROM exchange_rate er
       WHERE er.currency_id = c.id
       ORDER BY er.updated_at DESC LIMIT 1) as rate_frac
    FROM currency c
    WHERE c.updated_at >= ?`,
    [since]
  ).then(rows => rows.map(r => ({
    ...r,
    tags: r.tags ? String(r.tags).split(',').map(id => parseInt(id)) : [],
    rate_int: r.rate_int ?? null,
    rate_frac: r.rate_frac ?? null,
  })))
}

interface TrxRow {
  id: string
  timestamp: number
  updated_at: number
  counterparty: number | null
  note: string | null
}

interface TrxLineRow {
  id: string
  trx_id: string
  account: number
  tag: number
  sign: '+' | '-'
  amount_int: number
  amount_frac: number
  rate_int: number
  rate_frac: number
}

async function exportTransactions(since: number): Promise<SyncTransaction[]> {
  // Get transaction headers
  const trxRows = await querySQL<TrxRow>(
    `SELECT
      hex(t.id) as id,
      t.timestamp,
      t.updated_at,
      (SELECT t2c.counterparty_id FROM trx_to_counterparty t2c WHERE t2c.trx_id = t.id) as counterparty,
      (SELECT tn.note FROM trx_note tn WHERE tn.trx_id = t.id) as note
    FROM trx t
    WHERE t.updated_at >= ?`,
    [since]
  )

  if (trxRows.length === 0) return []

  // Get all lines for these transactions in one query
  const trxIds = trxRows.map(t => t.id)
  const placeholders = new Array(trxIds.length).fill('?').join(',')

  const lineRows = await querySQL<TrxLineRow>(
    `SELECT
      hex(tb.id) as id,
      hex(tb.trx_id) as trx_id,
      tb.account_id as account,
      tb.tag_id as tag,
      tb.sign,
      tb.amount_int,
      tb.amount_frac,
      tb.rate_int,
      tb.rate_frac
    FROM trx_base tb
    WHERE hex(tb.trx_id) IN (${placeholders})`,
    trxIds
  )

  // Group lines by transaction
  const linesByTrx = new Map<string, SyncTransactionLine[]>()
  for (const line of lineRows) {
    const lines = linesByTrx.get(line.trx_id) ?? []
    lines.push({
      id: line.id,
      account: line.account,
      tag: line.tag,
      sign: line.sign,
      amount_int: line.amount_int,
      amount_frac: line.amount_frac,
      rate_int: line.rate_int,
      rate_frac: line.rate_frac,
    })
    linesByTrx.set(line.trx_id, lines)
  }

  return trxRows.map(t => ({
    id: t.id,
    timestamp: t.timestamp,
    updated_at: t.updated_at,
    counterparty: t.counterparty,
    note: t.note,
    lines: linesByTrx.get(t.id) ?? [],
  }))
}

async function exportBudgets(since: number): Promise<SyncBudget[]> {
  return querySQL<SyncBudget>(
    `SELECT
      hex(b.id) as id,
      b.start,
      b.end,
      b.tag_id AS tag,
      b.amount_int,
      b.amount_frac,
      b.updated_at
    FROM budget b
    WHERE b.updated_at >= ?`,
    [since]
  )
}
