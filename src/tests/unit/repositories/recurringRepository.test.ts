import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SYSTEM_TAGS, type RecurringPlanInput, type TransactionInput } from '../../../types'

vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../../../services/repositories/notificationRepository', () => ({
  notificationRepository: {
    createTransactionDraft: vi.fn(),
  },
}))

vi.mock('../../../services/repositories/transactionRepository', () => ({
  transactionRepository: {
    create: vi.fn(),
  },
}))

vi.mock('../../../services/repositories/currencyRepository', () => ({
  currencyRepository: {
    getSystemRateInfo: vi.fn().mockResolvedValue({ rate: 1, currencyId: 1 }),
  },
}))

vi.mock('../../../services/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: vi.fn(),
  },
}))

vi.mock('../../../services/exchangeRate/historicalRateService', () => ({
  getRateForDate: vi.fn(),
}))

import { execSQL, queryOne, querySQL } from '../../../services/database'
import { currencyRepository } from '../../../services/repositories/currencyRepository'
import { notificationRepository } from '../../../services/repositories/notificationRepository'
import { recurringRepository } from '../../../services/repositories/recurringRepository'
import { transactionRepository } from '../../../services/repositories/transactionRepository'
import { settingsRepository } from '../../../services/repositories/settingsRepository'
import { getRateForDate } from '../../../services/exchangeRate/historicalRateService'

const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)
const mockQuerySQL = vi.mocked(querySQL)
const mockCurrencyRepository = vi.mocked(currencyRepository)
const mockNotificationRepository = vi.mocked(notificationRepository)
const mockTransactionRepository = vi.mocked(transactionRepository)
const mockSettingsRepository = vi.mocked(settingsRepository)
const mockGetRateForDate = vi.mocked(getRateForDate)

const planId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
const notificationId = new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1])

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: planId,
    schedule: JSON.stringify({ frequency: 'weekly', interval: 1, weekdays: [5] }),
    transaction_draft: JSON.stringify({
      timestamp: Math.floor(new Date('2026-05-08T09:30:00').getTime() / 1000),
      lines: [{
        account_id: 2,
        tag_id: 12,
        sign: '-',
        amount_int: 7,
        amount_frac: 0,
        rate_int: 1,
        rate_frac: 0,
      }],
    }),
    mode: 'expense',
    start_date: '2026-05-08',
    next_due_date: '2026-05-15',
    until_policy: JSON.stringify({ type: 'count', count: 3 }),
    occurrence_count: 1,
    status: 'active',
    payment_pin: null,
    notify_days_before: null,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  }
}

describe('recurringRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuerySQL.mockResolvedValue([])
    mockCurrencyRepository.getSystemRateInfo.mockResolvedValue({ rate: 1, currencyId: 1 })
    mockSettingsRepository.get.mockResolvedValue(null)
    mockNotificationRepository.createTransactionDraft.mockResolvedValue({
      id: notificationId,
      title: 'Recurring expense due 2026-05-15',
      type: 'transaction',
      payload: {},
      created_at: 1,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('serializes transaction drafts that contain bigint values', async () => {
    const id = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    let storedSchedule = ''
    let storedDraft = ''
    let storedUntil = ''

    mockExecSQL.mockImplementation(async (sql, params = []) => {
      if (sql.includes('INSERT INTO recurring_plan')) {
        storedSchedule = params[0] as string
        storedDraft = params[1] as string
        storedUntil = params[5] as string
      }
    })

    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('ORDER BY rowid DESC')) return { id }
      if (sql.includes('SELECT * FROM recurring_plan')) {
        return {
          id,
          schedule: storedSchedule,
          transaction_draft: storedDraft,
          mode: 'expense',
          start_date: '2026-05-15',
          next_due_date: '2026-05-15',
          until_policy: storedUntil,
          occurrence_count: 0,
          status: 'active',
          payment_pin: null,
          notify_days_before: null,
          created_at: 1,
          updated_at: 1,
        }
      }
      return null
    })

    const draft = {
      timestamp: 1778803200n,
      lines: [{
        account_id: 1,
        tag_id: SYSTEM_TAGS.TRANSFER,
        sign: '-',
        amount_int: 12n,
        amount_frac: 345000000000000000n,
        rate_int: 1n,
        rate_frac: 0n,
      }],
    } as unknown as TransactionInput

    const input: RecurringPlanInput = {
      schedule: { frequency: 'daily', interval: 1 },
      transaction_draft: draft,
      mode: 'expense',
      start_date: '2026-05-15',
      until_policy: { type: 'never' },
    }

    await expect(recurringRepository.createPlanFromTransaction(input)).resolves.toBeTruthy()

    const parsed = JSON.parse(storedDraft) as TransactionInput
    expect(parsed.timestamp).toBe(1778803200)
    expect(parsed.lines[0].amount_int).toBe(12)
    expect(parsed.lines[0].amount_frac).toBe(345000000000000000)
    expect(typeof parsed.lines[0].amount_int).toBe('number')
  })

  it('rejects creating, updating, and pre-transacting recurring plans with mode transfer or exchange', async () => {
    const draft = JSON.parse(planRow().transaction_draft) as TransactionInput

    await expect(recurringRepository.create({
      schedule: { frequency: 'daily', interval: 1 },
      transaction_draft: draft,
      mode: 'transfer',
      start_date: '2026-05-01',
      until_policy: { type: 'never' },
    })).rejects.toThrow('Recurring plans are only supported for expense and income transactions')

    mockQueryOne.mockImplementation(async (sql) => sql.includes('SELECT * FROM recurring_plan') ? planRow() : null)
    await expect(recurringRepository.update(planId, { mode: 'exchange' })).rejects.toThrow(
      'Recurring plans are only supported for expense and income transactions'
    )

    await expect(recurringRepository.createPlanFromTransaction({
      schedule: { frequency: 'daily', interval: 1 },
      transaction_draft: draft,
      mode: 'transfer',
      start_date: '2026-05-01',
      until_policy: { type: 'never' },
    }, 'add-now')).rejects.toThrow('Recurring plans are only supported for expense and income transactions')
    expect(mockTransactionRepository.create).not.toHaveBeenCalled()
  })

  it('projects recurring budgets in display currency and includes already-added current-month occurrences', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16T12:00:00'))

    const planId = new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1])
    const budgetId = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1])
    let storedSchedule = ''
    let storedDraft = ''
    let storedUntil = ''
    let storedOccurrenceCount = 0
    const budgetInserts: unknown[][] = []

    mockExecSQL.mockImplementation(async (sql, params = []) => {
      if (sql.includes('INSERT INTO recurring_plan')) {
        storedSchedule = params[0] as string
        storedDraft = params[1] as string
        storedUntil = params[5] as string
        storedOccurrenceCount = params[6] as number
      }
      if (sql.includes('INSERT INTO budget')) {
        budgetInserts.push(params)
      }
    })

    mockQueryOne.mockImplementation(async (sql, params = []) => {
      if (sql.includes('SELECT id FROM recurring_plan')) return { id: planId }
      if (sql.includes('SELECT * FROM recurring_plan')) {
        return {
          id: planId,
          schedule: storedSchedule,
          transaction_draft: storedDraft,
          mode: 'expense',
          start_date: '2026-05-08',
          next_due_date: '2026-05-15',
          until_policy: storedUntil,
          occurrence_count: storedOccurrenceCount,
          status: 'active',
          payment_pin: null,
          notify_days_before: null,
          created_at: 1,
          updated_at: 1,
        }
      }
      if (sql.includes('SELECT currency_id FROM account')) {
        expect(params).toEqual([2])
        return { currency_id: 2 }
      }
      if (sql.includes('SELECT id FROM budget')) return { id: budgetId }
      return null
    })

    await recurringRepository.create({
      schedule: { frequency: 'weekly', interval: 1, weekdays: [5] },
      transaction_draft: {
        timestamp: Math.floor(new Date('2026-05-08T12:00:00').getTime() / 1000),
        lines: [{
          account_id: 2,
          tag_id: 12,
          sign: '-',
          amount_int: 7000,
          amount_frac: 0,
          rate_int: 1000,
          rate_frac: 0,
        }],
      },
      mode: 'expense',
      start_date: '2026-05-08',
      until_policy: { type: 'count', count: 3 },
      occurrence_count: 1,
    })

    expect(JSON.parse(storedDraft).lines[0]).toEqual(expect.objectContaining({
      amount_int: 7000,
      amount_frac: 0,
      rate_int: 1000,
      rate_frac: 0,
    }))
    expect(mockCurrencyRepository.getSystemRateInfo).toHaveBeenCalled()
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('SELECT currency_id FROM account'),
      [2]
    )
    expect(budgetInserts).toHaveLength(1)
    expect(budgetInserts[0]).toEqual(expect.arrayContaining([12, 'expense', 21, 0]))
  })

  it('calculates next due dates for daily, weekly, monthly, and yearly schedules', () => {
    expect(recurringRepository.getNextDueDate(
      { frequency: 'daily', interval: 2 },
      '2026-05-01',
      '2026-05-01'
    )).toBe('2026-05-03')

    expect(recurringRepository.getNextDueDate(
      { frequency: 'weekly', interval: 2, weekdays: [1, 5] },
      '2026-05-08',
      '2026-05-01'
    )).toBe('2026-05-15')

    expect(recurringRepository.getNextDueDate(
      { frequency: 'monthly', interval: 1, monthDays: [31] },
      '2026-01-31',
      '2026-01-31'
    )).toBe('2026-02-28')

    expect(recurringRepository.getNextDueDate(
      { frequency: 'yearly', interval: 1, months: [2, 10], monthDays: [2, 10] },
      '2026-02-10',
      '2026-02-02'
    )).toBe('2026-10-02')

    expect(recurringRepository.getNextDueDate(
      { frequency: 'weekly', interval: 1 },
      '2026-05-01',
      '2026-05-01'
    )).toBe('2026-05-08')

    expect(recurringRepository.getNextDueDate(
      { frequency: 'monthly', interval: 2 },
      '2026-05-01',
      '2026-05-31'
    )).toBe('2026-05-31')

    expect(recurringRepository.getNextDueDate(
      { frequency: 'yearly', interval: 2 },
      '2026-05-01',
      '2026-05-31'
    )).toBe('2026-05-31')

    expect(recurringRepository.getNextDueDate(
      { frequency: 'daily', interval: 10000 },
      '2026-05-01',
      '2026-05-01'
    )).toBeNull()

    expect(recurringRepository.toHex({ id: planId })).toBe('0102030405060708')
  })

  it('returns first due dates according to until policies', () => {
    expect(recurringRepository.getFirstDueDate(
      { frequency: 'monthly', interval: 1, monthDays: [31, 32, -1] },
      '2026-02-01',
      { type: 'never' }
    )).toBe('2026-02-28')

    expect(recurringRepository.getFirstDueDate(
      { frequency: 'daily', interval: 1 },
      '2026-05-15',
      { type: 'date', date: '2026-05-14' }
    )).toBeNull()

    expect(recurringRepository.getFirstDueDate(
      { frequency: 'daily', interval: 1 },
      '2026-05-15',
      { type: 'count', count: 0 }
    )).toBeNull()
  })

  it('finds and maps recurring plans, including a payment pin when present', async () => {
    mockQuerySQL.mockResolvedValue([
      planRow({
        schedule: JSON.stringify({ frequency: 'yearly', interval: 0, months: [10, 2, 20], monthDays: [31, 2] }),
        until_policy: JSON.stringify({ type: 'never' }),
        payment_pin: JSON.stringify({ currency_id: 2, amount_int: 100, amount_frac: 0 }),
        notify_days_before: 5,
      }),
    ])

    const plans = await recurringRepository.findAll()

    expect(plans[0].schedule).toEqual({
      frequency: 'yearly',
      interval: 1,
      months: [2, 10],
      monthDays: [2, 31],
    })
    expect(plans[0].payment_pin).toEqual({ currency_id: 2, amount_int: 100, amount_frac: 0 })
    expect(plans[0].notify_days_before).toBe(5)
  })

  it('maps a plan without a payment pin to null', async () => {
    mockQuerySQL.mockResolvedValue([planRow()])

    const plans = await recurringRepository.findAll()

    expect(plans[0].payment_pin).toBeNull()
  })

  it('updates, pauses, resumes, and deletes plans', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16T12:00:00'))
    mockQueryOne.mockImplementation(async (sql, params = []) => {
      if (sql.includes('SELECT * FROM recurring_plan')) {
        return planRow({
          id: params[0] as Uint8Array,
          schedule: JSON.stringify({ frequency: 'daily', interval: 1 }),
          until_policy: JSON.stringify({ type: 'never' }),
        })
      }
      return null
    })

    await recurringRepository.update(planId, {
      schedule: { frequency: 'weekly', interval: 2, weekdays: [1, 5] },
      until_policy: { type: 'date', date: '2026-06-30' },
      status: 'paused',
    })
    await recurringRepository.pause(planId)
    await recurringRepository.resume(planId)
    await recurringRepository.delete(planId)

    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE recurring_plan'),
      expect.arrayContaining(['paused', planId])
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      `UPDATE recurring_plan SET status = 'paused' WHERE id = ?`,
      [planId]
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      `UPDATE recurring_plan SET status = 'active', next_due_date = ? WHERE id = ?`,
      ['2026-05-16', planId]
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM budget'),
      [planId]
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      `DELETE FROM recurring_plan WHERE id = ?`,
      [planId]
    )
  })

  it('updating repetitions only (schedule/until/notify_days_before) leaves an existing payment pin untouched, and can explicitly clear it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16T12:00:00'))
    const existing = planRow({
      schedule: JSON.stringify({ frequency: 'daily', interval: 1 }),
      until_policy: JSON.stringify({ type: 'never' }),
      payment_pin: JSON.stringify({ currency_id: 2, amount_int: 50, amount_frac: 0 }),
    })
    mockQueryOne.mockImplementation(async (sql) => sql.includes('SELECT * FROM recurring_plan') ? existing : null)

    await recurringRepository.update(planId, { notify_days_before: 4 })

    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE recurring_plan'),
      expect.arrayContaining([JSON.stringify({ currency_id: 2, amount_int: 50, amount_frac: 0 }), 4, planId])
    )

    mockExecSQL.mockClear()
    await recurringRepository.update(planId, { payment_pin: null })

    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE recurring_plan'),
      expect.arrayContaining([null])
    )
  })

  it('creates the first real transaction for add-now plans and schedules the next due date', async () => {
    let loadedPlan = planRow({ next_due_date: '2026-05-08', occurrence_count: 1 })
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM recurring_plan')) return { id: planId }
      if (sql.includes('SELECT * FROM recurring_plan')) return loadedPlan
      return null
    })
    mockExecSQL.mockImplementation(async (sql, params = []) => {
      if (sql.includes('UPDATE recurring_plan SET next_due_date')) {
        loadedPlan = planRow({ next_due_date: params[0] as string, occurrence_count: 1 })
      }
    })

    const plan = await recurringRepository.createPlanFromTransaction({
      schedule: { frequency: 'weekly', interval: 1, weekdays: [5] },
      transaction_draft: JSON.parse(planRow().transaction_draft) as TransactionInput,
      mode: 'expense',
      start_date: '2026-05-08',
      until_policy: { type: 'count', count: 3 },
    }, 'add-now')

    expect(mockTransactionRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      timestamp: Math.floor(new Date('2026-05-08T09:30:00').getTime() / 1000),
    }))
    expect(mockExecSQL).toHaveBeenCalledWith(
      `UPDATE recurring_plan SET next_due_date = ? WHERE id = ?`,
      ['2026-05-15', planId]
    )
    expect(plan.next_due_date).toBe('2026-05-15')
  })

  it('processes due plans into hydrated transaction draft notifications without duplicating existing occurrences', async () => {
    let currentRow = planRow({ next_due_date: '2026-05-01', occurrence_count: 0 })
    mockQuerySQL.mockResolvedValue([currentRow])
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM recurring_occurrence')) return null
      if (sql.includes('SELECT * FROM recurring_plan')) return currentRow
      return null
    })
    mockExecSQL.mockImplementation(async (sql, params = []) => {
      if (sql.includes('UPDATE recurring_plan SET occurrence_count')) {
        currentRow = planRow({
          occurrence_count: params[0] as number,
          next_due_date: params[1] as string | null,
        })
      }
    })

    const created = await recurringRepository.processDue('2026-05-20', 2)

    expect(created).toBe(2)
    expect(mockNotificationRepository.createTransactionDraft).toHaveBeenCalledTimes(2)
    expect(mockNotificationRepository.createTransactionDraft).toHaveBeenCalledWith(
      'You have upcoming payment transaction in 0 days',
      'expense',
      expect.objectContaining({
        timestamp: Math.floor(new Date('2026-05-01T09:30:00').getTime() / 1000),
      }),
      Math.floor(new Date('2026-05-01T00:00:00').getTime() / 1000)
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO recurring_occurrence'),
      [planId, '2026-05-01', notificationId]
    )
  })

  it('advances due plans when an occurrence already exists', async () => {
    let currentRow = planRow({ next_due_date: '2026-05-15', occurrence_count: 2 })
    mockQuerySQL.mockResolvedValue([currentRow])
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM recurring_occurrence')) return { id: notificationId }
      if (sql.includes('SELECT * FROM recurring_plan')) return currentRow
      return null
    })
    mockExecSQL.mockImplementation(async (sql, params = []) => {
      if (sql.includes('UPDATE recurring_plan SET occurrence_count')) {
        currentRow = planRow({
          occurrence_count: params[0] as number,
          next_due_date: params[1] as string | null,
        })
      }
    })

    const created = await recurringRepository.processDue('2026-05-20')

    expect(created).toBe(0)
    expect(mockNotificationRepository.createTransactionDraft).not.toHaveBeenCalled()
    expect(mockExecSQL).toHaveBeenCalledWith(
      `UPDATE recurring_plan SET occurrence_count = ?, next_due_date = ? WHERE id = ?`,
      [3, null, planId]
    )
  })

  it('surfaces an occurrence lead-days ahead of its due date while the occurrence keeps the real due date', async () => {
    const row = planRow({ next_due_date: '2026-05-15', occurrence_count: 0, notify_days_before: 3 })
    mockQuerySQL.mockResolvedValue([row])
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM recurring_occurrence')) return null
      if (sql.includes('SELECT * FROM recurring_plan')) return row
      return null
    })

    const tooEarly = await recurringRepository.processDue('2026-05-11', 1)
    expect(tooEarly).toBe(0)
    expect(mockNotificationRepository.createTransactionDraft).not.toHaveBeenCalled()

    const created = await recurringRepository.processDue('2026-05-12', 1)
    expect(created).toBe(1)
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO recurring_occurrence'),
      [planId, '2026-05-15', notificationId]
    )
  })

  it('falls back to the app-wide default lead time when a plan has none, and to zero when that is also unset', async () => {
    const row = planRow({ next_due_date: '2026-05-15', occurrence_count: 0, notify_days_before: null })
    mockQuerySQL.mockResolvedValue([row])
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM recurring_occurrence')) return null
      if (sql.includes('SELECT * FROM recurring_plan')) return row
      return null
    })

    mockSettingsRepository.get.mockResolvedValueOnce(null)
    const withNoDefault = await recurringRepository.processDue('2026-05-13', 1)
    expect(withNoDefault).toBe(0)

    mockSettingsRepository.get.mockResolvedValueOnce('2')
    const withDefault = await recurringRepository.processDue('2026-05-13', 1)
    expect(withDefault).toBe(1)
  })

  it('keeps the pinned account-currency amount fixed regardless of exchange-rate movement between creation and due date', async () => {
    const sourceAccountId = 2
    const targetAccountId = 3
    const row = planRow({
      next_due_date: '2026-06-01',
      occurrence_count: 0,
      payment_pin: JSON.stringify({ currency_id: 1, amount_int: 100, amount_frac: 0 }),
      transaction_draft: JSON.stringify({
        timestamp: Math.floor(new Date('2026-01-01T09:00:00').getTime() / 1000),
        lines: [
          { account_id: sourceAccountId, tag_id: SYSTEM_TAGS.EXCHANGE, sign: '-', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 },
          { account_id: targetAccountId, tag_id: SYSTEM_TAGS.EXCHANGE, sign: '+', amount_int: 90, amount_frac: 0, rate_int: 1, rate_frac: 0 },
          { account_id: targetAccountId, tag_id: 12, sign: '-', amount_int: 90, amount_frac: 0, rate_int: 1, rate_frac: 0 },
        ],
      }),
    })

    mockQuerySQL.mockResolvedValue([row])
    mockQueryOne.mockImplementation(async (sql, params = []) => {
      if (sql.includes('SELECT id FROM recurring_occurrence')) return null
      if (sql.includes('SELECT * FROM recurring_plan')) return row
      if (sql.includes('SELECT currency_id FROM account')) {
        return { currency_id: params[0] === sourceAccountId ? 1 : 2 }
      }
      return null
    })
    // Rate for currency 1 (the pinned account currency) swings wildly by the due date —
    // the pinned line must ignore it entirely and stay at the fixed amount.
    mockGetRateForDate.mockImplementation(async (currencyId: number) => (
      currencyId === 1 ? { int: 5, frac: 0 } : { int: 1, frac: 0 }
    ))

    await recurringRepository.processDue('2026-06-01', 1)

    const draft = mockNotificationRepository.createTransactionDraft.mock.calls[0][2] as TransactionInput
    const pinnedLine = draft.lines.find(l => l.account_id === sourceAccountId)!
    expect(pinnedLine.amount_int).toBe(100)
    expect(pinnedLine.amount_frac).toBe(0)
  })

  it('derives the payment-currency amount from a live rate at the due date, not the frozen creation-time rate', async () => {
    const sourceAccountId = 2
    const targetAccountId = 3
    const row = planRow({
      next_due_date: '2026-06-01',
      occurrence_count: 0,
      payment_pin: JSON.stringify({ currency_id: 2, amount_int: 100, amount_frac: 0 }),
      transaction_draft: JSON.stringify({
        timestamp: Math.floor(new Date('2026-01-01T09:00:00').getTime() / 1000),
        lines: [
          { account_id: sourceAccountId, tag_id: SYSTEM_TAGS.EXCHANGE, sign: '-', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 },
          { account_id: targetAccountId, tag_id: SYSTEM_TAGS.EXCHANGE, sign: '+', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 },
          { account_id: targetAccountId, tag_id: 12, sign: '-', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 },
        ],
      }),
    })

    mockQuerySQL.mockResolvedValue([row])
    mockQueryOne.mockImplementation(async (sql, params = []) => {
      if (sql.includes('SELECT id FROM recurring_occurrence')) return null
      if (sql.includes('SELECT * FROM recurring_plan')) return row
      if (sql.includes('SELECT currency_id FROM account')) {
        return { currency_id: params[0] === sourceAccountId ? 1 : 2 }
      }
      return null
    })
    // Currency 1 (account currency, the derived side) moves from 1 at creation time to 2 by the due date.
    mockGetRateForDate.mockImplementation(async (currencyId: number) => (
      currencyId === 1 ? { int: 2, frac: 0 } : { int: 1, frac: 0 }
    ))

    await recurringRepository.processDue('2026-06-01', 1)

    const draft = mockNotificationRepository.createTransactionDraft.mock.calls[0][2] as TransactionInput
    const pinnedLine = draft.lines.find(l => l.account_id === targetAccountId && l.tag_id === SYSTEM_TAGS.EXCHANGE)!
    const derivedLine = draft.lines.find(l => l.account_id === sourceAccountId)!
    expect(pinnedLine.amount_int).toBe(100)
    expect(derivedLine.amount_int).toBe(200)
  })

  it('normalizes BigInt rate fields from a live rate lookup before building the notification draft (regression: sqlite-wasm can return BigInt for INTEGER columns)', async () => {
    const sourceAccountId = 2
    const targetAccountId = 3
    const row = planRow({
      next_due_date: '2026-06-01',
      occurrence_count: 0,
      payment_pin: JSON.stringify({ currency_id: 2, amount_int: 100, amount_frac: 0 }),
      transaction_draft: JSON.stringify({
        timestamp: Math.floor(new Date('2026-01-01T09:00:00').getTime() / 1000),
        lines: [
          { account_id: sourceAccountId, tag_id: SYSTEM_TAGS.EXCHANGE, sign: '-', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 },
          { account_id: targetAccountId, tag_id: SYSTEM_TAGS.EXCHANGE, sign: '+', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 },
        ],
      }),
    })

    mockQuerySQL.mockResolvedValue([row])
    mockQueryOne.mockImplementation(async (sql, params = []) => {
      if (sql.includes('SELECT id FROM recurring_occurrence')) return null
      if (sql.includes('SELECT * FROM recurring_plan')) return row
      if (sql.includes('SELECT currency_id FROM account')) {
        return { currency_id: params[0] === sourceAccountId ? 1 : 2 }
      }
      return null
    })
    // Simulates sqlite-wasm returning BigInt for an INTEGER column value that
    // exceeds Number.MAX_SAFE_INTEGER — routine for `rate_frac`, which is
    // scaled by 10^18 (FRAC_SCALE) and so is BigInt for almost any nonzero
    // fraction, while `rate_int` (whole units) typically stays a safe number.
    mockGetRateForDate.mockResolvedValue({ int: 2, frac: 500000000000000000n } as unknown as { int: number; frac: number })

    await expect(recurringRepository.processDue('2026-06-01', 1)).resolves.toBe(1)

    const draft = mockNotificationRepository.createTransactionDraft.mock.calls[0][2] as TransactionInput
    expect(() => JSON.stringify(draft)).not.toThrow()
    for (const line of draft.lines) {
      expect(typeof line.rate_int).toBe('number')
      expect(typeof line.rate_frac).toBe('number')
    }
  })

  it('builds the upcoming-payment notification title with counterparty, category, days remaining, and wallet:currency', async () => {
    const draft = {
      counterparty_id: 77,
      timestamp: Math.floor(new Date('2026-05-18T09:00:00').getTime() / 1000),
      lines: [{ account_id: 2, tag_id: 12, sign: '-', amount_int: 7, amount_frac: 0, rate_int: 1, rate_frac: 0 }],
    }
    const row = planRow({ next_due_date: '2026-05-18', occurrence_count: 0, notify_days_before: 3, transaction_draft: JSON.stringify(draft) })

    mockQuerySQL.mockResolvedValue([row])
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM recurring_occurrence')) return null
      if (sql.includes('SELECT * FROM recurring_plan')) return row
      if (sql.includes('SELECT name FROM tag WHERE id')) return { name: 'Rent' }
      if (sql.includes('SELECT wallet_id, currency_id FROM account')) return { wallet_id: 5, currency_id: 9 }
      if (sql.includes('SELECT name FROM wallet')) return { name: 'Checking' }
      if (sql.includes('SELECT code, symbol, decimal_places FROM currency')) return { code: 'USD', symbol: '$', decimal_places: 2 }
      if (sql.includes('SELECT name FROM counterparty')) return { name: 'Landlord' }
      return null
    })

    await recurringRepository.processDue('2026-05-15', 1)

    expect(mockNotificationRepository.createTransactionDraft).toHaveBeenCalledWith(
      'You have upcoming payment to Landlord Rent in 3 days from Checking:USD',
      'expense',
      expect.anything(),
      expect.any(Number)
    )
  })

  it('omits the counterparty segment when the plan has no counterparty, showing same-day due as 0 days', async () => {
    const draft = {
      timestamp: Math.floor(new Date('2026-05-15T09:00:00').getTime() / 1000),
      lines: [{ account_id: 2, tag_id: 12, sign: '-', amount_int: 7, amount_frac: 0, rate_int: 1, rate_frac: 0 }],
    }
    const row = planRow({ next_due_date: '2026-05-15', occurrence_count: 0, notify_days_before: 0, transaction_draft: JSON.stringify(draft) })

    mockQuerySQL.mockResolvedValue([row])
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM recurring_occurrence')) return null
      if (sql.includes('SELECT * FROM recurring_plan')) return row
      if (sql.includes('SELECT name FROM tag WHERE id')) return { name: 'Groceries' }
      if (sql.includes('SELECT wallet_id, currency_id FROM account')) return { wallet_id: 5, currency_id: 9 }
      if (sql.includes('SELECT name FROM wallet')) return { name: 'Checking' }
      if (sql.includes('SELECT code, symbol, decimal_places FROM currency')) return { code: 'USD', symbol: '$', decimal_places: 2 }
      return null
    })

    await recurringRepository.processDue('2026-05-15', 1)

    expect(mockNotificationRepository.createTransactionDraft).toHaveBeenCalledWith(
      'You have upcoming payment Groceries in 0 days from Checking:USD',
      'expense',
      expect.anything(),
      expect.any(Number)
    )
  })

  it('hydrates a draft against current tag/account/wallet/currency/counterparty data', async () => {
    mockQueryOne.mockImplementation(async (sql, params = []) => {
      if (sql.includes('SELECT name FROM tag WHERE id')) return { name: 'Rent' }
      if (sql.includes('SELECT wallet_id, currency_id FROM account')) return { wallet_id: 5, currency_id: 9 }
      if (sql.includes('SELECT name FROM wallet')) return { name: 'Checking' }
      if (sql.includes('SELECT code, symbol, decimal_places FROM currency')) return { code: 'USD', symbol: '$', decimal_places: 2 }
      if (sql.includes('SELECT name FROM counterparty')) { expect(params).toEqual([77]); return { name: 'Landlord' } }
      return null
    })

    const hydration = await recurringRepository.hydrateDraft({
      counterparty_id: 77,
      timestamp: 1,
      lines: [{ account_id: 2, tag_id: 12, sign: '-', amount_int: 7, amount_frac: 500000000000000000, rate_int: 1, rate_frac: 0 }],
    })

    expect(hydration).toEqual({
      categoryName: 'Rent',
      counterpartyName: 'Landlord',
      walletName: 'Checking',
      currencyCode: 'USD',
      currencySymbol: '$',
      decimalPlaces: 2,
      amount: 7.5,
    })
  })

  it('hydrates a draft with no counterparty and unresolved account to nulls', async () => {
    mockQueryOne.mockResolvedValue(null)

    const hydration = await recurringRepository.hydrateDraft({
      timestamp: 1,
      lines: [],
    })

    expect(hydration).toEqual({
      categoryName: null,
      counterpartyName: null,
      walletName: null,
      currencyCode: null,
      currencySymbol: null,
      decimalPlaces: 2,
      amount: 0,
    })
  })

  it('syncs generated budget edits back into matching recurring draft lines', async () => {
    const budgetId = new Uint8Array([3, 3, 3, 3, 3, 3, 3, 3])
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('FROM recurring_budget')) return { plan_id: planId, tag_id: 12, type: 'expense' }
      if (sql.includes('SELECT * FROM recurring_plan')) return planRow({
        transaction_draft: JSON.stringify({
          timestamp: 1,
          lines: [
            { account_id: 1, tag_id: 12, sign: '-', amount_int: 7, amount_frac: 0, rate_int: 1, rate_frac: 0 },
            { account_id: 1, tag_id: 12, sign: '+', amount_int: 9, amount_frac: 0, rate_int: 1, rate_frac: 0 },
          ],
        }),
      })
      return null
    })

    await recurringRepository.syncDraftFromBudget(budgetId, 11, 500)

    const update = mockExecSQL.mock.calls.find(([sql]) => String(sql).includes('SET transaction_draft'))
    expect(update).toBeTruthy()
    const draft = JSON.parse(update?.[1]?.[0] as string) as TransactionInput
    expect(draft.lines[0]).toEqual(expect.objectContaining({ amount_int: 11, amount_frac: 500 }))
    expect(draft.lines[1]).toEqual(expect.objectContaining({ amount_int: 9, amount_frac: 0 }))
  })

  it('handles repository not-found paths without side effects', async () => {
    mockQueryOne.mockResolvedValue(null)

    await expect(recurringRepository.update(planId, {})).rejects.toThrow('Recurring plan not found')
    await expect(recurringRepository.create({
      schedule: { frequency: 'daily', interval: 1 },
      transaction_draft: JSON.parse(planRow().transaction_draft) as TransactionInput,
      mode: 'expense',
      start_date: '2026-05-01',
      until_policy: { type: 'never' },
    })).rejects.toThrow('Failed to create recurring plan')
    await expect(recurringRepository.findByHexId('0102030405060708')).resolves.toBeNull()
    await expect(recurringRepository.resume(planId)).resolves.toBeUndefined()
    await expect(recurringRepository.syncDraftFromBudget(planId, 10, 0)).resolves.toBeUndefined()
  })

  it('reports create and update reload failures', async () => {
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM recurring_plan')) return { id: planId }
      return null
    })

    await expect(recurringRepository.create({
      schedule: { frequency: 'daily', interval: 1 },
      transaction_draft: JSON.parse(planRow().transaction_draft) as TransactionInput,
      mode: 'expense',
      start_date: '2026-05-01',
      until_policy: { type: 'never' },
    })).rejects.toThrow('Failed to load recurring plan')

    mockQueryOne.mockImplementationOnce(async () => planRow())
      .mockImplementationOnce(async () => null)

    await expect(recurringRepository.update(planId, {
      schedule: { frequency: 'daily', interval: 1 },
    })).rejects.toThrow('Failed to load recurring plan')
  })

  it('skips budget projection for deleted plans', async () => {
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM recurring_plan')) return { id: planId }
      if (sql.includes('SELECT * FROM recurring_plan')) return planRow({
        status: 'deleted',
        until_policy: JSON.stringify({ type: 'date', date: '2026-06-30' }),
      })
      return null
    })

    const plan = await recurringRepository.create({
      schedule: { frequency: 'daily', interval: 1 },
      transaction_draft: JSON.parse(planRow().transaction_draft) as TransactionInput,
      mode: 'expense',
      start_date: '2026-05-01',
      until_policy: { type: 'date', date: '2026-06-30' },
      status: 'deleted',
    })

    expect(plan.status).toBe('deleted')
    expect(mockExecSQL).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO budget'),
      expect.anything()
    )
  })

  it('projects income with tag context and fractional carry in system currency', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16T12:00:00'))
    const budgetId = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9])
    const budgetInserts: unknown[][] = []

    mockQueryOne.mockImplementation(async (sql, params = []) => {
      if (sql.includes('SELECT id FROM recurring_plan')) return { id: planId }
      if (sql.includes('SELECT * FROM recurring_plan')) return planRow({
        schedule: JSON.stringify({ frequency: 'daily', interval: 1 }),
        transaction_draft: JSON.stringify({
          timestamp: 1,
          lines: [{
            account_id: 1,
            tag_id: 44,
            tag_context_id: 55,
            sign: '+',
            amount_int: 0,
            amount_frac: 900000000000000000,
            rate_int: 1,
            rate_frac: 0,
          }],
        }),
        start_date: '2026-05-16',
        until_policy: JSON.stringify({ type: 'count', count: 2 }),
      })
      if (sql.includes('SELECT currency_id FROM account')) return { currency_id: 1 }
      if (sql.includes('SELECT id FROM budget')) return { id: budgetId }
      return null
    })
    mockExecSQL.mockImplementation(async (sql, params = []) => {
      if (sql.includes('INSERT INTO budget')) budgetInserts.push(params)
    })

    await recurringRepository.create({
      schedule: { frequency: 'daily', interval: 1 },
      transaction_draft: {
        timestamp: 1,
        lines: [{
          account_id: 1,
          tag_id: 44,
          tag_context_id: 55,
          sign: '+',
          amount_int: 0,
          amount_frac: 900000000000000000,
          rate_int: 1,
          rate_frac: 0,
        }],
      },
      mode: 'income',
      start_date: '2026-05-16',
      until_policy: { type: 'count', count: 2 },
    })

    expect(budgetInserts[0]).toEqual(expect.arrayContaining([44, 'income', 1, 800000000000000000]))
    expect(mockExecSQL).toHaveBeenCalledWith(
      `INSERT OR IGNORE INTO budget_tag_context (budget_id, tag_id) VALUES (?, ?)`,
      [budgetId, 55]
    )
  })

  it('uses raw amounts when exchange rates are missing and stops projection when no next date exists', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16T12:00:00'))
    mockCurrencyRepository.getSystemRateInfo.mockResolvedValue({ rate: 1, currencyId: 1 })
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM recurring_plan')) return { id: planId }
      if (sql.includes('SELECT * FROM recurring_plan')) return planRow({
        schedule: JSON.stringify({ frequency: 'daily', interval: 10000 }),
        transaction_draft: JSON.stringify({
          timestamp: 1,
          lines: [{
            account_id: 2,
            tag_id: 44,
            sign: '-',
            amount_int: 5,
            amount_frac: 0,
            rate_int: 0,
            rate_frac: 0,
          }],
        }),
        start_date: '2026-05-16',
        until_policy: JSON.stringify({ type: 'date', date: '2026-06-30' }),
      })
      if (sql.includes('SELECT currency_id FROM account')) return { currency_id: 2 }
      if (sql.includes('SELECT id FROM budget')) return null
      return null
    })

    await recurringRepository.create({
      schedule: { frequency: 'daily', interval: 10000 },
      transaction_draft: {
        timestamp: 1,
        lines: [{
          account_id: 2,
          tag_id: 44,
          sign: '-',
          amount_int: 5,
          amount_frac: 0,
          rate_int: 0,
          rate_frac: 0,
        }],
      },
      mode: 'expense',
      start_date: '2026-05-16',
      until_policy: { type: 'date', date: '2026-06-30' },
    })

    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO budget'),
      expect.arrayContaining([44, 'expense', 5, 0])
    )
    expect(mockExecSQL).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO recurring_budget'),
      expect.anything()
    )
  })

  it('stops processing due plans when the updated plan cannot be reloaded', async () => {
    mockQuerySQL.mockResolvedValue([planRow()])
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM recurring_occurrence')) return null
      if (sql.includes('SELECT * FROM recurring_plan')) return null
      return null
    })

    const created = await recurringRepository.processDue('2026-05-20')

    expect(created).toBe(1)
    expect(mockNotificationRepository.createTransactionDraft).toHaveBeenCalledTimes(1)
  })

  it('uses current time for due drafts without an original timestamp and ignores missing budget plans', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-16T14:15:16'))
    mockQuerySQL.mockResolvedValue([planRow({
      transaction_draft: JSON.stringify({
        lines: [{
          account_id: 1,
          tag_id: 12,
          sign: '-',
          amount_int: 1,
          amount_frac: 0,
          rate_int: 1,
          rate_frac: 0,
        }],
      }),
    })])
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM recurring_occurrence')) return null
      if (sql.includes('SELECT * FROM recurring_plan')) return planRow({ next_due_date: null })
      if (sql.includes('FROM recurring_budget')) return { plan_id: planId, tag_id: 12, type: 'expense' }
      return null
    })

    await recurringRepository.processDue('2026-05-20', 1)

    expect(mockNotificationRepository.createTransactionDraft).toHaveBeenCalledWith(
      expect.any(String),
      'expense',
      expect.objectContaining({
        timestamp: Math.floor(new Date('2026-05-15T14:15:16').getTime() / 1000),
      }),
      expect.any(Number)
    )
    mockExecSQL.mockClear()
    mockQueryOne.mockImplementation(async (sql) => {
      if (sql.includes('FROM recurring_budget')) return { plan_id: planId, tag_id: 12, type: 'expense' }
      return null
    })

    await recurringRepository.syncDraftFromBudget(planId, 10, 0)

    expect(mockExecSQL).not.toHaveBeenCalledWith(
      expect.stringContaining('SET transaction_draft'),
      expect.anything()
    )
  })
})
