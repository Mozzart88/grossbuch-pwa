import { execSQL, execBatch, querySQL } from '../database/connection'
import { getActiveWorkspaceId } from '../database/workspace'
import { RECOMPUTE_SHARED_COUNTERS_SQL } from '../database/sharedCounterRecompute'
import { hexToBlob } from '../../utils/blobUtils'
import { settingsRepository } from '../repositories/settingsRepository'
import { linkedDeviceRepository } from '../repositories/linkedDeviceRepository'
import { resolveConflicts, type ConflictConfig } from './syncConflictResolution'
import { batchUpsert, isGatedByConflictConfig, type UpsertConfig } from './syncBatchUpsert'
import type {
  SyncPackage,
  SyncIcon,
  SyncTag,
  SyncWallet,
  SyncAccount,
  SyncCounterparty,
  SyncCurrency,
  SyncTransaction,
  SyncBudget,
  SyncNotification,
  SyncRecurringPlan,
  SyncRecurringOccurrence,
  SyncRecurringBudget,
  SyncGoal,
  SyncDeletion,
  SyncUnlinkCommand,
  SyncUnlinkConfirmCommand,
  SyncRenameCommand,
  SyncCommand,
  ImportResult,
} from './syncTypes'

/**
 * Import a SyncPackage with last-write-wins conflict resolution.
 * Process in dependency order: icons -> tags -> wallets -> accounts -> counterparties -> currencies -> transactions -> budgets -> notifications -> deletions
 *
 * IMPORTANT: Caller must wrap in dropUpdatedAtTriggers/restoreUpdatedAtTriggers
 * and setSuppressWriteNotifications to prevent echo loops.
 */
export async function importSyncPackage(pkg: SyncPackage): Promise<ImportResult> {
  const result: ImportResult = {
    imported: { icons: 0, tags: 0, wallets: 0, accounts: 0, counterparties: 0, currencies: 0, transactions: 0, budgets: 0, notifications: 0, recurringPlans: 0, recurringOccurrences: 0, recurringBudgets: 0, goals: 0, deletions: 0 },
    newAccountCurrencyIds: [],
    conflicts: 0,
    errors: [],
  }

  console.log(`[importSyncPackage] Starting: ${pkg.transactions.length} trx, ${pkg.wallets.length} wallets, ${pkg.accounts.length} accounts`)

  try {
    await execSQL('PRAGMA foreign_keys = OFF')
    await execSQL('BEGIN TRANSACTION')

    result.imported.icons = await importIcons(pkg.icons)
    result.imported.tags = await importTags(pkg.tags)
    result.imported.wallets = await importWallets(pkg.wallets)
    const accountsResult = await importAccounts(pkg.accounts)
    result.imported.accounts = accountsResult.count
    result.newAccountCurrencyIds = accountsResult.currencyIds
    result.imported.counterparties = await importCounterparties(pkg.counterparties)
    result.imported.currencies = await importCurrencies(pkg.currencies)
    result.imported.transactions = await importTransactions(pkg.transactions)
    result.imported.budgets = await importBudgets(pkg.budgets)
    result.imported.notifications = await importNotifications(pkg.notifications ?? [])
    result.imported.recurringPlans = await importRecurringPlans(pkg.recurringPlans ?? [])
    result.imported.recurringOccurrences = await importRecurringOccurrences(pkg.recurringOccurrences ?? [])
    result.imported.recurringBudgets = await importRecurringBudgets(pkg.recurringBudgets ?? [])
    result.imported.goals = await importGoals(pkg.goals ?? [])
    result.imported.deletions = await importDeletions(pkg.deletions)

    // shared.tag_sort_order/counterparty_sort_order/tag_references are application-maintained
    // (sortOrder.ts/tagReferences.ts), but those call sites are never hit by the raw-SQL
    // imports above — recompute once, after everything else, so this import leaves them
    // correct regardless of which entity types the package touched. See proposal.md.
    await execSQL(RECOMPUTE_SHARED_COUNTERS_SQL)

    await execSQL('COMMIT')
  } catch (err) {
    await execSQL('ROLLBACK').catch(() => { })
    const msg = err instanceof Error ? err.message : 'Unknown import error'
    result.errors.push(msg)
  } finally {
    await execSQL('PRAGMA foreign_keys = ON')
  }

  console.log(`[importSyncPackage] Done:`, result.imported, result.errors.length > 0 ? `errors: ${result.errors}` : 'no errors')

  if (result.errors.length === 0 && pkg.commands && pkg.commands.length > 0) {
    await processCommands(pkg.commands)
  }

  return result
}

// ======= Commands =======

// Not imported from './index' to avoid a circular dependency (index.ts imports this module).
// Handles both the split `installation_id` key (plain id string) and the legacy `{ id, jwt }`
// blob, in case this runs before the lazy split in getInstallationData() has occurred.
async function getOwnInstallationId(): Promise<string | null> {
  const raw = await settingsRepository.get('installation_id')
  if (!raw) return null
  try {
    const parsed = JSON.parse(String(raw)) as { id?: string }
    if (parsed && typeof parsed.id === 'string') return parsed.id
  } catch {
    // Not JSON — already split, raw is the plain id
  }
  return String(raw)
}

async function processCommands(commands: SyncCommand[]): Promise<void> {
  for (const cmd of commands) {
    try {
      if (cmd.type === 'unlink_device') {
        await processUnlinkDevice(cmd)
      } else if (cmd.type === 'unlink_confirm') {
        await processUnlinkConfirm(cmd)
      } else if (cmd.type === 'rename_device') {
        await processRenameDevice(cmd)
      }
    } catch (err) {
      console.error('[processCommands] Failed to process command:', cmd.type, err)
    }
  }
}

async function processRenameDevice(cmd: SyncRenameCommand): Promise<void> {
  const ownId = await getOwnInstallationId()
  if (!ownId) return

  if (cmd.target_installation_id === ownId) {
    await settingsRepository.set('device_name', cmd.name)
    console.log('[processRenameDevice] Renamed self to', cmd.name)
  } else {
    await linkedDeviceRepository.rename(cmd.target_installation_id, cmd.name)
    console.log('[processRenameDevice] Renamed peer', cmd.target_installation_id, 'to', cmd.name)
  }
}

async function processUnlinkDevice(cmd: SyncUnlinkCommand): Promise<void> {
  const ownId = await getOwnInstallationId()
  if (!ownId) return

  if (cmd.target_installation_id === ownId) {
    const initiator = await linkedDeviceRepository.findById(cmd.initiator_id)
    await settingsRepository.set('pending_self_unlink', JSON.stringify({
      initiator_id: cmd.initiator_id,
      keep_data: cmd.keep_data,
      initiator_pub_key: initiator?.public_key ?? '',
    }))
    console.log('[processUnlinkDevice] Marked self for unlink by', cmd.initiator_id)
  } else {
    const existing = await linkedDeviceRepository.findById(cmd.target_installation_id)
    if (existing) {
      await linkedDeviceRepository.remove(cmd.target_installation_id)
      console.log('[processUnlinkDevice] Removed peer', cmd.target_installation_id)
    }
  }
}

async function processUnlinkConfirm(cmd: SyncUnlinkConfirmCommand): Promise<void> {
  await linkedDeviceRepository.remove(cmd.target_installation_id)

  const rawPending = await settingsRepository.get('pending_unlink_requests')
  if (rawPending) {
    const pending = JSON.parse(String(rawPending)) as Array<{ target_id: string }>
    const filtered = pending.filter(p => p.target_id !== cmd.target_installation_id)
    if (filtered.length === 0) {
      await settingsRepository.delete('pending_unlink_requests')
    } else {
      await settingsRepository.set('pending_unlink_requests', JSON.stringify(filtered))
    }
  }

  console.log('[processUnlinkConfirm] Completed unlink for', cmd.target_installation_id)
}

// ======= Icons =======

const ICON_UPSERT_CONFIG: UpsertConfig<SyncIcon> = {
  table: 'shared.icon',
  idColumn: 'id',
  idIsBlob: false,
  getId: (icon) => icon.id,
  insert: (icon) => ({ sql: `INSERT INTO shared.icon (id, value, updated_at) VALUES (?, ?, ?)`, bind: [icon.id, icon.value, icon.updated_at] }),
  update: (icon) => ({ sql: 'UPDATE shared.icon SET value = ?, updated_at = ? WHERE id = ?', bind: [icon.value, icon.updated_at, icon.id] }),
  relations: [],
}

async function importIcons(icons: SyncIcon[]): Promise<number> {
  const { count } = await batchUpsert(ICON_UPSERT_CONFIG, icons, execBatch, querySQL)
  return count
}

// ======= Tags =======

// Pre-flight: resolve tag name conflicts caused by local tag ids diverging from the
// parent device's canonical ids for the same tag names — whether from migration-assigned
// ids or from two independently-evolved real installs drifting apart over their own
// histories. Delegates to the generic engine (syncConflictResolution.ts) for the
// detect -> vacate -> merge -> rename phases; see that module and design.md Decision 2
// for why the phase order is load-bearing. Must run inside the import transaction with
// foreign_keys = OFF.
const TAG_CONFLICT_CONFIG: ConflictConfig = {
  table: 'shared.tag',
  conflictColumn: 'name',
  skipIfIdExistsLocally: false,
  hasRenamePhase: true,
  remaps: [
    { mode: 'plain', table: 'shared.tag_to_tag', column: 'child_id' },
    { mode: 'plain', table: 'shared.tag_to_tag', column: 'parent_id' },
    { mode: 'plain', table: 'shared.tag_icon', column: 'tag_id' },
    { mode: 'conditional-sort-order', table: 'shared.tag_sort_order', column: 'tag_id', existsCheckTable: 'shared.tag' },
    { mode: 'or-ignore-then-delete-orphans', table: 'shared.counterparty_to_tags', column: 'tag_id' },
    { mode: 'or-ignore-then-delete-orphans', table: 'shared.currency_to_tags', column: 'tag_id' },
    { mode: 'plain', table: 'workspace.wallet_to_tags', column: 'tag_id' },
    { mode: 'plain', table: 'workspace.account_to_tags', column: 'tag_id' },
    { mode: 'plain', table: 'workspace.trx_base', column: 'tag_id' },
    { mode: 'plain', table: 'workspace.trx_base_tag_context', column: 'tag_id' },
    { mode: 'plain', table: 'workspace.budget', column: 'tag_id' },
    { mode: 'plain', table: 'workspace.budget_tag_context', column: 'tag_id' },
  ],
  finalize: 'delete-old-row',
}

async function resolveTagNameConflicts(tags: SyncTag[]): Promise<void> {
  await resolveConflicts(TAG_CONFLICT_CONFIG, tags, execBatch)
}

// tag_to_tag is self-referential (a tag is both a possible child and a possible parent in the
// same table), with an asymmetric delete guard that only applies to the "parents" direction
// (protecting the link to SYSTEM_TAGS.SYSTEM=1) — this doesn't fit RelationSync's symmetric
// many-to-many mode, so it stays hand-written, batched across every incoming tag in two
// direction-scoped passes rather than the generic engine. See design.md Decision 5.
async function syncTagRelations(tags: SyncTag[]): Promise<void> {
  if (tags.length === 0) return

  const parentStatements: { sql: string; bind?: unknown[] }[] = []
  for (const tag of tags) {
    parentStatements.push({ sql: `DELETE FROM shared.tag_to_tag WHERE child_id = ? AND parent_id > 1`, bind: [tag.id] })
    for (const id of tag.parents) {
      parentStatements.push({ sql: `INSERT OR IGNORE INTO shared.tag_to_tag (child_id, parent_id) VALUES (?, ?)`, bind: [tag.id, id] })
    }
  }
  await execBatch(parentStatements)

  const childStatements: { sql: string; bind?: unknown[] }[] = []
  for (const tag of tags) {
    childStatements.push({ sql: `DELETE FROM shared.tag_to_tag WHERE parent_id = ?`, bind: [tag.id] })
    for (const id of tag.children) {
      childStatements.push({ sql: `INSERT OR IGNORE INTO shared.tag_to_tag (child_id, parent_id) VALUES (?, ?)`, bind: [id, tag.id] })
    }
  }
  await execBatch(childStatements)
}

const TAG_UPSERT_CONFIG: UpsertConfig<SyncTag> = {
  table: 'shared.tag',
  idColumn: 'id',
  idIsBlob: false,
  getId: (t) => t.id,
  insert: (t) => ({ sql: `INSERT INTO shared.tag (id, name, updated_at) VALUES (?, ?, ?)`, bind: [t.id, t.name, t.updated_at] }),
  update: (t) => ({ sql: 'UPDATE shared.tag SET name = ?, updated_at = ? WHERE id = ?', bind: [t.name, t.updated_at, t.id] }),
  relations: [
    {
      mode: 'optional-child-row',
      table: 'shared.tag_icon',
      ownColumn: 'tag_id',
      ownColumnIsBlob: false,
      ownId: (t) => t.id,
      extraColumns: ['icon_id'],
      row: (t) => t.icon ? [t.icon] : null,
      gated: isGatedByConflictConfig(TAG_CONFLICT_CONFIG.remaps, 'shared.tag_icon', 'tag_id'),
    },
  ],
}

async function importTags(tags: SyncTag[]): Promise<number> {
  await resolveTagNameConflicts(tags)
  await batchUpsert(TAG_UPSERT_CONFIG, tags, execBatch, querySQL)
  await syncTagRelations(tags)
  // Unlike the other upsert-shaped entities, every incoming tag counts as "imported" here
  // regardless of whether its own row was written — relations (tag_to_tag/tag_icon) always
  // resync, and a tag whose row was already brought fully up to date by the name-conflict
  // pre-flight's rename phase (same final name AND updated_at) still counts. Matches the
  // pre-refactor loop's unconditional `count++`.
  return tags.length
}

// ======= Wallets =======

const WALLET_UPSERT_CONFIG: UpsertConfig<SyncWallet> = {
  table: 'workspace.wallet',
  idColumn: 'id',
  idIsBlob: false,
  getId: (w) => w.id,
  insert: (w) => ({ sql: `INSERT INTO workspace.wallet (id, name, color, updated_at) VALUES (?, ?, ?, ?)`, bind: [w.id, w.name, w.color, w.updated_at] }),
  update: (w) => ({ sql: `UPDATE workspace.wallet SET name = ?, color = ?, updated_at = ? WHERE id = ?`, bind: [w.name, w.color, w.updated_at, w.id] }),
  relations: [
    {
      mode: 'many-to-many',
      table: 'workspace.wallet_to_tags',
      ownColumn: 'wallet_id',
      ownColumnIsBlob: false,
      otherColumn: 'tag_id',
      ownId: (w) => w.id,
      values: (w) => w.tags,
      gated: true, // no ConflictConfig for wallets
    },
  ],
}

async function importWallets(wallets: SyncWallet[]): Promise<number> {
  const { count } = await batchUpsert(WALLET_UPSERT_CONFIG, wallets, execBatch, querySQL)
  return count
}

// ======= Accounts =======

const ACCOUNT_UPSERT_CONFIG: UpsertConfig<SyncAccount> = {
  table: 'workspace.account',
  idColumn: 'id',
  idIsBlob: false,
  getId: (a) => a.id,
  insert: (a) => ({ sql: `INSERT INTO workspace.account (id, wallet_id, currency_id, updated_at) VALUES (?, ?, ?, ?)`, bind: [a.id, a.wallet, a.currency, a.updated_at] }),
  update: (a) => ({ sql: `UPDATE workspace.account SET updated_at = ? WHERE id = ?`, bind: [a.updated_at, a.id] }),
  relations: [
    {
      mode: 'many-to-many',
      table: 'workspace.account_to_tags',
      ownColumn: 'account_id',
      ownColumnIsBlob: false,
      otherColumn: 'tag_id',
      ownId: (a) => a.id,
      values: (a) => a.tags,
      gated: true, // no ConflictConfig for accounts
    },
    {
      mode: 'optional-child-row',
      table: 'workspace.account_data',
      ownColumn: 'account_id',
      ownColumnIsBlob: false,
      ownId: (a) => a.id,
      extraColumns: ['note', 'due_date', 'rate', 'updated_at'],
      row: (a) => (a.note || a.due_date || a.rate != null) ? [a.note ?? null, a.due_date ?? null, a.rate ?? null, a.updated_at] : null,
      gated: true,
    },
  ],
}

async function importAccounts(accounts: SyncAccount[]): Promise<{ count: number; currencyIds: number[] }> {
  const { count, inserted } = await batchUpsert(ACCOUNT_UPSERT_CONFIG, accounts, execBatch, querySQL)
  return { count, currencyIds: inserted.map(a => a.currency) }
}

// ======= Counterparties =======

// Pre-flight: resolve counterparty name conflicts caused by local counterparty ids
// diverging from the parent device's canonical ids for the same name — the same class of
// bug documented for tags above (resolveTagNameConflicts), delegated to the same generic
// engine. Must run inside the import transaction with foreign_keys = OFF.
const COUNTERPARTY_CONFLICT_CONFIG: ConflictConfig = {
  table: 'shared.counterparty',
  conflictColumn: 'name',
  skipIfIdExistsLocally: false,
  hasRenamePhase: true,
  remaps: [
    { mode: 'plain', table: 'shared.counterparty_note', column: 'counterparty_id' },
    { mode: 'or-ignore-then-delete-orphans', table: 'shared.counterparty_to_tags', column: 'counterparty_id' },
    { mode: 'conditional-sort-order', table: 'shared.counterparty_sort_order', column: 'counterparty_id', existsCheckTable: 'shared.counterparty' },
    { mode: 'plain', table: 'workspace.trx_to_counterparty', column: 'counterparty_id' },
  ],
  finalize: 'delete-old-row',
}

async function resolveCounterpartyNameConflicts(counterparties: SyncCounterparty[]): Promise<void> {
  await resolveConflicts(COUNTERPARTY_CONFLICT_CONFIG, counterparties, execBatch)
}

// Fix: counterparty_note and counterparty_to_tags are both remapped by a counterparty merge
// (COUNTERPARTY_CONFLICT_CONFIG.remaps above), so both must be ungated — previously both were
// gated, leaving a merge's remapped tags/note stale (or, for counterparty_note, duplicated —
// see proposal.md) whenever the surviving row's own update wasn't newer than the local one.
const COUNTERPARTY_UPSERT_CONFIG: UpsertConfig<SyncCounterparty> = {
  table: 'shared.counterparty',
  idColumn: 'id',
  idIsBlob: false,
  getId: (cp) => cp.id,
  insert: (cp) => ({ sql: `INSERT INTO shared.counterparty (id, name, updated_at) VALUES (?, ?, ?)`, bind: [cp.id, cp.name, cp.updated_at] }),
  update: (cp) => ({ sql: `UPDATE shared.counterparty SET name = ?, updated_at = ? WHERE id = ?`, bind: [cp.name, cp.updated_at, cp.id] }),
  relations: [
    {
      mode: 'optional-child-row',
      table: 'shared.counterparty_note',
      ownColumn: 'counterparty_id',
      ownColumnIsBlob: false,
      ownId: (cp) => cp.id,
      extraColumns: ['note'],
      row: (cp) => cp.note ? [cp.note] : null,
      gated: isGatedByConflictConfig(COUNTERPARTY_CONFLICT_CONFIG.remaps, 'shared.counterparty_note', 'counterparty_id'),
    },
    {
      mode: 'many-to-many',
      table: 'shared.counterparty_to_tags',
      ownColumn: 'counterparty_id',
      ownColumnIsBlob: false,
      otherColumn: 'tag_id',
      ownId: (cp) => cp.id,
      values: (cp) => cp.tags,
      gated: isGatedByConflictConfig(COUNTERPARTY_CONFLICT_CONFIG.remaps, 'shared.counterparty_to_tags', 'counterparty_id'),
    },
  ],
}

async function importCounterparties(counterparties: SyncCounterparty[]): Promise<number> {
  await resolveCounterpartyNameConflicts(counterparties)
  const { count } = await batchUpsert(COUNTERPARTY_UPSERT_CONFIG, counterparties, execBatch, querySQL)
  return count
}

// ======= Currencies =======

// Pre-flight: resolve currency id divergence caused by devices seeding currencies in
// different orders across migration history (the currency analog of resolveTagNameConflicts
// above). Unlike tag/counterparty name, `code` is never rewritten by sync, so there is no
// rename phase — every conflict is resolved by remapping the local orphan row's own id to
// match the incoming id. Must run inside the import transaction with foreign_keys = OFF.
const CURRENCY_CONFLICT_CONFIG: ConflictConfig = {
  table: 'shared.currency',
  conflictColumn: 'code',
  skipIfIdExistsLocally: true,
  hasRenamePhase: false,
  remaps: [
    { mode: 'plain', table: 'shared.currency_to_tags', column: 'currency_id' },
    { mode: 'plain', table: 'shared.exchange_rate', column: 'currency_id' },
    { mode: 'plain', table: 'workspace.account', column: 'currency_id' },
  ],
  finalize: 'rename-id',
}

async function resolveCurrencyCodeConflicts(currencies: SyncCurrency[]): Promise<void> {
  await resolveConflicts(CURRENCY_CONFLICT_CONFIG, currencies, execBatch)
}

// Currencies are pre-seeded (never inserted by sync), so this is update-only — `insert: null`
// makes batchUpsert skip any incoming currency with no local row at all, matching the
// pre-refactor `if (!local) continue`. currency_to_tags is ungated (it's remapped by
// CURRENCY_CONFLICT_CONFIG.remaps), same "always sync, no updated_at guard" behavior as before.
const CURRENCY_UPSERT_CONFIG: UpsertConfig<SyncCurrency> = {
  table: 'shared.currency',
  idColumn: 'id',
  idIsBlob: false,
  getId: (c) => c.id,
  insert: null,
  update: (c) => ({ sql: `UPDATE shared.currency SET updated_at = ? WHERE id = ?`, bind: [c.updated_at, c.id] }),
  relations: [
    {
      mode: 'many-to-many',
      table: 'shared.currency_to_tags',
      ownColumn: 'currency_id',
      ownColumnIsBlob: false,
      otherColumn: 'tag_id',
      ownId: (c) => c.id,
      values: (c) => c.tags,
      gated: isGatedByConflictConfig(CURRENCY_CONFLICT_CONFIG.remaps, 'shared.currency_to_tags', 'currency_id'),
    },
  ],
}

async function importCurrencies(currencies: SyncCurrency[]): Promise<number> {
  await resolveCurrencyCodeConflicts(currencies)
  const { count } = await batchUpsert(CURRENCY_UPSERT_CONFIG, currencies, execBatch, querySQL)
  await importExchangeRates(currencies)
  return count
}

// Batched version of the per-currency "insert an exchange rate iff the sender has one and we
// don't" step: one existence read against shared.currency to find which incoming currencies are
// actually pre-seeded locally (mirrors the `if (!local) continue` gate above), one existence
// read against shared.exchange_rate to find which of those already have a rate, one runBatch
// insert for the rest.
async function importExchangeRates(currencies: SyncCurrency[]): Promise<void> {
  const candidates = currencies.filter(c => c.rate_int != null && c.rate_frac != null)
  if (candidates.length === 0) return

  const candidateIds = candidates.map(c => c.id)
  const localCurrencyRows = await querySQL<{ id: number }>(
    `SELECT id FROM shared.currency WHERE id IN (${candidateIds.map(() => '?').join(',')})`,
    candidateIds
  )
  const localCurrencyIds = new Set(localCurrencyRows.map(r => r.id))
  const eligible = candidates.filter(c => localCurrencyIds.has(c.id))
  if (eligible.length === 0) return

  const eligibleIds = eligible.map(c => c.id)
  const existingRateRows = await querySQL<{ currency_id: number }>(
    `SELECT currency_id FROM shared.exchange_rate WHERE currency_id IN (${eligibleIds.map(() => '?').join(',')})`,
    eligibleIds
  )
  const hasRate = new Set(existingRateRows.map(r => r.currency_id))

  const statements = eligible
    .filter(c => !hasRate.has(c.id))
    .map(c => ({
      sql: `INSERT INTO shared.exchange_rate (currency_id, rate_int, rate_frac) VALUES (?, ?, ?)`,
      bind: [c.id, c.rate_int, c.rate_frac],
    }))
  if (statements.length > 0) await execBatch(statements)
}

// ======= Transactions =======

// Transactions fan out two levels deep (transaction -> lines -> optional tag context, plus an
// optional counterparty link and note) — no equivalent shape in RelationSync, so this stays a
// dedicated batched helper rather than an UpsertConfig. See design.md Decision 2. TRX_BATCH_SIZE
// (syncExport.ts) genuinely bounds `transactions.length` to <=100 for the full-history push this
// change targets, so no further internal chunking is needed here.
async function importTransactions(transactions: SyncTransaction[]): Promise<number> {
  if (transactions.length === 0) return 0

  const ids = transactions.map(t => t.id)
  const localRows = await querySQL<{ id: string; updated_at: number }>(
    `SELECT hex(id) as id, updated_at FROM workspace.trx WHERE hex(id) IN (${ids.map(() => '?').join(',')})`,
    ids
  )
  const localUpdatedAtById = new Map(localRows.map(r => [r.id, r.updated_at]))

  const toInsert: SyncTransaction[] = []
  const toUpdate: SyncTransaction[] = []
  for (const trx of transactions) {
    const localUpdatedAt = localUpdatedAtById.get(trx.id)
    if (localUpdatedAt === undefined) {
      toInsert.push(trx)
    } else if (trx.updated_at > localUpdatedAt) {
      toUpdate.push(trx)
    }
  }

  if (toUpdate.length > 0) {
    const updateBlobs = toUpdate.map(t => hexToBlob(t.id))
    const ph = updateBlobs.map(() => '?').join(',')
    // Last-write-wins: replace each updated transaction's data. Order is load-bearing —
    // trx_base_tag_context subqueries trx_base's own ids, so it must be deleted first.
    await execBatch([
      { sql: `DELETE FROM workspace.trx_base_tag_context WHERE trx_base_id IN (SELECT id FROM workspace.trx_base WHERE trx_id IN (${ph}))`, bind: updateBlobs },
      { sql: `DELETE FROM workspace.trx_base WHERE trx_id IN (${ph})`, bind: updateBlobs },
      { sql: `DELETE FROM workspace.trx_to_counterparty WHERE trx_id IN (${ph})`, bind: updateBlobs },
      { sql: `DELETE FROM workspace.trx_note WHERE trx_id IN (${ph})`, bind: updateBlobs },
    ])
  }

  const rowStatements: { sql: string; bind?: unknown[] }[] = []
  for (const trx of toInsert) {
    rowStatements.push({ sql: `INSERT INTO workspace.trx (id, timestamp, updated_at) VALUES (?, ?, ?)`, bind: [hexToBlob(trx.id), trx.timestamp, trx.updated_at] })
  }
  for (const trx of toUpdate) {
    rowStatements.push({ sql: `UPDATE workspace.trx SET timestamp = ?, updated_at = ? WHERE id = ?`, bind: [trx.timestamp, trx.updated_at, hexToBlob(trx.id)] })
  }
  if (rowStatements.length > 0) await execBatch(rowStatements)

  const written = [...toInsert, ...toUpdate]

  const lineStatements: { sql: string; bind?: unknown[] }[] = []
  for (const trx of written) {
    const trxBlob = hexToBlob(trx.id)
    for (const line of trx.lines) {
      lineStatements.push({
        sql: `INSERT INTO workspace.trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [hexToBlob(line.id), trxBlob, line.account, line.tag, line.sign, line.amount_int, line.amount_frac, line.rate_int, line.rate_frac],
      })
      if (line.tag_context) {
        lineStatements.push({
          sql: `INSERT OR IGNORE INTO workspace.trx_base_tag_context (trx_base_id, tag_id) VALUES (?, ?)`,
          bind: [hexToBlob(line.id), line.tag_context],
        })
      }
    }
  }
  if (lineStatements.length > 0) await execBatch(lineStatements)

  const relationStatements: { sql: string; bind?: unknown[] }[] = []
  for (const trx of written) {
    const trxBlob = hexToBlob(trx.id)
    if (trx.counterparty) {
      relationStatements.push({ sql: `INSERT INTO workspace.trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)`, bind: [trxBlob, trx.counterparty] })
    }
    if (trx.note) {
      relationStatements.push({ sql: `INSERT INTO workspace.trx_note (trx_id, note) VALUES (?, ?)`, bind: [trxBlob, trx.note] })
    }
  }
  if (relationStatements.length > 0) await execBatch(relationStatements)

  return toInsert.length + toUpdate.length
}

// ======= Budgets =======

const BUDGET_UPSERT_CONFIG: UpsertConfig<SyncBudget> = {
  table: 'workspace.budget',
  idColumn: 'id',
  idIsBlob: true,
  getId: (b) => b.id,
  insert: (b) => ({
    sql: `INSERT INTO workspace.budget (id, start, end, tag_id, type, amount_int, amount_frac, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [hexToBlob(b.id), b.start, b.end, b.tag, b.type ?? 'expense', b.amount_int, b.amount_frac, b.updated_at],
  }),
  update: (b) => ({
    sql: `UPDATE workspace.budget SET start = ?, end = ?, tag_id = ?, type = ?, amount_int = ?, amount_frac = ?, updated_at = ? WHERE hex(id) = ?`,
    bind: [b.start, b.end, b.tag, b.type ?? 'expense', b.amount_int, b.amount_frac, b.updated_at, b.id],
  }),
  relations: [
    {
      mode: 'optional-child-row',
      table: 'workspace.budget_tag_context',
      ownColumn: 'budget_id',
      ownColumnIsBlob: true,
      ownId: (b) => b.id,
      extraColumns: ['tag_id'],
      row: (b) => b.tag_context ? [b.tag_context] : null,
      insertOrIgnore: true,
      gated: true, // no ConflictConfig for budgets
    },
  ],
}

async function importBudgets(budgets: SyncBudget[]): Promise<number> {
  const { count } = await batchUpsert(BUDGET_UPSERT_CONFIG, budgets, execBatch, querySQL)
  return count
}

// ======= Notifications =======

const NOTIFICATION_UPSERT_CONFIG: UpsertConfig<SyncNotification> = {
  table: 'shared.notification',
  idColumn: 'id',
  idIsBlob: true,
  getId: (n) => n.id,
  insert: (n) => ({
    sql: `INSERT INTO shared.notification (id, workspace_id, type, status, timestamp, readed_at, updated_at, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [hexToBlob(n.id), getActiveWorkspaceId(), n.type, n.status, n.timestamp, n.readed_at, n.updated_at, n.payload],
  }),
  update: (n) => ({
    sql: `UPDATE shared.notification
         SET type = ?, status = ?, timestamp = ?, readed_at = ?, updated_at = ?, payload = ?
         WHERE hex(id) = ?`,
    bind: [n.type, n.status, n.timestamp, n.readed_at, n.updated_at, n.payload, n.id],
  }),
  relations: [],
}

async function importNotifications(notifications: SyncNotification[]): Promise<number> {
  const { count } = await batchUpsert(NOTIFICATION_UPSERT_CONFIG, notifications, execBatch, querySQL)
  return count
}

// ======= Recurring =======

const RECURRING_PLAN_UPSERT_CONFIG: UpsertConfig<SyncRecurringPlan> = {
  table: 'workspace.recurring_plan',
  idColumn: 'id',
  idIsBlob: true,
  getId: (p) => p.id,
  insert: (p) => ({
    sql: `INSERT INTO workspace.recurring_plan
         (id, schedule, transaction_draft, mode, start_date, next_due_date, until_policy, occurrence_count, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [hexToBlob(p.id), p.schedule, p.transaction_draft, p.mode, p.start_date, p.next_due_date, p.until_policy, p.occurrence_count, p.status, p.created_at, p.updated_at],
  }),
  update: (p) => ({
    sql: `UPDATE workspace.recurring_plan
         SET schedule = ?, transaction_draft = ?, mode = ?, start_date = ?, next_due_date = ?,
             until_policy = ?, occurrence_count = ?, status = ?, created_at = ?, updated_at = ?
         WHERE hex(id) = ?`,
    bind: [p.schedule, p.transaction_draft, p.mode, p.start_date, p.next_due_date, p.until_policy, p.occurrence_count, p.status, p.created_at, p.updated_at, p.id],
  }),
  relations: [],
}

async function importRecurringPlans(plans: SyncRecurringPlan[]): Promise<number> {
  const { count } = await batchUpsert(RECURRING_PLAN_UPSERT_CONFIG, plans, execBatch, querySQL)
  return count
}

const RECURRING_OCCURRENCE_UPSERT_CONFIG: UpsertConfig<SyncRecurringOccurrence> = {
  table: 'workspace.recurring_occurrence',
  idColumn: 'id',
  idIsBlob: true,
  getId: (o) => o.id,
  insert: (o) => ({
    sql: `INSERT OR IGNORE INTO workspace.recurring_occurrence
         (id, plan_id, due_date, notification_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
    bind: [hexToBlob(o.id), hexToBlob(o.plan_id), o.due_date, o.notification_id ? hexToBlob(o.notification_id) : null, o.created_at, o.updated_at],
  }),
  update: (o) => ({
    sql: `UPDATE workspace.recurring_occurrence
         SET plan_id = ?, due_date = ?, notification_id = ?, created_at = ?, updated_at = ?
         WHERE hex(id) = ?`,
    bind: [hexToBlob(o.plan_id), o.due_date, o.notification_id ? hexToBlob(o.notification_id) : null, o.created_at, o.updated_at, o.id],
  }),
  relations: [],
}

async function importRecurringOccurrences(occurrences: SyncRecurringOccurrence[]): Promise<number> {
  const { count } = await batchUpsert(RECURRING_OCCURRENCE_UPSERT_CONFIG, occurrences, execBatch, querySQL)
  return count
}

const RECURRING_BUDGET_UPSERT_CONFIG: UpsertConfig<SyncRecurringBudget> = {
  table: 'workspace.recurring_budget',
  idColumn: 'budget_id',
  idIsBlob: true,
  getId: (b) => b.budget_id,
  insert: (b) => ({
    sql: `INSERT OR IGNORE INTO workspace.recurring_budget (budget_id, plan_id, due_month, updated_at)
         VALUES (?, ?, ?, ?)`,
    bind: [hexToBlob(b.budget_id), hexToBlob(b.plan_id), b.due_month, b.updated_at],
  }),
  update: (b) => ({
    sql: `UPDATE workspace.recurring_budget SET plan_id = ?, due_month = ?, updated_at = ?
         WHERE hex(budget_id) = ?`,
    bind: [hexToBlob(b.plan_id), b.due_month, b.updated_at, b.budget_id],
  }),
  relations: [],
}

async function importRecurringBudgets(budgets: SyncRecurringBudget[]): Promise<number> {
  const { count } = await batchUpsert(RECURRING_BUDGET_UPSERT_CONFIG, budgets, execBatch, querySQL)
  return count
}

// ======= Goals =======

// The goal's own wallet/accounts sync generically via importWallets/importAccounts
// (they're ordinary workspace rows); this only syncs the goal-specific overlay.
// `note` rides the goal row's own updated_at (a trg_goal_note_* trigger bumps
// it on every note edit — see workspaceMigrations.ts), so it's replaced
// wholesale in the same gated block as the rest of the goal row, mirroring how
// syncAccountData replaces account_data gated by the account's own updated_at.
const GOAL_UPSERT_CONFIG: UpsertConfig<SyncGoal> = {
  table: 'workspace.goal',
  idColumn: 'id',
  idIsBlob: true,
  getId: (g) => g.id,
  insert: (g) => ({
    sql: `INSERT INTO workspace.goal (id, name, target_int, target_frac, due_date, wallet_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    bind: [hexToBlob(g.id), g.name, g.target_int, g.target_frac, g.due_date, g.wallet, g.updated_at],
  }),
  update: (g) => ({
    sql: `UPDATE workspace.goal SET name = ?, target_int = ?, target_frac = ?, due_date = ?, wallet_id = ?, updated_at = ? WHERE hex(id) = ?`,
    bind: [g.name, g.target_int, g.target_frac, g.due_date, g.wallet, g.updated_at, g.id],
  }),
  relations: [
    {
      mode: 'many-to-many',
      table: 'workspace.goal_to_tags',
      ownColumn: 'goal_id',
      ownColumnIsBlob: true,
      otherColumn: 'tag_id',
      ownId: (g) => g.id,
      values: (g) => g.tags,
      gated: true, // no ConflictConfig for goals
    },
    {
      mode: 'optional-child-row',
      table: 'workspace.goal_note',
      ownColumn: 'goal_id',
      ownColumnIsBlob: true,
      ownId: (g) => g.id,
      extraColumns: ['note'],
      row: (g) => g.note ? [g.note] : null,
      gated: true,
    },
  ],
}

async function importGoals(goals: SyncGoal[]): Promise<number> {
  const { count } = await batchUpsert(GOAL_UPSERT_CONFIG, goals, execBatch, querySQL)
  return count
}

// ======= Deletions =======

function deletionPlaceholders(ids: unknown[]): string {
  return ids.map(() => '?').join(',')
}

interface DeletionTypeConfig {
  table: string
  idIsBlob: boolean
  // Cascade delete statements for a batch of ids of this entity type, in the same order the
  // pre-refactor per-deletion switch cases issued them (children/junctions before the row
  // itself). One statement per table, covering every id in `ids` via `IN (...)`.
  cascade: (ids: unknown[]) => { sql: string; bind?: unknown[] }[]
}

const DELETION_CONFIGS: Record<string, DeletionTypeConfig> = {
  tag: {
    table: 'shared.tag',
    idIsBlob: false,
    cascade: (ids) => [
      { sql: `DELETE FROM shared.tag_to_tag WHERE child_id IN (${deletionPlaceholders(ids)}) OR parent_id IN (${deletionPlaceholders(ids)})`, bind: [...ids, ...ids] },
      { sql: `DELETE FROM shared.tag_icon WHERE tag_id IN (${deletionPlaceholders(ids)})`, bind: ids },
      { sql: `DELETE FROM shared.tag WHERE id IN (${deletionPlaceholders(ids)})`, bind: ids },
    ],
  },
  wallet: {
    table: 'workspace.wallet',
    idIsBlob: false,
    cascade: (ids) => [{ sql: `DELETE FROM workspace.wallet WHERE id IN (${deletionPlaceholders(ids)})`, bind: ids }],
  },
  counterparty: {
    table: 'shared.counterparty',
    idIsBlob: false,
    cascade: (ids) => [{ sql: `DELETE FROM shared.counterparty WHERE id IN (${deletionPlaceholders(ids)})`, bind: ids }],
  },
  currency: {
    table: 'shared.currency',
    idIsBlob: false,
    cascade: (ids) => [{ sql: `DELETE FROM shared.currency WHERE id IN (${deletionPlaceholders(ids)})`, bind: ids }],
  },
  icon: {
    table: 'shared.icon',
    idIsBlob: false,
    cascade: (ids) => [
      { sql: `DELETE FROM shared.tag_icon WHERE icon_id IN (${deletionPlaceholders(ids)})`, bind: ids },
      { sql: `DELETE FROM shared.icon WHERE id IN (${deletionPlaceholders(ids)})`, bind: ids },
    ],
  },
  account: {
    table: 'workspace.account',
    idIsBlob: false,
    cascade: (ids) => [{ sql: `DELETE FROM workspace.account WHERE id IN (${deletionPlaceholders(ids)})`, bind: ids }],
  },
  trx: {
    table: 'workspace.trx',
    idIsBlob: true,
    cascade: (ids) => [
      { sql: `DELETE FROM workspace.trx_base_tag_context WHERE trx_base_id IN (SELECT id FROM workspace.trx_base WHERE hex(trx_id) IN (${deletionPlaceholders(ids)}))`, bind: ids },
      { sql: `DELETE FROM workspace.trx_base WHERE hex(trx_id) IN (${deletionPlaceholders(ids)})`, bind: ids },
      { sql: `DELETE FROM workspace.trx_to_counterparty WHERE hex(trx_id) IN (${deletionPlaceholders(ids)})`, bind: ids },
      { sql: `DELETE FROM workspace.trx_note WHERE hex(trx_id) IN (${deletionPlaceholders(ids)})`, bind: ids },
      { sql: `DELETE FROM workspace.trx WHERE hex(id) IN (${deletionPlaceholders(ids)})`, bind: ids },
    ],
  },
  budget: {
    table: 'workspace.budget',
    idIsBlob: true,
    cascade: (ids) => [{ sql: `DELETE FROM workspace.budget WHERE hex(id) IN (${deletionPlaceholders(ids)})`, bind: ids }],
  },
  notification: {
    table: 'shared.notification',
    idIsBlob: true,
    cascade: (ids) => [{ sql: `DELETE FROM shared.notification WHERE hex(id) IN (${deletionPlaceholders(ids)})`, bind: ids }],
  },
  recurring_plan: {
    table: 'workspace.recurring_plan',
    idIsBlob: true,
    cascade: (ids) => [{ sql: `DELETE FROM workspace.recurring_plan WHERE hex(id) IN (${deletionPlaceholders(ids)})`, bind: ids }],
  },
  recurring_occurrence: {
    table: 'workspace.recurring_occurrence',
    idIsBlob: true,
    cascade: (ids) => [{ sql: `DELETE FROM workspace.recurring_occurrence WHERE hex(id) IN (${deletionPlaceholders(ids)})`, bind: ids }],
  },
  goal: {
    table: 'workspace.goal',
    idIsBlob: true,
    cascade: (ids) => [{ sql: `DELETE FROM workspace.goal WHERE hex(id) IN (${deletionPlaceholders(ids)})`, bind: ids }],
  },
}

function deletionId(config: DeletionTypeConfig, del: SyncDeletion): unknown {
  return config.idIsBlob ? del.entity_id : parseInt(del.entity_id)
}

// Groups incoming deletions by entity type, then per type: one batched existence/updated_at
// read, classify which deletions apply (deleted_at > local.updated_at), one runBatch call
// covering that type's cascade. Round trips scale with the number of distinct entity types
// present, not the number of deletions. See design.md Decision 3.
async function importDeletions(deletions: SyncDeletion[]): Promise<number> {
  if (deletions.length === 0) return 0

  const byEntity = new Map<string, SyncDeletion[]>()
  for (const del of deletions) {
    const config = DELETION_CONFIGS[del.entity]
    if (!config) continue
    const group = byEntity.get(del.entity)
    if (group) group.push(del)
    else byEntity.set(del.entity, [del])
  }

  let count = 0
  for (const [entity, group] of byEntity) {
    const config = DELETION_CONFIGS[entity]
    const rawIds = group.map(del => deletionId(config, del))
    const idExpr = config.idIsBlob ? 'hex(id)' : 'id'
    const localRows = await querySQL<{ id: unknown; updated_at: number }>(
      `SELECT ${idExpr} as id, updated_at FROM ${config.table} WHERE ${idExpr} IN (${deletionPlaceholders(rawIds)})`,
      rawIds
    )
    const localUpdatedAtById = new Map(localRows.map(r => [r.id, r.updated_at]))

    const toDelete: unknown[] = []
    for (const del of group) {
      const id = deletionId(config, del)
      const localUpdatedAt = localUpdatedAtById.get(id)
      if (localUpdatedAt !== undefined && del.deleted_at > localUpdatedAt) {
        toDelete.push(id)
        count++
      }
    }

    if (toDelete.length > 0) {
      await execBatch(config.cascade(toDelete))
    }
  }

  return count
}
