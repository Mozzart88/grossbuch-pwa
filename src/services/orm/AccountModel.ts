import { execSQL } from '../database'
import { BaseModel } from './BaseModel'
import { SYSTEM_TAGS } from '../../types'

export class AccountModel extends BaseModel {
  static tableName = 'account'
  static idColumn = 'id'

  static selectSQL = `
    SELECT a.*,
      c.code AS currency,
      c.symbol,
      c.decimal_places,
      CAST(MAX(CASE WHEN ato.tag_id = ${SYSTEM_TAGS.DEFAULT} THEN 1 ELSE 0 END) AS INTEGER) as is_default
    FROM account a
    JOIN currency c ON a.currency_id = c.id
    LEFT JOIN account_to_tags ato ON ato.account_id = a.id
    GROUP BY a.id`

  static filterPrefix = 'a.'

  id!: number
  wallet_id!: number
  currency_id!: number
  balance_int = 0
  balance_frac = 0
  updated_at!: number
  is_default = false

  private _currency = ''
  private _symbol = ''
  private _decimal_places = 2

  get currency(): string {
    return this._currency
  }

  get symbol(): string {
    return this._symbol
  }

  get decimal_places(): number {
    return this._decimal_places
  }

  override _hydrate(row: Record<string, unknown>): this {
    const { currency, symbol, decimal_places, ...rest } = row
    this._currency = currency as string
    this._symbol = symbol as string
    this._decimal_places = decimal_places as number
    if ('is_default' in rest) rest.is_default = Boolean(rest.is_default)
    return super._hydrate(rest)
  }

  protected override getDirtyFields(): Record<string, unknown> {
    const fields = super.getDirtyFields()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { is_default: _d, ...rest } = fields
    return rest
  }

  protected override async _saveRelations(): Promise<void> {
    if (this.isFieldDirty('is_default')) {
      await execSQL(
        'DELETE FROM account_to_tags WHERE account_id = ? AND tag_id = ?',
        [this.id, SYSTEM_TAGS.DEFAULT]
      )
      if (this.is_default) {
        await execSQL(
          'INSERT INTO account_to_tags (account_id, tag_id) VALUES (?, ?)',
          [this.id, SYSTEM_TAGS.DEFAULT]
        )
      }
    }
  }

  protected override async _deleteRelations(): Promise<void> {
    await execSQL('DELETE FROM account_to_tags WHERE account_id = ?', [this.id])
  }
}
