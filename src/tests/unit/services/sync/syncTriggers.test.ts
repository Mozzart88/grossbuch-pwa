import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExecSQL = vi.fn().mockResolvedValue(undefined)

vi.mock('../../../../services/database/connection', () => ({
  execSQL: (...args: unknown[]) => mockExecSQL(...args),
}))

const { dropUpdatedAtTriggers, restoreUpdatedAtTriggers } = await import('../../../../services/sync/syncTriggers')

const EXPECTED_TRIGGER_NAMES = [
  'trg_icon_update',
  'trg_tag_update',
  'trg_tag_to_tag_insert',
  'trg_tag_to_tag_update',
  'trg_tag_to_tag_delete',
  'trg_tag_icon_insert',
  'trg_tag_icon_update',
  'trg_tag_icon_delete',
  'trg_wallet_update',
  'trg_wallet_to_tags_insert',
  'trg_wallet_to_tags_update',
  'trg_wallet_to_tags_delete',
  'trg_account_update',
  'trg_account_to_tags_insert',
  'trg_account_to_tags_update',
  'trg_account_to_tags_delete',
  'trg_counterparty_update',
  'trg_counterparty_to_tags_insert',
  'trg_counterparty_to_tags_update',
  'trg_counterparty_to_tags_delete',
  'trg_counterparty_note_insert',
  'trg_counterparty_note_update',
  'trg_counterparty_note_delete',
  'trg_currency_to_tags_insert',
  'trg_currency_to_tags_update',
  'trg_currency_to_tags_delete',
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
  'trg_budget_update',
]

describe('syncTriggers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('dropUpdatedAtTriggers', () => {
    it('drops all 37 updated_at triggers', async () => {
      await dropUpdatedAtTriggers()

      expect(mockExecSQL).toHaveBeenCalledTimes(37)
      for (const name of EXPECTED_TRIGGER_NAMES) {
        expect(mockExecSQL).toHaveBeenCalledWith(`DROP TRIGGER IF EXISTS ${name}`)
      }
    })

    it('drops triggers in the expected order', async () => {
      await dropUpdatedAtTriggers()

      const calls = mockExecSQL.mock.calls.map((c: unknown[]) => c[0] as string)
      for (let i = 0; i < EXPECTED_TRIGGER_NAMES.length; i++) {
        expect(calls[i]).toBe(`DROP TRIGGER IF EXISTS ${EXPECTED_TRIGGER_NAMES[i]}`)
      }
    })
  })

  describe('restoreUpdatedAtTriggers', () => {
    it('restores all 37 updated_at triggers', async () => {
      await restoreUpdatedAtTriggers()

      expect(mockExecSQL).toHaveBeenCalledTimes(37)
    })

    it('uses CREATE TRIGGER IF NOT EXISTS for each trigger', async () => {
      await restoreUpdatedAtTriggers()

      const calls = mockExecSQL.mock.calls.map((c: unknown[]) => c[0] as string)
      for (const name of EXPECTED_TRIGGER_NAMES) {
        const found = calls.some((sql: string) =>
          sql.includes(`CREATE TRIGGER IF NOT EXISTS ${name}`)
        )
        expect(found, `Expected CREATE TRIGGER for ${name}`).toBe(true)
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

    it('account_update trigger fires on balance column update', async () => {
      await restoreUpdatedAtTriggers()

      const calls = mockExecSQL.mock.calls.map((c: unknown[]) => c[0] as string)
      const accUpdate = calls.find((sql: string) => sql.includes('trg_account_update'))
      expect(accUpdate).toContain('AFTER UPDATE OF balance ON account')
    })
  })
})
