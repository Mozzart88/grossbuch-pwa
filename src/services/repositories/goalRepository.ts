import { querySQL, queryOne, execSQL, getLastInsertId } from '../database'
import type { Goal, GoalCreateInput, GoalUpdateInput, Transaction } from '../../types'
import { SYSTEM_TAGS } from '../../types'
import { walletRepository } from './walletRepository'
import { accountRepository } from './accountRepository'
import { transactionRepository } from './transactionRepository'
import { tagReferences } from './tagReferences'
import { inheritWalletTypeTags } from './accountTypeTags'
import { toIntFrac, fromIntFrac } from '../../utils/amount'

// Inlined as a subquery (rather than a resolved-and-bound param) so read paths
// never need to lazily create the tag — if it doesn't exist yet, the subquery
// simply returns NULL and matches no goal, which is correct for a tag nothing
// has been marked with yet. Only achieve()/unachieve() need the real numeric
// id (see getAchievedTagId below), since they actually write a row.
const ACHIEVED_TAG_ID_SUBQUERY = `(SELECT id FROM tag WHERE name = 'achieved')`

const GOAL_SELECT_COLUMNS = `
  g.id,
  g.wallet_id,
  g.name,
  w.color,
  da.currency_id,
  cur.code as currency,
  cur.symbol,
  cur.decimal_places,
  g.target_int,
  g.target_frac,
  g.due_date,
  g.updated_at,
  EXISTS(SELECT 1 FROM goal_to_tags gt WHERE gt.goal_id = g.id AND gt.tag_id = ${ACHIEVED_TAG_ID_SUBQUERY}) as is_achieved,
  EXISTS(SELECT 1 FROM goal_to_tags gt WHERE gt.goal_id = g.id AND gt.tag_id = ?) as is_archived,
  (SELECT note FROM goal_note gn WHERE gn.goal_id = g.id) as note,
  COALESCE((
    SELECT SUM(
      CASE WHEN a2.currency_id = da.currency_id
        THEN (a2.balance_int + a2.balance_frac * 1e-18)
        ELSE (a2.balance_int + a2.balance_frac * 1e-18)
             / (COALESCE(
               (SELECT (er.rate_int + er.rate_frac * 1e-18) FROM exchange_rate er
                WHERE er.currency_id = a2.currency_id ORDER BY er.updated_at DESC LIMIT 1),
               1.0
             ))
             * (COALESCE(
               (SELECT (er2.rate_int + er2.rate_frac * 1e-18) FROM exchange_rate er2
                WHERE er2.currency_id = da.currency_id ORDER BY er2.updated_at DESC LIMIT 1),
               1.0
             ))
      END
    )
    FROM account a2 WHERE a2.wallet_id = g.wallet_id
  ), 0) as balance
`

// `da` (default account) resolves the goal's target currency — whichever account
// in the goal's wallet is tagged DEFAULT, the same convention ordinary
// multi-currency wallets already use (see design.md Decision 1).
const GOAL_FROM = `
  FROM goal g
  JOIN wallet w ON w.id = g.wallet_id
  JOIN account da ON da.wallet_id = g.wallet_id
    AND EXISTS(SELECT 1 FROM account_to_tags dat WHERE dat.account_id = da.id AND dat.tag_id = ?)
  JOIN currency cur ON cur.id = da.currency_id
`

// Resolved/created lazily at first real use rather than seeded at migration
// time — see workspaceMigrations.ts's note on why a migration-time INSERT into
// shared.tag risks a legacy-install id collision with the one-time db-split
// bulk copy.
async function getAchievedTagId(): Promise<number> {
  const existing = await queryOne<{ id: number }>(`SELECT id FROM tag WHERE name = 'achieved'`)
  if (existing) return existing.id

  await execSQL(`INSERT OR IGNORE INTO tag (name) VALUES ('achieved')`)
  const row = await queryOne<{ id: number }>(`SELECT id FROM tag WHERE name = 'achieved'`)
  if (!row) throw new Error('Failed to create the "achieved" tag')
  return row.id
}

async function selectGoals(whereClause: string, whereParams: unknown[] = []): Promise<Goal[]> {
  return querySQL<Goal>(`
    SELECT ${GOAL_SELECT_COLUMNS}
    ${GOAL_FROM}
    ${whereClause}
    ORDER BY g.name ASC
  `, [SYSTEM_TAGS.ARCHIVED, SYSTEM_TAGS.DEFAULT, ...whereParams])
}

async function findByWalletId(walletId: number): Promise<Goal | null> {
  const rows = await selectGoals('WHERE g.wallet_id = ?', [walletId])
  const goal = rows[0] ?? null
  if (!goal) return null
  goal.accounts = await accountRepository.findByWalletId(goal.wallet_id)
  return goal
}

// Deletes every `trx` touching any of the given accounts (cascades every leg on
// each `trx`, including counterparty legs on unrelated accounts), decrementing
// tag references for every deleted `trx_base` row first since the cascade
// bypasses application-level bookkeeping. Shared by remove() and the
// Convert-to-Goal conflict path (see design.md Decisions 3 and 4).
async function deleteTransactionsTouchingAccounts(accountIds: number[]): Promise<void> {
  if (accountIds.length === 0) return
  const placeholders = accountIds.map(() => '?').join(',')
  const trxIds = await querySQL<{ trx_id: Uint8Array }>(
    `SELECT DISTINCT trx_id FROM trx_base WHERE account_id IN (${placeholders})`,
    accountIds
  )
  for (const { trx_id } of trxIds) {
    const lines = await querySQL<{ tag_id: number }>('SELECT tag_id FROM trx_base WHERE trx_id = ?', [trx_id])
    await execSQL('DELETE FROM trx WHERE id = ?', [trx_id])
    for (const line of lines) {
      await tagReferences.decrement(line.tag_id)
    }
  }
}

// Creates the goal-side mirror account for one currency during conversion.
// Bypasses walletRepository.addAccount's "one account per currency" guard on
// purpose: the original account of that same currency is still physically
// present in the wallet at this point (it's moved/removed only afterward —
// see convertWalletToGoal's ordering note), which addAccount would otherwise
// reject as a duplicate.
async function createMirrorAccount(walletId: number, currencyId: number): Promise<{ id: number }> {
  await execSQL('INSERT INTO account (wallet_id, currency_id) VALUES (?, ?)', [walletId, currencyId])
  const id = await getLastInsertId()
  await inheritWalletTypeTags(id, walletId)
  return { id }
}

export interface ConvertAccountPlanEntry {
  accountId: number
  destinationWalletId: number
}

export interface ConvertWalletToGoalInput {
  walletId: number
  name: string
  color?: string | null
  target_int: number
  target_frac: number
  due_date?: string | null
  defaultCurrencyId: number
  plan: ConvertAccountPlanEntry[]
}

export interface GoalPutTakeInput {
  goalId: Uint8Array
  counterpartyAccountId: number
  amount_int: number
  amount_frac: number
  rate_int?: number
  rate_frac?: number
  timestamp?: number
  note?: string
}

// Resolves which of the goal's accounts a Put/Take moves against, given the
// chosen counterparty's currency — see design.md Decision 10. Put accepts any
// currency: reuses the goal's existing same-currency account, or creates one
// (plain-typed, unmarked as default) if none exists yet. Take is currency-
// locked: it only draws down a goal account that already exists.
async function resolveGoalAccount(walletId: number, currencyId: number, direction: 'put' | 'take'): Promise<{ id: number }> {
  const existing = await walletRepository.findAccountByCurrency(walletId, currencyId)
  if (existing) return existing
  if (direction === 'take') {
    throw new Error('Take requires a savings account whose currency matches an existing goal account')
  }
  return walletRepository.addAccount(walletId, currencyId)
}

async function createPutTake(input: GoalPutTakeInput, direction: 'put' | 'take'): Promise<Transaction> {
  const goal = await queryOne<{ wallet_id: number }>('SELECT wallet_id FROM goal WHERE id = ?', [input.goalId])
  if (!goal) throw new Error('Goal not found')

  const counterpartyAccount = await accountRepository.findById(input.counterpartyAccountId)
  if (!counterpartyAccount) throw new Error('Counterparty account not found')
  if ((counterpartyAccount.account_type ?? 'plain') !== 'savings') {
    throw new Error('Put/Take requires a savings account as the counterparty')
  }

  const goalAccount = await resolveGoalAccount(goal.wallet_id, counterpartyAccount.currency_id, direction)

  const goalSign = direction === 'put' ? '+' : '-'
  const counterpartySign = direction === 'put' ? '-' : '+'

  return transactionRepository.create({
    timestamp: input.timestamp,
    note: input.note,
    lines: [
      {
        account_id: goalAccount.id,
        tag_id: SYSTEM_TAGS.TRANSFER,
        sign: goalSign,
        amount_int: input.amount_int,
        amount_frac: input.amount_frac,
        rate_int: input.rate_int ?? 0,
        rate_frac: input.rate_frac ?? 0,
      },
      {
        account_id: input.counterpartyAccountId,
        tag_id: SYSTEM_TAGS.TRANSFER,
        sign: counterpartySign,
        amount_int: 0,
        amount_frac: 0,
        rate_int: 0,
        rate_frac: 0,
      },
    ],
  })
}

// Edits an existing Put/Take in place, preserving trx.id (so sync sees a
// modified row, not a deleted-then-new one). Mode (Put/Take direction) is
// locked — read off the existing goal-side leg's sign, never taken from
// input — while the counterparty account is editable, resolving the
// (possibly different) goal-side account the same way put()/take() do. Reuses
// transactionRepository.update's delete-and-reinsert-under-the-same-trx
// pattern so balance triggers fire correctly on both the old and new account.
// See design.md Decision 16.
async function updatePutTake(trxId: Uint8Array, input: GoalPutTakeInput): Promise<Transaction> {
  const existingGoalLeg = await queryOne<{ sign: '+' | '-' }>(`
    SELECT tb.sign as sign
    FROM trx_base tb
    JOIN account a ON a.id = tb.account_id
    JOIN wallet w ON w.id = a.wallet_id
    JOIN goal g ON g.wallet_id = w.id
    WHERE tb.trx_id = ?
  `, [trxId])
  if (!existingGoalLeg) throw new Error('Put/Take transaction not found')
  const direction: 'put' | 'take' = existingGoalLeg.sign === '+' ? 'put' : 'take'

  const goal = await queryOne<{ wallet_id: number }>('SELECT wallet_id FROM goal WHERE id = ?', [input.goalId])
  if (!goal) throw new Error('Goal not found')

  const counterpartyAccount = await accountRepository.findById(input.counterpartyAccountId)
  if (!counterpartyAccount) throw new Error('Counterparty account not found')
  if ((counterpartyAccount.account_type ?? 'plain') !== 'savings') {
    throw new Error('Put/Take requires a savings account as the counterparty')
  }

  const goalAccount = await resolveGoalAccount(goal.wallet_id, counterpartyAccount.currency_id, direction)

  const goalSign = direction === 'put' ? '+' : '-'
  const counterpartySign = direction === 'put' ? '-' : '+'

  return transactionRepository.update(trxId, {
    timestamp: input.timestamp,
    note: input.note,
    lines: [
      {
        account_id: goalAccount.id,
        tag_id: SYSTEM_TAGS.TRANSFER,
        sign: goalSign,
        amount_int: input.amount_int,
        amount_frac: input.amount_frac,
        rate_int: input.rate_int ?? 0,
        rate_frac: input.rate_frac ?? 0,
      },
      {
        account_id: input.counterpartyAccountId,
        tag_id: SYSTEM_TAGS.TRANSFER,
        sign: counterpartySign,
        amount_int: 0,
        amount_frac: 0,
        rate_int: 0,
        rate_frac: 0,
      },
    ],
  })
}

export const goalRepository = {
  async findAll(): Promise<Goal[]> {
    return selectGoals('')
  },

  // Not achieved and not archived.
  async findActive(): Promise<Goal[]> {
    return selectGoals(
      `WHERE NOT EXISTS(SELECT 1 FROM goal_to_tags gt WHERE gt.goal_id = g.id AND gt.tag_id = ${ACHIEVED_TAG_ID_SUBQUERY}) AND NOT EXISTS(SELECT 1 FROM goal_to_tags gt WHERE gt.goal_id = g.id AND gt.tag_id = ?)`,
      [SYSTEM_TAGS.ARCHIVED]
    )
  },

  // Achieved and not archived.
  async findAchieved(): Promise<Goal[]> {
    return selectGoals(
      `WHERE EXISTS(SELECT 1 FROM goal_to_tags gt WHERE gt.goal_id = g.id AND gt.tag_id = ${ACHIEVED_TAG_ID_SUBQUERY}) AND NOT EXISTS(SELECT 1 FROM goal_to_tags gt WHERE gt.goal_id = g.id AND gt.tag_id = ?)`,
      [SYSTEM_TAGS.ARCHIVED]
    )
  },

  // Archived, regardless of achieved status.
  async findArchived(): Promise<Goal[]> {
    return selectGoals(
      'WHERE EXISTS(SELECT 1 FROM goal_to_tags gt WHERE gt.goal_id = g.id AND gt.tag_id = ?)',
      [SYSTEM_TAGS.ARCHIVED]
    )
  },

  async findById(goalId: Uint8Array): Promise<Goal | null> {
    const rows = await selectGoals('WHERE g.id = ?', [goalId])
    const goal = rows[0] ?? null
    if (!goal) return null
    goal.accounts = await accountRepository.findByWalletId(goal.wallet_id)
    return goal
  },

  findByWalletId,

  async create(input: GoalCreateInput): Promise<Goal> {
    await execSQL(
      `INSERT INTO wallet (name, color) VALUES ('goal_' || hex(randomblob(8)), ?)`,
      [input.color ?? null]
    )
    const walletId = await getLastInsertId()
    await execSQL('INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)', [walletId, SYSTEM_TAGS.SYSTEM])
    await tagReferences.increment(SYSTEM_TAGS.SYSTEM)

    await walletRepository.addAccount(walletId, input.currency_id, input.initial_balance)

    await execSQL(
      'INSERT INTO goal (id, name, target_int, target_frac, due_date, wallet_id) VALUES (randomblob(8), ?, ?, ?, ?, ?)',
      [input.name, input.target_int, input.target_frac, input.due_date ?? null, walletId]
    )

    const goal = await findByWalletId(walletId)
    if (!goal) throw new Error('Failed to create goal')
    return goal
  },

  async update(goalId: Uint8Array, input: GoalUpdateInput): Promise<Goal> {
    const fields: string[] = []
    const values: unknown[] = []

    if (input.target_int !== undefined) {
      fields.push('target_int = ?')
      values.push(input.target_int)
    }
    if (input.target_frac !== undefined) {
      fields.push('target_frac = ?')
      values.push(input.target_frac)
    }
    if (input.due_date !== undefined) {
      fields.push('due_date = ?')
      values.push(input.due_date)
    }
    if (input.name !== undefined) {
      fields.push('name = ?')
      values.push(input.name)
    }

    if (fields.length > 0) {
      values.push(goalId)
      await execSQL(`UPDATE goal SET ${fields.join(', ')} WHERE id = ?`, values)
    }

    const goal = await this.findById(goalId)
    if (!goal) throw new Error('Goal not found')
    return goal
  },

  async updateNote(goalId: Uint8Array, note: string | null): Promise<void> {
    const trimmed = note?.trim() || null
    if (trimmed) {
      await execSQL(`
        INSERT INTO goal_note (goal_id, note) VALUES (?, ?)
        ON CONFLICT(goal_id) DO UPDATE SET note = excluded.note, updated_at = unixepoch(CURRENT_TIMESTAMP)
      `, [goalId, trimmed])
    } else {
      await execSQL('DELETE FROM goal_note WHERE goal_id = ?', [goalId])
    }
  },

  async achieve(goalId: Uint8Array): Promise<void> {
    const tagId = await getAchievedTagId()
    await execSQL('INSERT OR IGNORE INTO goal_to_tags (goal_id, tag_id) VALUES (?, ?)', [goalId, tagId])
    await tagReferences.increment(tagId)
  },

  async unachieve(goalId: Uint8Array): Promise<void> {
    const tagId = await getAchievedTagId()
    await execSQL('DELETE FROM goal_to_tags WHERE goal_id = ? AND tag_id = ?', [goalId, tagId])
    await tagReferences.decrement(tagId)
  },

  async archive(goalId: Uint8Array): Promise<void> {
    await execSQL('INSERT OR IGNORE INTO goal_to_tags (goal_id, tag_id) VALUES (?, ?)', [goalId, SYSTEM_TAGS.ARCHIVED])
    await tagReferences.increment(SYSTEM_TAGS.ARCHIVED)
  },

  async unarchive(goalId: Uint8Array): Promise<void> {
    await execSQL('DELETE FROM goal_to_tags WHERE goal_id = ? AND tag_id = ?', [goalId, SYSTEM_TAGS.ARCHIVED])
    await tagReferences.decrement(SYSTEM_TAGS.ARCHIVED)
  },

  // Deletes every trx touching the goal's accounts, then the accounts, then
  // the wallet, then the goal row — one transaction, rollback on failure.
  // Deleting the wallet cascades to its accounts (account.wallet_id ON DELETE
  // CASCADE) and to the goal row itself (goal.wallet_id ON DELETE CASCADE),
  // which in turn cascades to goal_to_tags/goal_note. See design.md Decision 4.
  async remove(goalId: Uint8Array): Promise<void> {
    const goal = await queryOne<{ wallet_id: number }>('SELECT wallet_id FROM goal WHERE id = ?', [goalId])
    if (!goal) throw new Error('Goal not found')

    try {
      await execSQL('BEGIN TRANSACTION')

      const accounts = await querySQL<{ id: number }>('SELECT id FROM account WHERE wallet_id = ?', [goal.wallet_id])
      await deleteTransactionsTouchingAccounts(accounts.map(a => a.id))

      const accountTags = await querySQL<{ tag_id: number }>(
        'SELECT tag_id FROM account_to_tags WHERE account_id IN (SELECT id FROM account WHERE wallet_id = ?)',
        [goal.wallet_id]
      )
      const walletTags = await querySQL<{ tag_id: number }>(
        'SELECT tag_id FROM wallet_to_tags WHERE wallet_id = ?',
        [goal.wallet_id]
      )
      const goalTags = await querySQL<{ tag_id: number }>(
        'SELECT tag_id FROM goal_to_tags WHERE goal_id = ?',
        [goalId]
      )

      // Cascades: account, wallet_to_tags, account_to_tags, goal, goal_to_tags, goal_note.
      await execSQL('DELETE FROM wallet WHERE id = ?', [goal.wallet_id])

      for (const t of accountTags) await tagReferences.decrement(t.tag_id)
      for (const t of walletTags) await tagReferences.decrement(t.tag_id)
      for (const t of goalTags) await tagReferences.decrement(t.tag_id)

      await execSQL('COMMIT')
    } catch (err) {
      await execSQL('ROLLBACK').catch(() => { })
      throw err
    }
  },

  put(input: GoalPutTakeInput): Promise<Transaction> {
    return createPutTake(input, 'put')
  },

  take(input: GoalPutTakeInput): Promise<Transaction> {
    return createPutTake(input, 'take')
  },

  updatePutTake(trxId: Uint8Array, input: GoalPutTakeInput): Promise<Transaction> {
    return updatePutTake(trxId, input)
  },

  // Converts an existing savings wallet into a goal in place: the wallet is
  // renamed/system-tagged and becomes the goal's own hidden wallet, while each
  // of its former accounts either moves to a destination wallet (history
  // preserved, mirrored onto a new goal-side account of the same currency) or
  // is merged/folded into an existing same-currency destination account
  // (history lost, by design — see design.md Decision 3). One transaction;
  // rolled back entirely on any failure.
  async convertWalletToGoal(input: ConvertWalletToGoalInput): Promise<Goal> {
    try {
      await execSQL('BEGIN TRANSACTION')

      await execSQL(`UPDATE wallet SET name = 'goal_' || hex(randomblob(8)), color = ? WHERE id = ?`, [input.color ?? null, input.walletId])
      const alreadySystem = await queryOne<Record<string, unknown>>(
        'SELECT 1 FROM wallet_to_tags WHERE wallet_id = ? AND tag_id = ?',
        [input.walletId, SYSTEM_TAGS.SYSTEM]
      )
      if (!alreadySystem) {
        await execSQL('INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)', [input.walletId, SYSTEM_TAGS.SYSTEM])
        await tagReferences.increment(SYSTEM_TAGS.SYSTEM)
      }

      await execSQL(
        'INSERT INTO goal (id, name, target_int, target_frac, due_date, wallet_id) VALUES (randomblob(8), ?, ?, ?, ?, ?)',
        [input.name, input.target_int, input.target_frac, input.due_date ?? null, input.walletId]
      )

      const mirrorAccountsByCurrency = new Map<number, number>()

      for (const entry of input.plan) {
        const account = await accountRepository.findById(entry.accountId)
        if (!account) throw new Error('Account not found')

        const existingDestAccount = await walletRepository.findAccountByCurrencyAndType(
          entry.destinationWalletId,
          account.currency_id,
          account.account_type ?? 'plain'
        )

        // Mirror account is always created BEFORE the source account is moved/removed,
        // so the goal wallet never transiently drops to zero accounts (which would
        // trigger moveAccountToWallet's "delete empty wallet" cleanup on the goal
        // wallet itself).
        const mirrorAccount = await createMirrorAccount(input.walletId, account.currency_id)
        mirrorAccountsByCurrency.set(account.currency_id, mirrorAccount.id)

        if (!existingDestAccount) {
          const transferLines = await querySQL<{
            trx_id: Uint8Array; sign: '+' | '-'; amount_int: number; amount_frac: number; rate_int: number; rate_frac: number
          }>(
            'SELECT trx_id, sign, amount_int, amount_frac, rate_int, rate_frac FROM trx_base WHERE account_id = ? AND tag_id = ?',
            [entry.accountId, SYSTEM_TAGS.TRANSFER]
          )
          for (const line of transferLines) {
            await execSQL(
              `INSERT INTO trx_base (id, trx_id, account_id, tag_id, sign, amount_int, amount_frac, rate_int, rate_frac)
               VALUES (randomblob(8), ?, ?, ?, ?, ?, ?, ?, ?)`,
              [line.trx_id, mirrorAccount.id, SYSTEM_TAGS.TRANSFER, line.sign, line.amount_int, line.amount_frac, line.rate_int, line.rate_frac]
            )
            await tagReferences.increment(SYSTEM_TAGS.TRANSFER)
          }

          await accountRepository.moveAccountToWallet(entry.accountId, entry.destinationWalletId)
        } else {
          const sourceBalance = fromIntFrac(account.balance_int, account.balance_frac)

          await deleteTransactionsTouchingAccounts([entry.accountId])
          const accountTags = await querySQL<{ tag_id: number }>(
            'SELECT tag_id FROM account_to_tags WHERE account_id = ?',
            [entry.accountId]
          )
          await execSQL('DELETE FROM account WHERE id = ?', [entry.accountId])
          for (const t of accountTags) await tagReferences.decrement(t.tag_id)

          if (sourceBalance !== 0) {
            const currentDestBalance = fromIntFrac(existingDestAccount.balance_int, existingDestAccount.balance_frac)
            const { int: targetInt, frac: targetFrac } = toIntFrac(currentDestBalance + sourceBalance)
            await transactionRepository.createBalanceAdjustment(
              existingDestAccount.id, existingDestAccount.balance_int, existingDestAccount.balance_frac, targetInt, targetFrac
            )

            const { int: initInt, frac: initFrac } = toIntFrac(Math.abs(sourceBalance))
            await transactionRepository.create({
              lines: [{
                account_id: mirrorAccount.id,
                tag_id: SYSTEM_TAGS.INITIAL,
                sign: sourceBalance < 0 ? '-' : '+',
                amount_int: initInt,
                amount_frac: initFrac,
                rate_int: 0,
                rate_frac: 0,
              }],
            })
          }
        }
      }

      const defaultMirrorId = mirrorAccountsByCurrency.get(input.defaultCurrencyId)
      if (defaultMirrorId) {
        await accountRepository.setDefault(defaultMirrorId)
      }

      await execSQL('COMMIT')
    } catch (err) {
      await execSQL('ROLLBACK').catch(() => { })
      throw err
    }

    const goal = await findByWalletId(input.walletId)
    if (!goal) throw new Error('Failed to create goal')
    return goal
  },
}
