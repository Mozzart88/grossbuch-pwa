import { execSQL } from '../database'

// tag_sort_order/counterparty_sort_order (used by the shared.tags/shared.counterparties
// views for "most-used first" ordering) are maintained here instead of via DB triggers
// for the same reason as tagReferences.ts: the triggers that used to maintain them fired
// on workspace-scoped tables (trx_base, trx_to_counterparty) and wrote to shared-scoped
// tables, which SQLite forbids from within a trigger body. See design.md.
//
// Unlike tag_references, a row always already exists here by the time a trx_base/
// trx_to_counterparty row references it — shared.trg_tag_sort_order_new_tag and
// shared.trg_counterparty_sort_order_new_counterparty create it eagerly when the tag/
// counterparty itself is created — so a plain UPDATE (no upsert) is correct.
export const sortOrder = {
  async incrementTag(tagId: number): Promise<void> {
    await execSQL('UPDATE shared.tag_sort_order SET count = count + 1 WHERE tag_id = ?', [tagId])
  },

  async decrementTag(tagId: number): Promise<void> {
    await execSQL('UPDATE shared.tag_sort_order SET count = count - 1 WHERE tag_id = ?', [tagId])
  },

  async moveTag(oldTagId: number, newTagId: number): Promise<void> {
    if (oldTagId === newTagId) return
    await sortOrder.decrementTag(oldTagId)
    await sortOrder.incrementTag(newTagId)
  },

  async incrementCounterparty(counterpartyId: number): Promise<void> {
    await execSQL('UPDATE shared.counterparty_sort_order SET count = count + 1 WHERE counterparty_id = ?', [counterpartyId])
  },

  async decrementCounterparty(counterpartyId: number): Promise<void> {
    await execSQL('UPDATE shared.counterparty_sort_order SET count = count - 1 WHERE counterparty_id = ?', [counterpartyId])
  },
}
