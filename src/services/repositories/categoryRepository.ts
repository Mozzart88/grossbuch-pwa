import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Category, CategoryInput, CategoryType } from '../../types'

export const categoryRepository = {
  async findAll(): Promise<Category[]> {
    return querySQL<Category>('SELECT * FROM categories ORDER BY type ASC, sort_order ASC, name ASC')
  },

  async findByType(type: CategoryType | 'all'): Promise<Category[]> {
    if (type === 'all') {
      return this.findAll()
    }
    return querySQL<Category>(
      `SELECT * FROM categories WHERE type = ? OR type = 'both' ORDER BY sort_order ASC, name ASC`,
      [type]
    )
  },

  async findById(id: number): Promise<Category | null> {
    return queryOne<Category>('SELECT * FROM categories WHERE id = ?', [id])
  },

  async findByName(name: string): Promise<Category | null> {
    return queryOne<Category>('SELECT * FROM categories WHERE name = ?', [name])
  },

  async create(input: CategoryInput): Promise<Category> {
    // Check for unique name
    const existing = await this.findByName(input.name)
    if (existing) {
      throw new Error('Category with this name already exists')
    }

    await execSQL(
      `INSERT INTO categories (name, type, icon, color, parent_id) VALUES (?, ?, ?, ?, ?)`,
      [input.name, input.type, input.icon ?? null, input.color ?? null, input.parent_id ?? null]
    )
    const id = await getLastInsertId()
    const category = await this.findById(id)
    if (!category) throw new Error('Failed to create category')
    return category
  },

  async update(id: number, input: Partial<CategoryInput>): Promise<Category> {
    // Check for unique name if updating name
    if (input.name) {
      const existing = await this.findByName(input.name)
      if (existing && existing.id !== id) {
        throw new Error('Category with this name already exists')
      }
    }

    const fields: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      values.push(input.name)
    }
    if (input.type !== undefined) {
      fields.push('type = ?')
      values.push(input.type)
    }
    if (input.icon !== undefined) {
      fields.push('icon = ?')
      values.push(input.icon)
    }
    if (input.color !== undefined) {
      fields.push('color = ?')
      values.push(input.color)
    }
    if (input.parent_id !== undefined) {
      fields.push('parent_id = ?')
      values.push(input.parent_id)
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')")
      values.push(id)
      await execSQL(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    const category = await this.findById(id)
    if (!category) throw new Error('Category not found')
    return category
  },

  async canDelete(id: number): Promise<{ canDelete: boolean; transactionCount: number }> {
    const result = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM transactions WHERE category_id = ?',
      [id]
    )
    const count = result?.count ?? 0
    return { canDelete: count === 0, transactionCount: count }
  },

  async delete(id: number): Promise<void> {
    const { canDelete, transactionCount } = await this.canDelete(id)
    if (!canDelete) {
      throw new Error(`Cannot delete: ${transactionCount} transactions linked to this category`)
    }

    // Delete counterparty links first
    await execSQL('DELETE FROM counterparty_categories WHERE category_id = ?', [id])

    await execSQL('DELETE FROM categories WHERE id = ?', [id])
  },
}
