import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { TransactionForm } from '../components/transactions'
import { transactionRepository } from '../services/repositories'
import { useToast } from '../components/ui'
import type { TransactionInput } from '../types'

export function AddTransactionPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  const handleSubmit = async (data: TransactionInput) => {
    await transactionRepository.create(data)
    showToast('Transaction added', 'success')
    navigate('/')
  }

  return (
    <div>
      <PageHeader title="Add Transaction" showBack />
      <div className="p-4">
        <TransactionForm onSubmit={handleSubmit} onCancel={() => navigate('/')} />
      </div>
    </div>
  )
}
