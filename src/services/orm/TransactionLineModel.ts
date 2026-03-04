import { execSQL, queryOne } from '../database'
import { BaseModel } from './BaseModel'

export class TransactionLineModel extends BaseModel {
  static tableName = 'trx_base'
  static idColumn = 'id'
  static filterPrefix = 'tb.'

  static selectSQL = `
    SELECT tb.*,
           a.wallet,
           a.currency,
           a.symbol,
           a.decimal_places,
           tag.name AS tag,
           CASE WHEN EXISTS(
             SELECT 1 FROM tags_hierarchy th2
             WHERE th2.child_id = tag.id
               AND th2.parent = 'add-on'
           ) THEN 1 ELSE 0 END AS is_common
    FROM trx_base tb
    JOIN accounts a ON tb.account_id = a.id
    JOIN tag ON tb.tag_id = tag.id`

  id!: Uint8Array
  trx_id!: Uint8Array
  account_id!: number
  tag_id!: number
  sign!: '+' | '-'
  amount_int = 0
  amount_frac = 0
  rate_int = 0
  rate_frac = 0
  pct_value: number | null = null

  private _wallet = ''
  private _currency = ''
  private _symbol = ''
  private _decimal_places = 2
  private _tag = ''
  private _is_common = 0

  get wallet(): string { return this._wallet }
  get currency(): string { return this._currency }
  get symbol(): string { return this._symbol }
  get decimal_places(): number { return this._decimal_places }
  get tag(): string { return this._tag }
  get is_common(): number { return this._is_common }

  override _hydrate(row: Record<string, unknown>): this {
    const { wallet, currency, symbol, decimal_places, tag, is_common, ...rest } = row
    this._wallet = wallet as string
    this._currency = currency as string
    this._symbol = symbol as string
    this._decimal_places = decimal_places as number
    this._tag = tag as string
    this._is_common = is_common as number
    return super._hydrate(rest)
  }

  protected override getDirtyFields(): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { wallet: _w, currency: _c, symbol: _s, decimal_places: _d, tag: _t, is_common: _ic, ...rest } = super.getDirtyFields()
    return rest
  }

  override async save(): Promise<void> {
    if (this._isNew) {
      const allDirty = this.getDirtyFields()
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _skip, ...values } = allDirty
      const cols = Object.keys(values)
      const placeholders = cols.map(() => '?').join(', ')
      await execSQL(
        `INSERT INTO trx_base (id, ${cols.join(', ')}) VALUES (randomblob(8), ${placeholders})`,
        Object.values(values)
      )
      const result = await queryOne<{ id: Uint8Array }>(
        'SELECT id FROM trx_base ORDER BY rowid DESC LIMIT 1'
      )
      if (!result) throw new Error('Failed to create transaction line')
      this._isNew = false
      ;(this as Record<string, unknown>)['id'] = result.id
      this._dirty = new Set()
    } else {
      await super.save()
    }
  }
}
