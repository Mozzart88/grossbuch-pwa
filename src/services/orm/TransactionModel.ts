import { execSQL, queryOne } from '../database'
import { BaseModel } from './BaseModel'
import { LazyRelation } from './LazyRelation'
import { Repository } from './Repository'
import { TransactionLineModel } from './TransactionLineModel'

export class TransactionModel extends BaseModel {
  static tableName = 'trx'
  static idColumn = 'id'
  static filterPrefix = 't.'

  static selectSQL = `
    SELECT t.id, t.timestamp,
           t2c.counterparty_id,
           c.name AS counterparty,
           tn.note
    FROM trx t
    LEFT JOIN trx_to_counterparty t2c ON t2c.trx_id = t.id
    LEFT JOIN counterparty c ON t2c.counterparty_id = c.id
    LEFT JOIN trx_note tn ON tn.trx_id = t.id`

  id!: Uint8Array
  timestamp!: number
  counterparty_id: number | null = null
  note: string | null = null

  private _counterparty: string | null = null

  get counterparty(): string | null { return this._counterparty }

  lines = new LazyRelation<TransactionLineModel>(() =>
    Repository.find(TransactionLineModel, { trx_id: this.id })
  )

  override _hydrate(row: Record<string, unknown>): this {
    const { counterparty, ...rest } = row
    this._counterparty = (counterparty as string | null) ?? null
    return super._hydrate(rest)
  }

  protected override getDirtyFields(): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { counterparty_id: _ci, note: _n, ...rest } = super.getDirtyFields()
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
        `INSERT INTO trx (id, ${cols.join(', ')}) VALUES (randomblob(8), ${placeholders})`,
        Object.values(values)
      )
      const result = await queryOne<{ id: Uint8Array }>(
        'SELECT id FROM trx ORDER BY rowid DESC LIMIT 1'
      )
      if (!result) throw new Error('Failed to create transaction')
      this._isNew = false
      ;(this as Record<string, unknown>)['id'] = result.id
      await this._saveRelations()
      this._dirty = new Set()
    } else {
      await super.save()
    }
  }

  protected override async _saveRelations(): Promise<void> {
    if (this.isFieldDirty('counterparty_id')) {
      await execSQL('DELETE FROM trx_to_counterparty WHERE trx_id = ?', [this.id])
      if (this.counterparty_id !== null) {
        await execSQL(
          'INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)',
          [this.id, this.counterparty_id]
        )
      }
    }

    if (this.isFieldDirty('note')) {
      await execSQL('DELETE FROM trx_note WHERE trx_id = ?', [this.id])
      if (this.note !== null) {
        await execSQL(
          'INSERT INTO trx_note (trx_id, note) VALUES (?, ?)',
          [this.id, this.note]
        )
      }
    }

    for (const { op, item } of this.lines.drainPending()) {
      if (op === 'add') {
        item.trx_id = this.id
        await item.save()
      } else {
        await item.delete()
      }
    }
  }

  protected override async _deleteRelations(): Promise<void> {
    await execSQL('DELETE FROM trx_to_counterparty WHERE trx_id = ?', [this.id])
    await execSQL('DELETE FROM trx_note WHERE trx_id = ?', [this.id])
    await execSQL('DELETE FROM trx_base WHERE trx_id = ?', [this.id])
  }
}
