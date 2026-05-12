import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { toLocalISOString } from '../utils/dateUtils'

interface TransactionListUiContextValue {
  getExpandedDates: (scope: string) => Set<string>
  toggleDate: (scope: string, date: string) => void
}

const TransactionListUiContext = createContext<TransactionListUiContextValue | null>(null)

function createDefaultExpandedDates(): Set<string> {
  return new Set([toLocalISOString().slice(0, 10)])
}

export function TransactionListUiProvider({ children }: { children: ReactNode }) {
  const [expandedDatesByScope, setExpandedDatesByScope] = useState<Map<string, Set<string>>>(() => new Map())

  const getExpandedDates = useCallback((scope: string) => {
    return expandedDatesByScope.get(scope) ?? createDefaultExpandedDates()
  }, [expandedDatesByScope])

  const toggleDate = useCallback((scope: string, date: string) => {
    setExpandedDatesByScope(prev => {
      const next = new Map(prev)
      const scopeDates = new Set(next.get(scope) ?? createDefaultExpandedDates())

      if (scopeDates.has(date)) {
        scopeDates.delete(date)
      } else {
        scopeDates.add(date)
      }

      next.set(scope, scopeDates)
      return next
    })
  }, [])

  const value = useMemo(() => ({
    getExpandedDates,
    toggleDate,
  }), [getExpandedDates, toggleDate])

  return (
    <TransactionListUiContext.Provider value={value}>
      {children}
    </TransactionListUiContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTransactionListUi(scope: string) {
  const context = useContext(TransactionListUiContext)
  if (!context) {
    throw new Error('useTransactionListUi must be used within a TransactionListUiProvider')
  }

  return {
    expandedDates: context.getExpandedDates(scope),
    toggleDate: (date: string) => context.toggleDate(scope, date),
  }
}
