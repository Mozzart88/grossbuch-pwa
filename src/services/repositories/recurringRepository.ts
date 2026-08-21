import { execSQL, queryOne, querySQL } from '../database'
import type {
  NotificationTransactionMode,
  RecurringPaymentPin,
  RecurringPlan,
  RecurringPlanInput,
  RecurringPlanStatus,
  RecurringSchedule,
  RecurringUntilPolicy,
  TransactionInput,
} from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { blobToHex, hexToBlob } from '../../utils/blobUtils'
import { fromIntFrac, toIntFrac } from '../../utils/amount'
import { notificationRepository } from './notificationRepository'
import { transactionRepository } from './transactionRepository'
import { currencyRepository } from './currencyRepository'
import { settingsRepository } from './settingsRepository'
import { tagReferences } from './tagReferences'
import { getRateForDate } from '../exchangeRate/historicalRateService'

interface RecurringPlanRow {
  id: Uint8Array
  schedule: string
  transaction_draft: string
  mode: NotificationTransactionMode
  start_date: string
  next_due_date: string | null
  until_policy: string
  occurrence_count: number
  status: RecurringPlanStatus
  payment_pin: string | null
  notify_days_before: number | null
  created_at: number
  updated_at: number
}

export interface RecurringPlanHydration {
  categoryName: string | null
  counterpartyName: string | null
  walletName: string | null
  currencyCode: string | null
  currencySymbol: string | null
  decimalPlaces: number
  amount: number
}

const MAX_DUE_PER_RUN = 24
const DISALLOWED_RECURRING_MODES = new Set<NotificationTransactionMode>(['transfer', 'exchange'])

function todayLocal(): string {
  const now = new Date()
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonthsClamped(date: Date, months: number, targetDay = date.getDate()): Date {
  const next = new Date(date)
  next.setDate(1)
  next.setMonth(next.getMonth() + months)
  next.setDate(Math.min(targetDay, daysInMonth(next.getFullYear(), next.getMonth())))
  return next
}

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((parseDate(toDate).getTime() - parseDate(fromDate).getTime()) / 86400000)
}

// A plan is surfaced once `today` reaches its lead-time window before the real
// due date; `recurring_occurrence.due_date` always stores the real due date
// regardless of when it was surfaced (design.md Decision 4).
function isSurfaced(dueDate: string, leadDays: number, today: string): boolean {
  if (leadDays <= 0) return dueDate <= today
  const surfaceDate = formatDate(addDays(parseDate(dueDate), -leadDays))
  return surfaceDate <= today
}

function assertRecurrenceAllowedMode(mode: NotificationTransactionMode): void {
  if (DISALLOWED_RECURRING_MODES.has(mode)) {
    throw new Error('Recurring plans are only supported for expense and income transactions')
  }
}

function normalizeSchedule(schedule: RecurringSchedule): RecurringSchedule {
  return {
    ...schedule,
    interval: Math.max(1, Math.floor(schedule.interval || 1)),
    weekdays: schedule.weekdays?.map(Number).filter(d => d >= 0 && d <= 6).toSorted((a, b) => a - b),
    monthDays: schedule.monthDays?.map(Number).filter(d => d >= 1 && d <= 31).toSorted((a, b) => a - b),
    months: schedule.months?.map(Number).filter(m => m >= 1 && m <= 12).toSorted((a, b) => a - b),
  }
}

function normalizeJsonValue<T>(value: T): T {
  if (typeof value === 'bigint') return Number(value) as T
  if (Array.isArray(value)) return value.map(item => normalizeJsonValue(item)) as T
  if (value && typeof value === 'object') {
    if (value instanceof Uint8Array) return value
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeJsonValue(entry)])
    ) as T
  }
  return value
}

function normalizeDraft(draft: TransactionInput): TransactionInput {
  return normalizeJsonValue(draft)
}

function jsonStringify(value: unknown): string {
  return JSON.stringify(normalizeJsonValue(value))
}

function isDueAllowed(date: Date, schedule: RecurringSchedule, start: Date): boolean {
  const normalized = normalizeSchedule(schedule)
  if (date < start) return false
  if (normalized.frequency === 'daily') {
    const elapsed = Math.floor((date.getTime() - start.getTime()) / 86400000)
    return elapsed % normalized.interval === 0
  }
  if (normalized.frequency === 'weekly') {
    const weekdays = normalized.weekdays?.length ? normalized.weekdays : [start.getDay()]
    const elapsedWeeks = Math.floor((date.getTime() - start.getTime()) / (86400000 * 7))
    return elapsedWeeks % normalized.interval === 0 && weekdays.includes(date.getDay())
  }
  if (normalized.frequency === 'monthly') {
    const elapsedMonths = (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth()
    if (elapsedMonths < 0 || elapsedMonths % normalized.interval !== 0) return false
    const monthDays = normalized.monthDays?.length ? normalized.monthDays : [start.getDate()]
    return monthDays.some(day => date.getDate() === Math.min(day, daysInMonth(date.getFullYear(), date.getMonth())))
  }
  const elapsedYears = date.getFullYear() - start.getFullYear()
  if (elapsedYears < 0 || elapsedYears % normalized.interval !== 0) return false
  const months = normalized.months?.length ? normalized.months : [start.getMonth() + 1]
  const monthDays = normalized.monthDays?.length ? normalized.monthDays : [start.getDate()]
  return months.includes(date.getMonth() + 1) &&
    monthDays.some(day => date.getDate() === Math.min(day, daysInMonth(date.getFullYear(), date.getMonth())))
}

function shouldStop(until: RecurringUntilPolicy, date: string, count: number): boolean {
  if (until.type === 'date' && until.date && date > until.date) return true
  if (until.type === 'count' && until.count !== undefined && count >= until.count) return true
  return false
}

function mapPlan(row: RecurringPlanRow): RecurringPlan {
  return {
    ...row,
    schedule: normalizeSchedule(JSON.parse(row.schedule) as RecurringSchedule),
    transaction_draft: JSON.parse(row.transaction_draft) as TransactionInput,
    until_policy: JSON.parse(row.until_policy) as RecurringUntilPolicy,
    payment_pin: row.payment_pin ? (JSON.parse(row.payment_pin) as RecurringPaymentPin) : null,
  }
}

function draftForDate(draft: TransactionInput, date: string): TransactionInput {
  const existing = draft.timestamp ? new Date(draft.timestamp * 1000) : new Date()
  const due = parseDate(date)
  due.setHours(existing.getHours(), existing.getMinutes(), existing.getSeconds(), 0)
  return normalizeDraft({
    ...draft,
    timestamp: Math.floor(due.getTime() / 1000),
    lines: draft.lines.map(line => ({ ...line })),
  })
}

// Recomputes the two SYSTEM_TAGS.EXCHANGE-tagged lines of a draft against a
// live exchange rate for `dueDate`: the line whose account is denominated in
// `pin.currency_id` keeps the pinned amount fixed, the other line's amount is
// derived from it via that day's rate. All other lines pass through untouched.
// See design.md Decision 1/2.
async function resolvePinnedExchangePair(
  lines: TransactionInput['lines'],
  pin: RecurringPaymentPin,
  dueDate: string
): Promise<TransactionInput['lines']> {
  const exchangeLines = lines.filter(line => line.tag_id === SYSTEM_TAGS.EXCHANGE)
  if (exchangeLines.length !== 2) return lines

  const currencyIds = await Promise.all(exchangeLines.map(async line => {
    const account = await queryOne<{ currency_id: number }>(
      `SELECT currency_id FROM account WHERE id = ?`,
      [line.account_id]
    )
    return account?.currency_id ?? null
  }))

  const pinnedIndex = currencyIds.findIndex(id => id === pin.currency_id)
  if (pinnedIndex === -1) return lines
  const otherIndex = pinnedIndex === 0 ? 1 : 0
  const otherCurrencyId = currencyIds[otherIndex]
  if (otherCurrencyId === null) return lines

  const [pinnedRate, otherRate] = await Promise.all([
    getRateForDate(pin.currency_id, dueDate),
    getRateForDate(otherCurrencyId, dueDate),
  ])

  const pinnedRateValue = fromIntFrac(pinnedRate.int, pinnedRate.frac)
  const otherRateValue = fromIntFrac(otherRate.int, otherRate.frac)
  const pinnedAmountValue = fromIntFrac(pin.amount_int, pin.amount_frac)
  const otherAmountValue = pinnedRateValue > 0
    ? (pinnedAmountValue / pinnedRateValue) * otherRateValue
    : pinnedAmountValue
  const otherAmount = toIntFrac(otherAmountValue)

  const pinnedLine = exchangeLines[pinnedIndex]
  const otherLine = exchangeLines[otherIndex]

  return lines.map(line => {
    if (line === pinnedLine) {
      return { ...line, amount_int: pin.amount_int, amount_frac: pin.amount_frac, rate_int: pinnedRate.int, rate_frac: pinnedRate.frac }
    }
    if (line === otherLine) {
      return { ...line, amount_int: otherAmount.int, amount_frac: otherAmount.frac, rate_int: otherRate.int, rate_frac: otherRate.frac }
    }
    return line
  })
}

function buildNotificationTitle(hydration: RecurringPlanHydration, daysRemaining: number): string {
  const parts = ['You have upcoming payment']
  if (hydration.counterpartyName) parts.push(`to ${hydration.counterpartyName}`)
  parts.push(hydration.categoryName ?? 'transaction')
  parts.push(`in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`)
  const walletCurrency = [hydration.walletName, hydration.currencyCode].filter(Boolean).join(':')
  if (walletCurrency) parts.push(`from ${walletCurrency}`)
  return parts.join(' ')
}

function monthRange(month: string): { start: number; end: number } {
  const startDate = new Date(`${month}-01T00:00:00`)
  const endDate = new Date(startDate)
  endDate.setMonth(endDate.getMonth() + 1)
  return {
    start: Math.floor(startDate.getTime() / 1000),
    end: Math.floor(endDate.getTime() / 1000),
  }
}

function addMonthsToMonth(month: string, offset: number): string {
  const date = new Date(`${month}-01T00:00:00`)
  date.setMonth(date.getMonth() + offset)
  return formatDate(date).slice(0, 7)
}

async function convertLineToSystemAmount(
  line: TransactionInput['lines'][number],
  systemCurrencyId: number,
  systemRate: number,
  accountCurrencyCache: Map<number, number>
): Promise<{ amountInt: number; amountFrac: number }> {
  let accountCurrencyId = accountCurrencyCache.get(line.account_id)
  if (accountCurrencyId === undefined) {
    const account = await queryOne<{ currency_id: number }>(
      `SELECT currency_id FROM account WHERE id = ?`,
      [line.account_id]
    )
    accountCurrencyId = account?.currency_id ?? systemCurrencyId
    accountCurrencyCache.set(line.account_id, accountCurrencyId)
  }

  const amount = fromIntFrac(line.amount_int, line.amount_frac)
  if (accountCurrencyId === systemCurrencyId) {
    const converted = toIntFrac(amount)
    return { amountInt: converted.int, amountFrac: converted.frac }
  }

  const rate = fromIntFrac(line.rate_int, line.rate_frac)
  const converted = rate <= 0
    ? toIntFrac(amount)
    : toIntFrac((amount / rate) * systemRate)
  return { amountInt: converted.int, amountFrac: converted.frac }
}

async function decrementBudgetTagReferencesForPlan(planId: Uint8Array): Promise<void> {
  const budgets = await querySQL<{ id: Uint8Array; tag_id: number }>(
    `SELECT b.id, b.tag_id FROM budget b
     JOIN recurring_budget rb ON rb.budget_id = b.id
     WHERE rb.plan_id = ?`,
    [planId]
  )
  for (const budget of budgets) {
    await tagReferences.decrement(budget.tag_id)
    const contexts = await querySQL<{ tag_id: number }>(
      'SELECT tag_id FROM budget_tag_context WHERE budget_id = ?',
      [budget.id]
    )
    for (const ctx of contexts) {
      await tagReferences.decrement(ctx.tag_id)
    }
  }
}

async function projectBudgets(plan: RecurringPlan): Promise<void> {
  await decrementBudgetTagReferencesForPlan(plan.id)
  await execSQL(
    `DELETE FROM budget
     WHERE id IN (SELECT budget_id FROM recurring_budget WHERE plan_id = ?)`,
    [plan.id]
  )

  if (plan.status === 'deleted') return

  const currentMonth = todayLocal().slice(0, 7)
  const lastMonth = plan.until_policy.type === 'date' && plan.until_policy.date
    ? plan.until_policy.date.slice(0, 7)
    : addMonthsToMonth(currentMonth, 12)
  const { rate: systemRate, currencyId: systemCurrencyId } = await currencyRepository.getSystemRateInfo()
  const accountCurrencyCache = new Map<number, number>()

  const totals = new Map<string, {
    tagId: number
    tagContextId: number | null
    type: 'income' | 'expense'
    amountInt: number
    amountFrac: number
  }>()

  let date = plan.start_date
  let count = 0
  let guard = 0
  while (date <= `${lastMonth}-31` && guard < 500) {
    guard++
    if (date.slice(0, 7) >= currentMonth && !shouldStop(plan.until_policy, date, count)) {
      for (const line of plan.transaction_draft.lines) {
        if (
          line.tag_id === SYSTEM_TAGS.INITIAL ||
          line.tag_id === SYSTEM_TAGS.TRANSFER ||
          line.tag_id === SYSTEM_TAGS.EXCHANGE
        ) continue
        const type = line.sign === '+' ? 'income' : 'expense'
        const key = `${date.slice(0, 7)}:${line.tag_id}:${line.tag_context_id ?? ''}:${type}`
        const converted = await convertLineToSystemAmount(line, systemCurrencyId, systemRate, accountCurrencyCache)
        const current = totals.get(key) ?? {
          tagId: line.tag_id,
          tagContextId: line.tag_context_id ?? null,
          type,
          amountInt: 0,
          amountFrac: 0,
        }
        current.amountInt += converted.amountInt
        current.amountFrac += converted.amountFrac
        if (current.amountFrac >= 1_000_000_000_000_000_000) {
          current.amountInt += Math.floor(current.amountFrac / 1_000_000_000_000_000_000)
          current.amountFrac = current.amountFrac % 1_000_000_000_000_000_000
        }
        totals.set(key, current)
      }
    }
    count++
    const next = recurringRepository.getNextDueDate(plan.schedule, date, plan.start_date)
    if (!next || next <= date) break
    date = next
  }

  for (const [key, total] of totals) {
    const [month] = key.split(':')
    const range = monthRange(month)
    await execSQL(
      `INSERT INTO budget (id, start, end, tag_id, type, amount_int, amount_frac)
       VALUES (randomblob(8), ?, ?, ?, ?, ?, ?)`,
      [range.start, range.end, total.tagId, total.type, total.amountInt, total.amountFrac]
    )
    await tagReferences.increment(total.tagId)
    const budget = await queryOne<{ id: Uint8Array }>('SELECT id FROM budget ORDER BY rowid DESC LIMIT 1')
    if (!budget) continue
    if (total.tagContextId !== null) {
      await execSQL(`INSERT OR IGNORE INTO budget_tag_context (budget_id, tag_id) VALUES (?, ?)`, [budget.id, total.tagContextId])
      await tagReferences.increment(total.tagContextId)
    }
    await execSQL(
      `INSERT OR REPLACE INTO recurring_budget (budget_id, plan_id, due_month) VALUES (?, ?, ?)`,
      [budget.id, plan.id, month]
    )
  }
}

export const recurringRepository = {
  toHex(plan: Pick<RecurringPlan, 'id'>): string {
    return blobToHex(plan.id)
  },

  getNextDueDate(schedule: RecurringSchedule, afterDate: string, startDate = afterDate): string | null {
    const normalized = normalizeSchedule(schedule)
    const start = parseDate(startDate)
    let cursor = addDays(parseDate(afterDate), 1)
    const limit = addMonthsClamped(cursor, 240)
    while (cursor <= limit) {
      if (isDueAllowed(cursor, normalized, start)) return formatDate(cursor)
      cursor = addDays(cursor, 1)
    }
    return null
  },

  getFirstDueDate(schedule: RecurringSchedule, startDate: string, until: RecurringUntilPolicy): string | null {
    const start = parseDate(startDate)
    let cursor = new Date(start)
    const limit = addMonthsClamped(start, 240)
    while (cursor <= limit) {
      const date = formatDate(cursor)
      if (isDueAllowed(cursor, schedule, start) && !shouldStop(until, date, 0)) return date
      cursor = addDays(cursor, 1)
    }
    return null
  },

  async findAll(): Promise<RecurringPlan[]> {
    const rows = await querySQL<RecurringPlanRow>(
      `SELECT * FROM recurring_plan WHERE status != 'deleted' ORDER BY next_due_date IS NULL, next_due_date, updated_at DESC`
    )
    return rows.map(mapPlan)
  },

  async findById(id: Uint8Array): Promise<RecurringPlan | null> {
    const row = await queryOne<RecurringPlanRow>(`SELECT * FROM recurring_plan WHERE id = ?`, [id])
    return row ? mapPlan(row) : null
  },

  async findByHexId(id: string): Promise<RecurringPlan | null> {
    return this.findById(hexToBlob(id))
  },

  // Read-only projection of a draft's category/counterparty/wallet/currency/amount,
  // resolved against current data (not stored denormalized). Shared by the
  // Recurring Transactions list card and the due-occurrence notification title
  // (design.md Decision 7), so the two surfaces can't drift apart.
  async hydrateDraft(draft: TransactionInput): Promise<RecurringPlanHydration> {
    // `is_common` is only ever computed at read time (via a tags_hierarchy JOIN,
    // see transactionRepository) and never persisted on a draft's lines, so it
    // can't be used to filter add-on lines out here. Category sub-entries are
    // always pushed before common add-ons when a draft is built (see
    // ExpenseTransactionForm), so the first non-exchange/transfer line is
    // reliably the real category — and summing the rest in too gives the
    // plan's actual total (base amount plus any add-ons), which is what the
    // card/notification should show anyway.
    const primaryLines = draft.lines.filter(line =>
      line.tag_id !== SYSTEM_TAGS.EXCHANGE &&
      line.tag_id !== SYSTEM_TAGS.TRANSFER
    )
    const displayAccountId = primaryLines[0]?.account_id ?? draft.lines[0]?.account_id ?? null

    const [tag, account, counterparty] = await Promise.all([
      primaryLines[0]
        ? queryOne<{ name: string }>(`SELECT name FROM tag WHERE id = ?`, [primaryLines[0].tag_id])
        : Promise.resolve(null),
      displayAccountId !== null
        ? queryOne<{ wallet_id: number; currency_id: number }>(`SELECT wallet_id, currency_id FROM account WHERE id = ?`, [displayAccountId])
        : Promise.resolve(null),
      draft.counterparty_id
        ? queryOne<{ name: string }>(`SELECT name FROM counterparty WHERE id = ?`, [draft.counterparty_id])
        : Promise.resolve(null),
    ])

    const [wallet, currency] = await Promise.all([
      account
        ? queryOne<{ name: string }>(`SELECT name FROM wallet WHERE id = ?`, [account.wallet_id])
        : Promise.resolve(null),
      account
        ? queryOne<{ code: string; symbol: string; decimal_places: number }>(`SELECT code, symbol, decimal_places FROM currency WHERE id = ?`, [account.currency_id])
        : Promise.resolve(null),
    ])

    const amount = primaryLines.reduce((sum, line) => sum + fromIntFrac(line.amount_int, line.amount_frac), 0)

    return {
      categoryName: tag?.name ?? null,
      counterpartyName: counterparty?.name ?? null,
      walletName: wallet?.name ?? null,
      currencyCode: currency?.code ?? null,
      currencySymbol: currency?.symbol ?? null,
      decimalPlaces: currency?.decimal_places ?? 2,
      amount,
    }
  },

  // Default pin for a submitted draft: when it contains a payment-currency
  // exchange pair (see design.md Context — ExpenseTransactionForm's synthetic
  // EXCHANGE lines), pin the payment-currency side (the '+' line), since
  // that's the amount the user is actually thinking of ("$9.99 subscription")
  // regardless of which account currency pays it. A single-currency draft has
  // nothing to pin.
  async derivePaymentPin(draft: TransactionInput): Promise<RecurringPaymentPin | null> {
    const paymentLine = draft.lines.find(line => line.tag_id === SYSTEM_TAGS.EXCHANGE && line.sign === '+')
    if (!paymentLine) return null
    const account = await queryOne<{ currency_id: number }>(
      `SELECT currency_id FROM account WHERE id = ?`,
      [paymentLine.account_id]
    )
    if (!account) return null
    return { currency_id: account.currency_id, amount_int: paymentLine.amount_int, amount_frac: paymentLine.amount_frac }
  },

  async create(input: RecurringPlanInput): Promise<RecurringPlan> {
    assertRecurrenceAllowedMode(input.mode)
    const schedule = normalizeSchedule(input.schedule)
    const transactionDraft = normalizeDraft(input.transaction_draft)
    const until = input.until_policy
    const firstDue = this.getFirstDueDate(schedule, input.start_date, until)
    await execSQL(
      `INSERT INTO recurring_plan
       (id, schedule, transaction_draft, mode, start_date, next_due_date, until_policy, occurrence_count, status, payment_pin, notify_days_before)
       VALUES (randomblob(8), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        jsonStringify(schedule),
        jsonStringify(transactionDraft),
        input.mode,
        input.start_date,
        firstDue,
        jsonStringify(until),
        input.occurrence_count ?? 0,
        input.status ?? 'active',
        input.payment_pin ? jsonStringify(input.payment_pin) : null,
        input.notify_days_before ?? null,
      ]
    )
    const row = await queryOne<{ id: Uint8Array }>('SELECT id FROM recurring_plan ORDER BY rowid DESC LIMIT 1')
    if (!row) throw new Error('Failed to create recurring plan')
    const plan = await this.findById(row.id)
    if (!plan) throw new Error('Failed to load recurring plan')
    await projectBudgets(plan)
    return plan
  },

  async update(id: Uint8Array, input: Partial<RecurringPlanInput>): Promise<RecurringPlan> {
    const existing = await this.findById(id)
    if (!existing) throw new Error('Recurring plan not found')
    const nextInput: RecurringPlanInput = {
      schedule: input.schedule ?? existing.schedule,
      transaction_draft: normalizeDraft(input.transaction_draft ?? existing.transaction_draft),
      mode: input.mode ?? existing.mode,
      start_date: input.start_date ?? existing.start_date,
      until_policy: input.until_policy ?? existing.until_policy,
      occurrence_count: input.occurrence_count ?? existing.occurrence_count,
      status: input.status ?? existing.status,
      payment_pin: input.payment_pin !== undefined ? input.payment_pin : existing.payment_pin,
      notify_days_before: input.notify_days_before !== undefined ? input.notify_days_before : existing.notify_days_before,
    }
    assertRecurrenceAllowedMode(nextInput.mode)
    const nextDue = nextInput.status === 'active'
      ? this.getFirstDueDate(nextInput.schedule, nextInput.start_date, nextInput.until_policy)
      : existing.next_due_date
    await execSQL(
      `UPDATE recurring_plan
       SET schedule = ?, transaction_draft = ?, mode = ?, start_date = ?, next_due_date = ?,
           until_policy = ?, occurrence_count = ?, status = ?, payment_pin = ?, notify_days_before = ?
      WHERE id = ?`,
      [
        jsonStringify(normalizeSchedule(nextInput.schedule)),
        jsonStringify(nextInput.transaction_draft),
        nextInput.mode,
        nextInput.start_date,
        nextDue,
        jsonStringify(nextInput.until_policy),
        nextInput.occurrence_count,
        nextInput.status,
        nextInput.payment_pin ? jsonStringify(nextInput.payment_pin) : null,
        nextInput.notify_days_before ?? null,
        id,
      ]
    )
    const plan = await this.findById(id)
    if (!plan) throw new Error('Failed to load recurring plan')
    await projectBudgets(plan)
    return plan
  },

  async pause(id: Uint8Array): Promise<void> {
    await execSQL(`UPDATE recurring_plan SET status = 'paused' WHERE id = ?`, [id])
  },

  async resume(id: Uint8Array): Promise<void> {
    const plan = await this.findById(id)
    if (!plan) return
    const nextDue = this.getFirstDueDate(plan.schedule, todayLocal(), plan.until_policy)
    await execSQL(`UPDATE recurring_plan SET status = 'active', next_due_date = ? WHERE id = ?`, [nextDue, id])
  },

  async delete(id: Uint8Array): Promise<void> {
    await decrementBudgetTagReferencesForPlan(id)
    await execSQL(`DELETE FROM budget WHERE id IN (SELECT budget_id FROM recurring_budget WHERE plan_id = ?)`, [id])
    await execSQL(`DELETE FROM recurring_plan WHERE id = ?`, [id])
  },

  async createPlanFromTransaction(
    input: RecurringPlanInput,
    firstAction: 'plan-only' | 'add-now' | 'add-past' = 'plan-only'
  ): Promise<RecurringPlan> {
    assertRecurrenceAllowedMode(input.mode)
    const sanitizedInput = {
      ...input,
      transaction_draft: normalizeDraft(input.transaction_draft),
    }
    let occurrenceCount = input.occurrence_count ?? 0
    if (firstAction === 'add-now' || firstAction === 'add-past') {
      await transactionRepository.create(draftForDate(sanitizedInput.transaction_draft, sanitizedInput.start_date))
      occurrenceCount += 1
    }
    const firstScheduledFrom = occurrenceCount > 0
      ? this.getNextDueDate(sanitizedInput.schedule, sanitizedInput.start_date, sanitizedInput.start_date)
      : this.getFirstDueDate(sanitizedInput.schedule, sanitizedInput.start_date, sanitizedInput.until_policy)
    const plan = await this.create({ ...sanitizedInput, occurrence_count: occurrenceCount })
    if (firstScheduledFrom !== plan.next_due_date) {
      await execSQL(`UPDATE recurring_plan SET next_due_date = ? WHERE id = ?`, [firstScheduledFrom, plan.id])
      const updated = await this.findById(plan.id)
      if (updated) {
        await projectBudgets(updated)
        return updated
      }
    }
    return plan
  },

  async processDue(today = todayLocal(), max = MAX_DUE_PER_RUN): Promise<number> {
    const plans = await querySQL<RecurringPlanRow>(
      `SELECT * FROM recurring_plan
       WHERE status = 'active' AND next_due_date IS NOT NULL
       ORDER BY next_due_date ASC`
    )
    const globalDefaultLeadDaysRaw = await settingsRepository.get('recurring_default_notify_days_before')
    const globalDefaultLeadDays = Number(globalDefaultLeadDaysRaw ?? 0) || 0

    let created = 0
    for (const row of plans) {
      let plan = mapPlan(row)
      const leadDays = plan.notify_days_before ?? globalDefaultLeadDays
      while (plan.next_due_date && isSurfaced(plan.next_due_date, leadDays, today) && created < max) {
        const dueDate = plan.next_due_date
        const existing = await queryOne<{ id: Uint8Array }>(
          `SELECT id FROM recurring_occurrence WHERE plan_id = ? AND due_date = ?`,
          [plan.id, dueDate]
        )
        if (!existing) {
          let draft = draftForDate(plan.transaction_draft, dueDate)
          if (plan.payment_pin) {
            // Re-normalize: the resolved rate/amount fields come straight from a
            // fresh SQLite read (getRateForDate), which can return BigInt for
            // INTEGER columns — normalizeDraft converts those back to plain
            // numbers so the notification payload can be JSON.stringify'd.
            draft = normalizeDraft({ ...draft, lines: await resolvePinnedExchangePair(draft.lines, plan.payment_pin, dueDate) })
          }
          const hydration = await this.hydrateDraft(draft)
          const title = buildNotificationTitle(hydration, Math.max(0, daysBetween(today, dueDate)))
          const notification = await notificationRepository.createTransactionDraft(
            title,
            plan.mode,
            draft,
            Math.floor(parseDate(dueDate).getTime() / 1000)
          )
          await execSQL(
            `INSERT INTO recurring_occurrence (id, plan_id, due_date, notification_id)
             VALUES (randomblob(8), ?, ?, ?)`,
            [plan.id, dueDate, notification.id]
          )
          created++
        }

        const occurrenceCount = plan.occurrence_count + 1
        const nextDue = shouldStop(plan.until_policy, dueDate, occurrenceCount)
          ? null
          : this.getNextDueDate(plan.schedule, dueDate, plan.start_date)
        await execSQL(
          `UPDATE recurring_plan SET occurrence_count = ?, next_due_date = ? WHERE id = ?`,
          [occurrenceCount, nextDue, plan.id]
        )
        const updated = await this.findById(plan.id)
        if (!updated) break
        plan = updated
      }
      if (created >= max) break
    }
    return created
  },

  async syncDraftFromBudget(budgetId: Uint8Array, amountInt: number, amountFrac: number): Promise<void> {
    const link = await queryOne<{ plan_id: Uint8Array; tag_id: number; type: 'income' | 'expense' }>(
      `SELECT rb.plan_id, b.tag_id, b.type
       FROM recurring_budget rb
       JOIN budget b ON b.id = rb.budget_id
       WHERE rb.budget_id = ?`,
      [budgetId]
    )
    if (!link?.plan_id || link.tag_id === undefined || !link.type) return
    const plan = await this.findById(link.plan_id)
    if (!plan) return
    const draft = {
      ...plan.transaction_draft,
      lines: plan.transaction_draft.lines.map(line => {
        const matches = line.tag_id === link.tag_id && (link.type === 'income' ? line.sign === '+' : line.sign === '-')
        return matches ? { ...line, amount_int: amountInt, amount_frac: amountFrac } : line
      }),
    }
    await execSQL(`UPDATE recurring_plan SET transaction_draft = ? WHERE id = ?`, [jsonStringify(draft), plan.id])
  },
}
