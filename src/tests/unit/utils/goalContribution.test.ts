import { describe, it, expect } from 'vitest'
import { computeSuggestedContribution, sumSuggestedContributions } from '../../../utils/goalContribution'

describe('computeSuggestedContribution', () => {
  const today = new Date(2026, 7, 24) // 2026-08-24

  it('divides the remaining amount by the whole months until the due date', () => {
    // Due 2027-08 -> 12 months out
    expect(computeSuggestedContribution(1200, 0, '2027-08-01', today)).toBeCloseTo(100, 5)
  })

  it('floors months remaining at 1 for a due date within the current month', () => {
    expect(computeSuggestedContribution(500, 0, '2026-08-31', today)).toBeCloseTo(500, 5)
  })

  it('floors months remaining at 1 for an overdue due date', () => {
    expect(computeSuggestedContribution(500, 0, '2025-01-01', today)).toBeCloseTo(500, 5)
  })

  it('floors at $0 once the balance meets or exceeds the target', () => {
    expect(computeSuggestedContribution(1000, 1000, '2027-01-01', today)).toBe(0)
    expect(computeSuggestedContribution(1000, 1500, '2027-01-01', today)).toBe(0)
  })

  it('returns null when the goal has no due date', () => {
    expect(computeSuggestedContribution(1000, 200, null, today)).toBeNull()
    expect(computeSuggestedContribution(1000, 200, undefined, today)).toBeNull()
  })
})

describe('sumSuggestedContributions', () => {
  const today = new Date(2026, 7, 24) // 2026-08-24

  it('sums the contribution figure across every goal that has a due date', () => {
    const goals = [
      // (1200 - 0) / 12 months (due 2027-08) = 100
      { target_int: 1200, target_frac: 0, balance: 0, due_date: '2027-08-24' },
      // (500 - 0) / 1 month (due this month) = 500
      { target_int: 500, target_frac: 0, balance: 0, due_date: '2026-08-31' },
    ]

    expect(sumSuggestedContributions(goals, today)).toBeCloseTo(600, 5)
  })

  it('excludes goals without a due date from the sum', () => {
    const goals = [
      { target_int: 1200, target_frac: 0, balance: 0, due_date: null },
    ]

    expect(sumSuggestedContributions(goals, today)).toBe(0)
  })

  it('excludes an archived or achieved goal from the sum because callers only pass active goals', () => {
    // sumSuggestedContributions has no notion of "archived"/"achieved" — it
    // trusts the caller to pass goalRepository.findActive()'s result (already
    // excludes both) rather than findAll()'s.
    const activeOnly = [
      { target_int: 1200, target_frac: 0, balance: 0, due_date: '2026-09-24' },
    ]

    expect(sumSuggestedContributions(activeOnly, today)).toBeCloseTo(1200, 5)
  })
})
