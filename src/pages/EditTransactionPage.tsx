import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { TransactionForm } from '../components/transactions'
import { transactionRepository } from '../services/repositories'
import { Button, Spinner, useToast } from '../components/ui'
import type { Transaction } from '../types'

// Helper to convert hex string to Uint8Array
function hexToBlob(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

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
      // Convert hex string ID to Uint8Array
      const blobId = hexToBlob(id)
      const tx = await transactionRepository.findById(blobId)
      setTransaction(tx)
    } catch (error) {
      console.error('Failed to load transaction:', error)
      showToast('Failed to load transaction', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = () => {
    navigate('/')
  }

  const handleDelete = async () => {
    if (!id || !confirm('Are you sure you want to delete this transaction?')) return
    setDeleting(true)
    try {
      const blobId = hexToBlob(id)
      await transactionRepository.delete(blobId)
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
        {transaction && (
          <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm">
            <p className="text-gray-500 dark:text-gray-400 mb-2">Transaction ID: {transaction.id ? Array.from(transaction.id).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8) : 'N/A'}...</p>
            <p className="text-gray-600 dark:text-gray-300">Editing is not yet supported with the new schema. You can delete and recreate the transaction.</p>
          </div>
        )}
        <TransactionForm
          onSubmit={handleSubmit}
          onCancel={() => navigate('/')}
        />
      </div>
    </div>
  )
}
