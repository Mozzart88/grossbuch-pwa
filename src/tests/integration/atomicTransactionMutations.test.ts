import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { setupTestDatabase, closeTestDatabase, createDatabaseMock, insertWallet, insertAccount, getTestDatabase } from './setup'
import type { TransactionInput } from '../../types'

let repository: typeof import('../../services/repositories/transactionRepository').transactionRepository
let input: TransactionInput
beforeAll(async () => {
  await setupTestDatabase()
  const db = createDatabaseMock()
  vi.doMock('../../services/database', () => db)
  vi.doMock('../../services/database/connection', () => db)
  repository = (await import('../../services/repositories/transactionRepository')).transactionRepository
  const wallet = insertWallet({ name: 'Synthetic exchange wallet' })
  const debit = insertAccount({ wallet_id: wallet, currency_id: 1 })
  const credit = insertAccount({ wallet_id: wallet, currency_id: 2 })
  input = { timestamp: 1000, lines: [
    { account_id: debit, tag_id: 7, sign: '-', amount_int: 20, amount_frac: 0, rate_int: 1, rate_frac: 0 },
    { account_id: credit, tag_id: 7, sign: '+', amount_int: 18, amount_frac: 0, rate_int: 1, rate_frac: 0 },
  ] }
})
afterAll(closeTestDatabase)

it('overlapping creates return distinct headers owning exactly their requested exchange lines', async () => {
  const [first, second] = await Promise.all([repository.create(input), repository.create({ ...input, timestamp: 2000 })])
  expect(first.id).not.toEqual(second.id)
  expect(first.timestamp).toBe(1000)
  expect(second.timestamp).toBe(2000)
  expect(first.lines).toHaveLength(2)
  expect(second.lines).toHaveLength(2)
  const db = getTestDatabase()
  expect(db.exec('SELECT count(*) FROM trx WHERE NOT EXISTS (SELECT 1 FROM trx_base WHERE trx_id=trx.id)')[0].values).toEqual([[0]])
})

function financialState() {
  const db = getTestDatabase()
  return ['workspace.trx', 'workspace.trx_base', 'workspace.account', 'workspace.trx_note', 'workspace.trx_to_counterparty', 'workspace.trx_base_tag_context', 'workspace.sync_deletions', 'shared.tag_references', 'shared.tag_sort_order', 'shared.counterparty_sort_order'].map(table => db.exec(`SELECT * FROM ${table} ORDER BY rowid`))
}

it('failed update restores the header, lines, balances, references and deletion history', async () => {
  const trx = await repository.create(input)
  const before = financialState()
  await expect(repository.update(trx.id, { ...input, timestamp: 3000, lines: [input.lines[0], { ...input.lines[1], account_id: -1 }] })).rejects.toThrow()
  expect(financialState()).toEqual(before)
})

it('failed deletion restores counters changed before a failing cascade', async () => {
  const trx = await repository.create(input)
  const db = getTestDatabase()
  db.run("CREATE TRIGGER workspace.fail_delete BEFORE DELETE ON trx_base BEGIN SELECT RAISE(ABORT, 'injected delete failure'); END")
  const before = financialState()
  try {
    await expect(repository.delete(trx.id)).rejects.toThrow('injected delete failure')
    expect(financialState()).toEqual(before)
  } finally { db.run('DROP TRIGGER workspace.fail_delete') }
})

it('failed standalone line creation restores its balance and counters', async () => {
  const trx = await repository.create(input)
  const db = getTestDatabase()
  db.run("CREATE TRIGGER workspace.fail_context BEFORE INSERT ON trx_base_tag_context BEGIN SELECT RAISE(ABORT, 'injected context failure'); END")
  const before = financialState()
  try {
    await expect(repository.addLine(trx.id, { ...input.lines[0], tag_context_id: 7 })).rejects.toThrow('injected context failure')
    expect(financialState()).toEqual(before)
  } finally { db.run('DROP TRIGGER workspace.fail_context') }
})

it('direct sync import preserves incoming timestamps and restores foreign keys and triggers', async () => {
  const { importSyncPackage } = await import('../../services/sync/syncImport')
  const result = await importSyncPackage({
    version: 2, sender_id: 'synthetic', created_at: 2000, since: 0,
    icons: [], tags: [], wallets: [], accounts: [], counterparties: [], currencies: [], budgets: [], deletions: [],
    transactions: [{ id: '0102030405060708', timestamp: 1000, updated_at: 1234,
      lines: [{ id: '1112131415161718', account: input.lines[0].account_id, tag: 7, sign: '-', amount_int: 20, amount_frac: 0, rate_int: 1, rate_frac: 0 }], counterparty: null, note: null }],
  } as Parameters<typeof importSyncPackage>[0])
  expect(result.errors).toEqual([])
  const db = getTestDatabase()
  expect(db.exec("SELECT updated_at FROM trx WHERE hex(id)='0102030405060708'")[0].values).toEqual([[1234]])
  expect(db.exec('PRAGMA foreign_keys')[0].values).toEqual([[1]])
  db.run("UPDATE trx SET timestamp=999 WHERE hex(id)='0102030405060708'")
  expect(db.exec("SELECT updated_at FROM trx WHERE hex(id)='0102030405060708'")[0].values[0][0]).toBeGreaterThan(1234)
})
