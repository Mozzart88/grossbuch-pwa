import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { TransactionForm } from '../components/transactions'
import { transactionRepository } from '../services/repositories'
import { Button, Spinner, useToast } from '../components/ui'
import type { Transaction, TransactionInput } from '../types'

export function EditTransactionPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { showToast } = useToast()

  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadTransaction()
  }, [id])

  const loadTransaction = async () => {
    if (!id) return
    try {
      const tx = await transactionRepository.findById(parseInt(id))
      setTransaction(tx)
    } catch (error) {
      console.error('Failed to load transaction:', error)
      showToast('Failed to load transaction', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (data: TransactionInput) => {
    if (!id) return
    await transactionRepository.update(parseInt(id), data)
    showToast('Transaction updated', 'success')
    navigate('/')
  }

  const handleDelete = async () => {
    if (!id || !confirm('Are you sure you want to delete this transaction?')) return
    setDeleting(true)
    try {
      await transactionRepository.delete(parseInt(id))
      showToast('Transaction deleted', 'success')
      navigate('/')
    } catch (error) {
      console.error('Failed to delete transaction:', error)
      showToast('Failed to delete transaction', 'error')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  if (!transaction) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">Transaction not found</p>
        <Button onClick={() => navigate('/')} className="mt-4">
          Go Back
        </Button>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Edit Transaction"
        showBack
        rightAction={
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-600 dark:text-red-400"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        }
      />
      <div className="p-4">
        <TransactionForm
          transaction={transaction}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/')}
        />
      </div>
    </div>
  )
}
