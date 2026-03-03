import { execSQL, getLastInsertId } from '../database'

export type ModelClass<T extends BaseModel> = {
  new (): T
  tableName: string
  idColumn: string
}

export type FilterMap = Record<string, string | number | boolean | null | Uint8Array>

export abstract class BaseModel {
  /** Declared by subclass: name of the DB table */
  static tableName: string
  /** Declared by subclass (default 'id') */
  static idColumn: string = 'id'

  private _original: Record<string, unknown> = {}
  private _dirty: Set<string> = new Set()
  /** true after _hydrate completes — new instances are false until first hydrate */
  private _isNew = true
  /** Proxy intercept is only active after this flag is set */
  private _tracking = false

  constructor() {
    return new Proxy(this, {
      set(target, prop, value) {
        if (
          typeof prop === 'string' &&
          !prop.startsWith('_') &&
          target._tracking
        ) {
          target._dirty.add(prop)
        }
        return Reflect.set(target, prop, value)
      },
    }) as this
  }

  /** Fluent builder for new instances: `new TagModel().set({ name: 'foo' })` */
  set(values: Partial<Omit<this, keyof BaseModel>>): this {
    Object.assign(this, values)
    return this
  }

  isDirty(): boolean {
    return this._dirty.size > 0
  }

  getDirtyFields(): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const key of this._dirty) {
      out[key] = (this as Record<string, unknown>)[key]
    }
    return out
  }

  isNew(): boolean {
    return this._isNew
  }

  /**
   * Persist to DB.
   * Default implementation handles flat tables with a single integer/auto PK.
   * Complex models (blob IDs, multi-table) should override this method.
   */
  async save(): Promise<void> {
    const Model = this.constructor as typeof BaseModel
    const { tableName, idColumn } = Model

    if (this._isNew) {
      const values = this._snapshot()
      const cols = Object.keys(values)
      const placeholders = cols.map(() => '?').join(', ')
      await execSQL(
        `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders})`,
        Object.values(values)
      )
      const newId = await getLastInsertId()
      ;(this as Record<string, unknown>)[idColumn] = newId
      this._original = { ...values, [idColumn]: newId }
      this._dirty = new Set()
      this._isNew = false
    } else {
      const dirty = this.getDirtyFields()
      if (Object.keys(dirty).length > 0) {
        const sets = Object.keys(dirty)
          .map(k => `${k} = ?`)
          .join(', ')
        const id = (this as Record<string, unknown>)[idColumn]
        await execSQL(
          `UPDATE ${tableName} SET ${sets} WHERE ${idColumn} = ?`,
          [...Object.values(dirty), id]
        )
        this._original = { ...this._original, ...dirty }
        this._dirty = new Set()
      }
    }

    await this._saveRelations()
  }

  /**
   * Override in subclasses to flush LazyRelation pending ops after the main
   * table INSERT/UPDATE. Called unconditionally by save() — even when no flat
   * fields are dirty.
   *
   * Example (TagModel):
   *   const pending = this.parents.drainPending()
   *   for (const { op, item } of pending) {
   *     if (op === 'add') {
   *       await execSQL('INSERT INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)', [this.id, item.id])
   *     } else {
   *       await execSQL('DELETE FROM tag_to_tag WHERE child_id = ? AND parent_id = ?', [this.id, item.id])
   *     }
   *   }
   */
  protected async _saveRelations(): Promise<void> {
    // no-op by default
  }

  /**
   * Delete this record from the DB. Calls _deleteRelations() first so
   * subclasses can clean up junction tables before the main row is removed.
   * Throws if called on a new (never-saved) instance.
   */
  async delete(): Promise<void> {
    if (this._isNew) throw new Error('Cannot delete an unsaved model instance')
    const Model = this.constructor as typeof BaseModel
    const { tableName, idColumn } = Model
    const id = (this as Record<string, unknown>)[idColumn]
    await this._deleteRelations()
    await execSQL(`DELETE FROM ${tableName} WHERE ${idColumn} = ?`, [id])
  }

  /**
   * Override in subclasses to clean up related rows (junction tables, child
   * records, etc.) before the main row is deleted.
   */
  protected async _deleteRelations(): Promise<void> {
    // no-op by default
  }

  /** Revert all dirty fields to values at load / last save */
  rollback(): void {
    this._tracking = false
    Object.assign(this, this._original)
    this._dirty = new Set()
    this._tracking = true
  }

  /**
   * @internal — called by Repository when populating instances from DB rows.
   * Not intended to be called directly in application code.
   */
  _hydrate(row: Record<string, unknown>): this {
    this._tracking = false
    this._original = { ...row }
    Object.assign(this, row)
    this._dirty = new Set()
    this._isNew = false
    this._tracking = true
    return this
  }

  private _snapshot(): Record<string, unknown> {
    const keys = Object.keys(this._original)
    const out: Record<string, unknown> = {}
    for (const key of keys) {
      out[key] = (this as Record<string, unknown>)[key]
    }
    return out
  }
}
