import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { TransactionForm } from '../components/transactions'

export function AddTransactionPage() {
  const navigate = useNavigate()

  const handleSubmit = () => {
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
