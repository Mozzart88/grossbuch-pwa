import type { MonthlyTagSummary, MonthlyCategoryBreakdown, Tag, TagHierarchy } from '../types'
import { SYSTEM_TAGS } from '../types'

export type SummaryTreeItem = {
  tag_id: number
  tag_context_id?: number | null
}

export const summaryItemKey = (item: SummaryTreeItem): string =>
  item.tag_context_id === null || item.tag_context_id === undefined
    ? item.tag_id.toString()
    : `${item.tag_id}:${item.tag_context_id}`

// Collects each ancestor tag id reachable from tagId at most once, even when
// the tag hierarchy is a DAG (a tag may have multiple parents) and two of
// its parent chains reconverge on the same ancestor — see the
// `summary-tag-rollup` spec.
export const getAncestorIdsForTree = (
  tagHierarchy: TagHierarchy[],
  tagId: number,
  validIds?: Set<number>,
  contextId?: number | null
): number[] => {
  const result: number[] = []
  const visited = new Set<number>()
  const visit = (childId: number) => {
    tagHierarchy
      .filter(h => h.child_id === childId)
      .forEach(h => {
        if (h.parent_id === SYSTEM_TAGS.INCOME || h.parent_id === SYSTEM_TAGS.EXPENSE || h.parent_id === SYSTEM_TAGS.SYSTEM || h.parent_id === SYSTEM_TAGS.DEFAULT) {
          return
        }
        if (contextId !== null && contextId !== undefined && h.parent_id === contextId) {
          return
        }
        if (visited.has(h.parent_id)) {
          return
        }
        visited.add(h.parent_id)
        if (!validIds || validIds.has(h.parent_id)) {
          result.push(h.parent_id)
        }
        visit(h.parent_id)
      })
  }
  visit(tagId)
  return result
}

export const withSummaryAncestors = (
  items: MonthlyTagSummary[],
  tagHierarchy: TagHierarchy[],
  getTagName: (tagId: number) => string
): MonthlyTagSummary[] => {
  const byId = new Map(items.map(item => [summaryItemKey(item), { ...item }]))
  for (const item of items) {
    for (const ancestorId of getAncestorIdsForTree(tagHierarchy, item.tag_id, undefined, item.tag_context_id ?? null)) {
      const ancestorKey = summaryItemKey({ tag_id: ancestorId, tag_context_id: item.tag_context_id ?? null })
      const existing = byId.get(ancestorKey)
      if (existing) {
        existing.income += item.income
        existing.expense += item.expense
        existing.net += item.net
      } else {
        byId.set(ancestorKey, {
          tag_id: ancestorId,
          tag: getTagName(ancestorId),
          tag_context_id: item.tag_context_id ?? null,
          tag_context: item.tag_context ?? null,
          income: item.income,
          expense: item.expense,
          net: item.net,
        })
      }
    }
  }
  return Array.from(byId.values())
}

export const withCategoryAncestors = (
  items: MonthlyCategoryBreakdown[],
  type: 'income' | 'expense',
  tagHierarchy: TagHierarchy[],
  incomeTags: Tag[],
  expenseTags: Tag[],
  getTagName: (tagId: number) => string
): MonthlyCategoryBreakdown[] => {
  const typeTagIds = new Set((type === 'income' ? incomeTags : expenseTags).map(t => t.id))
  const byId = new Map(items.map(item => [summaryItemKey(item), { ...item }]))
  for (const item of items) {
    for (const ancestorId of getAncestorIdsForTree(tagHierarchy, item.tag_id, typeTagIds.size ? typeTagIds : undefined, item.tag_context_id ?? null)) {
      const ancestorKey = summaryItemKey({ tag_id: ancestorId, tag_context_id: item.tag_context_id ?? null })
      const existing = byId.get(ancestorKey)
      if (existing) {
        existing.amount += item.amount
      } else {
        byId.set(ancestorKey, {
          tag_id: ancestorId,
          tag: getTagName(ancestorId),
          tag_context_id: item.tag_context_id ?? null,
          tag_context: item.tag_context ?? null,
          amount: item.amount,
          type,
        })
      }
    }
  }
  return Array.from(byId.values())
}

// Maps every tag id that appears as a parent in tagHierarchy to the full set
// of its descendant tag ids, computed once per tagHierarchy rather than via
// a fresh recursive walk per category node (see getAggregateBudgetForCategory
// in SummariesPage.tsx).
export const buildDescendantsByTagId = (tagHierarchy: TagHierarchy[]): Map<number, Set<number>> => {
  const childrenOf = new Map<number, number[]>()
  for (const h of tagHierarchy) {
    if (!childrenOf.has(h.parent_id)) childrenOf.set(h.parent_id, [])
    childrenOf.get(h.parent_id)!.push(h.child_id)
  }

  const cache = new Map<number, Set<number>>()
  const descendantsOf = (tagId: number): Set<number> => {
    const cached = cache.get(tagId)
    if (cached) return cached
    const result = new Set<number>()
    cache.set(tagId, result)
    for (const child of childrenOf.get(tagId) ?? []) {
      if (!result.has(child)) {
        result.add(child)
        for (const d of descendantsOf(child)) result.add(d)
      }
    }
    return result
  }

  const map = new Map<number, Set<number>>()
  for (const parentId of childrenOf.keys()) {
    map.set(parentId, descendantsOf(parentId))
  }
  return map
}
