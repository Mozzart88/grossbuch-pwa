import { beforeEach, describe, expect, it, vi } from 'vitest'
import { execSQL, queryOne } from '../../../../services/database/connection'
import { importSyncPackage } from '../../../../services/sync/syncImport'
import type { SyncPackage } from '../../../../services/sync/syncTypes'

vi.mock('../../../../services/database/connection', () => ({
  execSQL: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../../../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)

const recurringPlan = {
  id: '0102030405060708',
  schedule: '{"frequency":"weekly","interval":1,"weekdays":[5]}',
  transaction_draft: '{"timestamp":1,"lines":[]}',
  mode: 'expense',
  start_date: '2026-05-01',
  next_due_date: '2026-05-08',
  until_policy: '{"type":"never"}',
  occurrence_count: 0,
  status: 'active',
  created_at: 1,
  updated_at: 5,
}

const recurringOccurrence = {
  id: '1112131415161718',
  plan_id: recurringPlan.id,
  due_date: '2026-05-08',
  notification_id: '2122232425262728',
  created_at: 1,
  updated_at: 5,
}

const recurringBudget = {
  budget_id: '3132333435363738',
  plan_id: recurringPlan.id,
  due_month: '2026-05',
  updated_at: 5,
}

function packageWith(overrides: Partial<SyncPackage>): SyncPackage {
  return {
    version: 2,
    sender_id: 'sender',
    created_at: 1,
    since: 0,
    icons: [],
    tags: [],
    wallets: [],
    accounts: [],
    counterparties: [],
    currencies: [],
    transactions: [],
    budgets: [],
    notifications: [],
    recurringPlans: [],
    recurringOccurrences: [],
    recurringBudgets: [],
    deletions: [],
    ...overrides,
  }
}

describe('syncImport recurring entities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('imports new recurring plans, occurrences, and budget links', async () => {
    mockQueryOne.mockResolvedValue(null)

    const result = await importSyncPackage(packageWith({
      recurringPlans: [recurringPlan],
      recurringOccurrences: [recurringOccurrence],
      recurringBudgets: [recurringBudget],
    }))

    expect(result.errors).toEqual([])
    expect(result.imported.recurringPlans).toBe(1)
    expect(result.imported.recurringOccurrences).toBe(1)
    expect(result.imported.recurringBudgets).toBe(1)
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO recurring_plan'),
      expect.arrayContaining([expect.any(Uint8Array), recurringPlan.schedule, recurringPlan.transaction_draft])
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO recurring_occurrence'),
      expect.arrayContaining([expect.any(Uint8Array), expect.any(Uint8Array), recurringOccurrence.due_date, expect.any(Uint8Array)])
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO recurring_budget'),
      expect.arrayContaining([expect.any(Uint8Array), expect.any(Uint8Array), recurringBudget.due_month])
    )
  })

  it('updates older recurring entities and applies recurring deletions', async () => {
    mockQueryOne.mockResolvedValue({ updated_at: 1 })

    const result = await importSyncPackage(packageWith({
      recurringPlans: [recurringPlan],
      recurringOccurrences: [{ ...recurringOccurrence, notification_id: null }],
      recurringBudgets: [recurringBudget],
      deletions: [
        { entity: 'recurring_plan', entity_id: recurringPlan.id, deleted_at: 9 },
        { entity: 'recurring_occurrence', entity_id: recurringOccurrence.id, deleted_at: 9 },
      ],
    }))

    expect(result.errors).toEqual([])
    expect(result.imported.recurringPlans).toBe(1)
    expect(result.imported.recurringOccurrences).toBe(1)
    expect(result.imported.recurringBudgets).toBe(1)
    expect(result.imported.deletions).toBe(2)
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE recurring_plan'),
      expect.arrayContaining([recurringPlan.schedule, recurringPlan.transaction_draft, recurringPlan.mode])
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE recurring_occurrence'),
      expect.arrayContaining([expect.any(Uint8Array), recurringOccurrence.due_date, null])
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE recurring_budget'),
      expect.arrayContaining([expect.any(Uint8Array), recurringBudget.due_month, recurringBudget.updated_at])
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      `DELETE FROM recurring_plan WHERE hex(id) = ?`,
      [recurringPlan.id]
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      `DELETE FROM recurring_occurrence WHERE hex(id) = ?`,
      [recurringOccurrence.id]
    )
  })
})
