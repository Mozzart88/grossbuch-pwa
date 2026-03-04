import type { Tag } from '../../types'
import { querySQL, queryOne, execSQL } from '../database'
import { BaseModel } from './BaseModel'
import { LazyRelation } from './LazyRelation'

export class TagModel extends BaseModel implements Tag {
  static tableName = 'tag'
  static idColumn = 'id'

  static selectSQL = `
    SELECT t.id, t.name, t.updated_at,
           tso.count AS sort_order,
           i.value   AS icon
    FROM tag t
    LEFT JOIN tag_sort_order tso ON tso.tag_id = t.id
    LEFT JOIN tag_icon ti        ON ti.tag_id  = t.id
    LEFT JOIN icon i             ON i.id        = ti.icon_id`

  static filterPrefix = 't.'

  id!: number
  name = ''
  updated_at!: number

  private _sort_order: number | null = null

  get sort_order(): number | null {
    return this._sort_order
  }

  icon?: string | undefined = undefined

  parents = new LazyRelation<TagModel>(() =>
    querySQL<Record<string, unknown>>(
      'SELECT parent_id AS id, parent AS name FROM tags_hierarchy WHERE child_id = ?',
      [this.id]
    ).then(rows => rows.map(row => new TagModel()._hydrate(row)))
  )

  children = new LazyRelation<TagModel>(() =>
    querySQL<Record<string, unknown>>(
      'SELECT child_id AS id, child AS name FROM tags_hierarchy WHERE parent_id = ?',
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
    const { icon: _, ...rest } = super.getDirtyFields()
    return rest
  }

  protected async _saveRelations(): Promise<void> {
    if (this.isFieldDirty('icon')) {
      if (this.icon !== undefined) {
        await execSQL('INSERT OR IGNORE INTO icon (value) VALUES (?)', [this.icon])
        const iconRow = await queryOne<{ id: number }>('SELECT id FROM icon WHERE value = ?', [this.icon])
        if (iconRow) {
          await execSQL('DELETE FROM tag_icon WHERE tag_id = ?', [this.id])
          await execSQL('INSERT INTO tag_icon (tag_id, icon_id) VALUES (?, ?)', [this.id, iconRow.id])
        }
      } else {
        await execSQL('DELETE FROM tag_icon WHERE tag_id = ?', [this.id])
      }
    }

    for (const { op, item } of this.parents.drainPending()) {
      if (op === 'add') {
        await execSQL(
          'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
          [this.id, item.id]
        )
      } else {
        await execSQL(
          'DELETE FROM tag_to_tag WHERE child_id = ? AND parent_id = ?',
          [this.id, item.id]
        )
      }
    }
    for (const { op, item } of this.children.drainPending()) {
      if (op === 'add') {
        await execSQL(
          'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
          [item.id, this.id]
        )
      } else {
        await execSQL(
          'DELETE FROM tag_to_tag WHERE child_id = ? AND parent_id = ?',
          [item.id, this.id]
        )
      }
    }
  }

  protected async _deleteRelations(): Promise<void> {
    await execSQL('DELETE FROM tag_icon WHERE tag_id = ?', [this.id])
    await execSQL(
      'DELETE FROM tag_to_tag WHERE child_id = ? OR parent_id = ?',
      [this.id, this.id]
    )
  }
}
