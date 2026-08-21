import { execSQL } from './connection'

// Views that join workspace-scoped tables (wallet, account, trx, trx_base, budget, ...)
// with shared-scoped ones (currency, tag, counterparty) can't exist as regular views —
// SQLite forbids a VIEW from referencing objects in a different attached database,
// even with explicit qualification. CREATE TEMP VIEW is explicitly exempted from that
// restriction (see design.md). These are recreated once per session, after `shared`
// and the active workspace are both attached; they don't need to be recreated on
// workspace switch since their `workspace.`-qualified references bind to the attach
// alias, not a specific file.
//
// Created in dependency order: `accounts` before the views that join it,
// `budget_subtags` before `summary`. `budget_subtags` also depends on `shared.tags_hierarchy`,
// which doesn't exist until Section 5 creates the core shared-entity schema — like triggers,
// CREATE VIEW is lazy about referenced-table existence, so this can be created now and will
// simply not be successfully queryable until then.
export const TEMP_VIEW_NAMES = [
  'accounts',
  'trx_log',
  'transactions',
  'exchanges',
  'transfers',
  'budget_subtags',
  'summary',
  'counterparties_summary',
  'tags_summary',
]

export const TEMP_VIEW_STATEMENTS: string[] = [
  `CREATE TEMP VIEW accounts AS
  SELECT
    a.id as id,
    w.name as wallet,
    w.color as wallet_color,
    c.code as currency, c.symbol as symbol, c.decimal_places as decimal_places,
    group_concat(t.name, ', ') as tags,
    CASE
      WHEN SUM(CASE WHEN t.name = 'savings' THEN 1 ELSE 0 END) > 0 THEN 'savings'
      WHEN SUM(CASE WHEN t.name = 'credits' THEN 1 ELSE 0 END) > 0 THEN 'credits'
      ELSE 'plain'
    END as account_type,
    ad.note as note,
    ad.due_date as due_date,
    ad.rate as rate,
    a.balance_int as balance_int,
    a.balance_frac as balance_frac,
    a.updated_at as updated_at
  FROM workspace.account a
  JOIN workspace.wallet w ON a.wallet_id = w.id
  JOIN shared.currency c ON a.currency_id = c.id
  LEFT JOIN workspace.account_to_tags a2t ON a2t.account_id = a.id
  LEFT JOIN shared.tag t ON a2t.tag_id = t.id
  LEFT JOIN workspace.account_data ad ON ad.account_id = a.id
  GROUP BY a.id
  ORDER BY wallet_id;`,

  `CREATE TEMP VIEW trx_log AS
  SELECT
    t.id as id,
    datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
    c.name as counterparty,
    a.wallet as wallet,
    a.wallet_color as wallet_color,
    a.currency as currency,
    a.symbol as symbol,
    a.decimal_places as decimal_places,
    tag.name as tags,
    tb.amount_int as amount_int,
    tb.amount_frac as amount_frac,
    tb.sign as sign,
    tb.rate_int as rate_int,
    tb.rate_frac as rate_frac
  FROM workspace.trx t
  JOIN workspace.trx_base tb ON tb.trx_id = t.id
  JOIN accounts a ON tb.account_id = a.id
  JOIN shared.tag tag ON tb.tag_id = tag.id
  LEFT JOIN workspace.trx_to_counterparty t2c ON t2c.trx_id = t.id
  LEFT JOIN shared.counterparty c ON t2c.counterparty_id = c.id
  ORDER BY t.timestamp;`,

  `CREATE TEMP VIEW transactions AS
  SELECT
    t.id as id,
    datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
    c.name as counterparty,
    GROUP_CONCAT(DISTINCT a.wallet) as wallet,
    GROUP_CONCAT(DISTINCT a.currency) as currency,
    GROUP_CONCAT(tag.name) as tags,
    sum((
      CASE WHEN tb.sign = '-'
      THEN -(tb.amount_int + tb.amount_frac * 1e-18)
      ELSE (tb.amount_int + tb.amount_frac * 1e-18)
      END
    )) as amount
  FROM workspace.trx t
  JOIN workspace.trx_base tb ON tb.trx_id = t.id
  JOIN accounts a ON tb.account_id = a.id
  JOIN shared.tag tag ON tb.tag_id = tag.id
  LEFT JOIN workspace.trx_to_counterparty t2c ON t2c.trx_id = t.id
  LEFT JOIN shared.counterparty c ON t2c.counterparty_id = c.id
  WHERE tb.tag_id NOT IN (3, 6, 7)
  GROUP BY t.id
  ORDER BY t.timestamp;`,

  `CREATE TEMP VIEW exchanges AS
  SELECT
    t.id as id,
    datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
    c.name as counterparty,
    a.wallet as wallet,
    a.currency as currency,
    tag.name as tag,
    (iif(tb.sign = '-', -1, 1) * (tb.amount_int + tb.amount_frac * 1e-18)) as amount
  FROM workspace.trx t
  JOIN workspace.trx_base tb ON tb.trx_id = t.id
  JOIN accounts a ON tb.account_id = a.id
  JOIN shared.tag tag ON tb.tag_id = tag.id
  LEFT JOIN workspace.trx_to_counterparty t2c ON t2c.trx_id = t.id
  LEFT JOIN shared.counterparty c ON t2c.counterparty_id = c.id
  WHERE tb.tag_id IN (7, 13);`,

  `CREATE TEMP VIEW transfers AS
  SELECT
    t.id as id,
    datetime(t.timestamp, 'unixepoch', 'localtime') as date_time,
    c.name as counterparty,
    a.wallet as wallet,
    a.currency as currency,
    tag.name as tag,
    (iif(tb.sign = '-', -1, 1) * (tb.amount_int + tb.amount_frac * 1e-18)) as amount
  FROM workspace.trx t
  JOIN workspace.trx_base tb ON tb.trx_id = t.id
  JOIN accounts a ON tb.account_id = a.id
  JOIN shared.tag tag ON tb.tag_id = tag.id
  LEFT JOIN workspace.trx_to_counterparty t2c ON t2c.trx_id = t.id
  LEFT JOIN shared.counterparty c ON t2c.counterparty_id = c.id
  WHERE tb.tag_id IN (6, 13);`,

  `CREATE TEMP VIEW budget_subtags AS
  SELECT
    budget.id as budget_id,
    th.child_id as child_id
  FROM workspace.budget
  LEFT JOIN shared.tags_hierarchy th ON th.parent_id = budget.tag_id OR budget.tag_id = th.child_id;`,

  `CREATE TEMP VIEW summary AS
  SELECT
    tag.name as tag,
    budget.type as type,
    (budget.amount_int + budget.amount_frac * 1e-18) as amount,
    budget.amount_int as amount_int,
    budget.amount_frac as amount_frac,
    total(
      (tb.amount_int + tb.amount_frac * 1e-18)
      / (tb.rate_int + tb.rate_frac * 1e-18)
    ) as actual
  FROM workspace.budget
  JOIN shared.tag tag ON budget.tag_id = tag.id
  JOIN workspace.trx ON trx.timestamp >= budget.start AND trx.timestamp < budget.end
  JOIN workspace.trx_base tb ON tb.trx_id = trx.id
    AND (tb.tag_id = budget.tag_id OR tb.tag_id IN (SELECT child_id FROM budget_subtags WHERE budget_id = budget.id))
  WHERE (tb.rate_int > 0 OR tb.rate_frac > 0)
    AND tb.sign = CASE budget.type WHEN 'income' THEN '+' ELSE '-' END
  GROUP BY budget.tag_id, budget.type, budget.end - budget.start;`,

  `CREATE TEMP VIEW counterparties_summary AS
  SELECT
    c.name as counterparty,
    sum(
      iif(tb.sign = '-', -1, 1)
      * (tb.amount_int + tb.amount_frac * 1e-18)
      * (tb.rate_int + tb.rate_frac * 1e-18)
    ) as amount
  FROM shared.counterparty c
  JOIN workspace.trx_to_counterparty t2c ON t2c.counterparty_id = c.id
  LEFT JOIN workspace.trx_base tb ON t2c.trx_id = tb.trx_id
  GROUP BY c.id
  ORDER BY amount;`,

  `CREATE TEMP VIEW tags_summary AS
  SELECT
    tag.name as tag,
    total(
      iif(tb.sign = '-', -1, 1)
      * (tb.amount_int + tb.amount_frac * 1e-18)
      * (tb.rate_int + tb.rate_frac * 1e-18)
    ) as amount
  FROM workspace.trx_base tb
  JOIN shared.tag tag ON tb.tag_id = tag.id
  GROUP BY tb.tag_id
  ORDER BY amount;`,
]

export async function createTempViews(): Promise<void> {
  const drops = [...TEMP_VIEW_NAMES].reverse().map((name) => `DROP VIEW IF EXISTS temp.${name};`)
  await execSQL(drops.join(' '))
  await execSQL(TEMP_VIEW_STATEMENTS.join(' '))
}
