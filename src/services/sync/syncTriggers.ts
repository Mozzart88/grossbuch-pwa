import { execSQL } from '../database/connection'

/**
 * All updated_at maintenance triggers that must be dropped during sync import
 * to prevent the receiving device's clock from overwriting the sender's timestamps.
 *
 * These are the exact same triggers permanently defined in sharedMigrations.ts/
 * workspaceMigrations.ts — this is a temporary drop-then-restore, not a schema
 * change, so the SQL bodies must match verbatim. `CREATE TRIGGER`/`DROP TRIGGER`
 * are DDL, not DML: unlike a plain SELECT/INSERT/UPDATE/DELETE (which searches
 * main then each attached database for an unqualified table name), they default
 * to `main` and do not search attached databases — so every trigger name here
 * MUST be schema-qualified, matching whichever schema (`shared` or `workspace`)
 * the trigger's table now lives in (confirmed against the real engine: an
 * unqualified `CREATE TRIGGER ... ON tag` fails with "no such table: main.tag").
 */
interface UpdatedAtTrigger {
  schema: 'shared' | 'workspace'
  name: string
  sql: string
}

const UPDATED_AT_TRIGGERS: UpdatedAtTrigger[] = [
  // Icon (shared)
  {
    schema: 'shared', name: 'trg_icon_update', sql: `
AFTER UPDATE ON icon
FOR EACH ROW
BEGIN
  UPDATE icon SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE icon.id = NEW.id;
END`,
  },
  // Tag (shared)
  {
    schema: 'shared', name: 'trg_tag_update', sql: `
AFTER UPDATE ON tag
FOR EACH ROW
WHEN NEW.id > 1
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id = NEW.id;
END`,
  },
  {
    schema: 'shared', name: 'trg_tag_to_tag_insert', sql: `
AFTER INSERT ON tag_to_tag
FOR EACH ROW
WHEN NEW.parent_id > 1
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id IN (NEW.parent_id, NEW.child_id);
END`,
  },
  {
    schema: 'shared', name: 'trg_tag_to_tag_update', sql: `
AFTER UPDATE ON tag_to_tag
FOR EACH ROW
WHEN NEW.parent_id > 1
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id IN (NEW.parent_id, NEW.child_id);
END`,
  },
  {
    schema: 'shared', name: 'trg_tag_to_tag_delete', sql: `
AFTER DELETE ON tag_to_tag
FOR EACH ROW
WHEN OLD.parent_id > 1
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id IN (OLD.parent_id, OLD.child_id);
END`,
  },
  {
    schema: 'shared', name: 'trg_tag_icon_insert', sql: `
AFTER INSERT ON tag_icon
FOR EACH ROW
WHEN NEW.tag_id > 1 AND EXISTS (SELECT 1 FROM tag_to_tag WHERE child_id = NEW.tag_id AND parent_id > 1)
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id = NEW.tag_id;
END`,
  },
  {
    schema: 'shared', name: 'trg_tag_icon_update', sql: `
AFTER UPDATE ON tag_icon
FOR EACH ROW
WHEN NEW.tag_id > 1 AND EXISTS (SELECT 1 FROM tag_to_tag WHERE child_id = NEW.tag_id AND parent_id > 1)
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id = NEW.tag_id;
END`,
  },
  {
    schema: 'shared', name: 'trg_tag_icon_delete', sql: `
AFTER DELETE ON tag_icon
FOR EACH ROW
WHEN OLD.tag_id > 1 AND EXISTS (SELECT 1 FROM tag_to_tag WHERE child_id = OLD.tag_id AND parent_id > 1)
BEGIN
  UPDATE tag SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE tag.id = OLD.tag_id;
END`,
  },
  // Wallet (workspace)
  {
    schema: 'workspace', name: 'trg_wallet_update', sql: `
AFTER UPDATE ON wallet
FOR EACH ROW
BEGIN
  UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE wallet.id = NEW.id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_wallet_to_tags_insert', sql: `
AFTER INSERT ON wallet_to_tags
FOR EACH ROW
BEGIN
  UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE wallet.id = NEW.wallet_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_wallet_to_tags_update', sql: `
AFTER UPDATE ON wallet_to_tags
FOR EACH ROW
BEGIN
  UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE wallet.id = NEW.wallet_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_wallet_to_tags_delete', sql: `
AFTER DELETE ON wallet_to_tags
FOR EACH ROW
BEGIN
  UPDATE wallet SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE wallet.id = OLD.wallet_id;
END`,
  },
  // Account (workspace)
  {
    schema: 'workspace', name: 'trg_account_update', sql: `
AFTER UPDATE OF balance_int, balance_frac ON account
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_account_to_tags_insert', sql: `
AFTER INSERT ON account_to_tags
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.account_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_account_to_tags_update', sql: `
AFTER UPDATE ON account_to_tags
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.account_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_account_to_tags_delete', sql: `
AFTER DELETE ON account_to_tags
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = OLD.account_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_account_data_insert', sql: `
AFTER INSERT ON account_data
FOR EACH ROW
BEGIN
  UPDATE account_data SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account_id = NEW.account_id;
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.account_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_account_data_update', sql: `
AFTER UPDATE OF note, due_date, rate ON account_data
FOR EACH ROW
BEGIN
  UPDATE account_data SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account_id = NEW.account_id;
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = NEW.account_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_account_data_delete', sql: `
AFTER DELETE ON account_data
FOR EACH ROW
BEGIN
  UPDATE account SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE account.id = OLD.account_id;
END`,
  },
  // Counterparty (shared)
  {
    schema: 'shared', name: 'trg_counterparty_update', sql: `
AFTER UPDATE ON counterparty
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.id;
END`,
  },
  {
    schema: 'shared', name: 'trg_counterparty_to_tags_insert', sql: `
AFTER INSERT ON counterparty_to_tags
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.counterparty_id;
END`,
  },
  {
    schema: 'shared', name: 'trg_counterparty_to_tags_update', sql: `
AFTER UPDATE ON counterparty_to_tags
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.counterparty_id;
END`,
  },
  {
    schema: 'shared', name: 'trg_counterparty_to_tags_delete', sql: `
AFTER DELETE ON counterparty_to_tags
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = OLD.counterparty_id;
END`,
  },
  {
    schema: 'shared', name: 'trg_counterparty_note_insert', sql: `
AFTER INSERT ON counterparty_note
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.counterparty_id;
END`,
  },
  {
    schema: 'shared', name: 'trg_counterparty_note_update', sql: `
AFTER UPDATE ON counterparty_note
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = NEW.counterparty_id;
END`,
  },
  {
    schema: 'shared', name: 'trg_counterparty_note_delete', sql: `
AFTER DELETE ON counterparty_note
FOR EACH ROW
BEGIN
  UPDATE counterparty SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE counterparty.id = OLD.counterparty_id;
END`,
  },
  // Currency (shared)
  {
    schema: 'shared', name: 'trg_currency_to_tags_insert', sql: `
AFTER INSERT ON currency_to_tags
FOR EACH ROW
WHEN NEW.tag_id = 2
BEGIN
  UPDATE currency SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE currency.id = NEW.currency_id;
END`,
  },
  {
    schema: 'shared', name: 'trg_currency_to_tags_update', sql: `
AFTER UPDATE ON currency_to_tags
FOR EACH ROW
WHEN NEW.tag_id = 2 OR OLD.tag_id = 2
BEGIN
  UPDATE currency SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE currency.id = NEW.currency_id;
END`,
  },
  {
    schema: 'shared', name: 'trg_currency_to_tags_delete', sql: `
AFTER DELETE ON currency_to_tags
FOR EACH ROW
WHEN OLD.tag_id = 2
BEGIN
  UPDATE currency SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE currency.id = OLD.currency_id;
END`,
  },
  // Trx (workspace)
  {
    schema: 'workspace', name: 'trg_trx_update', sql: `
AFTER UPDATE ON trx
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_trx_to_counterparty_insert', sql: `
AFTER INSERT ON trx_to_counterparty
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_trx_to_counterparty_update', sql: `
AFTER UPDATE ON trx_to_counterparty
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_trx_to_counterparty_delete', sql: `
AFTER DELETE ON trx_to_counterparty
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = OLD.trx_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_trx_note_insert', sql: `
AFTER INSERT ON trx_note
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_trx_note_update', sql: `
AFTER UPDATE ON trx_note
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_trx_note_delete', sql: `
AFTER DELETE ON trx_note
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = OLD.trx_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_trx_base_insert', sql: `
AFTER INSERT ON trx_base
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_trx_base_update', sql: `
AFTER UPDATE ON trx_base
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = NEW.trx_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_trx_base_delete', sql: `
AFTER DELETE ON trx_base
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE trx.id = OLD.trx_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_trx_base_tag_context_insert', sql: `
AFTER INSERT ON trx_base_tag_context
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = (SELECT trx_id FROM trx_base WHERE id = NEW.trx_base_id);
END`,
  },
  {
    schema: 'workspace', name: 'trg_trx_base_tag_context_delete', sql: `
AFTER DELETE ON trx_base_tag_context
FOR EACH ROW
BEGIN
  UPDATE trx SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = (SELECT trx_id FROM trx_base WHERE id = OLD.trx_base_id);
END`,
  },
  // Budget (workspace)
  {
    schema: 'workspace', name: 'trg_budget_update', sql: `
AFTER UPDATE ON budget
FOR EACH ROW
BEGIN
  UPDATE budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE budget.id = NEW.id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_budget_tag_context_insert', sql: `
AFTER INSERT ON budget_tag_context
FOR EACH ROW
BEGIN
  UPDATE budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = NEW.budget_id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_budget_tag_context_delete', sql: `
AFTER DELETE ON budget_tag_context
FOR EACH ROW
BEGIN
  UPDATE budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = OLD.budget_id;
END`,
  },
  // Notification (shared) — matches sharedMigrations.ts v1's trg_shared_notification_update
  {
    schema: 'shared', name: 'trg_shared_notification_update', sql: `
AFTER UPDATE OF type, status, timestamp, readed_at, payload ON notification
FOR EACH ROW
BEGIN
  UPDATE notification SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = NEW.id;
END`,
  },
  // Recurring (workspace)
  {
    schema: 'workspace', name: 'trg_recurring_plan_update', sql: `
AFTER UPDATE OF schedule, transaction_draft, mode, start_date, next_due_date, until_policy, occurrence_count, status
ON recurring_plan
FOR EACH ROW
BEGIN
  UPDATE recurring_plan SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = NEW.id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_recurring_occurrence_update', sql: `
AFTER UPDATE OF plan_id, due_date, notification_id ON recurring_occurrence
FOR EACH ROW
BEGIN
  UPDATE recurring_occurrence SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE id = NEW.id;
END`,
  },
  {
    schema: 'workspace', name: 'trg_recurring_budget_update', sql: `
AFTER UPDATE OF budget_id, plan_id, due_month ON recurring_budget
FOR EACH ROW
BEGIN
  UPDATE recurring_budget SET updated_at = unixepoch(CURRENT_TIMESTAMP)
  WHERE budget_id = NEW.budget_id;
END`,
  },
]

/**
 * Drop all updated_at triggers.
 * Must be called BEFORE BEGIN TRANSACTION in sync import.
 */
export async function dropUpdatedAtTriggers(): Promise<void> {
  for (const trigger of UPDATED_AT_TRIGGERS) {
    await execSQL(`DROP TRIGGER IF EXISTS ${trigger.schema}.${trigger.name}`)
  }
}

/**
 * Restore all updated_at triggers with exact original SQL.
 * Must be called in finally block after sync import completes.
 */
export async function restoreUpdatedAtTriggers(): Promise<void> {
  for (const trigger of UPDATED_AT_TRIGGERS) {
    await execSQL(`CREATE TRIGGER IF NOT EXISTS ${trigger.schema}.${trigger.name}${trigger.sql}`)
  }
}
