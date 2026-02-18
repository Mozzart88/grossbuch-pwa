import { execSQL } from '../database/connection'

/**
 * All 37 v13 updated_at triggers that must be dropped during sync import
 * to prevent the receiving device's clock from overwriting the sender's timestamps.
 */
const UPDATED_AT_TRIGGER_NAMES = [
  // Icon
  'trg_icon_update',
  // Tag
  'trg_tag_update',
  'trg_tag_to_tag_insert',
  'trg_tag_to_tag_update',
  'trg_tag_to_tag_delete',
  'trg_tag_icon_insert',
  'trg_tag_icon_update',
  'trg_tag_icon_delete',
  // Wallet
  'trg_wallet_update',
  'trg_wallet_to_tags_insert',
  'trg_wallet_to_tags_update',
  'trg_wallet_to_tags_delete',
  // Account
  'trg_account_update',
  'trg_account_to_tags_insert',
  'trg_account_to_tags_update',
  'trg_account_to_tags_delete',
  // Counterparty
  'trg_counterparty_update',
  'trg_counterparty_to_tags_insert',
  'trg_counterparty_to_tags_update',
  'trg_counterparty_to_tags_delete',
  'trg_counterparty_note_insert',
  'trg_counterparty_note_update',
  'trg_counterparty_note_delete',
  // Currency
  'trg_currency_to_tags_insert',
  'trg_currency_to_tags_update',
  'trg_currency_to_tags_delete',
  // Trx
  'trg_trx_update',
  'trg_trx_to_counterparty_insert',
  'trg_trx_to_counterparty_update',
  'trg_trx_to_counterparty_delete',
  'trg_trx_note_insert',
  'trg_trx_note_update',
  'trg_trx_note_delete',
  'trg_trx_base_insert',
  'trg_trx_base_update',
  'trg_trx_base_delete',
  // Budget
  'trg_budget_update',
] as const

/**
 * Drop all 37 v13 updated_at triggers.
 * Must be called BEFORE BEGIN TRANSACTION in sync import.
 */
export async function dropUpdatedAtTriggers(): Promise<void> {
  for (const name of UPDATED_AT_TRIGGER_NAMES) {
    await execSQL(`DROP TRIGGER IF EXISTS ${name}`)
  }
}

/**
 * Restore all 37 v13 updated_at triggers with exact original SQL.
 * Must be called in finally block after sync import completes.
 */
export async function restoreUpdatedAtTriggers(): Promise<void> {
  // Icon
  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_icon_update
AFTER UPDATE ON icon
FOR EACH ROW
BEGIN
  UPDATE icon SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE icon.id = NEW.id;
END`)

  // Tag
  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_tag_update
AFTER UPDATE ON tag
FOR EACH ROW
WHEN NEW.id > 1
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id = NEW.id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_tag_to_tag_insert
AFTER INSERT ON tag_to_tag
FOR EACH ROW
WHEN NEW.parent_id > 1
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id IN (NEW.parent_id, NEW.child_id);
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_tag_to_tag_update
AFTER UPDATE ON tag_to_tag
FOR EACH ROW
WHEN NEW.parent_id > 1
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id IN (NEW.parent_id, NEW.child_id);
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_tag_to_tag_delete
AFTER DELETE ON tag_to_tag
FOR EACH ROW
WHEN OLD.parent_id > 1
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id IN (OLD.parent_id, OLD.child_id);
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_tag_icon_insert
AFTER INSERT ON tag_icon
FOR EACH ROW
WHEN NEW.tag_id > 1 AND EXISTS (SELECT 1 FROM tag_to_tag WHERE child_id = NEW.tag_id AND parent_id > 1)
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id = NEW.tag_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_tag_icon_update
AFTER UPDATE ON tag_icon
FOR EACH ROW
WHEN NEW.tag_id > 1 AND EXISTS (SELECT 1 FROM tag_to_tag WHERE child_id = NEW.tag_id AND parent_id > 1)
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id = NEW.tag_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_tag_icon_delete
AFTER DELETE ON tag_icon
FOR EACH ROW
WHEN OLD.tag_id > 1 AND EXISTS (SELECT 1 FROM tag_to_tag WHERE child_id = OLD.tag_id AND parent_id > 1)
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id = OLD.tag_id;
END`)

  // Wallet
  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_wallet_update
AFTER UPDATE ON wallet
FOR EACH ROW
BEGIN
  UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE wallet.id = NEW.id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_wallet_to_tags_insert
AFTER INSERT ON wallet_to_tags
FOR EACH ROW
BEGIN
  UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE wallet.id = NEW.wallet_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_wallet_to_tags_update
AFTER UPDATE ON wallet_to_tags
FOR EACH ROW
BEGIN
  UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE wallet.id = NEW.wallet_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_wallet_to_tags_delete
AFTER DELETE ON wallet_to_tags
FOR EACH ROW
BEGIN
  UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE wallet.id = OLD.wallet_id;
END`)

  // Account
  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_account_update
AFTER UPDATE OF balance ON account
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_account_to_tags_insert
AFTER INSERT ON account_to_tags
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.account_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_account_to_tags_update
AFTER UPDATE ON account_to_tags
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.account_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_account_to_tags_delete
AFTER DELETE ON account_to_tags
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = OLD.account_id;
END`)

  // Counterparty
  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_counterparty_update
AFTER UPDATE ON counterparty
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_counterparty_to_tags_insert
AFTER INSERT ON counterparty_to_tags
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.counterparty_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_counterparty_to_tags_update
AFTER UPDATE ON counterparty_to_tags
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.counterparty_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_counterparty_to_tags_delete
AFTER DELETE ON counterparty_to_tags
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = OLD.counterparty_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_counterparty_note_insert
AFTER INSERT ON counterparty_note
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.counterparty_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_counterparty_note_update
AFTER UPDATE ON counterparty_note
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.counterparty_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_counterparty_note_delete
AFTER DELETE ON counterparty_note
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = OLD.counterparty_id;
END`)

  // Currency
  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_currency_to_tags_insert
AFTER INSERT ON currency_to_tags
FOR EACH ROW
WHEN NEW.tag_id = 2
BEGIN
  UPDATE currency SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE currency.id = NEW.currency_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_currency_to_tags_update
AFTER UPDATE ON currency_to_tags
FOR EACH ROW
WHEN NEW.tag_id = 2 OR OLD.tag_id = 2
BEGIN
  UPDATE currency SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE currency.id = NEW.currency_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_currency_to_tags_delete
AFTER DELETE ON currency_to_tags
FOR EACH ROW
WHEN OLD.tag_id = 2
BEGIN
  UPDATE currency SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE currency.id = OLD.currency_id;
END`)

  // Trx
  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_trx_update
AFTER UPDATE ON trx
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_trx_to_counterparty_insert
AFTER INSERT ON trx_to_counterparty
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_trx_to_counterparty_update
AFTER UPDATE ON trx_to_counterparty
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_trx_to_counterparty_delete
AFTER DELETE ON trx_to_counterparty
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = OLD.trx_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_trx_note_insert
AFTER INSERT ON trx_note
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_trx_note_update
AFTER UPDATE ON trx_note
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_trx_note_delete
AFTER DELETE ON trx_note
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = OLD.trx_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_trx_base_insert
AFTER INSERT ON trx_base
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_trx_base_update
AFTER UPDATE ON trx_base
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END`)

  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_trx_base_delete
AFTER DELETE ON trx_base
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = OLD.trx_id;
END`)

  // Budget
  await execSQL(`CREATE TRIGGER IF NOT EXISTS trg_budget_update
AFTER UPDATE ON budget
FOR EACH ROW
BEGIN
  UPDATE budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE budget.id = NEW.id;
END`)
}
