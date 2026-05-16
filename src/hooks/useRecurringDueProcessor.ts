import { useEffect, useRef } from 'react'
import { recurringRepository } from '../services/repositories'

export function useRecurringDueProcessor({ enabled }: { enabled: boolean }) {
  const ran = useRef(false)

  useEffect(() => {
    if (!enabled || ran.current) return
    ran.current = true
    recurringRepository.processDue().catch((error) => {
      console.error('Failed to process recurring transactions:', error)
    })
  }, [enabled])
}
