import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecSQL = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../../services/database/connection', () => ({
  execSQL: (...args: unknown[]) => mockExecSQL(...args),
}))

const { dropUpdatedAtTriggers, restoreUpdatedAtTriggers } = await import('../../../../services/sync/syncTriggers')

const EXPECTED_TRIGGERS = [
  { schema: 'shared', name: 'trg_icon_update' },
  { schema: 'shared', name: 'trg_tag_update' },
  { schema: 'shared', name: 'trg_tag_to_tag_insert' },
  { schema: 'shared', name: 'trg_tag_to_tag_update' },
  { schema: 'shared', name: 'trg_tag_to_tag_delete' },
  { schema: 'shared', name: 'trg_tag_icon_insert' },
  { schema: 'shared', name: 'trg_tag_icon_update' },
  { schema: 'shared', name: 'trg_tag_icon_delete' },
  { schema: 'workspace', name: 'trg_wallet_update' },
  { schema: 'workspace', name: 'trg_wallet_to_tags_insert' },
  { schema: 'workspace', name: 'trg_wallet_to_tags_update' },
  { schema: 'workspace', name: 'trg_wallet_to_tags_delete' },
  { schema: 'workspace', name: 'trg_account_update' },
  { schema: 'workspace', name: 'trg_account_to_tags_insert' },
  { schema: 'workspace', name: 'trg_account_to_tags_update' },
  { schema: 'workspace', name: 'trg_account_to_tags_delete' },
  { schema: 'workspace', name: 'trg_account_data_insert' },
  { schema: 'workspace', name: 'trg_account_data_update' },
  { schema: 'workspace', name: 'trg_account_data_delete' },
  { schema: 'shared', name: 'trg_counterparty_update' },
  { schema: 'shared', name: 'trg_counterparty_to_tags_insert' },
  { schema: 'shared', name: 'trg_counterparty_to_tags_update' },
  { schema: 'shared', name: 'trg_counterparty_to_tags_delete' },
  { schema: 'shared', name: 'trg_counterparty_note_insert' },
  { schema: 'shared', name: 'trg_counterparty_note_update' },
  { schema: 'shared', name: 'trg_counterparty_note_delete' },
  { schema: 'shared', name: 'trg_currency_to_tags_insert' },
  { schema: 'shared', name: 'trg_currency_to_tags_update' },
  { schema: 'shared', name: 'trg_currency_to_tags_delete' },
  { schema: 'workspace', name: 'trg_trx_update' },
  { schema: 'workspace', name: 'trg_trx_to_counterparty_insert' },
  { schema: 'workspace', name: 'trg_trx_to_counterparty_update' },
  { schema: 'workspace', name: 'trg_trx_to_counterparty_delete' },
  { schema: 'workspace', name: 'trg_trx_note_insert' },
  { schema: 'workspace', name: 'trg_trx_note_update' },
  { schema: 'workspace', name: 'trg_trx_note_delete' },
  { schema: 'workspace', name: 'trg_trx_base_insert' },
  { schema: 'workspace', name: 'trg_trx_base_update' },
  { schema: 'workspace', name: 'trg_trx_base_delete' },
  { schema: 'workspace', name: 'trg_trx_base_tag_context_insert' },
  { schema: 'workspace', name: 'trg_trx_base_tag_context_delete' },
  { schema: 'workspace', name: 'trg_budget_update' },
  { schema: 'workspace', name: 'trg_budget_tag_context_insert' },
  { schema: 'workspace', name: 'trg_budget_tag_context_delete' },
  { schema: 'shared', name: 'trg_shared_notification_update' },
  { schema: 'workspace', name: 'trg_recurring_plan_update' },
  { schema: 'workspace', name: 'trg_recurring_occurrence_update' },
  { schema: 'workspace', name: 'trg_recurring_budget_update' },
]

describe('syncTriggers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('dropUpdatedAtTriggers', () => {
    it('drops all updated_at triggers', async () => {
      await dropUpdatedAtTriggers()

      expect(mockExecSQL).toHaveBeenCalledTimes(EXPECTED_TRIGGERS.length)
      for (const trigger of EXPECTED_TRIGGERS) {
        expect(mockExecSQL).toHaveBeenCalledWith(`DROP TRIGGER IF EXISTS ${trigger.schema}.${trigger.name}`)
      }
    })

    it('drops triggers in the expected order', async () => {
      await dropUpdatedAtTriggers()

      const calls = mockExecSQL.mock.calls.map((c: unknown[]) => c[0] as string)
      for (let i = 0; i < EXPECTED_TRIGGERS.length; i++) {
        expect(calls[i]).toBe(`DROP TRIGGER IF EXISTS ${EXPECTED_TRIGGERS[i].schema}.${EXPECTED_TRIGGERS[i].name}`)
      }
    })
  })

  describe('restoreUpdatedAtTriggers', () => {
    it('restores all updated_at triggers', async () => {
      await restoreUpdatedAtTriggers()

      expect(mockExecSQL).toHaveBeenCalledTimes(EXPECTED_TRIGGERS.length)
    })

    it('uses CREATE TRIGGER IF NOT EXISTS for each trigger', async () => {
      await restoreUpdatedAtTriggers()

      const calls = mockExecSQL.mock.calls.map((c: unknown[]) => c[0] as string)
      for (const trigger of EXPECTED_TRIGGERS) {
        const found = calls.some((sql: string) =>
          sql.includes(`CREATE TRIGGER IF NOT EXISTS ${trigger.schema}.${trigger.name}`)
        )
        expect(found, `Expected CREATE TRIGGER for ${trigger.schema}.${trigger.name}`).toBe(true)
      }
    })

    it('includes correct WHEN clauses for tag triggers', async () => {
      await restoreUpdatedAtTriggers()

      const calls = mockExecSQL.mock.calls.map((c: unknown[]) => c[0] as string)
      const tagUpdate = calls.find((sql: string) => sql.includes('trg_tag_update'))
      expect(tagUpdate).toContain('WHEN NEW.id > 1')
    })

    it('includes correct WHEN clauses for currency triggers', async () => {
      await restoreUpdatedAtTriggers()

      const calls = mockExecSQL.mock.calls.map((c: unknown[]) => c[0] as string)
      const currInsert = calls.find((sql: string) => sql.includes('trg_currency_to_tags_insert'))
      expect(currInsert).toContain('WHEN NEW.tag_id = 2')
    })

    it('account_update trigger fires on balance_int and balance_frac updates', async () => {
      await restoreUpdatedAtTriggers()

      const calls = mockExecSQL.mock.calls.map((c: unknown[]) => c[0] as string)
      const accUpdate = calls.find((sql: string) => sql.includes('trg_account_update'))
      expect(accUpdate).toContain('AFTER UPDATE OF balance_int, balance_frac ON account')
    })
  })
})
