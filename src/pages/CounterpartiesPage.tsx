import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Modal, Input, Spinner, useToast } from '../components/ui'
import { counterpartyRepository, tagRepository } from '../services/repositories'
import type { Counterparty, CounterpartyInput, Tag } from '../types'
import { useLayoutContextSafe } from '../store/LayoutContext'

export function CounterpartiesPage() {
  const { showToast } = useToast()
  const layoutContext = useLayoutContextSafe()
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCounterparty, setEditingCounterparty] = useState<Counterparty | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [cps, userTags] = await Promise.all([
        counterpartyRepository.findAll(),
        tagRepository.findUserTags(),
      ])
      setCounterparties(cps)
      setTags(userTags)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const openModal = useCallback((counterparty?: Counterparty) => {
    if (counterparty) {
      setEditingCounterparty(counterparty)
      setName(counterparty.name)
      setNote(counterparty.note || '')
      setSelectedTagIds(counterparty.tag_ids || [])
    } else {
      setEditingCounterparty(null)
      setName('')
      setNote('')
      setSelectedTagIds([])
    }
    setModalOpen(true)
  }, [])

  const closeModal = () => {
    setModalOpen(false)
    setEditingCounterparty(null)
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

  const toggleTag = (tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      const data: CounterpartyInput = {
        name: name.trim(),
        note: note || undefined,
        tag_ids: selectedTagIds,
      }

      if (editingCounterparty) {
        await counterpartyRepository.update(editingCounterparty.id, data)
        showToast('Counterparty updated', 'success')
      } else {
        await counterpartyRepository.create(data)
        showToast('Counterparty created', 'success')
      }

      closeModal()
      loadData()
    } catch (error) {
      console.error('Failed to save counterparty:', error)
      showToast(error instanceof Error ? error.message : 'Failed to save', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (counterparty: Counterparty) => {
    const { canDelete, transactionCount } = await counterpartyRepository.canDelete(counterparty.id)

    if (!canDelete) {
      showToast(`Cannot delete: ${transactionCount} transactions use this counterparty`, 'error')
      return
    }

    if (!confirm(`Delete "${counterparty.name}"? This cannot be undone.`)) return

    try {
      await counterpartyRepository.delete(counterparty.id)
      showToast('Counterparty deleted', 'success')
      loadData()
    } catch (error) {
      console.error('Failed to delete counterparty:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete', 'error')
    }
  }

  const getTagNames = (tagIds?: number[]) => {
    if (!tagIds || tagIds.length === 0) return 'All tags'
    const names = tagIds
      .map((id) => tags.find((t) => t.id === id)?.name)
      .filter(Boolean)
    return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ')
  }

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
        title="Counterparties"
        showBack
      />

      <div className="p-4">
        {counterparties.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>No counterparties yet</p>
            <p className="text-sm mt-1">Add shops, employers, or anyone you transact with</p>
          </div>
        ) : (
          <Card className="divide-y divide-gray-200 dark:divide-gray-700">
            {counterparties.map((cp) => (
              <div key={cp.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{cp.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {getTagNames(cp.tag_ids)}
                  </p>
                  {cp.note && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 italic">
                      {cp.note}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openModal(cp)}
                    className="text-xs text-primary-600 dark:text-primary-400"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(cp)}
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editingCounterparty ? 'Edit Counterparty' : 'Add Counterparty'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Amazon, Supermarket"
            required
          />
          <Input
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Additional info..."
          />
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Linked Tags (optional)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              If selected, this counterparty will only appear for these tags
            </p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    selectedTagIds.includes(tag.id)
                      ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {tag.name}
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
