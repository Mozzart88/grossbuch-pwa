import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Modal, Input, Spinner, useToast } from '../components/ui'
import { tagRepository } from '../services/repositories'
import { SYSTEM_TAGS } from '../types'
import type { Tag, TagInput } from '../types'
import { useLayoutContextSafe } from '../store/LayoutContext'
import { useDataRefresh } from '../hooks/useDataRefresh'

type TagType = 'expense' | 'income' | 'both'

export function TagsPage() {
  const { showToast } = useToast()
  const layoutContext = useLayoutContextSafe()
  const dataVersion = useDataRefresh()
  const [expenseTags, setExpenseTags] = useState<Tag[]>([])
  const [incomeTags, setIncomeTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [type, setType] = useState<TagType>('expense')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [dataVersion])

  const loadData = async () => {
    try {
      const [expense, income] = await Promise.all([
        tagRepository.findExpenseTags(),
        tagRepository.findIncomeTags(),
      ])
      setExpenseTags(expense)
      setIncomeTags(income)
    } catch (error) {
      console.error('Failed to load tags:', error)
    } finally {
      setLoading(false)
    }
  }

  const getTagType = (tag: Tag): TagType => {
    const isExpense = expenseTags.some(t => t.id === tag.id)
    const isIncome = incomeTags.some(t => t.id === tag.id)
    if (isExpense && isIncome) return 'both'
    if (isIncome) return 'income'
    return 'expense'
  }

  const isSystemTag = (tag: Tag): boolean => {
    // System tags have IDs 1-10 or 22
    return tag.id <= 10 || tag.id === SYSTEM_TAGS.ARCHIVED
  }

  const openModal = useCallback((tag?: Tag) => {
    if (tag) {
      setEditingTag(tag)
      setName(tag.name)
      // Note: getTagType needs to be called after state is loaded
      // For editing, we'll determine type from the tag's presence in expense/income arrays
    } else {
      setEditingTag(null)
      setName('')
      setType('expense')
    }
    setModalOpen(true)
  }, [])

  // When editing, update the type based on the tag
  useEffect(() => {
    if (editingTag) {
      setName(editingTag.name)
      setType(getTagType(editingTag))
    }
  }, [editingTag, expenseTags, incomeTags])

  const closeModal = () => {
    setModalOpen(false)
    setEditingTag(null)
  }

  // Set up plus button to open modal
  useEffect(() => {
    const setPlusButtonConfig = layoutContext?.setPlusButtonConfig
    if (!setPlusButtonConfig) return

    setPlusButtonConfig({
      onClick: () => openModal(),
    })

    return () => {
      setPlusButtonConfig(null)
    }
  }, [layoutContext?.setPlusButtonConfig, openModal])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      // Determine parent IDs based on type
      const parent_ids: number[] = [SYSTEM_TAGS.DEFAULT] // Always a child of 'default'
      if (type === 'expense' || type === 'both') {
        parent_ids.push(SYSTEM_TAGS.EXPENSE)
      }
      if (type === 'income' || type === 'both') {
        parent_ids.push(SYSTEM_TAGS.INCOME)
      }

      const data: TagInput = {
        name: name.trim(),
        parent_ids,
      }

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
      console.error('Failed to save tag:', error)
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
      console.error('Failed to delete tag:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete', 'error')
    }
  }

  // Filter to show only user-created tags (exclude system tags like transfer, exchange)
  const visibleExpenseTags = expenseTags.filter(t => !isSystemTag(t))
  const visibleIncomeTags = incomeTags.filter(t => !isSystemTag(t))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Tags"
        showBack
      />

      <div className="p-4 space-y-6">
        {/* Expense tags */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Expense Tags
          </h3>
          <Card className="divide-y divide-gray-200 dark:divide-gray-700">
            {visibleExpenseTags.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No expense tags</p>
            ) : (
              visibleExpenseTags.map((tag) => (
                <div key={tag.id} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {tag.name}
                    </span>
                    {getTagType(tag) === 'both' && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                        both
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openModal(tag)}
                      className="text-xs text-primary-600 dark:text-primary-400"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(tag)}
                      className="text-xs text-red-600 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>

        {/* Income tags */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Income Tags
          </h3>
          <Card className="divide-y divide-gray-200 dark:divide-gray-700">
            {visibleIncomeTags.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No income tags</p>
            ) : (
              visibleIncomeTags.map((tag) => (
                <div key={tag.id} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {tag.name}
                    </span>
                    {getTagType(tag) === 'both' && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                        both
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openModal(tag)}
                      className="text-xs text-primary-600 dark:text-primary-400"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(tag)}
                      className="text-xs text-red-600 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editingTag ? 'Edit Tag' : 'Add Tag'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Groceries"
            required
          />
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Type
            </label>
            <div className="flex gap-2">
              {(['expense', 'income', 'both'] as TagType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                    type === t
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
            <Button type="button" variant="secondary" onClick={closeModal} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
