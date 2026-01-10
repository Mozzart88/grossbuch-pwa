import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Counterparty, CounterpartyInput } from '../../types'

export const counterpartyRepository = {
  async findAll(): Promise<Counterparty[]> {
    const counterparties = await querySQL<Counterparty>('SELECT * FROM counterparties ORDER BY name ASC')

    // Load category IDs for each counterparty
    for (const cp of counterparties) {
      const links = await querySQL<{ category_id: number }>(
        'SELECT category_id FROM counterparty_categories WHERE counterparty_id = ?',
        [cp.id]
      )
      cp.category_ids = links.map((l) => l.category_id)
    }

    return counterparties
  },

  async findById(id: number): Promise<Counterparty | null> {
    const counterparty = await queryOne<Counterparty>('SELECT * FROM counterparties WHERE id = ?', [id])
    if (!counterparty) return null

    const links = await querySQL<{ category_id: number }>(
      'SELECT category_id FROM counterparty_categories WHERE counterparty_id = ?',
      [id]
    )
    counterparty.category_ids = links.map((l) => l.category_id)

    return counterparty
  },

  async findByName(name: string): Promise<Counterparty | null> {
    return queryOne<Counterparty>('SELECT * FROM counterparties WHERE name = ?', [name])
  },

  async findByCategoryId(categoryId: number): Promise<Counterparty[]> {
    return querySQL<Counterparty>(`
      SELECT cp.* FROM counterparties cp
      JOIN counterparty_categories cc ON cp.id = cc.counterparty_id
      WHERE cc.category_id = ?
      ORDER BY cp.name ASC
    `, [categoryId])
  },

  async create(input: CounterpartyInput): Promise<Counterparty> {
    // Check for unique name
    const existing = await this.findByName(input.name)
    if (existing) {
      throw new Error('Counterparty with this name already exists')
    }

    await execSQL(
      `INSERT INTO counterparties (name, notes) VALUES (?, ?)`,
      [input.name, input.notes ?? null]
    )
    const id = await getLastInsertId()

    // Link categories
    if (input.category_ids && input.category_ids.length > 0) {
      for (const categoryId of input.category_ids) {
        await execSQL(
          'INSERT INTO counterparty_categories (counterparty_id, category_id) VALUES (?, ?)',
          [id, categoryId]
        )
      }
    }

    const counterparty = await this.findById(id)
    if (!counterparty) throw new Error('Failed to create counterparty')
    return counterparty
  },

  async update(id: number, input: Partial<CounterpartyInput>): Promise<Counterparty> {
    // Check for unique name if updating name
    if (input.name) {
      const existing = await this.findByName(input.name)
      if (existing && existing.id !== id) {
        throw new Error('Counterparty with this name already exists')
      }
    }

    const fields: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      values.push(input.name)
    }
    if (input.notes !== undefined) {
      fields.push('notes = ?')
      values.push(input.notes)
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      values.push(id)
      await execSQL(`UPDATE counterparties SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    // Update category links if provided
    if (input.category_ids !== undefined) {
      await execSQL('DELETE FROM counterparty_categories WHERE counterparty_id = ?', [id])
      for (const categoryId of input.category_ids) {
        await execSQL(
          'INSERT INTO counterparty_categories (counterparty_id, category_id) VALUES (?, ?)',
          [id, categoryId]
        )
      }
    }

    const counterparty = await this.findById(id)
    if (!counterparty) throw new Error('Counterparty not found')
    return counterparty
  },

  async canDelete(id: number): Promise<{ canDelete: boolean; transactionCount: number }> {
    const result = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM transactions WHERE counterparty_id = ?',
      [id]
    )
    const count = result?.count ?? 0
    return { canDelete: count === 0, transactionCount: count }
  },

  async delete(id: number): Promise<void> {
    const { canDelete, transactionCount } = await this.canDelete(id)
    if (!canDelete) {
      throw new Error(`Cannot delete: ${transactionCount} transactions linked to this counterparty`)
    }

    // Category links are deleted by CASCADE
    await execSQL('DELETE FROM counterparties WHERE id = ?', [id])
  },
}
