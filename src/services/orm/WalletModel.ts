import { execSQL } from '../database'
import { BaseModel } from './BaseModel'
import { LazyRelation } from './LazyRelation'
import { Repository } from './Repository'
import { AccountModel } from './AccountModel'
import { SYSTEM_TAGS } from '../../types'

export class WalletModel extends BaseModel {
  static tableName = 'wallet'
  static idColumn = 'id'

  static selectSQL = `
    SELECT w.*,
      CAST(MAX(CASE WHEN wt.tag_id = ${SYSTEM_TAGS.DEFAULT}  THEN 1 ELSE 0 END) AS INTEGER) as is_default,
      CAST(MAX(CASE WHEN wt.tag_id = ${SYSTEM_TAGS.ARCHIVED} THEN 1 ELSE 0 END) AS INTEGER) as is_archived,
      CAST(MAX(CASE WHEN wt.tag_id = ${SYSTEM_TAGS.SYSTEM}   THEN 1 ELSE 0 END) AS INTEGER) as is_virtual
    FROM wallet w
    LEFT JOIN wallet_to_tags wt ON wt.wallet_id = w.id
    GROUP BY w.id`

  static filterPrefix = 'w.'

  id!: number
  name = ''
  color: string | null = null
  is_default = false
  is_archived = false

  private _is_virtual = false

  get is_virtual(): boolean {
    return this._is_virtual
  }

  accounts = new LazyRelation<AccountModel>(() =>
    Repository.find(AccountModel, { wallet_id: this.id })
  )

  override _hydrate(row: Record<string, unknown>): this {
    const { is_virtual, ...rest } = row
    this._is_virtual = Boolean(is_virtual)
    if ('is_default' in rest) rest.is_default = Boolean(rest.is_default)
    if ('is_archived' in rest) rest.is_archived = Boolean(rest.is_archived)
    return super._hydrate(rest)
  }

  protected override getDirtyFields(): Record<string, unknown> {
    const fields = super.getDirtyFields()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { is_default: _d, is_archived: _a, ...rest } = fields
    return rest
  }

  protected override async _saveRelations(): Promise<void> {
    if (this.isFieldDirty('is_default')) {
      await execSQL(
        'DELETE FROM wallet_to_tags WHERE wallet_id = ? AND tag_id = ?',
        [this.id, SYSTEM_TAGS.DEFAULT]
      )
      if (this.is_default) {
        await execSQL(
          'INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)',
          [this.id, SYSTEM_TAGS.DEFAULT]
        )
      }
    }
    if (this.isFieldDirty('is_archived')) {
      await execSQL(
        'DELETE FROM wallet_to_tags WHERE wallet_id = ? AND tag_id = ?',
        [this.id, SYSTEM_TAGS.ARCHIVED]
      )
      if (this.is_archived) {
        await execSQL(
          'INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)',
          [this.id, SYSTEM_TAGS.ARCHIVED]
        )
      }
    }
  }

  protected override async _deleteRelations(): Promise<void> {
    await execSQL('DELETE FROM wallet_to_tags WHERE wallet_id = ?', [this.id])
  }
}
