import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TransactionLog } from '../../types'
import { transactionRepository } from '../../services/repositories'
import { formatDate } from '../../utils/dateUtils'
import { TransactionItem } from '../transactions/TransactionItem'
import { Spinner } from '../ui'
import { blobToHex } from '../../utils/blobUtils'
import { useDataRefresh } from '../../hooks/useDataRefresh'

// Groups a flat TransactionLog[] into date -> trxHexId -> lines, same shape
// AccountTransactionList uses for its own per-date grouping.
function groupByDate(transactions: TransactionLog[]): Map<string, Map<string, TransactionLog[]>> {
  const groups = new Map<string, Map<string, TransactionLog[]>>()
  for (const tx of transactions) {
    const date = tx.date_time.split(' ')[0]
    if (!groups.has(date)) groups.set(date, new Map<string, TransactionLog[]>())
    const hexId = blobToHex(tx.id)
    if (!groups.get(date)!.has(hexId)) groups.get(date)!.set(hexId, [])
    groups.get(date)!.get(hexId)!.push(tx)
  }
  return groups
}

interface GoalTransactionListProps {
  goalId: string
  accountIds: number[]
  limit?: number
  emptyMessage?: string
}

// A goal's transactions may span more than one currency account, so unlike
// AccountTransactionList this shows a flat, grouped-by-date list with no
// per-account running balance (which wouldn't be meaningful across currencies).
export function GoalTransactionList({ goalId, accountIds, limit, emptyMessage = 'No transactions yet' }: GoalTransactionListProps) {
  const navigate = useNavigate()
  const dataVersion = useDataRefresh()
  const [transactions, setTransactions] = useState<TransactionLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void transactionRepository.findByAccountIds(accountIds, limit).then(txns => {
      if (!cancelled) {
        setTransactions(txns)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIds.join(','), limit, dataVersion])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-8">
        <p className="text-center">{emptyMessage}</p>
      </div>
    )
  }

  const grouped = groupByDate(transactions)

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {Array.from(grouped.entries()).map(([date, txns]) => (
        <div key={date}>
          <div className="px-4 py-2 bg-gray-100 dark:bg-gray-900">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              {formatDate(date)}
            </span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {Array.from(txns.entries()).map(([hexId, trxs], index) => {
              // Put/Take rows (either leg's goal_name set) route to the
              // dedicated Put/Take edit page, not the generic transfer editor
              // — see design.md Decision 16.
              const isPutTake = trxs.some(l => l.goal_name)
              const editHref = isPutTake ? `/goals/${goalId}/put-take/${hexId}` : `/transaction/${hexId}`
              return (
                <TransactionItem
                  key={`${hexId}-${index}`}
                  transaction={trxs}
                  onClick={() => navigate(editHref)}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
