import { execSQL, queryOne } from '../database/connection'
import { hexToBlob } from '../../utils/blobUtils'
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
  SyncDeletion,
  ImportResult,
} from './syncTypes'

/**
 * Import a SyncPackage with last-write-wins conflict resolution.
 * Process in dependency order: icons -> tags -> wallets -> accounts -> counterparties -> currencies -> transactions -> budgets -> deletions
 *
 * IMPORTANT: Caller must wrap in dropUpdatedAtTriggers/restoreUpdatedAtTriggers
 * and setSuppressWriteNotifications to prevent echo loops.
 */
export async function importSyncPackage(pkg: SyncPackage): Promise<ImportResult> {
  const result: ImportResult = {
    imported: { icons: 0, tags: 0, wallets: 0, accounts: 0, counterparties: 0, currencies: 0, transactions: 0, budgets: 0, deletions: 0 },
    newAccountCurrencyIds: [],
    conflicts: 0,
    errors: [],
  }

  console.log(`[importSyncPackage] Starting: ${pkg.transactions.length} trx, ${pkg.wallets.length} wallets, ${pkg.accounts.length} accounts`)

  // Drop balance triggers BEFORE transaction (DDL outside transaction)
  const hasTransactions = pkg.transactions.length > 0
  if (hasTransactions) {
    await dropBalanceTriggers()
  }

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
    result.imported.deletions = await importDeletions(pkg.deletions)

    await execSQL('COMMIT')
  } catch (err) {
    await execSQL('ROLLBACK').catch(() => { })
    const msg = err instanceof Error ? err.message : 'Unknown import error'
    result.errors.push(msg)
  } finally {
    await execSQL('PRAGMA foreign_keys = ON')
    if (hasTransactions) {
      await restoreBalanceTriggers()
    }
  }

  console.log(`[importSyncPackage] Done:`, result.imported, result.errors.length > 0 ? `errors: ${result.errors}` : 'no errors')

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
      await execSQL(`INSERT INTO icon (id, value, updated_at) VALUES (?, ?, ?)`, [icon.id, icon.value, icon.updated_at])
      count++
    } else if (local.updated_at < icon.updated_at) {
      await execSQL('UPDATE icon SET value = ?, updated_at = ? WHERE id = ?', [icon.value, icon.updated_at, icon.id])
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
      await execSQL(`INSERT INTO tag (id, name, updated_at) VALUES (?, ?, ?)`, [tag.id, tag.name, tag.updated_at])
    } else if (tag.updated_at > local.updated_at) {
      await execSQL('UPDATE tag SET name = ?, updated_at = ? WHERE id = ?', [tag.name, tag.updated_at, tag.id])
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
      await execSQL(`INSERT INTO wallet (id, name, color, updated_at) VALUES (?, ?, ?, ?)`, [w.id, w.name, w.color, w.updated_at])
      await syncWalletTags(w.id, w.tags)
      count++
    } else if (w.updated_at > local.updated_at) {
      await execSQL(`UPDATE wallet SET name = ?, color = ?, updated_at = ? WHERE id = ?`, [w.name, w.color, w.updated_at, local.id])
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

async function importAccounts(accounts: SyncAccount[]): Promise<{ count: number; currencyIds: number[] }> {
  let count = 0
  const currencyIds: number[] = []
  for (const acc of accounts) {
    const local = await queryOne<{ id: number; updated_at: number }>(
      `SELECT id, updated_at FROM account WHERE id = ?`,
      [acc.id]
    )

    if (!local) {
      await execSQL(
        `INSERT INTO account (id, wallet_id, currency_id, updated_at) VALUES (?, ?, ?, ?)`,
        [acc.id, acc.wallet, acc.currency, acc.updated_at]
      )
      await syncAccountTags(acc.id, acc.tags)
      currencyIds.push(acc.currency)
      count++
    } else if (acc.updated_at > local.updated_at) {
      await syncAccountTags(local.id, acc.tags)
      await execSQL(`UPDATE account SET updated_at = ? WHERE id = ?`, [acc.updated_at, local.id])
      count++
    }
  }
  return { count, currencyIds }
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
      await execSQL(`INSERT INTO counterparty (id, name, updated_at) VALUES (?, ?, ?)`, [cp.id, cp.name, cp.updated_at])
      await syncCounterpartyData(cp.id, cp)
      count++
    } else if (cp.updated_at > local.updated_at) {
      await execSQL(`UPDATE counterparty SET name = ?, updated_at = ? WHERE id = ?`, [cp.name, cp.updated_at, local.id])
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

// ======= Currencies =======

async function importCurrencies(currencies: SyncCurrency[]): Promise<number> {
  let count = 0
  for (const cur of currencies) {
    const local = await queryOne<{ id: number; updated_at: number }>(
      `SELECT id, updated_at FROM currency WHERE id = ?`,
      [cur.id]
    )
    if (!local) continue // Currency must already exist (pre-seeded)

    // Always sync currency_to_tags (no updated_at guard)
    await execSQL(`DELETE FROM currency_to_tags WHERE currency_id = ?`, [local.id])
    for (const tagId of cur.tags) {
      await execSQL(
        `INSERT OR IGNORE INTO currency_to_tags (currency_id, tag_id) VALUES (?, ?)`,
        [local.id, tagId]
      )
    }

    // Only update currency record if sender is newer
    if (cur.updated_at > local.updated_at) {
      await execSQL(`UPDATE currency SET updated_at = ? WHERE id = ?`, [cur.updated_at, local.id])
      count++
    }

    // Import exchange rate if sender has one and we don't
    if (cur.rate_int != null && cur.rate_frac != null) {
      const localRate = await queryOne<{ rate_int: number }>(
        `SELECT rate_int FROM exchange_rate WHERE currency_id = ? ORDER BY updated_at DESC LIMIT 1`,
        [cur.id]
      )
      if (!localRate) {
        await execSQL(
          `INSERT INTO exchange_rate (currency_id, rate_int, rate_frac) VALUES (?, ?, ?)`,
          [cur.id, cur.rate_int, cur.rate_frac]
        )
      }
    }
  }
  return count
}

// ======= Transactions =======

async function importTransactions(transactions: SyncTransaction[]): Promise<number> {
  if (transactions.length === 0) return 0

  const affectedAccountIds = new Set<number>()
  let count = 0

  for (const trx of transactions) {
    const trxBlob = hexToBlob(trx.id)
    const local = await queryOne<{ updated_at: number }>(
      `SELECT updated_at FROM trx WHERE hex(id) = ?`,
      [trx.id]
    )

    if (!local) {
      // Insert new transaction
      await execSQL(
        `INSERT INTO trx (id, timestamp, updated_at) VALUES (?, ?, ?)`,
        [trxBlob, trx.timestamp, trx.updated_at]
      )
      await insertTrxRelations(trx, affectedAccountIds)
      count++
    } else if (trx.updated_at > local.updated_at) {
      // Last-write-wins: replace transaction data
      await execSQL(`DELETE FROM trx_base WHERE trx_id = ?`, [trxBlob])
      await execSQL(`DELETE FROM trx_to_counterparty WHERE trx_id = ?`, [trxBlob])
      await execSQL(`DELETE FROM trx_note WHERE trx_id = ?`, [trxBlob])
      await execSQL(`UPDATE trx SET timestamp = ?, updated_at = ? WHERE id = ?`, [trx.timestamp, trx.updated_at, trxBlob])
      await insertTrxRelations(trx, affectedAccountIds)
      count++
    }
  }

  // Recalculate balances for all affected accounts
  if (affectedAccountIds.size > 0) {
    const ids = Array.from(affectedAccountIds)
    const placeholders = ids.map(() => '?').join(',')
    // Recalculate as float then split into int/frac
    await execSQL(
      `UPDATE account SET
        balance_int = CAST((
          SELECT COALESCE(SUM(
            CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE -(amount_int + amount_frac * 1e-18) END
          ), 0) FROM trx_base WHERE account_id = account.id
        ) AS INTEGER),
        balance_frac = CAST(((
          SELECT COALESCE(SUM(
            CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE -(amount_int + amount_frac * 1e-18) END
          ), 0) FROM trx_base WHERE account_id = account.id
        ) - CAST((
          SELECT COALESCE(SUM(
            CASE WHEN sign = '+' THEN (amount_int + amount_frac * 1e-18) ELSE -(amount_int + amount_frac * 1e-18) END
          ), 0) FROM trx_base WHERE account_id = account.id
        ) AS INTEGER)) * 1000000000000000000 AS INTEGER)
      WHERE id IN (${placeholders})`,
      ids
    )
  }

  return count
}

// ======= Balance Trigger Helpers =======

async function dropBalanceTriggers(): Promise<void> {
  await execSQL(`DROP TRIGGER IF EXISTS trg_add_trx_base`)
  await execSQL(`DROP TRIGGER IF EXISTS trg_del_trx_base`)
  await execSQL(`DROP TRIGGER IF EXISTS trg_update_trx_base`)
}

async function restoreBalanceTriggers(): Promise<void> {
  await execSQL(`
    CREATE TRIGGER IF NOT EXISTS trg_add_trx_base
    AFTER INSERT ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE account SET
        balance_int = CASE
          WHEN NEW.sign = '+'
          THEN balance_int + NEW.amount_int + (balance_frac + NEW.amount_frac) / 1000000000000000000
          ELSE balance_int - NEW.amount_int - IIF(balance_frac < NEW.amount_frac, 1, 0)
        END,
        balance_frac = CASE
          WHEN NEW.sign = '+'
          THEN (balance_frac + NEW.amount_frac) % 1000000000000000000
          ELSE IIF(balance_frac < NEW.amount_frac,
               balance_frac - NEW.amount_frac + 1000000000000000000,
               balance_frac - NEW.amount_frac)
        END
      WHERE id = NEW.account_id;
    END
  `)
  await execSQL(`
    CREATE TRIGGER IF NOT EXISTS trg_del_trx_base
    AFTER DELETE ON trx_base
    FOR EACH ROW
    BEGIN
      UPDATE account SET
        balance_int = CASE
          WHEN OLD.sign = '+'
          THEN balance_int - OLD.amount_int - IIF(balance_frac < OLD.amount_frac, 1, 0)
          ELSE balance_int + OLD.amount_int + (balance_frac + OLD.amount_frac) / 1000000000000000000
        END,
        balance_frac = CASE
          WHEN OLD.sign = '+'
          THEN IIF(balance_frac < OLD.amount_frac,
               balance_frac - OLD.amount_frac + 1000000000000000000,
               balance_frac - OLD.amount_frac)
          ELSE (balance_frac + OLD.amount_frac) % 1000000000000000000
        END
      WHERE id = OLD.account_id;
    END
  `)
  await execSQL(`
    CREATE TRIGGER IF NOT EXISTS trg_update_trx_base
    AFTER UPDATE OF sign, amount_int, amount_frac ON trx_base
    WHEN NEW.amount_int != 0 OR NEW.amount_frac != 0
    BEGIN
      UPDATE account SET
        balance_int = CASE
          WHEN OLD.sign = '+'
          THEN balance_int - OLD.amount_int - IIF(balance_frac < OLD.amount_frac, 1, 0)
          ELSE balance_int + OLD.amount_int + (balance_frac + OLD.amount_frac) / 1000000000000000000
        END,
        balance_frac = CASE
          WHEN OLD.sign = '+'
          THEN IIF(balance_frac < OLD.amount_frac,
               balance_frac - OLD.amount_frac + 1000000000000000000,
               balance_frac - OLD.amount_frac)
          ELSE (balance_frac + OLD.amount_frac) % 1000000000000000000
        END
      WHERE id = OLD.account_id;
      UPDATE account SET
        balance_int = CASE
          WHEN NEW.sign = '+'
          THEN balance_int + NEW.amount_int + (balance_frac + NEW.amount_frac) / 1000000000000000000
          ELSE balance_int - NEW.amount_int - IIF(balance_frac < NEW.amount_frac, 1, 0)
        END,
        balance_frac = CASE
          WHEN NEW.sign = '+'
          THEN (balance_frac + NEW.amount_frac) % 1000000000000000000
          ELSE IIF(balance_frac < NEW.amount_frac,
               balance_frac - NEW.amount_frac + 1000000000000000000,
               balance_frac - NEW.amount_frac)
        END
      WHERE id = NEW.account_id;
    END
  `)
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
      `INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [hexToBlob(line.id), trxBlob, line.account, line.tag, line.sign, line.amount_int, line.amount_frac, line.rate_int, line.rate_frac]
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
        `INSERT INTO budget (id, start, end, tag_id, amount_int, amount_frac, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [hexToBlob(b.id), b.start, b.end, b.tag, b.amount_int, b.amount_frac, b.updated_at]
      )
      count++
    } else if (b.updated_at > local.updated_at) {
      await execSQL(
        `UPDATE budget SET start = ?, end = ?, tag_id = ?, amount_int = ?, amount_frac = ?, updated_at = ? WHERE hex(id) = ?`,
        [b.start, b.end, b.tag, b.amount_int, b.amount_frac, b.updated_at, b.id]
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
