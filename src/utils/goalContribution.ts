import { fromIntFrac } from './amount'

// (target - balance) / months remaining until due date, floored at 1 month
// (a due date this month or overdue still divides by 1, not 0 or negative)
// and floored at $0 once balance meets or exceeds target. Computed at read
// time from already-loaded data — see design.md's Decision 7.
export function computeSuggestedContribution(
  target: number,
  balance: number,
  dueDate: string | null | undefined,
  today: Date = new Date()
): number | null {
  if (!dueDate) return null

  const remaining = target - balance
  if (remaining <= 0) return 0

  const [dueYear, dueMonth] = dueDate.slice(0, 10).split('-').map(Number)
  const monthsRemaining = Math.max(
    1,
    (dueYear - today.getFullYear()) * 12 + (dueMonth - (today.getMonth() + 1))
  )

  return remaining / monthsRemaining
}

// Sums the suggested contribution across a set of goals — callers pass
// goalRepository.findActive()'s result so archived/achieved goals are already
// excluded (see design.md's Decision 7 / spec.md's budget pre-fill scenario).
export function sumSuggestedContributions(
  goals: Array<{ target_int: number; target_frac: number; balance: number; due_date: string | null }>,
  today: Date = new Date()
): number {
  return goals.reduce((sum, goal) => {
    const target = fromIntFrac(goal.target_int, goal.target_frac)
    return sum + (computeSuggestedContribution(target, goal.balance, goal.due_date, today) ?? 0)
  }, 0)
}
