import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Account } from '../../../types'

// Most of goalRepository's behavior is SQL-heavy (schema joins, cascades,
// transaction ordering) and is exercised realistically against a real sqlite
// engine in src/tests/integration/goals.test.ts. This file mocks the DB layer
// to cover branch logic and error paths that don't need a real engine:
// achieved-tag lazy resolution, Put/Take validation, and rollback-on-failure.

vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  getLastInsertId: vi.fn(),
}))

vi.mock('../../../services/repositories/walletRepository', () => ({
  walletRepository: {
    addAccount: vi.fn(),
    findAccountByCurrency: vi.fn(),
  },
}))

vi.mock('../../../services/repositories/accountRepository', () => ({
  accountRepository: {
    findById: vi.fn(),
    findByWalletId: vi.fn(),
    moveAccountToWallet: vi.fn(),
    setDefault: vi.fn(),
  },
}))

vi.mock('../../../services/repositories/transactionRepository', () => ({
  transactionRepository: {
    create: vi.fn(),
    update: vi.fn(),
    createBalanceAdjustment: vi.fn(),
  },
}))

import { goalRepository } from '../../../services/repositories/goalRepository'
import { accountRepository } from '../../../services/repositories/accountRepository'
import { walletRepository } from '../../../services/repositories/walletRepository'
import { transactionRepository } from '../../../services/repositories/transactionRepository'
import { execSQL, querySQL, queryOne } from '../../../services/database'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)
const mockAccountFindById = vi.mocked(accountRepository.findById)
const mockFindAccountByCurrency = vi.mocked(walletRepository.findAccountByCurrency)
const mockAddAccount = vi.mocked(walletRepository.addAccount)
const mockTransactionCreate = vi.mocked(transactionRepository.create)
const mockTransactionUpdate = vi.mocked(transactionRepository.update)

const goalId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])

const savingsAccount: Account = {
  id: 2, wallet_id: 20, currency_id: 1, balance_int: 500, balance_frac: 0, updated_at: 0, account_type: 'savings',
}
const goalAccount: Account = {
  id: 1, wallet_id: 10, currency_id: 1, balance_int: 0, balance_frac: 0, updated_at: 0, account_type: 'plain',
}

describe('goalRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockQuerySQL.mockResolvedValue([])
  })

  describe('achieved tag resolution', () => {
    it('read paths (findActive/findAchieved/findAll) never resolve or create the tag — it is inlined as a subquery', async () => {
      mockQuerySQL.mockResolvedValueOnce([])

      await goalRepository.findActive()

      expect(mockQueryOne).not.toHaveBeenCalled()
      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('achieve() reuses the achieved tag id when it already exists, without inserting', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 99 }) // getAchievedTagId

      await goalRepository.achieve(goalId)

      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO tag'))
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO goal_to_tags (goal_id, tag_id) VALUES (?, ?)',
        [goalId, 99]
      )
    })

    it('achieve() creates the achieved tag lazily on first use rather than relying on migration-time seeding', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // getAchievedTagId: not found yet
        .mockResolvedValueOnce({ id: 42 }) // getAchievedTagId: re-select after insert

      await goalRepository.achieve(goalId)

      expect(mockExecSQL).toHaveBeenCalledWith(`INSERT OR IGNORE INTO tag (name) VALUES ('achieved')`)
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO goal_to_tags (goal_id, tag_id) VALUES (?, ?)',
        [goalId, 42]
      )
    })
  })

  describe('findAll', () => {
    it('queries every goal with no where clause', async () => {
      mockQuerySQL.mockResolvedValueOnce([])
      await goalRepository.findAll()
      expect(mockQuerySQL).toHaveBeenCalledWith(expect.stringContaining('ORDER BY g.name ASC'), [22, 2])
    })
  })

  describe('Put/Take', () => {
    const goalWalletId = 10

    function mockGoalLookup() {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT wallet_id FROM goal WHERE id')) {
          return { wallet_id: goalWalletId }
        }
        return null
      })
    }

    it('rejects when the goal does not exist', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await expect(
        goalRepository.put({ goalId, counterpartyAccountId: savingsAccount.id, amount_int: 10, amount_frac: 0 })
      ).rejects.toThrow('Goal not found')
    })

    it('rejects when the counterparty account does not exist', async () => {
      mockGoalLookup()
      mockAccountFindById.mockResolvedValue(null)

      await expect(
        goalRepository.put({ goalId, counterpartyAccountId: savingsAccount.id, amount_int: 10, amount_frac: 0 })
      ).rejects.toThrow('Counterparty account not found')
    })

    it('rejects a non-savings counterparty account', async () => {
      mockGoalLookup()
      mockAccountFindById.mockResolvedValue({ ...savingsAccount, account_type: 'plain' })

      await expect(
        goalRepository.put({ goalId, counterpartyAccountId: savingsAccount.id, amount_int: 10, amount_frac: 0 })
      ).rejects.toThrow(/savings/)
      expect(mockTransactionCreate).not.toHaveBeenCalled()
    })

    it('reuses the existing same-currency goal account for a Put', async () => {
      mockGoalLookup()
      mockAccountFindById.mockResolvedValue(savingsAccount)
      mockFindAccountByCurrency.mockResolvedValue(goalAccount)
      mockTransactionCreate.mockResolvedValue({} as never)

      await goalRepository.put({ goalId, counterpartyAccountId: savingsAccount.id, amount_int: 50, amount_frac: 0 })

      expect(mockFindAccountByCurrency).toHaveBeenCalledWith(goalWalletId, savingsAccount.currency_id)
      expect(mockAddAccount).not.toHaveBeenCalled()
      expect(mockTransactionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({ account_id: goalAccount.id, sign: '+', amount_int: 50, amount_frac: 0 }),
            expect.objectContaining({ account_id: savingsAccount.id, sign: '-', amount_int: 0, amount_frac: 0 }),
          ],
        })
      )
    })

    it('creates a new goal-side account for a Put in a currency the goal does not yet have', async () => {
      mockGoalLookup()
      mockAccountFindById.mockResolvedValue({ ...savingsAccount, currency_id: 2 })
      mockFindAccountByCurrency.mockResolvedValue(null)
      mockAddAccount.mockResolvedValue({ ...goalAccount, id: 99, currency_id: 2 })
      mockTransactionCreate.mockResolvedValue({} as never)

      await goalRepository.put({ goalId, counterpartyAccountId: savingsAccount.id, amount_int: 50, amount_frac: 0 })

      expect(mockAddAccount).toHaveBeenCalledWith(goalWalletId, 2)
      expect(mockTransactionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({ account_id: 99, sign: '+' }),
            expect.objectContaining({ account_id: savingsAccount.id, sign: '-' }),
          ],
        })
      )
    })

    it('rejects a Take when no goal account exists in that currency — nothing to auto-create on the way out', async () => {
      mockGoalLookup()
      mockAccountFindById.mockResolvedValue(savingsAccount)
      mockFindAccountByCurrency.mockResolvedValue(null)

      await expect(
        goalRepository.take({ goalId, counterpartyAccountId: savingsAccount.id, amount_int: 10, amount_frac: 0 })
      ).rejects.toThrow(/currency/)
      expect(mockTransactionCreate).not.toHaveBeenCalled()
    })

    it('take() flips the signs relative to put()', async () => {
      mockGoalLookup()
      mockAccountFindById.mockResolvedValue(savingsAccount)
      mockFindAccountByCurrency.mockResolvedValue(goalAccount)
      mockTransactionCreate.mockResolvedValue({} as never)

      await goalRepository.take({ goalId, counterpartyAccountId: savingsAccount.id, amount_int: 20, amount_frac: 0 })

      expect(mockTransactionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({ account_id: goalAccount.id, sign: '-' }),
            expect.objectContaining({ account_id: savingsAccount.id, sign: '+' }),
          ],
        })
      )
    })
  })

  describe('updatePutTake', () => {
    const goalWalletId = 10
    const trxId = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9])

    function mockLookups(existingSign: '+' | '-') {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT wallet_id FROM goal WHERE id')) {
          return { wallet_id: goalWalletId }
        }
        if (typeof sql === 'string' && sql.includes('FROM trx_base tb')) {
          return { sign: existingSign }
        }
        return null
      })
    }

    it('throws when the transaction is not a Put/Take on any goal', async () => {
      mockQueryOne.mockResolvedValue(null)

      await expect(
        goalRepository.updatePutTake(trxId, { goalId, counterpartyAccountId: savingsAccount.id, amount_int: 10, amount_frac: 0 })
      ).rejects.toThrow('Put/Take transaction not found')
    })

    it('throws when the given goalId does not match the transaction\'s actual goal', async () => {
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM trx_base tb')) return { sign: '+' }
        if (typeof sql === 'string' && sql.includes('SELECT wallet_id FROM goal WHERE id')) return null
        return null
      })

      await expect(
        goalRepository.updatePutTake(trxId, { goalId, counterpartyAccountId: savingsAccount.id, amount_int: 10, amount_frac: 0 })
      ).rejects.toThrow('Goal not found')
    })

    it('rejects when the counterparty account does not exist', async () => {
      mockLookups('+')
      mockAccountFindById.mockResolvedValue(null)

      await expect(
        goalRepository.updatePutTake(trxId, { goalId, counterpartyAccountId: savingsAccount.id, amount_int: 10, amount_frac: 0 })
      ).rejects.toThrow('Counterparty account not found')
    })

    it('rejects a non-savings counterparty account', async () => {
      mockLookups('+')
      mockAccountFindById.mockResolvedValue({ ...savingsAccount, account_type: 'plain' })

      await expect(
        goalRepository.updatePutTake(trxId, { goalId, counterpartyAccountId: savingsAccount.id, amount_int: 10, amount_frac: 0 })
      ).rejects.toThrow(/savings/)
      expect(mockTransactionUpdate).not.toHaveBeenCalled()
    })

    it('locks direction to the existing entry (a Put stays a Put) regardless of input', async () => {
      mockLookups('+')
      mockAccountFindById.mockResolvedValue(savingsAccount)
      mockFindAccountByCurrency.mockResolvedValue(goalAccount)
      mockTransactionUpdate.mockResolvedValue({} as never)

      await goalRepository.updatePutTake(trxId, { goalId, counterpartyAccountId: savingsAccount.id, amount_int: 75, amount_frac: 0 })

      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        trxId,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ account_id: goalAccount.id, sign: '+', amount_int: 75, amount_frac: 0 }),
            expect.objectContaining({ account_id: savingsAccount.id, sign: '-', amount_int: 0, amount_frac: 0 }),
          ],
        })
      )
    })

    it('re-resolves the goal-side account when the counterparty currency changes', async () => {
      mockLookups('-')
      mockAccountFindById.mockResolvedValue({ ...savingsAccount, currency_id: 3 })
      mockFindAccountByCurrency.mockResolvedValue({ ...goalAccount, id: 77, currency_id: 3 })
      mockTransactionUpdate.mockResolvedValue({} as never)

      await goalRepository.updatePutTake(trxId, { goalId, counterpartyAccountId: savingsAccount.id, amount_int: 20, amount_frac: 0 })

      expect(mockFindAccountByCurrency).toHaveBeenCalledWith(goalWalletId, 3)
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        trxId,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ account_id: 77, sign: '-' }),
            expect.objectContaining({ account_id: savingsAccount.id, sign: '+' }),
          ],
        })
      )
    })
  })

  describe('remove', () => {
    it('rolls back the whole transaction when a step fails', async () => {
      mockQueryOne.mockResolvedValueOnce({ wallet_id: 10 }) // goal lookup
      mockExecSQL.mockImplementation(async (sql: string) => {
        if (typeof sql === 'string' && sql.startsWith('DELETE FROM wallet')) {
          throw new Error('delete failed')
        }
      })

      await expect(goalRepository.remove(goalId)).rejects.toThrow('delete failed')

      const execCalls = mockExecSQL.mock.calls.map(c => c[0])
      expect(execCalls).toContain('BEGIN TRANSACTION')
      expect(execCalls).toContain('ROLLBACK')
      expect(execCalls).not.toContain('COMMIT')
    })

    it('throws when the goal does not exist', async () => {
      mockQueryOne.mockResolvedValueOnce(null)

      await expect(goalRepository.remove(goalId)).rejects.toThrow('Goal not found')
      expect(mockExecSQL).not.toHaveBeenCalledWith('BEGIN TRANSACTION')
    })
  })

  describe('achieve / unachieve / archive / unarchive', () => {
    it('achieve inserts the (lazily-resolved) achieved tag into goal_to_tags', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 42 }) // achieved tag already exists

      await goalRepository.achieve(goalId)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO goal_to_tags (goal_id, tag_id) VALUES (?, ?)',
        [goalId, 42]
      )
    })

    it('archive inserts the reserved ARCHIVED tag id directly, without resolving by name', async () => {
      await goalRepository.archive(goalId)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO goal_to_tags (goal_id, tag_id) VALUES (?, ?)',
        [goalId, 22]
      )
      expect(mockQueryOne).not.toHaveBeenCalled()
    })

    it('unarchive removes the ARCHIVED tag', async () => {
      await goalRepository.unarchive(goalId)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM goal_to_tags WHERE goal_id = ? AND tag_id = ?',
        [goalId, 22]
      )
    })
  })

  describe('updateNote', () => {
    it('upserts a trimmed non-empty note', async () => {
      await goalRepository.updateNote(goalId, '  hello  ')

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO goal_note'),
        [goalId, 'hello']
      )
    })

    it('deletes the note when passed null', async () => {
      await goalRepository.updateNote(goalId, null)

      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM goal_note WHERE goal_id = ?', [goalId])
    })

    it('deletes the note when passed a blank string', async () => {
      await goalRepository.updateNote(goalId, '   ')

      expect(mockExecSQL).toHaveBeenCalledWith('DELETE FROM goal_note WHERE goal_id = ?', [goalId])
    })
  })
})
