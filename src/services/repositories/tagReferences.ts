import { execSQL, queryOne } from '../database'

// tag_references lives in shared and can only be reached with a schema-qualified
// name — but only outside of trigger bodies, where SQLite forbids that. See
// design.md ("Tag reference counting via application-maintained shared.tag_references")
// for why this is maintained here instead of via DB triggers.
export const tagReferences = {
  async increment(tagId: number): Promise<void> {
    await execSQL(
      `INSERT INTO shared.tag_references (tag_id, count) VALUES (?, 1)
       ON CONFLICT(tag_id) DO UPDATE SET count = count + 1`,
      [tagId]
    )
  },

  async decrement(tagId: number): Promise<void> {
    await execSQL(
      `INSERT INTO shared.tag_references (tag_id, count) VALUES (?, 0)
       ON CONFLICT(tag_id) DO UPDATE SET count = count - 1`,
      [tagId]
    )
  },

  async move(oldTagId: number, newTagId: number): Promise<void> {
    if (oldTagId === newTagId) return
    await tagReferences.decrement(oldTagId)
    await tagReferences.increment(newTagId)
  },

  async getCount(tagId: number): Promise<number> {
    const row = await queryOne<{ count: number }>(
      `SELECT count FROM shared.tag_references WHERE tag_id = ?`,
      [tagId]
    )
    return row?.count ?? 0
  },
}
