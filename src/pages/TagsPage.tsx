import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Modal, Input, Spinner, useToast, DropdownMenu, LiveSearch } from '../components/ui'
import { tagRepository } from '../services/repositories'
import { SYSTEM_TAGS } from '../types'
import type { Tag, TagInput } from '../types'
import { useLayoutContextSafe } from '../store/LayoutContext'
import { useDataRefresh } from '../hooks/useDataRefresh'

type TagType = 'expense' | 'income' | 'both'

const ROOT_PARENT_IDS = new Set<number>([
  SYSTEM_TAGS.DEFAULT,
  SYSTEM_TAGS.INCOME,
  SYSTEM_TAGS.EXPENSE,
  SYSTEM_TAGS.SYSTEM,
])

export function TagsPage() {
  const { showToast } = useToast()
  const layoutContext = useLayoutContextSafe()
  const dataVersion = useDataRefresh()
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [expenseTags, setExpenseTags] = useState<Tag[]>([])
  const [incomeTags, setIncomeTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [subTagModalOpen, setSubTagModalOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [targetParent, setTargetParent] = useState<Tag | null>(null)
  const [selectedSubTagId, setSelectedSubTagId] = useState('')
  const [newSubTagName, setNewSubTagName] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const [name, setName] = useState('')
  const [type, setType] = useState<TagType>('expense')
  const [submitting, setSubmitting] = useState(false)

  const isSystemTag = (tag: Tag): boolean => tag.id <= 10 || tag.id === SYSTEM_TAGS.ARCHIVED
  const visible = (tags: Tag[]) => tags.filter(t => !isSystemTag(t))

  const loadData = useCallback(async () => {
    try {
      const [all, expense, income, hierarchy] = await Promise.all([
        tagRepository.findUserTags?.() ?? Promise.resolve([]),
        tagRepository.findExpenseTags(),
        tagRepository.findIncomeTags(),
        tagRepository.getHierarchy?.() ?? Promise.resolve([]),
      ])
      const fallbackAll = all.length ? all : [...expense, ...income].filter((tag, index, arr) => arr.findIndex(t => t.id === tag.id) === index)
      const withParents = fallbackAll.map(tag => ({
        ...tag,
        parent_ids: hierarchy.length
          ? hierarchy.filter(h => h.child_id === tag.id).map(h => h.parent_id)
          : [
            ...(expense.some(t => t.id === tag.id) ? [SYSTEM_TAGS.EXPENSE] : []),
            ...(income.some(t => t.id === tag.id) ? [SYSTEM_TAGS.INCOME] : []),
          ],
      }))
      setAllTags(visible(withParents))
      setExpenseTags(visible(expense))
      setIncomeTags(visible(income))
      setExpandedIds(prev => prev.size ? prev : new Set([...expense, ...income].map(t => t.id)))
    } catch (error) {
      console.error('Failed to load tags:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData, dataVersion])

  const getTagType = (tag: Tag): TagType => {
    const isExpense = expenseTags.some(t => t.id === tag.id)
    const isIncome = incomeTags.some(t => t.id === tag.id)
    if (isExpense && isIncome) return 'both'
    if (isIncome) return 'income'
    return 'expense'
  }

  const getNonRootParentIds = (tag: Tag): number[] =>
    tag.parent_ids?.filter(parentId => !ROOT_PARENT_IDS.has(parentId)) ?? []

  const getDirectTypeRootIds = (tag: Tag): number[] =>
    tag.parent_ids?.filter(parentId => parentId === SYSTEM_TAGS.INCOME || parentId === SYSTEM_TAGS.EXPENSE) ?? []

  const isTagInRootBranch = (tagId: number, rootId: number, visited = new Set<number>()): boolean => {
    if (tagId === rootId || visited.has(tagId)) return tagId === rootId
    visited.add(tagId)
    const tag = allTags.find(t => t.id === tagId)
    if (!tag) return false
    if (tag.parent_ids?.includes(rootId)) return true
    return getNonRootParentIds(tag).some(parentId => isTagInRootBranch(parentId, rootId, visited))
  }

  const isNestedInRootBranch = (tag: Tag, rootId: number): boolean =>
    getNonRootParentIds(tag).some(parentId => isTagInRootBranch(parentId, rootId))

  const belongsToRootBranch = (tag: Tag, rootId: number): boolean => {
    const directTypeRootIds = getDirectTypeRootIds(tag)
    if (directTypeRootIds.length) return directTypeRootIds.includes(rootId)
    return isTagInRootBranch(tag.id, rootId)
  }

  const openModal = useCallback((tag?: Tag) => {
    setEditingTag(tag ?? null)
    setName(tag?.name ?? '')
    setType(tag ? getTagType(tag) : 'expense')
    setModalOpen(true)
  }, [expenseTags, incomeTags])

  useEffect(() => {
    const setPlusButtonConfig = layoutContext?.setPlusButtonConfig
    if (!setPlusButtonConfig) return
    setPlusButtonConfig({ onClick: () => openModal() })
    return () => setPlusButtonConfig(null)
  }, [layoutContext?.setPlusButtonConfig, openModal])

  const closeModal = () => {
    setModalOpen(false)
    setEditingTag(null)
  }

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const parent_ids: number[] = editingTag ? getNonRootParentIds(editingTag) : []
      parent_ids.push(SYSTEM_TAGS.DEFAULT)
      if (type === 'expense' || type === 'both') parent_ids.push(SYSTEM_TAGS.EXPENSE)
      if (type === 'income' || type === 'both') parent_ids.push(SYSTEM_TAGS.INCOME)
      const data: TagInput = { name: name.trim(), parent_ids }
      if (editingTag) {
        await tagRepository.update(editingTag.id, data)
        showToast('Tag updated', 'success')
      } else {
        await tagRepository.create(data)
        showToast('Tag created', 'success')
      }
      closeModal()
      loadData()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to save', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (tag: Tag) => {
    const { canDelete, reason } = await tagRepository.canDelete(tag.id)
    if (!canDelete) {
      showToast(`Cannot delete: ${reason}`, 'error')
      return
    }
    if (!confirm(`Delete "${tag.name}"? This cannot be undone.`)) return
    try {
      await tagRepository.delete(tag.id)
      showToast('Tag deleted', 'success')
      loadData()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete', 'error')
    }
  }

  const openSubTagModal = (parent: Tag) => {
    setTargetParent(parent)
    setSelectedSubTagId('')
    setNewSubTagName('')
    setSubTagModalOpen(true)
  }

  const handleAddSubTag = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!targetParent) return
    setSubmitting(true)
    try {
      if (newSubTagName) {
        await tagRepository.create({ name: newSubTagName.trim(), parent_ids: [targetParent.id] })
      } else if (selectedSubTagId) {
        await tagRepository.addRelation(parseInt(selectedSubTagId), targetParent.id)
      }
      setSubTagModalOpen(false)
      showToast('Sub-tag added', 'success')
      loadData()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to add sub-tag', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveRelation = async (child: Tag, parent: Tag) => {
    try {
      await tagRepository.removeRelation(child.id, parent.id)
      showToast('Relation removed', 'success')
      loadData()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to remove relation', 'error')
    }
  }

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const directChildren = (parentId: number, rootId: number): Tag[] =>
    allTags
      .filter(t => t.parent_ids?.includes(parentId) && belongsToRootBranch(t, rootId))
      .toSorted((a, b) => a.name.localeCompare(b.name))

  const topLevelFor = (rootId: number): Tag[] =>
    allTags
      .filter(t => belongsToRootBranch(t, rootId) && t.parent_ids?.includes(rootId) && !isNestedInRootBranch(t, rootId))
      .toSorted((a, b) => a.name.localeCompare(b.name))

  const renderRows = (tags: Tag[], rootId: number, depth = 0, parent?: Tag): React.ReactNode => (
    tags.map(tag => {
      const children = directChildren(tag.id, rootId)
      const expanded = expandedIds.has(tag.id)
      return (
        <div key={`${parent?.id ?? 'root'}-${tag.id}`}>
          <div className="flex items-center justify-between px-3 py-2">
            <button
              type="button"
              onClick={() => children.length ? toggleExpanded(tag.id) : undefined}
              className="flex min-w-0 items-center gap-2 text-left"
              style={{ paddingLeft: depth * 16 }}
            >
              <span className="w-4 text-xs text-gray-400">{children.length ? (expanded ? '▾' : '▸') : ''}</span>
              <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{tag.name}</span>
              {getTagType(tag) === 'both' && (
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">both</span>
              )}
            </button>
            <DropdownMenu
              items={[
                { label: 'Add sub-tag', onClick: () => openSubTagModal(tag) },
                { label: 'Edit', onClick: () => openModal(tag) },
                ...(parent ? [{ label: 'Remove relation', onClick: () => handleRemoveRelation(tag, parent) }] : []),
                { label: 'Delete', onClick: () => handleDelete(tag), variant: 'danger' as const },
              ]}
            />
            <div className="sr-only">
              <button type="button" onClick={() => openModal(tag)}>Edit</button>
              <button type="button" onClick={() => handleDelete(tag)}>Delete</button>
            </div>
          </div>
          {expanded && children.length > 0 && renderRows(children, rootId, depth + 1, tag)}
        </div>
      )
    })
  )

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Spinner /></div>
  }

  const subTagOptions = allTags
    .filter(t => t.id !== targetParent?.id)
    .map(t => ({ value: t.id, label: t.name }))

  return (
    <div>
      <PageHeader title="Tags" showBack />
      <div className="p-4 space-y-6">
        <section>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Expense Tags</h3>
          <Card className="divide-y divide-gray-200 dark:divide-gray-700">
            {topLevelFor(SYSTEM_TAGS.EXPENSE).length ? renderRows(topLevelFor(SYSTEM_TAGS.EXPENSE), SYSTEM_TAGS.EXPENSE) : (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No expense tags</p>
            )}
          </Card>
        </section>

        <section>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Income Tags</h3>
          <Card className="divide-y divide-gray-200 dark:divide-gray-700">
            {topLevelFor(SYSTEM_TAGS.INCOME).length ? renderRows(topLevelFor(SYSTEM_TAGS.INCOME), SYSTEM_TAGS.INCOME) : (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No income tags</p>
            )}
          </Card>
        </section>
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editingTag ? 'Edit Tag' : 'Add Tag'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Groceries" required />
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
            <div className="flex gap-2">
              {(['expense', 'income', 'both'] as TagType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${type === t
                    ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={submitting} className="flex-1">{submitting ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={subTagModalOpen} onClose={() => setSubTagModalOpen(false)} title={`Add sub-tag${targetParent ? ` to ${targetParent.name}` : ''}`}>
        <form onSubmit={handleAddSubTag} className="space-y-4">
          <LiveSearch
            label="Sub-tag"
            value={selectedSubTagId}
            options={subTagOptions}
            onChange={(value) => { setSelectedSubTagId(String(value)); setNewSubTagName('') }}
            onCreateNew={(value) => { setSelectedSubTagId(''); setNewSubTagName(value) }}
            pendingNewValue={newSubTagName}
            placeholder="Search or create tag"
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setSubTagModalOpen(false)} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={submitting || (!selectedSubTagId && !newSubTagName)} className="flex-1">
              {submitting ? 'Adding...' : 'Add'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
