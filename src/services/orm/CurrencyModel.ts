import { execSQL } from '../database'
import { BaseModel } from './BaseModel'

export class CurrencyModel extends BaseModel {
  static tableName = 'currency'
  static idColumn = 'id'

  static selectSQL = `
    SELECT
      c.*,
      CAST(MAX(CASE WHEN ct.tag_id = 1 THEN 1 ELSE 0 END) AS INTEGER) as is_system,
      CAST(MAX(CASE WHEN ct.tag_id = 2 THEN 1 ELSE 0 END) AS INTEGER) as is_payment_default,
      CAST(MAX(CASE WHEN ct.tag_id = 4 THEN 1 ELSE 0 END) AS INTEGER) as is_fiat,
      CAST(MAX(CASE WHEN ct.tag_id = 5 THEN 1 ELSE 0 END) AS INTEGER) as is_crypto
    FROM currency c
    LEFT JOIN currency_to_tags ct ON ct.currency_id = c.id
    GROUP BY c.id`

  static filterPrefix = 'c.'

  id!: number
  code = ''
  name = ''
  symbol = ''
  decimal_places = 2
  is_system = false
  is_payment_default = false

  private _is_fiat = false
  private _is_crypto = false

  get is_fiat(): boolean {
    return this._is_fiat
  }

  get is_crypto(): boolean {
    return this._is_crypto
  }

  override _hydrate(row: Record<string, unknown>): this {
    const { is_fiat, is_crypto, ...rest } = row
    this._is_fiat = Boolean(is_fiat)
    this._is_crypto = Boolean(is_crypto)
    // Cast 0/1 integers to booleans before super sets them (tracking off during super._hydrate)
    if ('is_system' in rest) rest.is_system = Boolean(rest.is_system)
    if ('is_payment_default' in rest) rest.is_payment_default = Boolean(rest.is_payment_default)
    return super._hydrate(rest)
  }

  protected override getDirtyFields(): Record<string, unknown> {
    const fields = super.getDirtyFields()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { is_system: _s, is_payment_default: _p, ...rest } = fields
    return rest
  }

  protected override async _saveRelations(): Promise<void> {
    if (this.isFieldDirty('is_system') || this.isFieldDirty('is_payment_default')) {
      await execSQL(
        'DELETE FROM currency_to_tags WHERE currency_id = ? AND tag_id IN (1, 2)',
        [this.id]
      )
      if (this.is_system) {
        await execSQL('INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, 1)', [this.id])
      }
      if (this.is_payment_default) {
        await execSQL('INSERT INTO currency_to_tags (currency_id, tag_id) VALUES (?, 2)', [this.id])
      }
    }
  }

  protected override async _deleteRelations(): Promise<void> {
    await execSQL('DELETE FROM currency_to_tags WHERE currency_id = ?', [this.id])
  }
}
