import { querySQL, queryOne } from '../database'
import { BaseModel } from './BaseModel'
import type { ModelClass, FilterMap } from './BaseModel'

export class Repository {
  /** SELECT * WHERE filters (AND-joined equality). Returns all matching rows as model instances. */
  static async find<T extends BaseModel>(
    Model: ModelClass<T>,
    filters?: FilterMap
  ): Promise<T[]> {
    const { sql, binds } = Repository._buildSelect(Model, filters)
    const rows = await querySQL<Record<string, unknown>>(sql, binds)
    return rows.map(row => new Model()._hydrate(row))
  }

  /** SELECT * WHERE filters — returns first match or null. */
  static async findOne<T extends BaseModel>(
    Model: ModelClass<T>,
    filters?: FilterMap
  ): Promise<T | null> {
    const { sql, binds } = Repository._buildSelect(Model, filters)
    const row = await queryOne<Record<string, unknown>>(sql + ' LIMIT 1', binds)
    return row ? new Model()._hydrate(row) : null
  }

  /** Persist a new entity. Delegates to entity.save(). */
  static async create<T extends BaseModel>(entity: T): Promise<T> {
    await entity.save()
    return entity
  }

  /** Apply values to an existing entity and persist. */
  static async update<T extends BaseModel>(
    entity: T,
    values: Partial<Omit<T, keyof BaseModel>>
  ): Promise<T> {
    entity.set(values)
    await entity.save()
    return entity
  }

  /** DELETE the entity by its primary key. */
  static async delete<T extends BaseModel>(entity: T): Promise<void> {
    await entity.delete()
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private static _buildSelect(
    Model: ModelClass<any>,
    filters?: FilterMap
  ): { sql: string; binds: unknown[] } {
    const base = Model.selectSQL ?? `SELECT * FROM ${Model.tableName}`
    const prefix = Model.filterPrefix ?? ''
    const binds: unknown[] = []
    let sql = base

    if (filters && Object.keys(filters).length > 0) {
      const conditions = Object.entries(filters).map(([col, val]) => {
        binds.push(val)
        return `${prefix}${col} = ?`
      })
      sql += ` WHERE ${conditions.join(' AND ')}`
    }

    return { sql, binds }
  }
}
