import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database/connection', () => ({
  execSQL: vi.fn().mockResolvedValue(undefined),
  queryOne: vi.fn().mockResolvedValue(null),
  getLastInsertId: vi.fn().mockResolvedValue(1),
  validateReferenceExists: vi.fn().mockResolvedValue(true),
}))

vi.mock('../../../../services/database/workspace', () => ({
  getActiveWorkspaceId: vi.fn().mockReturnValue(1),
  switchWorkspace: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../../services/workspaceTransfer/sharedEntityReconciliation', () => ({
  reconcileIcons: vi.fn().mockResolvedValue(new Map()),
  reconcileTags: vi.fn().mockResolvedValue(new Map()),
  reconcileCurrencies: vi.fn().mockResolvedValue(new Map()),
  reconcileCounterparties: vi.fn().mockResolvedValue(new Map()),
}))

import { importWorkspacePackage } from '../../../../services/workspaceTransfer/workspaceImport'
import { execSQL, queryOne, getLastInsertId, validateReferenceExists } from '../../../../services/database/connection'
import { getActiveWorkspaceId, switchWorkspace } from '../../../../services/database/workspace'
import { reconcileTags, reconcileCurrencies, reconcileCounterparties } from '../../../../services/workspaceTransfer/sharedEntityReconciliation'
import type { WorkspacePackage, WorkspaceWallet, WorkspaceAccount, WorkspaceTransaction, WorkspaceBudget } from '../../../../services/workspaceTransfer/workspaceTypes'

const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)
const mockGetLastInsertId = vi.mocked(getLastInsertId)
const mockValidateReferenceExists = vi.mocked(validateReferenceExists)
const mockGetActiveWorkspaceId = vi.mocked(getActiveWorkspaceId)
const mockSwitchWorkspace = vi.mocked(switchWorkspace)
const mockReconcileTags = vi.mocked(reconcileTags)
const mockReconcileCurrencies = vi.mocked(reconcileCurrencies)
const mockReconcileCounterparties = vi.mocked(reconcileCounterparties)

function emptyPackage(overrides: Partial<WorkspacePackage> = {}): WorkspacePackage {
  return {
    version: 1,
    workspace_name: 'Imported',
    created_at: 1000,
    icons: [],
    tags: [],
    currencies: [],
    counterparties: [],
    wallets: [],
    accounts: [],
    transactions: [],
    budgets: [],
    ...overrides,
  }
}

function wallet(overrides: Partial<WorkspaceWallet> = {}): WorkspaceWallet {
  return { id: 1, name: 'Cash', color: null, tags: [], ...overrides }
}

function account(overrides: Partial<WorkspaceAccount> = {}): WorkspaceAccount {
  return {
    id: 1, wallet: 1, currency: 'USD', tags: [],
    balance_int: 0, balance_frac: 0,
    ...overrides,
  }
}

function transaction(overrides: Partial<WorkspaceTransaction> = {}): WorkspaceTransaction {
  return {
    timestamp: 1000, counterparty: null, note: null,
    lines: [],
    ...overrides,
  }
}

function budget(overrides: Partial<WorkspaceBudget> = {}): WorkspaceBudget {
  return {
    start: 0, end: 1000, tag: 'Groceries', type: 'expense',
    amount_int: 100, amount_frac: 0,
    ...overrides,
  }
}

describe('importWorkspacePackage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
    mockQueryOne.mockResolvedValue(null)
    mockGetLastInsertId.mockResolvedValue(1)
    mockValidateReferenceExists.mockResolvedValue(true)
    mockGetActiveWorkspaceId.mockReturnValue(1)
    mockSwitchWorkspace.mockResolvedValue(undefined)
    mockReconcileTags.mockResolvedValue(new Map())
    mockReconcileCurrencies.mockResolvedValue(new Map())
    mockReconcileCounterparties.mockResolvedValue(new Map())
  })

  it('creates a new shared.workspace row by default', async () => {
    mockGetLastInsertId.mockResolvedValueOnce(99) // new workspace id
    mockGetActiveWorkspaceId.mockReturnValue(99) // pretend switch already landed us there for this call

    await importWorkspacePackage(emptyPackage({ workspace_name: 'Business' }))

    expect(mockExecSQL).toHaveBeenCalledWith(`INSERT INTO shared.workspace (name) VALUES (?)`, ['Business'])
  })

  it('throws when mergeIntoWorkspaceId does not reference an existing workspace', async () => {
    mockValidateReferenceExists.mockResolvedValueOnce(false)

    await expect(importWorkspacePackage(emptyPackage(), { mergeIntoWorkspaceId: 404 })).rejects.toThrow('Target workspace not found')
  })

  it('does not switch workspaces when merging into the currently active one', async () => {
    mockGetActiveWorkspaceId.mockReturnValue(1)

    await importWorkspacePackage(emptyPackage(), { mergeIntoWorkspaceId: 1 })

    expect(mockSwitchWorkspace).not.toHaveBeenCalled()
    expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO shared.workspace'), expect.anything())
  })

  it('switches to the target workspace and back to the original when merging into a different one', async () => {
    mockGetActiveWorkspaceId.mockReturnValue(1)

    await importWorkspacePackage(emptyPackage(), { mergeIntoWorkspaceId: 2 })

    expect(mockSwitchWorkspace.mock.calls).toEqual([[2], [1]])
  })

  it('switches to the newly created workspace and restores the original active one afterward', async () => {
    mockGetActiveWorkspaceId.mockReturnValue(1)
    mockGetLastInsertId.mockResolvedValueOnce(77)

    await importWorkspacePackage(emptyPackage())

    expect(mockSwitchWorkspace.mock.calls).toEqual([[77], [1]])
  })

  it('still restores the original workspace when the import throws partway through', async () => {
    mockGetActiveWorkspaceId.mockReturnValue(1)
    mockExecSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO workspace.wallet')) throw new Error('boom')
    })

    await expect(
      importWorkspacePackage(emptyPackage({ wallets: [{ id: 1, name: 'Cash', color: null, tags: [] }] }), { mergeIntoWorkspaceId: 2 })
    ).rejects.toThrow('boom')

    expect(mockSwitchWorkspace.mock.calls).toEqual([[2], [1]])
  })

  it('reports import counts from the reconciliation and insert results', async () => {
    mockGetActiveWorkspaceId.mockReturnValue(1)

    const result = await importWorkspacePackage(emptyPackage(), { mergeIntoWorkspaceId: 1 })

    expect(result.workspaceId).toBe(1)
    expect(result.imported).toEqual({
      icons: 0,
      tags: 0,
      currencies: 0,
      counterparties: 0,
      wallets: 0,
      accounts: 0,
      transactions: 0,
      budgets: 0,
    })
  })

  describe('wallets', () => {
    it('creates a new wallet when none exists by name, and tags it via the reconciliation map', async () => {
      mockReconcileTags.mockResolvedValue(new Map([['savings', 5]]))
      mockQueryOne.mockResolvedValue(null) // no existing wallet by name

      await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ name: 'Savings', tags: ['savings'] })],
      }))

      expect(mockExecSQL).toHaveBeenCalledWith(
        `INSERT INTO workspace.wallet (name, color) VALUES (?, ?)`,
        ['Savings', null]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        `INSERT INTO workspace.wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)`,
        [1, 5]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO shared.tag_references'),
        [5]
      )
    })

    it('reuses an existing wallet by name instead of inserting a duplicate', async () => {
      mockQueryOne.mockResolvedValueOnce({ id: 42 }) // existing wallet named 'Cash'

      await importWorkspacePackage(emptyPackage({ wallets: [wallet({ name: 'Cash' })] }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        `INSERT INTO workspace.wallet (name, color) VALUES (?, ?)`,
        expect.anything()
      )
    })

    it('skips re-tagging a reused wallet that already carries the tag (merge dedup)', async () => {
      mockReconcileTags.mockResolvedValue(new Map([['savings', 5]]))
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM workspace.wallet WHERE name')) return { id: 42 }
        if (sql.includes('FROM workspace.wallet_to_tags')) return { 1: 1 } // already tagged
        return null
      })

      await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ name: 'Savings', tags: ['savings'] })],
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        `INSERT INTO workspace.wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)`,
        expect.anything()
      )
    })

    it("resolves a wallet tag via the live shared.tag lookup when it's not in the reconciliation map (system tags)", async () => {
      mockReconcileTags.mockResolvedValue(new Map()) // system tags are never in this map
      mockQueryOne.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM shared.tag WHERE name')) return { id: 2 } // 'default' system tag
        return null
      })

      await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ tags: ['default'] })],
      }))

      expect(mockExecSQL).toHaveBeenCalledWith(
        `INSERT INTO workspace.wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)`,
        [1, 2]
      )
    })

    it('skips a wallet tag that resolves to no known tag id at all', async () => {
      mockReconcileTags.mockResolvedValue(new Map())
      mockQueryOne.mockResolvedValue(null) // live shared.tag lookup also misses

      await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ tags: ['nonexistent'] })],
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        `INSERT INTO workspace.wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)`,
        expect.anything()
      )
    })
  })

  describe('accounts', () => {
    it('creates an account, tags it, and stores account_data when note/due_date/rate are present', async () => {
      mockReconcileTags.mockResolvedValue(new Map([['savings', 5]]))
      mockReconcileCurrencies.mockResolvedValue(new Map([['USD', 7]]))
      mockGetLastInsertId
        .mockResolvedValueOnce(10) // wallet insert
        .mockResolvedValueOnce(20) // account insert

      const result = await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ id: 1 })],
        accounts: [account({ id: 1, wallet: 1, currency: 'USD', tags: ['savings'], note: 'note', due_date: '2026-01-01', rate: 5 })],
      }), { mergeIntoWorkspaceId: 1 })

      expect(mockExecSQL).toHaveBeenCalledWith(
        `INSERT INTO workspace.account (wallet_id, currency_id, balance_int, balance_frac) VALUES (?, ?, ?, ?)`,
        [10, 7, 0, 0]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        `INSERT OR IGNORE INTO workspace.account_to_tags (account_id, tag_id) VALUES (?, ?)`,
        [20, 5]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        `INSERT INTO workspace.account_data (account_id, note, due_date, rate) VALUES (?, ?, ?, ?)`,
        [20, 'note', '2026-01-01', 5]
      )
      expect(result.imported.accounts).toBe(1)
    })

    it('omits account_data entirely when note/due_date/rate are all absent', async () => {
      mockReconcileCurrencies.mockResolvedValue(new Map([['USD', 7]]))

      await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ id: 1 })],
        accounts: [account({ id: 1, wallet: 1, currency: 'USD' })],
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workspace.account_data'),
        expect.anything()
      )
    })

    it("skips tagging an account with a tag that doesn't resolve", async () => {
      mockReconcileCurrencies.mockResolvedValue(new Map([['USD', 7]]))
      mockQueryOne.mockResolvedValue(null) // live shared.tag fallback also misses

      await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ id: 1 })],
        accounts: [account({ id: 1, wallet: 1, currency: 'USD', tags: ['nonexistent'] })],
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO workspace.account_to_tags'),
        expect.anything()
      )
    })

    it('stores account_data with individually-absent fields defaulted to null', async () => {
      mockReconcileCurrencies.mockResolvedValue(new Map([['USD', 7]]))

      await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ id: 1 })],
        accounts: [account({ id: 1, wallet: 1, currency: 'USD', rate: 0 })], // rate != null is true even though 0 is falsy
      }))

      expect(mockExecSQL).toHaveBeenCalledWith(
        `INSERT INTO workspace.account_data (account_id, note, due_date, rate) VALUES (?, ?, ?, ?)`,
        [1, null, null, 0]
      )
    })

    it('defaults a genuinely absent rate to null when only note is present', async () => {
      mockReconcileCurrencies.mockResolvedValue(new Map([['USD', 7]]))

      await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ id: 1 })],
        accounts: [account({ id: 1, wallet: 1, currency: 'USD', note: 'note' })], // rate left undefined
      }))

      expect(mockExecSQL).toHaveBeenCalledWith(
        `INSERT INTO workspace.account_data (account_id, note, due_date, rate) VALUES (?, ?, ?, ?)`,
        [1, 'note', null, null]
      )
    })

    it("skips an account whose wallet reference doesn't resolve", async () => {
      mockReconcileCurrencies.mockResolvedValue(new Map([['USD', 7]]))

      const result = await importWorkspacePackage(emptyPackage({
        accounts: [account({ id: 1, wallet: 999, currency: 'USD' })], // no such wallet in the package
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workspace.account ('),
        expect.anything()
      )
      expect(result.imported.accounts).toBe(0)
    })

    it("skips an account whose currency reference doesn't resolve", async () => {
      mockReconcileCurrencies.mockResolvedValue(new Map()) // 'XYZ' not reconciled

      const result = await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ id: 1 })],
        accounts: [account({ id: 1, wallet: 1, currency: 'XYZ' })],
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workspace.account ('),
        expect.anything()
      )
      expect(result.imported.accounts).toBe(0)
    })
  })

  describe('transactions', () => {
    it('imports a multi-line transaction when every line resolves, including tag_context and counterparty/note', async () => {
      mockReconcileTags.mockResolvedValue(new Map([['income', 9], ['expense', 10], ['recurring', 11]]))
      mockReconcileCurrencies.mockResolvedValue(new Map([['USD', 7]]))
      mockReconcileCounterparties.mockResolvedValue(new Map([['Employer', 3]]))
      mockGetLastInsertId
        .mockResolvedValueOnce(10) // wallet
        .mockResolvedValueOnce(20) // account

      const result = await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ id: 1 })],
        accounts: [account({ id: 1, wallet: 1, currency: 'USD' })],
        transactions: [transaction({
          counterparty: 'Employer',
          note: 'Paycheck',
          lines: [
            { account: 1, tag: 'income', tag_context: 'recurring', sign: '+', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 },
          ],
        })],
      }))

      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workspace.trx ('), expect.anything())
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workspace.trx_base ('), expect.anything())
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO workspace.trx_base_tag_context'),
        expect.arrayContaining([11])
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        `INSERT INTO workspace.trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)`,
        expect.arrayContaining([3])
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workspace.trx_note'),
        expect.arrayContaining(['Paycheck'])
      )
      expect(result.imported.transactions).toBe(1)
    })

    it("skips the whole transaction when any line's account reference doesn't resolve", async () => {
      mockReconcileTags.mockResolvedValue(new Map([['income', 9]]))

      const result = await importWorkspacePackage(emptyPackage({
        transactions: [transaction({
          lines: [{ account: 999, tag: 'income', sign: '+', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 }],
        })],
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workspace.trx ('), expect.anything())
      expect(result.imported.transactions).toBe(0)
    })

    it("skips the whole transaction when any line's tag reference doesn't resolve", async () => {
      mockReconcileCurrencies.mockResolvedValue(new Map([['USD', 7]]))
      mockQueryOne.mockResolvedValue(null) // live shared.tag fallback also misses
      mockGetLastInsertId.mockResolvedValueOnce(10).mockResolvedValueOnce(20)

      const result = await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ id: 1 })],
        accounts: [account({ id: 1, wallet: 1, currency: 'USD' })],
        transactions: [transaction({
          lines: [{ account: 1, tag: 'nonexistent', sign: '+', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 }],
        })],
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workspace.trx ('), expect.anything())
      expect(result.imported.transactions).toBe(0)
    })

    it('skips a transaction with zero lines', async () => {
      const result = await importWorkspacePackage(emptyPackage({
        transactions: [transaction({ lines: [] })],
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workspace.trx ('), expect.anything())
      expect(result.imported.transactions).toBe(0)
    })

    it("skips the tag_context insert when it doesn't resolve to a known tag", async () => {
      mockReconcileTags.mockResolvedValue(new Map([['income', 9]]))
      mockReconcileCurrencies.mockResolvedValue(new Map([['USD', 7]]))
      mockGetLastInsertId.mockResolvedValueOnce(10).mockResolvedValueOnce(20)

      await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ id: 1 })],
        accounts: [account({ id: 1, wallet: 1, currency: 'USD' })],
        transactions: [transaction({
          lines: [{ account: 1, tag: 'income', tag_context: 'nonexistent', sign: '+', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 }],
        })],
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO workspace.trx_base_tag_context'),
        expect.anything()
      )
    })

    it("skips linking a counterparty that isn't in the reconciliation map", async () => {
      mockReconcileTags.mockResolvedValue(new Map([['income', 9]]))
      mockReconcileCurrencies.mockResolvedValue(new Map([['USD', 7]]))
      mockReconcileCounterparties.mockResolvedValue(new Map()) // 'Unknown' not reconciled
      mockGetLastInsertId.mockResolvedValueOnce(10).mockResolvedValueOnce(20)

      await importWorkspacePackage(emptyPackage({
        wallets: [wallet({ id: 1 })],
        accounts: [account({ id: 1, wallet: 1, currency: 'USD' })],
        transactions: [transaction({
          counterparty: 'Unknown',
          lines: [{ account: 1, tag: 'income', sign: '+', amount_int: 100, amount_frac: 0, rate_int: 1, rate_frac: 0 }],
        })],
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        `INSERT INTO workspace.trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)`,
        expect.anything()
      )
    })
  })

  describe('budgets', () => {
    it('creates a budget and its tag_context when both resolve', async () => {
      mockReconcileTags.mockResolvedValue(new Map([['Groceries', 12], ['recurring', 11]]))

      const result = await importWorkspacePackage(emptyPackage({
        budgets: [budget({ tag: 'Groceries', tag_context: 'recurring' })],
      }))

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workspace.budget ('),
        expect.arrayContaining([12])
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO workspace.budget_tag_context'),
        expect.arrayContaining([11])
      )
      expect(result.imported.budgets).toBe(1)
    })

    it('creates a budget with no tag_context insert at all when the budget has none', async () => {
      mockReconcileTags.mockResolvedValue(new Map([['Groceries', 12]]))

      const result = await importWorkspacePackage(emptyPackage({
        budgets: [budget({ tag: 'Groceries', tag_context: undefined })],
      }))

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workspace.budget ('),
        expect.arrayContaining([12])
      )
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO workspace.budget_tag_context'),
        expect.anything()
      )
      expect(result.imported.budgets).toBe(1)
    })

    it("skips the budget entirely when its tag doesn't resolve", async () => {
      mockReconcileTags.mockResolvedValue(new Map())
      mockQueryOne.mockResolvedValue(null)

      const result = await importWorkspacePackage(emptyPackage({
        budgets: [budget({ tag: 'nonexistent' })],
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO workspace.budget ('), expect.anything())
      expect(result.imported.budgets).toBe(0)
    })

    it("skips the budget's tag_context insert when it doesn't resolve", async () => {
      mockReconcileTags.mockResolvedValue(new Map([['Groceries', 12]]))
      mockQueryOne.mockResolvedValue(null)

      await importWorkspacePackage(emptyPackage({
        budgets: [budget({ tag: 'Groceries', tag_context: 'nonexistent' })],
      }))

      expect(mockExecSQL).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO workspace.budget_tag_context'),
        expect.anything()
      )
    })
  })
})
