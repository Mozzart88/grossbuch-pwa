import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, Modal, Input, Select, Spinner, useToast } from '../components/ui'
import { categoryRepository } from '../services/repositories'
import type { Category, CategoryInput, CategoryType } from '../types'

const EMOJI_OPTIONS = ['🍔', '🚗', '💡', '🏠', '🏥', '🎬', '🛍️', '💅', '📚', '✈️', '💰', '💻', '📈', '💵', '↩️', '🎁', '📝', '💲']

export function CategoriesPage() {
  const { showToast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [type, setType] = useState<CategoryType>('expense')
  const [icon, setIcon] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const cats = await categoryRepository.findAll()
      setCategories(cats)
    } catch (error) {
      console.error('Failed to load categories:', error)
    } finally {
      setLoading(false)
    }
  }

  const openModal = (category?: Category) => {
    if (category) {
      setEditingCategory(category)
      setName(category.name)
      setType(category.type)
      setIcon(category.icon || '')
    } else {
      setEditingCategory(null)
      setName('')
      setType('expense')
      setIcon('')
    }
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingCategory(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSubmitting(true)
    try {
      const data: CategoryInput = {
        name: name.trim(),
        type,
        icon: icon || undefined,
      }

      if (editingCategory) {
        await categoryRepository.update(editingCategory.id, data)
        showToast('Category updated', 'success')
      } else {
        await categoryRepository.create(data)
        showToast('Category created', 'success')
      }

      closeModal()
      loadData()
    } catch (error) {
      console.error('Failed to save category:', error)
      showToast(error instanceof Error ? error.message : 'Failed to save', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (category: Category) => {
    const { canDelete, transactionCount } = await categoryRepository.canDelete(category.id)

    if (!canDelete) {
      showToast(`Cannot delete: ${transactionCount} transactions use this category`, 'error')
      return
    }

    if (!confirm(`Delete "${category.name}"? This cannot be undone.`)) return

    try {
      await categoryRepository.delete(category.id)
      showToast('Category deleted', 'success')
      loadData()
    } catch (error) {
      console.error('Failed to delete category:', error)
      showToast(error instanceof Error ? error.message : 'Failed to delete', 'error')
    }
  }

  const expenseCategories = categories.filter((c) => c.type === 'expense' || c.type === 'both')
  const incomeCategories = categories.filter((c) => c.type === 'income' || c.type === 'both')

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
        title="Categories"
        showBack
        rightAction={
          <Button size="sm" onClick={() => openModal()}>
            Add
          </Button>
        }
      />

      <div className="p-4 space-y-6">
        {/* Expense categories */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Expense Categories
          </h3>
          <Card className="divide-y divide-gray-200 dark:divide-gray-700">
            {expenseCategories.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No expense categories</p>
            ) : (
              expenseCategories.map((category) => (
                <div key={category.id} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{category.icon || '📁'}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {category.name}
                    </span>
                    {category.type === 'both' && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                        both
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openModal(category)}
                      className="text-xs text-primary-600 dark:text-primary-400"
                    >
                      Edit
                    </button>
                    {!category.is_preset && (
                      <button
                        onClick={() => handleDelete(category)}
                        className="text-xs text-red-600 dark:text-red-400"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>

        {/* Income categories */}
        <div>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Income Categories
          </h3>
          <Card className="divide-y divide-gray-200 dark:divide-gray-700">
            {incomeCategories.length === 0 ? (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">No income categories</p>
            ) : (
              incomeCategories.map((category) => (
                <div key={category.id} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{category.icon || '📁'}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {category.name}
                    </span>
                    {category.type === 'both' && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                        both
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openModal(category)}
                      className="text-xs text-primary-600 dark:text-primary-400"
                    >
                      Edit
                    </button>
                    {!category.is_preset && (
                      <button
                        onClick={() => handleDelete(category)}
                        className="text-xs text-red-600 dark:text-red-400"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editingCategory ? 'Edit Category' : 'Add Category'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Groceries"
            required
          />
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as CategoryType)}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
              { value: 'both', label: 'Both' },
            ]}
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Icon</label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`w-10 h-10 text-xl rounded-lg border-2 transition-colors ${
                    icon === emoji
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {emoji}
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
