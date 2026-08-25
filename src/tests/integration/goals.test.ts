import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  createDatabaseMock,
  insertWallet,
  insertAccount,
  getTestDatabase,
  getCurrencyIdByCode,
} from './setup'
import { SYSTEM_TAGS } from '../../types'

describe('Goals Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  beforeEach(() => {
    resetTestDatabase()
    vi.doMock('../../services/database', () => createDatabaseMock())
  })

  const getGoalRepository = async () => {
    const { goalRepository } = await import('../../services/repositories/goalRepository')
    return goalRepository
  }
  const getAccountRepository = async () => {
    const { accountRepository } = await import('../../services/repositories/accountRepository')
    return accountRepository
  }
  const getTransactionRepository = async () => {
    const { transactionRepository } = await import('../../services/repositories/transactionRepository')
    return transactionRepository
  }
  const getWalletRepository = async () => {
    const { walletRepository } = await import('../../services/repositories/walletRepository')
    return walletRepository
  }

  const markSavingsAccount = (accountId: number) => {
    const db = getTestDatabase()
    const row = db.exec(`SELECT id FROM tag WHERE name = 'savings'`)
    const savingsTagId = Number(row[0].values[0][0])
    db.run('INSERT INTO workspace.account_to_tags (account_id, tag_id) VALUES (?, ?)', [accountId, savingsTagId])
  }

  describe('create', () => {
    it('creates a hidden system-tagged wallet, one default account, and the goal row', async () => {
      const goalRepository = await getGoalRepository()
      const db = getTestDatabase()
      const usdId = getCurrencyIdByCode('USD')

      const goal = await goalRepository.create({
        name: 'Emergency Fund',
        color: '#10B981',
        currency_id: usdId,
        target_int: 5000,
        target_frac: 0,
        due_date: '2027-01-01',
      })

      expect(goal.name).toBe('Emergency Fund')
      expect(goal.currency).toBe('USD')
      expect(goal.balance).toBe(0)
      expect(goal.target_int).toBe(5000)
      expect(goal.due_date).toBe('2027-01-01')
      expect(goal.is_achieved).toBeFalsy()
      expect(goal.is_archived).toBeFalsy()

      const walletTags = db.exec(`SELECT tag_id FROM workspace.wallet_to_tags WHERE wallet_id = ${goal.wallet_id}`)
      expect(walletTags[0].values.map(v => Number(v[0]))).toContain(SYSTEM_TAGS.SYSTEM)

      const account = db.exec(`SELECT currency_id FROM workspace.account WHERE wallet_id = ${goal.wallet_id}`)
      expect(Number(account[0].values[0][0])).toBe(usdId)
    })

    it('records an initial balance as a plain INITIAL-tagged opening transaction', async () => {
      const goalRepository = await getGoalRepository()
      const usdId = getCurrencyIdByCode('USD')

      const goal = await goalRepository.create({
        name: 'Car',
        currency_id: usdId,
        initial_balance: 250,
        target_int: 5000,
        target_frac: 0,
      })

      expect(goal.balance).toBe(250)
    })

    it('excludes the goal wallet from walletRepository.findActive()', async () => {
      const goalRepository = await getGoalRepository()
      const walletRepository = await getWalletRepository()
      const usdId = getCurrencyIdByCode('USD')

      const goal = await goalRepository.create({ name: 'Hidden', currency_id: usdId, target_int: 100, target_frac: 0 })

      const active = await walletRepository.findActive()
      expect(active.some(w => w.id === goal.wallet_id)).toBe(false)
    })
  })

  describe('lifecycle: achieve/unachieve/archive/unarchive', () => {
    it('are independent of each other and never touch the wallet/accounts/transactions', async () => {
      const goalRepository = await getGoalRepository()
      const usdId = getCurrencyIdByCode('USD')
      const goal = await goalRepository.create({ name: 'Home', currency_id: usdId, initial_balance: 10, target_int: 100, target_frac: 0 })

      await goalRepository.achieve(goal.id)
      let reloaded = await goalRepository.findById(goal.id)
      expect(reloaded!.is_achieved).toBeTruthy()
      expect(reloaded!.is_archived).toBeFalsy()
      expect(reloaded!.balance).toBe(10)

      await goalRepository.archive(goal.id)
      reloaded = await goalRepository.findById(goal.id)
      expect(reloaded!.is_achieved).toBeTruthy()
      expect(reloaded!.is_archived).toBeTruthy()

      await goalRepository.unachieve(goal.id)
      reloaded = await goalRepository.findById(goal.id)
      expect(reloaded!.is_achieved).toBeFalsy()
      expect(reloaded!.is_archived).toBeTruthy()

      await goalRepository.unarchive(goal.id)
      reloaded = await goalRepository.findById(goal.id)
      expect(reloaded!.is_achieved).toBeFalsy()
      expect(reloaded!.is_archived).toBeFalsy()
      expect(reloaded!.balance).toBe(10)
    })

    it('sections goals by achieved/archived status', async () => {
      const goalRepository = await getGoalRepository()
      const usdId = getCurrencyIdByCode('USD')
      const active = await goalRepository.create({ name: 'Active', currency_id: usdId, target_int: 100, target_frac: 0 })
      const achieved = await goalRepository.create({ name: 'Achieved', currency_id: usdId, target_int: 100, target_frac: 0 })
      const archived = await goalRepository.create({ name: 'Archived', currency_id: usdId, target_int: 100, target_frac: 0 })
      const both = await goalRepository.create({ name: 'AchievedAndArchived', currency_id: usdId, target_int: 100, target_frac: 0 })

      await goalRepository.achieve(achieved.id)
      await goalRepository.archive(archived.id)
      await goalRepository.achieve(both.id)
      await goalRepository.archive(both.id)

      const activeList = (await goalRepository.findActive()).map(g => g.name)
      const achievedList = (await goalRepository.findAchieved()).map(g => g.name)
      const archivedList = (await goalRepository.findArchived()).map(g => g.name)

      expect(activeList).toEqual(['Active'])
      expect(achievedList).toEqual(['Achieved'])
      expect(archivedList.sort()).toEqual(['AchievedAndArchived', 'Archived'])
    })
  })

  describe('update / note', () => {
    it('updates name, target, and due date', async () => {
      const goalRepository = await getGoalRepository()
      const usdId = getCurrencyIdByCode('USD')
      const goal = await goalRepository.create({ name: 'Old Name', currency_id: usdId, target_int: 100, target_frac: 0 })

      const updated = await goalRepository.update(goal.id, { name: 'New Name', target_int: 200, target_frac: 0, due_date: '2028-01-01' })
      expect(updated.name).toBe('New Name')
      expect(updated.target_int).toBe(200)
      expect(updated.due_date).toBe('2028-01-01')
    })

    it('sets, replaces, and clears the note', async () => {
      const goalRepository = await getGoalRepository()
      const usdId = getCurrencyIdByCode('USD')
      const goal = await goalRepository.create({ name: 'Notey', currency_id: usdId, target_int: 100, target_frac: 0 })

      await goalRepository.updateNote(goal.id, 'Save for a **rainy day**')
      expect((await goalRepository.findById(goal.id))!.note).toBe('Save for a **rainy day**')

      await goalRepository.updateNote(goal.id, null)
      expect((await goalRepository.findById(goal.id))!.note).toBeNull()
    })
  })

  describe('Put/Take', () => {
    it('changes the goal balance without changing the savings account balance, but records the entry there', async () => {
      const goalRepository = await getGoalRepository()
      const accountRepository = await getAccountRepository()
      const transactionRepository = await getTransactionRepository()
      const usdId = getCurrencyIdByCode('USD')

      const goal = await goalRepository.create({ name: 'Savings Goal', currency_id: usdId, target_int: 1000, target_frac: 0 })

      const savingsWalletId = insertWallet({ name: 'Bank' })
      const savingsAccountId = insertAccount({ wallet_id: savingsWalletId, currency_id: usdId, balance_int: 500 })
      markSavingsAccount(savingsAccountId)

      await goalRepository.put({ goalId: goal.id, counterpartyAccountId: savingsAccountId, amount_int: 50, amount_frac: 0 })

      const reloadedGoal = await goalRepository.findById(goal.id)
      expect(reloadedGoal!.balance).toBe(50)
      const savingsAccount = await accountRepository.findById(savingsAccountId)
      expect(savingsAccount!.balance_int).toBe(500)

      const savingsHistory = await transactionRepository.findByAccountAndMonth(savingsAccountId, new Date().toISOString().slice(0, 7))
      expect(savingsHistory.length).toBeGreaterThan(0)

      await goalRepository.take({ goalId: goal.id, counterpartyAccountId: savingsAccountId, amount_int: 20, amount_frac: 0 })
      expect((await goalRepository.findById(goal.id))!.balance).toBe(30)
      expect((await accountRepository.findById(savingsAccountId))!.balance_int).toBe(500)
    })

    it('Put in a new currency creates a matching goal account; Take rejects a currency the goal does not have', async () => {
      const goalRepository = await getGoalRepository()
      const usdId = getCurrencyIdByCode('USD')
      const eurId = getCurrencyIdByCode('EUR')

      const goal = await goalRepository.create({ name: 'Multi-currency Goal', currency_id: usdId, target_int: 1000, target_frac: 0 })
      expect(goal.accounts).toHaveLength(1)

      const eurWalletId = insertWallet({ name: 'Euro Bank' })
      const eurAccountId = insertAccount({ wallet_id: eurWalletId, currency_id: eurId, balance_int: 200 })
      markSavingsAccount(eurAccountId)

      await expect(
        goalRepository.take({ goalId: goal.id, counterpartyAccountId: eurAccountId, amount_int: 10, amount_frac: 0 })
      ).rejects.toThrow(/currency/)

      await goalRepository.put({ goalId: goal.id, counterpartyAccountId: eurAccountId, amount_int: 30, amount_frac: 0 })

      const reloadedGoal = await goalRepository.findById(goal.id)
      expect(reloadedGoal!.accounts).toHaveLength(2)
      const newEurAccount = reloadedGoal!.accounts!.find(a => a.currency_id === eurId)
      expect(newEurAccount!.balance_int).toBe(30)

      // Now that a EUR goal account exists, Take against it succeeds.
      await goalRepository.take({ goalId: goal.id, counterpartyAccountId: eurAccountId, amount_int: 5, amount_frac: 0 })
      const finalGoal = await goalRepository.findById(goal.id)
      expect(finalGoal!.accounts!.find(a => a.currency_id === eurId)!.balance_int).toBe(25)
    })

    it('is excluded from the main transaction list and month summary, but visible on the savings account', async () => {
      const goalRepository = await getGoalRepository()
      const transactionRepository = await getTransactionRepository()
      const usdId = getCurrencyIdByCode('USD')

      const goal = await goalRepository.create({ name: 'Excluded Goal', currency_id: usdId, target_int: 1000, target_frac: 0 })
      const savingsWalletId = insertWallet({ name: 'Bank 2' })
      const savingsAccountId = insertAccount({ wallet_id: savingsWalletId, currency_id: usdId, balance_int: 500 })
      markSavingsAccount(savingsAccountId)

      const before = await transactionRepository.getMonthSummary(new Date().toISOString().slice(0, 7))
      await goalRepository.put({ goalId: goal.id, counterpartyAccountId: savingsAccountId, amount_int: 75, amount_frac: 0 })
      const after = await transactionRepository.getMonthSummary(new Date().toISOString().slice(0, 7))

      expect(after.income).toBe(before.income)
      expect(after.expenses).toBe(before.expenses)

      const db = getTestDatabase()
      const mainListRows = db.exec(`SELECT COUNT(*) FROM transactions WHERE wallet LIKE '%Bank 2%'`)
      expect(Number(mainListRows[0].values[0][0])).toBe(0)

      // findByAccountAndMonth returns every leg of a trx that touches the account
      // (both sides of the Put/Take, same as it would for an ordinary transfer),
      // so the meaningful assertion is "exactly one distinct transaction shows up".
      const savingsHistory = await transactionRepository.findByAccountAndMonth(savingsAccountId, new Date().toISOString().slice(0, 7))
      const distinctTrxIds = new Set(savingsHistory.map(r => Array.from(r.id).join(',')))
      expect(distinctTrxIds.size).toBe(1)
    })

    it('rejects a non-savings counterparty', async () => {
      const goalRepository = await getGoalRepository()
      const usdId = getCurrencyIdByCode('USD')
      const goal = await goalRepository.create({ name: 'Guarded Goal', currency_id: usdId, target_int: 1000, target_frac: 0 })
      const plainWalletId = insertWallet({ name: 'Plain Wallet' })
      const plainAccountId = insertAccount({ wallet_id: plainWalletId, currency_id: usdId, balance_int: 500 })

      await expect(goalRepository.put({ goalId: goal.id, counterpartyAccountId: plainAccountId, amount_int: 10, amount_frac: 0 }))
        .rejects.toThrow(/savings/)
    })
  })

  describe('updatePutTake', () => {
    it('updates amount/date/note in place, preserving trx.id, and moves the goal-side leg when the counterparty currency changes', async () => {
      const goalRepository = await getGoalRepository()
      const transactionRepository = await getTransactionRepository()
      const usdId = getCurrencyIdByCode('USD')
      const eurId = getCurrencyIdByCode('EUR')

      const goal = await goalRepository.create({ name: 'Editable Goal', currency_id: usdId, target_int: 1000, target_frac: 0 })
      const usdWalletId = insertWallet({ name: 'USD Bank' })
      const usdAccountId = insertAccount({ wallet_id: usdWalletId, currency_id: usdId, balance_int: 500 })
      markSavingsAccount(usdAccountId)
      const eurWalletId = insertWallet({ name: 'EUR Bank' })
      const eurAccountId = insertAccount({ wallet_id: eurWalletId, currency_id: eurId, balance_int: 300 })
      markSavingsAccount(eurAccountId)

      const putTrx = await goalRepository.put({ goalId: goal.id, counterpartyAccountId: usdAccountId, amount_int: 50, amount_frac: 0 })

      // Amount-only edit, same account: in-place update.
      await goalRepository.updatePutTake(putTrx.id, {
        goalId: goal.id,
        counterpartyAccountId: usdAccountId,
        amount_int: 80,
        amount_frac: 0,
        note: 'adjusted',
      })

      let reloaded = await transactionRepository.findById(putTrx.id)
      expect(reloaded!.id).toEqual(putTrx.id)
      expect(reloaded!.note).toBe('adjusted')
      let goalLine = reloaded!.lines!.find(l => l.sign === '+')!
      expect(goalLine.amount_int).toBe(80)
      let goalAfterAmountEdit = await goalRepository.findById(goal.id)
      expect(goalAfterAmountEdit!.balance).toBe(80)
      expect((await (await getAccountRepository()).findById(usdAccountId))!.balance_int).toBe(500)

      // Switching the counterparty to a new currency moves the goal-side leg
      // to a (newly created) EUR goal account — mode stays Put throughout.
      await goalRepository.updatePutTake(putTrx.id, {
        goalId: goal.id,
        counterpartyAccountId: eurAccountId,
        amount_int: 40,
        amount_frac: 0,
      })

      reloaded = await transactionRepository.findById(putTrx.id)
      expect(reloaded!.id).toEqual(putTrx.id)
      goalLine = reloaded!.lines!.find(l => l.sign === '+')!
      expect(goalLine.amount_int).toBe(40)
      const finalGoal = await goalRepository.findById(goal.id)
      const eurGoalAccount = finalGoal!.accounts!.find(a => a.currency_id === eurId)
      expect(eurGoalAccount).toBeDefined()
      expect(eurGoalAccount!.balance_int).toBe(40)
      // The now-unused USD goal account is left as-is, not auto-cleaned-up.
      const usdGoalAccount = finalGoal!.accounts!.find(a => a.currency_id === usdId)
      expect(usdGoalAccount!.balance_int).toBe(0)
    })

    it('throws when the transaction is not a Put/Take', async () => {
      const goalRepository = await getGoalRepository()
      const transactionRepository = await getTransactionRepository()
      const usdId = getCurrencyIdByCode('USD')
      const goal = await goalRepository.create({ name: 'Unrelated Goal', currency_id: usdId, target_int: 1000, target_frac: 0 })

      const walletId = insertWallet({ name: 'Ordinary Wallet' })
      const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId, balance_int: 0 })
      const ordinaryTrx = await transactionRepository.create({
        lines: [{ account_id: accountId, tag_id: SYSTEM_TAGS.INITIAL, sign: '+', amount_int: 10, amount_frac: 0, rate_int: 0, rate_frac: 0 }],
      })

      await expect(
        goalRepository.updatePutTake(ordinaryTrx.id, { goalId: goal.id, counterpartyAccountId: accountId, amount_int: 5, amount_frac: 0 })
      ).rejects.toThrow('Put/Take transaction not found')
    })
  })

  describe('remove', () => {
    it('deletes every transaction touching the goal accounts, the accounts, the wallet, and the goal — including the counterparty leg on the funding account', async () => {
      const goalRepository = await getGoalRepository()
      const accountRepository = await getAccountRepository()
      const usdId = getCurrencyIdByCode('USD')

      const goal = await goalRepository.create({ name: 'Doomed Goal', currency_id: usdId, target_int: 1000, target_frac: 0 })
      const goalAccountId = goal.accounts![0].id
      const savingsWalletId = insertWallet({ name: 'Funding Wallet' })
      const savingsAccountId = insertAccount({ wallet_id: savingsWalletId, currency_id: usdId, balance_int: 500 })
      markSavingsAccount(savingsAccountId)

      await goalRepository.put({ goalId: goal.id, counterpartyAccountId: savingsAccountId, amount_int: 40, amount_frac: 0 })

      await goalRepository.remove(goal.id)

      expect(await goalRepository.findById(goal.id)).toBeNull()
      expect(await accountRepository.findById(goalAccountId)).toBeNull()

      const db = getTestDatabase()
      const walletRow = db.exec(`SELECT id FROM workspace.wallet WHERE id = ${goal.wallet_id}`)
      expect(walletRow[0]).toBeUndefined()

      // The zero-leg Put entry is gone from the savings account's own history too
      // (accepted trade-off, surfaced via the confirmation prompt — design.md).
      const remainingTrxBase = db.exec(`SELECT COUNT(*) FROM workspace.trx_base WHERE account_id = ${savingsAccountId}`)
      expect(Number(remainingTrxBase[0].values[0][0])).toBe(0)
      // The savings account itself, and its real balance, are untouched.
      const savingsAccount = await accountRepository.findById(savingsAccountId)
      expect(savingsAccount!.balance_int).toBe(500)
    })
  })

  describe('convertWalletToGoal (real transaction, atomicity)', () => {
    it('moves an account with no currency conflict, mirrors its TRANSFER history onto the goal side, and preserves the original history', async () => {
      const goalRepository = await getGoalRepository()
      const transactionRepository = await getTransactionRepository()
      const db = getTestDatabase()
      const usdId = getCurrencyIdByCode('USD')

      const sourceWalletId = insertWallet({ name: 'Travel fund' })
      const sourceAccountId = insertAccount({ wallet_id: sourceWalletId, currency_id: usdId, balance_int: 300 })
      db.run('INSERT INTO workspace.account_to_tags (account_id, tag_id) VALUES (?, 2)', [sourceAccountId]) // DEFAULT
      const otherWalletId = insertWallet({ name: 'Other account for the transfer' })
      const otherAccountId = insertAccount({ wallet_id: otherWalletId, currency_id: usdId, balance_int: 0 })

      // A historical transfer between sourceAccount and otherAccount, predating the conversion.
      await transactionRepository.create({
        lines: [
          { account_id: sourceAccountId, tag_id: SYSTEM_TAGS.TRANSFER, sign: '-', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 },
          { account_id: otherAccountId, tag_id: SYSTEM_TAGS.TRANSFER, sign: '+', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 },
        ],
      })

      const destinationWalletId = insertWallet({ name: 'Destination wallet' })

      const goal = await goalRepository.convertWalletToGoal({
        walletId: sourceWalletId,
        name: 'Travel',
        target_int: 5000,
        target_frac: 0,
        defaultCurrencyId: usdId,
        plan: [{ accountId: sourceAccountId, destinationWalletId }],
      })

      expect(goal.wallet_id).toBe(sourceWalletId)
      expect(goal.currency).toBe('USD')

      const movedAccount = db.exec(`SELECT wallet_id, balance_int FROM account WHERE id = ${sourceAccountId}`)
      expect(Number(movedAccount[0].values[0][0])).toBe(destinationWalletId)
      expect(Number(movedAccount[0].values[0][1])).toBe(200) // 300 - 100 transfer out

      // The goal's mirror account reflects the same historical transfer.
      const mirrorAccount = db.exec(`SELECT id, balance_int FROM account WHERE wallet_id = ${sourceWalletId}`)
      const mirrorAccountId = Number(mirrorAccount[0].values[0][0])
      expect(Number(mirrorAccount[0].values[0][1])).toBe(-100)

      const mirrorLines = db.exec(`SELECT sign, amount_int FROM workspace.trx_base WHERE account_id = ${mirrorAccountId}`)
      expect(mirrorLines[0].values).toEqual([['-', 100]])

      // Original account's own history is untouched (the transfer trx still has its
      // original two legs, plus the appended mirror leg — three total for that trx).
      const originalTrxLines = db.exec(`
        SELECT COUNT(*) FROM workspace.trx_base
        WHERE trx_id = (SELECT trx_id FROM workspace.trx_base WHERE account_id = ${sourceAccountId} LIMIT 1)
      `)
      expect(Number(originalTrxLines[0].values[0][0])).toBe(3)
    })

    it('merges into an existing same-currency destination account, folding the balance via an Adjust Balance entry and seeding the goal side with a single INITIAL entry (data loss, by design)', async () => {
      const goalRepository = await getGoalRepository()
      const accountRepository = await getAccountRepository()
      const db = getTestDatabase()
      const usdId = getCurrencyIdByCode('USD')

      const sourceWalletId = insertWallet({ name: 'Conflict Source' })
      const sourceAccountId = insertAccount({ wallet_id: sourceWalletId, currency_id: usdId, balance_int: 150 })
      db.run('INSERT INTO workspace.account_to_tags (account_id, tag_id) VALUES (?, 2)', [sourceAccountId])

      const destinationWalletId = insertWallet({ name: 'Existing USD Wallet' })
      const destinationAccountId = insertAccount({ wallet_id: destinationWalletId, currency_id: usdId, balance_int: 400 })

      const goal = await goalRepository.convertWalletToGoal({
        walletId: sourceWalletId,
        name: 'Merged Goal',
        target_int: 1000,
        target_frac: 0,
        defaultCurrencyId: usdId,
        plan: [{ accountId: sourceAccountId, destinationWalletId }],
      })

      // Source account no longer exists.
      expect(await accountRepository.findById(sourceAccountId)).toBeNull()
      // Destination balance folds in the source's balance.
      const destinationAccount = await accountRepository.findById(destinationAccountId)
      expect(destinationAccount!.balance_int).toBe(550)
      // The goal's mirror account starts from the merged balance via a single INITIAL entry.
      const mirrorAccountId = goal.accounts![0].id
      const mirrorLines = db.exec(`SELECT tag_id, amount_int FROM workspace.trx_base WHERE account_id = ${mirrorAccountId}`)
      expect(mirrorLines[0].values).toEqual([[SYSTEM_TAGS.INITIAL, 150]])
    })

    it('does not merge a savings-typed source account into a plain-typed destination account of the same currency (design.md Decision 8)', async () => {
      const goalRepository = await getGoalRepository()
      const accountRepository = await getAccountRepository()
      const db = getTestDatabase()
      const usdId = getCurrencyIdByCode('USD')

      const sourceWalletId = insertWallet({ name: 'Savings Source' })
      const sourceAccountId = insertAccount({ wallet_id: sourceWalletId, currency_id: usdId, balance_int: 150 })
      db.run('INSERT INTO workspace.account_to_tags (account_id, tag_id) VALUES (?, 2)', [sourceAccountId]) // DEFAULT
      markSavingsAccount(sourceAccountId)

      const destinationWalletId = insertWallet({ name: 'Destination With Plain USD' })
      const destinationPlainAccountId = insertAccount({ wallet_id: destinationWalletId, currency_id: usdId, balance_int: 400 })

      await goalRepository.convertWalletToGoal({
        walletId: sourceWalletId,
        name: 'Type-Aware Conflict Goal',
        target_int: 1000,
        target_frac: 0,
        defaultCurrencyId: usdId,
        plan: [{ accountId: sourceAccountId, destinationWalletId }],
      })

      // Not merged: the source account moved in as a second, distinct account —
      // the plain-typed destination account's own balance/history is untouched.
      const destinationPlainAccount = await accountRepository.findById(destinationPlainAccountId)
      expect(destinationPlainAccount!.balance_int).toBe(400)

      const movedAccount = db.exec(`SELECT wallet_id, balance_int FROM account WHERE id = ${sourceAccountId}`)
      expect(Number(movedAccount[0].values[0][0])).toBe(destinationWalletId)
      expect(Number(movedAccount[0].values[0][1])).toBe(150)

      const destinationAccountCount = db.exec(`SELECT COUNT(*) FROM account WHERE wallet_id = ${destinationWalletId}`)
      expect(Number(destinationAccountCount[0].values[0][0])).toBe(2)
    })

    it('rolls back every write when a later step fails partway through', async () => {
      const goalRepository = await getGoalRepository()
      const db = getTestDatabase()
      const usdId = getCurrencyIdByCode('USD')

      const sourceWalletId = insertWallet({ name: 'Rollback Source' })
      const sourceAccountId = insertAccount({ wallet_id: sourceWalletId, currency_id: usdId, balance_int: 100 })
      db.run('INSERT INTO workspace.account_to_tags (account_id, tag_id) VALUES (?, 2)', [sourceAccountId])

      await expect(goalRepository.convertWalletToGoal({
        walletId: sourceWalletId,
        name: 'Rollback Goal',
        target_int: 1000,
        target_frac: 0,
        defaultCurrencyId: usdId,
        // Non-existent destination wallet forces accountRepository.moveAccountToWallet to fail.
        plan: [{ accountId: sourceAccountId, destinationWalletId: 999999 }],
      })).rejects.toThrow()

      // No goal was created, the source account never moved, no extra mirror account survives.
      const goalRow = db.exec(`SELECT id FROM workspace.goal WHERE wallet_id = ${sourceWalletId}`)
      expect(goalRow[0]).toBeUndefined()
      const account = db.exec(`SELECT wallet_id FROM account WHERE id = ${sourceAccountId}`)
      expect(Number(account[0].values[0][0])).toBe(sourceWalletId)
      const accountsInSourceWallet = db.exec(`SELECT COUNT(*) FROM account WHERE wallet_id = ${sourceWalletId}`)
      expect(Number(accountsInSourceWallet[0].values[0][0])).toBe(1)
    })

    it('rejects a plan entry referencing a non-existent account', async () => {
      const goalRepository = await getGoalRepository()
      const usdId = getCurrencyIdByCode('USD')
      const sourceWalletId = insertWallet({ name: 'Bad Plan Source' })
      insertAccount({ wallet_id: sourceWalletId, currency_id: usdId, balance_int: 0 })

      await expect(goalRepository.convertWalletToGoal({
        walletId: sourceWalletId,
        name: 'Bad Plan Goal',
        target_int: 100,
        target_frac: 0,
        defaultCurrencyId: usdId,
        plan: [{ accountId: 999999, destinationWalletId: sourceWalletId }],
      })).rejects.toThrow('Account not found')
    })
  })

  it('resolves and reuses the achieved tag by name rather than a reserved numeric id', async () => {
    const goalRepository = await getGoalRepository()
    const db = getTestDatabase()
    const usdId = getCurrencyIdByCode('USD')

    const goalA = await goalRepository.create({ name: 'A', currency_id: usdId, target_int: 100, target_frac: 0 })
    await goalRepository.achieve(goalA.id)
    const goalB = await goalRepository.create({ name: 'B', currency_id: usdId, target_int: 100, target_frac: 0 })
    await goalRepository.achieve(goalB.id)

    const achievedTagRows = db.exec(`SELECT id FROM tag WHERE name = 'achieved'`)
    expect(achievedTagRows[0].values.length).toBe(1)
    const achievedTagId = Number(achievedTagRows[0].values[0][0])

    const usages = db.exec(`SELECT COUNT(*) FROM workspace.goal_to_tags WHERE tag_id = ${achievedTagId}`)
    expect(Number(usages[0].values[0][0])).toBe(2)
  })
})
