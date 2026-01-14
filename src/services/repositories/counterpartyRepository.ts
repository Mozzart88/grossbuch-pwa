import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Counterparty, CounterpartyInput, CounterpartySummary } from '../../types'

export const counterpartyRepository = {
  async findAll(): Promise<Counterparty[]> {
    const counterparties = await querySQL<Counterparty>('SELECT * FROM counterparty ORDER BY name ASC')

    // Load tag IDs for each counterparty
    for (const cp of counterparties) {
      const links = await querySQL<{ tag_id: number; name: string }>(`
        SELECT ct.tag_id, t.name
        FROM counterparty_to_tags ct
        JOIN tag t ON t.id = ct.tag_id
        WHERE ct.counterparty_id = ?
      `, [cp.id])
      cp.tag_ids = links.map((l) => l.tag_id)
      cp.tags = links.map((l) => l.name)
    }

    return counterparties
  },

  async findById(id: number): Promise<Counterparty | null> {
    const counterparty = await queryOne<Counterparty>('SELECT * FROM counterparty WHERE id = ?', [id])
    if (!counterparty) return null

    const links = await querySQL<{ tag_id: number; name: string }>(`
      SELECT ct.tag_id, t.name
      FROM counterparty_to_tags ct
      JOIN tag t ON t.id = ct.tag_id
      WHERE ct.counterparty_id = ?
    `, [id])
    counterparty.tag_ids = links.map((l) => l.tag_id)
    counterparty.tags = links.map((l) => l.name)

    return counterparty
  },

  async findByName(name: string): Promise<Counterparty | null> {
    return queryOne<Counterparty>('SELECT * FROM counterparty WHERE name = ?', [name])
  },

  async findByTagId(tagId: number): Promise<Counterparty[]> {
    return querySQL<Counterparty>(`
      SELECT cp.* FROM counterparty cp
      JOIN counterparty_to_tags ct ON cp.id = ct.counterparty_id
      WHERE ct.tag_id = ?
      ORDER BY cp.name ASC
    `, [tagId])
  },

  async create(input: CounterpartyInput): Promise<Counterparty> {
    // Check for unique name
    const existing = await this.findByName(input.name)
    if (existing) {
      throw new Error('Counterparty with this name already exists')
    }

    await execSQL(
      `INSERT INTO counterparty (name, note) VALUES (?, ?)`,
      [input.name, input.note ?? null]
    )
    const id = await getLastInsertId()

    // Link tags
    if (input.tag_ids && input.tag_ids.length > 0) {
      for (const tagId of input.tag_ids) {
        await execSQL(
          'INSERT INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)',
          [id, tagId]
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
    if (input.note !== undefined) {
      fields.push('note = ?')
      values.push(input.note)
    }

    if (fields.length > 0) {
      fields.push("updated_at = strftime('%s', datetime('now', 'localtime'))")
      values.push(id)
      await execSQL(`UPDATE counterparty SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    // Update tag links if provided
    if (input.tag_ids !== undefined) {
      await execSQL('DELETE FROM counterparty_to_tags WHERE counterparty_id = ?', [id])
      for (const tagId of input.tag_ids) {
        await execSQL(
          'INSERT INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)',
          [id, tagId]
        )
      }
    }

    const counterparty = await this.findById(id)
    if (!counterparty) throw new Error('Counterparty not found')
    return counterparty
  },

  async canDelete(id: number): Promise<{ canDelete: boolean; transactionCount: number }> {
    const result = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM trx_to_counterparty WHERE counterparty_id = ?',
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

    // Tag links are deleted by CASCADE
    await execSQL('DELETE FROM counterparty WHERE id = ?', [id])
  },

  // Get summary from view
  async getSummary(): Promise<CounterpartySummary[]> {
    return querySQL<CounterpartySummary>('SELECT * FROM counterparties_summary')
  },
}
