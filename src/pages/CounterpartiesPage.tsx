import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Modal, Input, Spinner, useToast } from '../components/ui'
import { counterpartyRepository, categoryRepository } from '../services/repositories'
import type { Counterparty, CounterpartyInput, Category } from '../types'

export function CounterpartiesPage() {
  const { showToast } = useToast()
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCounterparty, setEditingCounterparty] = useState<Counterparty | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [cps, cats] = await Promise.all([
        counterpartyRepository.findAll(),
        categoryRepository.findAll(),
      ])
      setCounterparties(cps)
      setCategories(cats)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const openModal = (counterparty?: Counterparty) => {
    if (counterparty) {
      setEditingCounterparty(counterparty)
      setName(counterparty.name)
      setNotes(counterparty.notes || '')
      setSelectedCategoryIds(counterparty.category_ids || [])
    } else {
      setEditingCounterparty(null)
      setName('')
      setNotes('')
      setSelectedCategoryIds([])
    }
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingCounterparty(null)
  }

  const toggleCategory = (categoryId: number) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      const data: CounterpartyInput = {
        name: name.trim(),
        notes: notes || undefined,
        category_ids: selectedCategoryIds,
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

  const getCategoryNames = (categoryIds?: number[]) => {
    if (!categoryIds || categoryIds.length === 0) return 'All categories'
    const names = categoryIds
      .map((id) => categories.find((c) => c.id === id)?.name)
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
        rightAction={
          <Button size="sm" onClick={() => openModal()}>
            Add
          </Button>
        }
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
                    {getCategoryNames(cp.category_ids)}
                  </p>
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
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional info..."
          />
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Linked Categories (optional)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              If selected, this counterparty will only appear for these categories
            </p>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    selectedCategoryIds.includes(category.id)
                      ? 'bg-primary-100 border-primary-500 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {category.icon} {category.name}
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
