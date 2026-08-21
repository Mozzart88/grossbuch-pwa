import { execSQL, queryOne, getLastInsertId, validateReferenceExists } from '../database/connection'
import { getActiveWorkspaceId, switchWorkspace } from '../database/workspace'
import { reconcileIcons, reconcileTags, reconcileCurrencies, reconcileCounterparties } from './sharedEntityReconciliation'
import { tagReferences } from '../repositories/tagReferences'
import type { WorkspacePackage, WorkspaceImportResult } from './workspaceTypes'

function randomBlobId(): Uint8Array {
  const id = new Uint8Array(8)
  crypto.getRandomValues(id)
  return id
}

/**
 * Resolve a tag name to a local id, falling back to a live lookup for names
 * not in the reconciliation map — covers system tags (income/expense/
 * transfer/exchange/...), which are never exported (see workspaceExport.ts's
 * NON_SYSTEM_TAG_FILTER) since every installation pre-seeds them identically,
 * the same assumption sync's exportTags already relies on.
 */
async function resolveTagId(name: string, tagIdByName: Map<string, number>): Promise<number | null> {
  const mapped = tagIdByName.get(name)
  if (mapped !== undefined) return mapped
  const row = await queryOne<{ id: number }>(`SELECT id FROM shared.tag WHERE name = ?`, [name])
  return row?.id ?? null
}

/**
 * Import a WorkspacePackage. Defaults to creating a new workspace; pass
 * `mergeIntoWorkspaceId` to add the imported data into an existing one
 * instead. Every shared-entity reference is reconciled by natural key (never
 * trusts incoming ids — see sharedEntityReconciliation.ts); wallets/accounts/
 * transactions/budgets always get fresh local ids, since a merge target may
 * already have its own data occupying the package's original id space.
 */
export async function importWorkspacePackage(
  pkg: WorkspacePackage,
  options: { mergeIntoWorkspaceId?: number } = {}
): Promise<WorkspaceImportResult> {
  const originalActiveWorkspaceId = getActiveWorkspaceId()

  let targetWorkspaceId: number
  if (options.mergeIntoWorkspaceId !== undefined) {
    if (!(await validateReferenceExists('shared.workspace', 'id', options.mergeIntoWorkspaceId))) {
      throw new Error('Target workspace not found')
    }
    targetWorkspaceId = options.mergeIntoWorkspaceId
  } else {
    await execSQL(`INSERT INTO shared.workspace (name) VALUES (?)`, [pkg.workspace_name])
    targetWorkspaceId = await getLastInsertId()
  }

  const needsSwitch = targetWorkspaceId !== originalActiveWorkspaceId
  if (needsSwitch) {
    await switchWorkspace(targetWorkspaceId)
  }

  try {
    return await importIntoActiveWorkspace(pkg, targetWorkspaceId)
  } finally {
    if (needsSwitch && originalActiveWorkspaceId !== null) {
      await switchWorkspace(originalActiveWorkspaceId)
    }
  }
}

async function importIntoActiveWorkspace(pkg: WorkspacePackage, workspaceId: number): Promise<WorkspaceImportResult> {
  const iconIdByValue = await reconcileIcons(pkg.icons)
  const tagIdByName = await reconcileTags(pkg.tags, iconIdByValue)
  const currencyIdByCode = await reconcileCurrencies(pkg.currencies)
  const counterpartyIdByName = await reconcileCounterparties(pkg.counterparties, tagIdByName)

  // wallet.name is UNIQUE within a workspace file, so — unlike account, which
  // has no natural key at all (two accounts can share wallet+currency,
  // distinguished only by type tag) — merging into an existing, already-
  // populated workspace must reconcile wallets by name rather than blind-insert.
  const walletIdByPackageId = new Map<number, number>()
  for (const wallet of pkg.wallets) {
    const existing = await queryOne<{ id: number }>(`SELECT id FROM workspace.wallet WHERE name = ?`, [wallet.name])
    let newId: number
    if (existing) {
      newId = existing.id
    } else {
      await execSQL(`INSERT INTO workspace.wallet (name, color) VALUES (?, ?)`, [wallet.name, wallet.color])
      newId = await getLastInsertId()
    }
    walletIdByPackageId.set(wallet.id, newId)
    for (const tagName of wallet.tags) {
      const tagId = await resolveTagId(tagName, tagIdByName)
      if (tagId === null) continue
      // Unlike account (always freshly inserted, see below), `newId` here may
      // be a reused, already-tagged wallet — check first so a merge-import
      // doesn't double-count a tag the wallet already carries.
      const alreadyTagged = await queryOne(
        `SELECT 1 FROM workspace.wallet_to_tags WHERE wallet_id = ? AND tag_id = ?`, [newId, tagId]
      )
      if (alreadyTagged) continue
      await execSQL(`INSERT INTO workspace.wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)`, [newId, tagId])
      await tagReferences.increment(tagId)
    }
  }

  const accountIdByPackageId = new Map<number, number>()
  let accountsImported = 0
  for (const account of pkg.accounts) {
    const walletId = walletIdByPackageId.get(account.wallet)
    const currencyId = currencyIdByCode.get(account.currency)
    if (walletId === undefined || currencyId === undefined) continue

    await execSQL(
      `INSERT INTO workspace.account (wallet_id, currency_id, balance_int, balance_frac) VALUES (?, ?, ?, ?)`,
      [walletId, currencyId, account.balance_int, account.balance_frac]
    )
    const newId = await getLastInsertId()
    accountIdByPackageId.set(account.id, newId)
    accountsImported++

    for (const tagName of account.tags) {
      const tagId = await resolveTagId(tagName, tagIdByName)
      if (tagId !== null) {
        await execSQL(`INSERT OR IGNORE INTO workspace.account_to_tags (account_id, tag_id) VALUES (?, ?)`, [newId, tagId])
        await tagReferences.increment(tagId)
      }
    }

    if (account.note || account.due_date || account.rate != null) {
      await execSQL(
        `INSERT INTO workspace.account_data (account_id, note, due_date, rate) VALUES (?, ?, ?, ?)`,
        [newId, account.note ?? null, account.due_date ?? null, account.rate ?? null]
      )
    }
  }

  let transactionsImported = 0
  for (const trx of pkg.transactions) {
    const lineRows: { accountId: number; tagId: number; line: (typeof trx.lines)[number] }[] = []
    let missingReference = false
    for (const line of trx.lines) {
      const accountId = accountIdByPackageId.get(line.account)
      const tagId = await resolveTagId(line.tag, tagIdByName)
      if (accountId === undefined || tagId === null) {
        missingReference = true
        break
      }
      lineRows.push({ accountId, tagId, line })
    }
    if (missingReference || lineRows.length === 0) continue

    const trxId = randomBlobId()
    await execSQL(`INSERT INTO workspace.trx (id, timestamp) VALUES (?, ?)`, [trxId, trx.timestamp])

    for (const { accountId, tagId, line } of lineRows) {
      const trxBaseId = randomBlobId()
      await execSQL(
        `INSERT INTO workspace.trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [trxBaseId, trxId, accountId, tagId, line.sign, line.amount_int, line.amount_frac, line.rate_int, line.rate_frac]
      )
      await tagReferences.increment(tagId)
      if (line.tag_context) {
        const contextTagId = await resolveTagId(line.tag_context, tagIdByName)
        if (contextTagId !== null) {
          await execSQL(`INSERT OR IGNORE INTO workspace.trx_base_tag_context (trx_base_id, tag_id) VALUES (?, ?)`, [trxBaseId, contextTagId])
          await tagReferences.increment(contextTagId)
        }
      }
    }

    if (trx.counterparty) {
      const counterpartyId = counterpartyIdByName.get(trx.counterparty)
      if (counterpartyId !== undefined) {
        await execSQL(`INSERT INTO workspace.trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)`, [trxId, counterpartyId])
      }
    }
    if (trx.note) {
      await execSQL(`INSERT INTO workspace.trx_note (trx_id, note) VALUES (?, ?)`, [trxId, trx.note])
    }
    transactionsImported++
  }

  let budgetsImported = 0
  for (const budget of pkg.budgets) {
    const tagId = await resolveTagId(budget.tag, tagIdByName)
    if (tagId === null) continue

    const budgetId = randomBlobId()
    await execSQL(
      `INSERT INTO workspace.budget (id, start, end, tag_id, type, amount_int, amount_frac) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [budgetId, budget.start, budget.end, tagId, budget.type, budget.amount_int, budget.amount_frac]
    )
    await tagReferences.increment(tagId)
    budgetsImported++

    if (budget.tag_context) {
      const contextTagId = await resolveTagId(budget.tag_context, tagIdByName)
      if (contextTagId !== null) {
        await execSQL(`INSERT OR IGNORE INTO workspace.budget_tag_context (budget_id, tag_id) VALUES (?, ?)`, [budgetId, contextTagId])
        await tagReferences.increment(contextTagId)
      }
    }
  }

  return {
    workspaceId,
    imported: {
      icons: iconIdByValue.size,
      tags: tagIdByName.size,
      currencies: currencyIdByCode.size,
      counterparties: counterpartyIdByName.size,
      wallets: walletIdByPackageId.size,
      accounts: accountsImported,
      transactions: transactionsImported,
      budgets: budgetsImported,
    },
  }
}
