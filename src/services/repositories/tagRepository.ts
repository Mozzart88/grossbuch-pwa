import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Tag, TagInput, TagHierarchy, TagGraph, TagSummary, TagContextOption } from '../../types'
import { SYSTEM_TAGS } from '../../types'

const ROOT_PARENT_IDS: number[] = [
  SYSTEM_TAGS.SYSTEM,
  SYSTEM_TAGS.DEFAULT,
  SYSTEM_TAGS.INCOME,
  SYSTEM_TAGS.EXPENSE,
]

export const tagRepository = {
  async findAll(): Promise<Tag[]> {
    return querySQL<Tag>('SELECT * FROM tags ORDER BY id ASC')
  },

  async findById(id: number): Promise<Tag | null> {
    const tag = await queryOne<Tag>('SELECT * FROM tags WHERE id = ?', [id])
    if (!tag) return null

    // Load parent relationships
    // TODO: should be used tags_hierarchy
    const parents = await querySQL<{ parent_id: number; name: string }>(`
      SELECT ttt.parent_id, t.name
      FROM tag_to_tag ttt
      JOIN tag t ON t.id = ttt.parent_id
      WHERE ttt.child_id = ?
    `, [id])
    tag.parent_ids = parents.map(p => p.parent_id)
    tag.parent_names = parents.map(p => p.name)

    // Load child relationships
    // TODO: should be used tags_hierarchy
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
    return queryOne<Tag>('SELECT * FROM tags WHERE name = ?', [name])
  },

  // Find user-visible tags (children of 'default' tag, id=2)
  async findUserTags(): Promise<Tag[]> {
    return await querySQL<Tag>(`
    SELECT DISTINCT
      child_id as id,
      child as name
    FROM tags_hierarchy
    WHERE parent_id != ?
    `, [SYSTEM_TAGS.SYSTEM])
  },

  // Find income category tags (children of 'income' tag, id=9)
  async findIncomeTags(): Promise<Tag[]> {
    return this.getTagsByAncestorId(SYSTEM_TAGS.INCOME)
  },

  // Find expense category tags (children of 'expense' tag, id=10)
  async findExpenseTags(): Promise<Tag[]> {
    return this.getTagsByAncestorId(SYSTEM_TAGS.EXPENSE)
  },

  // Find system tags (children of 'system' tag, id=1)
  async findSystemTags(): Promise<Tag[]> {
    return this.getTagsByParentId(SYSTEM_TAGS.SYSTEM)
  },

  // Find common add-on tags (children of 'add-on' tag) shown as toggle pills
  async findCommonTags(): Promise<Tag[]> {
    return querySQL<Tag>(`
      SELECT t.* FROM tags t
      JOIN tags_hierarchy th ON t.id = th.child_id
      WHERE th.parent = 'add-on'
      ORDER BY t.name ASC
    `)
  },

  // Check if tag is a system tag (protected from deletion)
  // TODO: can be used tags_hierarchy or tags with sort_order = null
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
        await this.addRelation(id, parentId)
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
        await this.addRelation(id, parentId)
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

    const contextCount = await queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM trx_base_tag_context WHERE tag_id = ?',
      [id]
    )
    if (contextCount && contextCount.count > 0) {
      return { canDelete: false, reason: `${contextCount.count} transactions use this tag as context` }
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
        t.*
      FROM tags t
      JOIN tags_hierarchy th ON t.id = th.child_id
      WHERE th.parent_id = ?
    `, [id])
  },

  async getDirectParents(id: number): Promise<Tag[]> {
    return querySQL<Tag>(`
      SELECT t.*
      FROM tag_to_tag ttt
      JOIN tags t ON t.id = ttt.parent_id
      WHERE ttt.child_id = ?
      ORDER BY t.name ASC
    `, [id])
  },

  async getDirectChildren(id: number): Promise<Tag[]> {
    return querySQL<Tag>(`
      SELECT t.*
      FROM tag_to_tag ttt
      JOIN tags t ON t.id = ttt.child_id
      WHERE ttt.parent_id = ?
      ORDER BY t.name ASC
    `, [id])
  },

  async getAncestorIds(id: number): Promise<number[]> {
    const rows = await querySQL<{ id: number }>(`
      WITH RECURSIVE ancestors(id) AS (
        SELECT parent_id FROM tag_to_tag WHERE child_id = ?
        UNION
        SELECT ttt.parent_id
        FROM tag_to_tag ttt
        JOIN ancestors a ON a.id = ttt.child_id
      )
      SELECT id FROM ancestors
    `, [id])
    return rows.map(r => r.id)
  },

  async getDescendantIds(id: number): Promise<number[]> {
    const rows = await querySQL<{ id: number }>(`
      WITH RECURSIVE descendants(id) AS (
        SELECT child_id FROM tag_to_tag WHERE parent_id = ?
        UNION
        SELECT ttt.child_id
        FROM tag_to_tag ttt
        JOIN descendants d ON d.id = ttt.parent_id
      )
      SELECT id FROM descendants
    `, [id])
    return rows.map(r => r.id)
  },

  async getTagsByAncestorId(id: number): Promise<Tag[]> {
    return querySQL<Tag>(`
      WITH RECURSIVE descendants(id) AS (
        SELECT child_id
        FROM tag_to_tag rel
        WHERE parent_id = ?
          AND (
            ? NOT IN (?, ?)
            OR NOT EXISTS (
              SELECT 1 FROM tag_to_tag direct_type
              WHERE direct_type.child_id = rel.child_id
                AND direct_type.parent_id IN (?, ?)
            )
            OR EXISTS (
              SELECT 1 FROM tag_to_tag requested_type
              WHERE requested_type.child_id = rel.child_id
                AND requested_type.parent_id = ?
            )
          )
        UNION
        SELECT ttt.child_id
        FROM tag_to_tag ttt
        JOIN descendants d ON d.id = ttt.parent_id
        WHERE (
          ? NOT IN (?, ?)
          OR NOT EXISTS (
            SELECT 1 FROM tag_to_tag direct_type
            WHERE direct_type.child_id = ttt.child_id
              AND direct_type.parent_id IN (?, ?)
          )
          OR EXISTS (
            SELECT 1 FROM tag_to_tag requested_type
            WHERE requested_type.child_id = ttt.child_id
              AND requested_type.parent_id = ?
          )
        )
      )
      SELECT DISTINCT t.*
      FROM tags t
      JOIN descendants d ON d.id = t.id
      ORDER BY t.sort_order DESC, t.name ASC
    `, [
      id,
      id, SYSTEM_TAGS.INCOME, SYSTEM_TAGS.EXPENSE, SYSTEM_TAGS.INCOME, SYSTEM_TAGS.EXPENSE, id,
      id, SYSTEM_TAGS.INCOME, SYSTEM_TAGS.EXPENSE, SYSTEM_TAGS.INCOME, SYSTEM_TAGS.EXPENSE, id,
    ])
  },

  async getTopLevelParents(id: number, type?: 'income' | 'expense'): Promise<Tag[]> {
    const rootId = type === 'income'
      ? SYSTEM_TAGS.INCOME
      : type === 'expense'
        ? SYSTEM_TAGS.EXPENSE
        : null
    const params: unknown[] = rootId ? [id, rootId] : [id]
    return querySQL<Tag>(`
      WITH RECURSIVE ancestors(id) AS (
        SELECT ?
        UNION
        SELECT ttt.parent_id
        FROM tag_to_tag ttt
        JOIN ancestors a ON a.id = ttt.child_id
      )
      SELECT DISTINCT t.*
      FROM tag_to_tag rel
      JOIN ancestors a ON a.id = rel.child_id
      JOIN tags t ON t.id = rel.child_id
      WHERE rel.parent_id ${rootId ? '= ?' : 'IN (9, 10)'}
        AND t.id NOT IN (?, ?)
      ORDER BY t.name ASC
    `, rootId ? [...params, SYSTEM_TAGS.INCOME, SYSTEM_TAGS.EXPENSE] : [...params, SYSTEM_TAGS.INCOME, SYSTEM_TAGS.EXPENSE])
  },

  async wouldCreateCycle(childId: number, parentId: number): Promise<boolean> {
    if (childId === parentId) return true
    const descendants = await this.getDescendantIds(childId)
    return descendants.includes(parentId)
  },

  async addRelation(childId: number, parentId: number): Promise<void> {
    if (await this.wouldCreateCycle(childId, parentId)) {
      throw new Error('Tag relationship would create a cycle')
    }

    await execSQL(
      'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
      [childId, parentId]
    )
  },

  async removeRelation(childId: number, parentId: number): Promise<void> {
    const ancestorIds = await this.getAncestorIds(parentId)
    const inheritedRootIds = [parentId, ...ancestorIds].filter(id =>
      id === SYSTEM_TAGS.INCOME || id === SYSTEM_TAGS.EXPENSE
    )

    await execSQL(
      'DELETE FROM tag_to_tag WHERE child_id = ? AND parent_id = ?',
      [childId, parentId]
    )

    const remainingParents = await this.getDirectParents(childId)
    const hasNestedParent = remainingParents.some(parent => !ROOT_PARENT_IDS.includes(parent.id))
    if (!hasNestedParent) {
      for (const rootId of inheritedRootIds) {
        await this.addRelation(childId, rootId)
      }
    }
  },

  async getContextOptions(type: 'income' | 'expense'): Promise<TagContextOption[]> {
    const rootId = type === 'income' ? SYSTEM_TAGS.INCOME : SYSTEM_TAGS.EXPENSE
    return querySQL<TagContextOption>(`
      WITH RECURSIVE
      descendants(tag_id, tag_name, context_id, context_name) AS (
        SELECT t.id, t.name, t.id, t.name
        FROM tag_to_tag rel
        JOIN tag t ON t.id = rel.child_id
        WHERE rel.parent_id = ?
          AND t.id NOT IN (?, ?)
        UNION
        SELECT child.id, child.name, descendants.context_id, descendants.context_name
        FROM descendants
        JOIN tag_to_tag rel ON rel.parent_id = descendants.tag_id
        JOIN tag child ON child.id = rel.child_id
        WHERE (
          NOT EXISTS (
            SELECT 1 FROM tag_to_tag direct_type
            WHERE direct_type.child_id = child.id
              AND direct_type.parent_id IN (?, ?)
          )
          OR EXISTS (
            SELECT 1 FROM tag_to_tag requested_type
            WHERE requested_type.child_id = child.id
              AND requested_type.parent_id = ?
          )
        )
      )
      SELECT DISTINCT
        tag_id,
        tag_name,
        CASE WHEN tag_id = context_id THEN NULL ELSE context_id END as context_id,
        CASE WHEN tag_id = context_id THEN NULL ELSE context_name END as context_name,
        tag_name || CASE WHEN tag_id = context_id THEN '' ELSE ' ' || context_name END as label,
        ? as type
      FROM descendants
      ORDER BY label ASC
    `, [rootId, SYSTEM_TAGS.INCOME, SYSTEM_TAGS.EXPENSE, SYSTEM_TAGS.INCOME, SYSTEM_TAGS.EXPENSE, rootId, type])
  }
}
