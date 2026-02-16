import { execSQL, queryOne } from '../database/connection'
import { hexToBlob } from '../../utils/blobUtils'
import type {
  SyncPackage,
  SyncIcon,
  SyncTag,
  SyncWallet,
  SyncAccount,
  SyncCounterparty,
  SyncTransaction,
  SyncBudget,
  SyncDeletion,
  ImportResult,
} from './syncTypes'

/**
 * Import a SyncPackage with last-write-wins conflict resolution.
 * Process in dependency order: icons -> tags -> wallets -> accounts -> counterparties -> transactions -> budgets -> deletions
 */
export async function importSyncPackage(pkg: SyncPackage): Promise<ImportResult> {
  const result: ImportResult = {
    imported: { icons: 0, tags: 0, wallets: 0, accounts: 0, counterparties: 0, currencies: 0, transactions: 0, budgets: 0, deletions: 0 },
    conflicts: 0,
    errors: [],
  }

  try {
    await execSQL('BEGIN TRANSACTION')

    result.imported.icons = await importIcons(pkg.icons)
    result.imported.tags = await importTags(pkg.tags)
    result.imported.wallets = await importWallets(pkg.wallets)
    result.imported.accounts = await importAccounts(pkg.accounts)
    result.imported.counterparties = await importCounterparties(pkg.counterparties)
    result.imported.transactions = await importTransactions(pkg.transactions)
    result.imported.budgets = await importBudgets(pkg.budgets)
    result.imported.deletions = await importDeletions(pkg.deletions)

    await execSQL('COMMIT')
  } catch (err) {
    await execSQL('ROLLBACK').catch(() => { })
    const msg = err instanceof Error ? err.message : 'Unknown import error'
    result.errors.push(msg)
  }

  return result
}

// ======= Icons =======

async function importIcons(icons: SyncIcon[]): Promise<number> {
  let count = 0
  for (const icon of icons) {
    const local = await queryOne<{ updated_at: number }>(
      `SELECT updated_at FROM icon WHERE id = ?`,
      [icon.id]
    )
    if (!local) {
      await execSQL(`INSERT INTO icon (id,value) VALUES (?,?)`, [icon.id, icon.value])
      count++
    } else if (local.updated_at < icon.updated_at) {
      await execSQL('UPDATE icon SET value = ? WHERE id = ?', [icon.value, icon.id])
    }
  }
  return count
}

// ======= Tags =======

async function importTags(tags: SyncTag[]): Promise<number> {
  let count = 0
  for (const tag of tags) {
    const local = await queryOne<{ name: string, updated_at: number }>(
      `SELECT name, updated_at FROM tag WHERE id = ?`,
      [tag.id]
    )

    if (!local) {
      await execSQL(`INSERT INTO tag (id, name) VALUES (?,?)`, [tag.id, tag.name])
    } else if (tag.updated_at > local.updated_at) {
      await execSQL('UPDATE tag SET name = ? WHERE id = ?', [tag.name, tag.id])
    }
    await syncTagRelations(tag.id, tag.parents, tag.children)
    await syncTagIcon(tag.id, tag.icon)
    count++
  }
  return count
}

async function syncTagRelations(tagId: number, parents: number[], children: number[]): Promise<void> {
  // Remove existing non-system parent relations
  await execSQL(
    `DELETE FROM tag_to_tag WHERE ( child_id = ? AND parent_id > 1 ) OR parent_id = ?`,
    [tagId, tagId]
  )
  for (const id of parents) {
    await execSQL(
      `INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)`,
      [tagId, id]
    )
  }

  for (const id of children) {
    await execSQL(
      `INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)`,
      [id, tagId]
    )
  }
}

async function syncTagIcon(tagId: number, icon: number | null): Promise<void> {
  await execSQL(`DELETE FROM tag_icon WHERE tag_id = ?`, [tagId])
  if (icon) {
    await execSQL(`INSERT INTO tag_icon (tag_id, icon_id) VALUES (?, ?)`, [tagId, icon])
  }
}

// ======= Wallets =======

async function importWallets(wallets: SyncWallet[]): Promise<number> {
  let count = 0
  for (const w of wallets) {
    const local = await queryOne<{ id: number; updated_at: number }>(
      `SELECT id, updated_at FROM wallet WHERE id = ?`,
      [w.id]
    )

    if (!local) {
      await execSQL(`INSERT INTO wallet (id, name, color) VALUES (?, ?, ?)`, [w.id, w.name, w.color])
      await syncWalletTags(w.id, w.tags)
      count++
    } else if (w.updated_at > local.updated_at) {
      await execSQL(`UPDATE wallet SET name = ?, color = ? WHERE id = ?`, [w.name, w.color, local.id])
      await syncWalletTags(local.id, w.tags)
      count++
    }
  }
  return count
}

async function syncWalletTags(walletId: number, tagIds: number[]): Promise<void> {
  await execSQL(`DELETE FROM wallet_to_tags WHERE wallet_id = ?`, [walletId])
  for (const tagId of tagIds) {
    await execSQL(
      `INSERT OR IGNORE INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)`,
      [walletId, tagId]
    )
  }
}

// ======= Accounts =======

async function importAccounts(accounts: SyncAccount[]): Promise<number> {
  let count = 0
  for (const acc of accounts) {
    const local = await queryOne<{ id: number; updated_at: number }>(
      `SELECT id, updated_at FROM account WHERE id = ?`,
      [acc.id]
    )

    if (!local) {
      await execSQL(
        `INSERT INTO account (id, wallet_id, currency_id) VALUES (?, ?, ?)`,
        [acc.id, acc.wallet, acc.currency]
      )
      await syncAccountTags(acc.id, acc.tags)
      count++
    } else if (acc.updated_at > local.updated_at) {
      await syncAccountTags(local.id, acc.tags)
      count++
    }
  }
  return count
}

async function syncAccountTags(accountId: number, tagIds: number[]): Promise<void> {
  await execSQL(`DELETE FROM account_to_tags WHERE account_id = ?`, [accountId])
  for (const tagId of tagIds) {
    await execSQL(
      `INSERT OR IGNORE INTO account_to_tags (account_id, tag_id) VALUES (?, ?)`,
      [accountId, tagId]
    )
  }
}

// ======= Counterparties =======

async function importCounterparties(counterparties: SyncCounterparty[]): Promise<number> {
  let count = 0
  for (const cp of counterparties) {
    const local = await queryOne<{ id: number; updated_at: number }>(
      `SELECT id, updated_at FROM counterparty WHERE id = ?`,
      [cp.id]
    )

    if (!local) {
      await execSQL(`INSERT INTO counterparty (id, name) VALUES (?, ?)`, [cp.id, cp.name])
      await syncCounterpartyData(cp.id, cp)
      count++
    } else if (cp.updated_at > local.updated_at) {
      await execSQL(`UPDATE counterparty SET name = ? WHERE id = ?`, [cp.name, local.id])
      await syncCounterpartyData(local.id, cp)
      count++
    }
  }
  return count
}

async function syncCounterpartyData(cpId: number, cp: SyncCounterparty): Promise<void> {
  // Sync note
  await execSQL(`DELETE FROM counterparty_note WHERE counterparty_id = ?`, [cpId])
  if (cp.note) {
    await execSQL(`INSERT INTO counterparty_note (counterparty_id, note) VALUES (?, ?)`, [cpId, cp.note])
  }

  // Sync tags
  await execSQL(`DELETE FROM counterparty_to_tags WHERE counterparty_id = ?`, [cpId])
  for (const tagId of cp.tags) {
    await execSQL(
      `INSERT OR IGNORE INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)`,
      [cpId, tagId]
    )
  }
}

// ======= Transactions =======

async function importTransactions(transactions: SyncTransaction[]): Promise<number> {
  if (transactions.length === 0) return 0

  // Temporarily drop balance triggers to avoid incremental balance updates during import
  await execSQL(`DROP TRIGGER IF EXISTS trg_add_trx_base`)
  await execSQL(`DROP TRIGGER IF EXISTS trg_del_trx_base`)
  await execSQL(`DROP TRIGGER IF EXISTS trg_update_trx_base`)

  const affectedAccountIds = new Set<number>()
  let count = 0

  try {
    for (const trx of transactions) {
      const trxBlob = hexToBlob(trx.id)
      const local = await queryOne<{ updated_at: number }>(
        `SELECT updated_at FROM trx WHERE hex(id) = ?`,
        [trx.id]
      )

      if (!local) {
        // Insert new transaction
        await execSQL(
          `INSERT INTO trx (id, timestamp) VALUES (?, ?)`,
          [trxBlob, trx.timestamp]
        )
        await insertTrxRelations(trx, affectedAccountIds)
        count++
      } else if (trx.updated_at > local.updated_at) {
        // Last-write-wins: replace transaction data
        await execSQL(`DELETE FROM trx_base WHERE trx_id = ?`, [trxBlob])
        await execSQL(`DELETE FROM trx_to_counterparty WHERE trx_id = ?`, [trxBlob])
        await execSQL(`DELETE FROM trx_note WHERE trx_id = ?`, [trxBlob])
        await execSQL(`UPDATE trx SET timestamp = ? WHERE id = ?`, [trx.timestamp, trxBlob])
        await insertTrxRelations(trx, affectedAccountIds)
        count++
      }
    }

    // Recalculate balances for all affected accounts
    if (affectedAccountIds.size > 0) {
      const ids = Array.from(affectedAccountIds)
      const placeholders = ids.map(() => '?').join(',')
      await execSQL(
        `UPDATE account SET balance = (
          SELECT COALESCE(SUM(
            CASE WHEN sign = '+' THEN amount ELSE -amount END
          ), 0) FROM trx_base WHERE account_id = account.id
        ) WHERE id IN (${placeholders})`,
        ids
      )
    }
  } finally {
    // Recreate balance triggers
    await execSQL(`
      CREATE TRIGGER IF NOT EXISTS trg_add_trx_base
      AFTER INSERT ON trx_base
      FOR EACH ROW
      BEGIN
        UPDATE account
        SET balance = (
          CASE
            WHEN NEW.sign = '-' THEN balance - NEW.amount
            ELSE balance + NEW.amount
          END
        )
        WHERE id = NEW.account_id;
      END
    `)
    await execSQL(`
      CREATE TRIGGER IF NOT EXISTS trg_del_trx_base
      AFTER DELETE ON trx_base
      FOR EACH ROW
      BEGIN
        UPDATE account
        SET balance = (
          CASE
            WHEN OLD.sign = '+' THEN balance - OLD.amount
            ELSE balance + OLD.amount
          END
        )
        WHERE id = OLD.account_id;
      END
    `)
    await execSQL(`
      CREATE TRIGGER IF NOT EXISTS trg_update_trx_base
      AFTER UPDATE OF sign, amount ON trx_base
      WHEN 0 != NEW.amount
      BEGIN
        UPDATE account
        SET balance = (
          CASE
          WHEN OLD.sign != NEW.sign
          THEN (
            CASE
            WHEN NEW.sign = '+' THEN balance + OLD.amount + NEW.amount
            ELSE balance - OLD.amount - NEW.amount
            END
          )
          ELSE (
            CASE
            WHEN NEW.sign = '+' THEN balance - OLD.amount + NEW.amount
            ELSE balance + OLD.amount - NEW.amount
            END
          )
          END
        )
        WHERE id = NEW.account_id;
      END
    `)
  }

  return count
}

async function insertTrxRelations(
  trx: SyncTransaction,
  affectedAccountIds: Set<number>
): Promise<void> {
  const trxBlob = hexToBlob(trx.id)

  // Insert lines
  for (const line of trx.lines) {
    affectedAccountIds.add(line.account)
    await execSQL(
      `INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount, rate) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [hexToBlob(line.id), trxBlob, line.account, line.tag, line.sign, line.amount, line.rate]
    )
  }

  // Insert counterparty link
  if (trx.counterparty) {
    await execSQL(
      `INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)`,
      [trxBlob, trx.counterparty]
    )
  }

  // Insert note
  if (trx.note) {
    await execSQL(
      `INSERT INTO trx_note (trx_id, note) VALUES (?, ?)`,
      [trxBlob, trx.note]
    )
  }
}

// ======= Budgets =======

async function importBudgets(budgets: SyncBudget[]): Promise<number> {
  let count = 0
  for (const b of budgets) {
    const local = await queryOne<{ updated_at: number }>(
      `SELECT updated_at FROM budget WHERE hex(id) = ?`,
      [b.id]
    )

    if (!local) {
      await execSQL(
        `INSERT INTO budget (id, start, end, tag_id, amount) VALUES (?, ?, ?, ?, ?)`,
        [hexToBlob(b.id), b.start, b.end, b.tag, b.amount]
      )
      count++
    } else if (b.updated_at > local.updated_at) {
      await execSQL(
        `UPDATE budget SET start = ?, end = ?, tag_id = ?, amount = ? WHERE hex(id) = ?`,
        [b.start, b.end, b.tag, b.amount, b.id]
      )
      count++
    }
  }
  return count
}

// ======= Deletions =======

async function importDeletions(deletions: SyncDeletion[]): Promise<number> {
  let count = 0
  for (const del of deletions) {
    const deleted = await applyDeletion(del)
    if (deleted) count++
  }
  return count
}

async function applyDeletion(del: SyncDeletion): Promise<boolean> {
  switch (del.entity) {
    case 'tag': {
      const id = parseInt(del.entity_id)
      const local = await queryOne<{ id: number; updated_at: number }>(
        `SELECT id, updated_at FROM tag WHERE id = ?`,
        [id]
      )
      if (local && del.deleted_at > local.updated_at) {
        await execSQL(`DELETE FROM tag_to_tag WHERE child_id = ? OR parent_id = ?`, [local.id, local.id])
        await execSQL(`DELETE FROM tag_icon WHERE tag_id = ?`, [local.id])
        await execSQL(`DELETE FROM tag WHERE id = ?`, [local.id])
        return true
      }
      return false
    }
    case 'wallet': {
      const id = parseInt(del.entity_id)
      const local = await queryOne<{ id: number; updated_at: number }>(
        `SELECT id, updated_at FROM wallet WHERE id = ?`,
        [id]
      )
      if (local && del.deleted_at > local.updated_at) {
        await execSQL(`DELETE FROM wallet WHERE id = ?`, [local.id])
        return true
      }
      return false
    }
    case 'counterparty': {
      const id = parseInt(del.entity_id)
      const local = await queryOne<{ id: number; updated_at: number }>(
        `SELECT id, updated_at FROM counterparty WHERE id = ?`,
        [id]
      )
      if (local && del.deleted_at > local.updated_at) {
        await execSQL(`DELETE FROM counterparty WHERE id = ?`, [local.id])
        return true
      }
      return false
    }
    case 'currency': {
      const id = parseInt(del.entity_id)
      const local = await queryOne<{ id: number; updated_at: number }>(
        `SELECT id, updated_at FROM currency WHERE id = ?`,
        [id]
      )
      if (local && del.deleted_at > local.updated_at) {
        await execSQL(`DELETE FROM currency WHERE id = ?`, [local.id])
        return true
      }
      return false
    }
    case 'icon': {
      const id = parseInt(del.entity_id)
      const local = await queryOne<{ id: number; updated_at: number }>(
        `SELECT id, updated_at FROM icon WHERE id = ?`,
        [id]
      )
      if (local && del.deleted_at > local.updated_at) {
        await execSQL(`DELETE FROM tag_icon WHERE icon_id = ?`, [local.id])
        await execSQL(`DELETE FROM icon WHERE id = ?`, [local.id])
        return true
      }
      return false
    }
    case 'account': {
      const id = parseInt(del.entity_id)
      const local = await queryOne<{ id: number; updated_at: number }>(
        `SELECT id, updated_at FROM account WHERE id = ?`,
        [id]
      )
      if (local && del.deleted_at > local.updated_at) {
        await execSQL(`DELETE FROM account WHERE id = ?`, [local.id])
        return true
      }
      return false
    }
    case 'trx': {
      const local = await queryOne<{ updated_at: number }>(
        `SELECT updated_at FROM trx WHERE hex(id) = ?`,
        [del.entity_id]
      )
      if (local && del.deleted_at > local.updated_at) {
        await execSQL(`DELETE FROM trx WHERE hex(id) = ?`, [del.entity_id])
        return true
      }
      return false
    }
    case 'budget': {
      const local = await queryOne<{ updated_at: number }>(
        `SELECT updated_at FROM budget WHERE hex(id) = ?`,
        [del.entity_id]
      )
      if (local && del.deleted_at > local.updated_at) {
        await execSQL(`DELETE FROM budget WHERE hex(id) = ?`, [del.entity_id])
        return true
      }
      return false
    }
    default:
      return false
  }
}
