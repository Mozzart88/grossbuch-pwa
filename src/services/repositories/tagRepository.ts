import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Tag, TagInput, TagHierarchy, TagGraph, TagSummary } from '../../types'
import { SYSTEM_TAGS } from '../../types'

export const tagRepository = {
  async findAll(): Promise<Tag[]> {
    return querySQL<Tag>('SELECT * FROM tag ORDER BY id ASC')
  },

  async findById(id: number): Promise<Tag | null> {
    const tag = await queryOne<Tag>('SELECT * FROM tag WHERE id = ?', [id])
    if (!tag) return null

    // Load parent relationships
    const parents = await querySQL<{ parent_id: number; name: string }>(`
      SELECT ttt.parent_id, t.name
      FROM tag_to_tag ttt
      JOIN tag t ON t.id = ttt.parent_id
      WHERE ttt.child_id = ?
    `, [id])
    tag.parent_ids = parents.map(p => p.parent_id)
    tag.parent_names = parents.map(p => p.name)

    // Load child relationships
    const children = await querySQL<{ child_id: number; name: string }>(`
      SELECT ttt.child_id, t.name
      FROM tag_to_tag ttt
      JOIN tag t ON t.id = ttt.child_id
      WHERE ttt.parent_id = ?
    `, [id])
    tag.child_ids = children.map(c => c.child_id)
    tag.child_names = children.map(c => c.name)

    return tag
  },

  async findByName(name: string): Promise<Tag | null> {
    return queryOne<Tag>('SELECT * FROM tag WHERE name = ?', [name])
  },

  // Find user-visible tags (children of 'default' tag, id=2)
  async findUserTags(): Promise<Tag[]> {
    return this.getTagsByParentId(SYSTEM_TAGS.DEFAULT)
  },

  // Find income category tags (children of 'income' tag, id=9)
  async findIncomeTags(): Promise<Tag[]> {
    return this.getTagsByParentId(SYSTEM_TAGS.INCOME)
  },

  // Find expense category tags (children of 'expense' tag, id=10)
  async findExpenseTags(): Promise<Tag[]> {
    return this.getTagsByParentId(SYSTEM_TAGS.EXPENSE)
  },

  // Find system tags (children of 'system' tag, id=1)
  async findSystemTags(): Promise<Tag[]> {
    return this.getTagsByParentId(SYSTEM_TAGS.SYSTEM)
  },

  // Check if tag is a system tag (protected from deletion)
  async isSystemTag(id: number): Promise<boolean> {
    const result = await queryOne<{ is_system: number }>(`
      SELECT EXISTS(
        SELECT 1 FROM tag_to_tag WHERE child_id = ? AND parent_id = ?
      ) as is_system
    `, [id, SYSTEM_TAGS.SYSTEM])
    return result?.is_system === 1
  },

  async create(input: TagInput): Promise<Tag> {
    // Check for unique name
    const existing = await this.findByName(input.name)
    if (existing) {
      throw new Error('Tag with this name already exists')
    }

    await execSQL('INSERT INTO tag (name) VALUES (?)', [input.name])
    const id = await getLastInsertId()

    // Add parent relationships
    if (input.parent_ids && input.parent_ids.length > 0) {
      for (const parentId of input.parent_ids) {
        await execSQL(
          'INSERT INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
          [id, parentId]
        )
      }
    }

    const tag = await this.findById(id)
    if (!tag) throw new Error('Failed to create tag')
    return tag
  },

  async update(id: number, input: Partial<TagInput>): Promise<Tag> {
    // Check if system tag
    if (await this.isSystemTag(id)) {
      throw new Error('Cannot modify system tags')
    }

    // Check for unique name if updating name
    if (input.name) {
      const existing = await this.findByName(input.name)
      if (existing && existing.id !== id) {
        throw new Error('Tag with this name already exists')
      }
    }

    if (input.name !== undefined) {
      await execSQL(
        'UPDATE tag SET name = ? WHERE id = ?',
        [input.name, id]
      )
    }

    // Update parent relationships if provided
    if (input.parent_ids !== undefined) {
      // Don't remove system parent relationship
      await execSQL(
        'DELETE FROM tag_to_tag WHERE child_id = ? AND parent_id != ?',
        [id, SYSTEM_TAGS.SYSTEM]
      )
      for (const parentId of input.parent_ids) {
        await execSQL(
          'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
          [id, parentId]
        )
      }
    }

    const tag = await this.findById(id)
    if (!tag) throw new Error('Tag not found')
    return tag
  },

  async canDelete(id: number): Promise<{ canDelete: boolean; reason?: string }> {
    // System tags cannot be deleted
    if (await this.isSystemTag(id)) {
      return { canDelete: false, reason: 'System tags cannot be deleted' }
    }

    // Check if tag is used in transactions
    const txCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM trx_base WHERE tag_id = ?',
      [id]
    )
    if (txCount && txCount.count > 0) {
      return { canDelete: false, reason: `${txCount.count} transactions use this tag` }
    }

    // Check if tag is used in budgets
    const budgetCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM budget WHERE tag_id = ?',
      [id]
    )
    if (budgetCount && budgetCount.count > 0) {
      return { canDelete: false, reason: `${budgetCount.count} budgets use this tag` }
    }

    return { canDelete: true }
  },

  async delete(id: number): Promise<void> {
    const { canDelete, reason } = await this.canDelete(id)
    if (!canDelete) {
      throw new Error(`Cannot delete: ${reason}`)
    }

    // Delete tag relationships first
    await execSQL('DELETE FROM tag_to_tag WHERE child_id = ? OR parent_id = ?', [id, id])

    // Delete the tag
    await execSQL('DELETE FROM tag WHERE id = ?', [id])
  },

  // Views
  async getHierarchy(): Promise<TagHierarchy[]> {
    return querySQL<TagHierarchy>('SELECT * FROM tags_hierarchy')
  },

  async getGraph(): Promise<TagGraph[]> {
    return querySQL<TagGraph>('SELECT * FROM tags_graph')
  },

  async getSummary(): Promise<TagSummary[]> {
    return querySQL<TagSummary>('SELECT * FROM tags_summary')
  },

  async getTagsByParentId(id: number): Promise<Tag[]> {
    return querySQL<Tag>(`
      SELECT 
        child_id as id,
        child as name
      FROM tags_hierarchy
      WHERE parent_id = ?
      ORDER BY name ASC
    `, [id])
  }
}
