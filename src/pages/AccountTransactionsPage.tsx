import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { AccountTransactionList } from '../components/transactions/AccountTransactionList'
import { Spinner } from '../components/ui'
import { accountRepository } from '../services/repositories'
import type { Account } from '../types'

export function AccountTransactionsPage() {
  const { accountId } = useParams<{ accountId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Get month from URL params, undefined means use current month
  const monthParam = searchParams.get('month') || undefined

  // Update URL when month changes
  // Use replace only if we already have a month param (to avoid history bloat when changing months)
  // Use push for the first month set to ensure we have a proper history entry to return to
  const handleMonthChange = useCallback((newMonth: string) => {
    const hasMonthParam = searchParams.has('month')
    setSearchParams({ month: newMonth }, { replace: hasMonthParam })
  }, [setSearchParams, searchParams])

  useEffect(() => {
    loadAccount()
  }, [accountId])

  const loadAccount = async () => {
    if (!accountId) {
      setError('Account ID is required')
      setLoading(false)
      return
    }

    try {
      const id = parseInt(accountId, 10)
      if (isNaN(id)) {
        setError('Invalid account ID')
        setLoading(false)
        return
      }

      const acc = await accountRepository.findById(id)
      if (!acc) {
        setError('Account not found')
        setLoading(false)
        return
      }

      setAccount(acc)
    } catch (err) {
      console.error('Failed to load account:', err)
      setError('Failed to load account')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  if (error || !account) {
    return (
      <div>
        <PageHeader title="Account Transactions" showBack />
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400 p-8">
          <p>{error || 'Account not found'}</p>
          <button
            onClick={() => navigate('/settings/accounts')}
            className="mt-4 text-primary-600 dark:text-primary-400 hover:underline"
          >
            Back to Accounts
          </button>
        </div>
      </div>
    )
  }

  const title = `${account.wallet} - ${account.currency}`

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={title} showBack />
      <div className="flex-1 overflow-hidden">
        <AccountTransactionList
          account={account}
          initialMonth={monthParam}
          onMonthChange={handleMonthChange}
        />
      </div>
    </div>
  )
}
