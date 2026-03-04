import { querySQL, execSQL } from '../database'
import { BaseModel } from './BaseModel'
import { LazyRelation } from './LazyRelation'
import { TagModel } from './TagModel'

export class CounterpartyModel extends BaseModel {
  static tableName = 'counterparty'
  static idColumn = 'id'

  static selectSQL = `
    SELECT c.id, c.name,
           cso.count AS sort_order,
           cn.note
    FROM counterparty c
    LEFT JOIN counterparty_sort_order cso ON cso.counterparty_id = c.id
    LEFT JOIN counterparty_note cn ON cn.counterparty_id = c.id`

  static filterPrefix = 'c.'

  id!: number
  name = ''
  note: string | null = null

  private _sort_order: number | null = null

  get sort_order(): number | null {
    return this._sort_order
  }

  tags = new LazyRelation<TagModel>(() =>
    querySQL<Record<string, unknown>>(
      `SELECT t.id, t.name FROM tag t
       JOIN counterparty_to_tags ct ON ct.tag_id = t.id
       WHERE ct.counterparty_id = ?`,
      [this.id]
    ).then(rows => rows.map(row => new TagModel()._hydrate(row)))
  )

  override _hydrate(row: Record<string, unknown>): this {
    const { sort_order, ...rest } = row
    this._sort_order = (sort_order as number | null) ?? null
    return super._hydrate(rest)
  }

  protected override getDirtyFields(): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { note: _, ...rest } = super.getDirtyFields()
    return rest
  }

  protected override async _saveRelations(): Promise<void> {
    if (this.isFieldDirty('note')) {
      await execSQL('DELETE FROM counterparty_note WHERE counterparty_id = ?', [this.id])
      if (this.note !== null) {
        await execSQL(
          'INSERT INTO counterparty_note (counterparty_id, note) VALUES (?, ?)',
          [this.id, this.note]
        )
      }
    }

    for (const { op, item } of this.tags.drainPending()) {
      if (op === 'add') {
        await execSQL(
          'INSERT OR IGNORE INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)',
          [this.id, item.id]
        )
      } else {
        await execSQL(
          'DELETE FROM counterparty_to_tags WHERE counterparty_id = ? AND tag_id = ?',
          [this.id, item.id]
        )
      }
    }
  }

  protected override async _deleteRelations(): Promise<void> {
    await execSQL('DELETE FROM counterparty_note WHERE counterparty_id = ?', [this.id])
    await execSQL('DELETE FROM counterparty_to_tags WHERE counterparty_id = ?', [this.id])
  }
}
