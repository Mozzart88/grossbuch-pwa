import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  insertWallet,
  insertAccount,
  insertTag,
  insertCounterparty,
  insertTransaction,
  insertBudget,
  getCurrencyIdByCode,
  getTestDatabase,
} from './setup'
import { RECOMPUTE_SHARED_COUNTERS_SQL } from '../../services/database/sharedCounterRecompute'

// sharedCounterRecompute.ts exports plain SQL (no execSQL call of its own — see that
// file's header comment for why), so this runs it directly against the sql.js fixture
// rather than through the mocked `connection` layer other integration tests use.
describe('sharedCounterRecompute', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  it('recomputes tag_sort_order, counterparty_sort_order, and tag_references from actual workspace data, overriding stale values', () => {
    resetTestDatabase()
    const db = getTestDatabase()

    const walletId = insertWallet({ name: 'Main', is_default: true })
    const usdId = getCurrencyIdByCode('USD')
    const accountId = insertAccount({ wallet_id: walletId, currency_id: usdId })
    const tagA = insertTag({ name: 'Groceries' })
    const tagB = insertTag({ name: 'Rent' })
    const cpA = insertCounterparty({ name: 'Landlord' })

    insertTransaction({ account_id: accountId, tag_id: tagA, sign: '-', amount_int: 10, counterparty_id: cpA })
    insertTransaction({ account_id: accountId, tag_id: tagA, sign: '-', amount_int: 20, counterparty_id: cpA })
    insertTransaction({ account_id: accountId, tag_id: tagB, sign: '-', amount_int: 5 })
    insertBudget({ tag_id: tagB, amount_int: 100 })

    // Simulate the pre-fix bug: counters left stale/zeroed (or, for tag_references, stale
    // nonzero on a tag that no longer has any reference) despite real workspace usage.
    db.run('UPDATE shared.tag_sort_order SET count = 0 WHERE tag_id IN (?, ?)', [tagA, tagB])
    db.run('UPDATE shared.counterparty_sort_order SET count = 0 WHERE counterparty_id = ?', [cpA])
    db.run('INSERT OR REPLACE INTO shared.tag_references (tag_id, count) VALUES (?, ?)', [tagA, 999])

    db.run(RECOMPUTE_SHARED_COUNTERS_SQL)

    const tagSortOrder = (id: number) =>
      Number(db.exec('SELECT count FROM shared.tag_sort_order WHERE tag_id = ?', [id])[0].values[0][0])
    const counterpartySortOrder = (id: number) =>
      Number(db.exec('SELECT count FROM shared.counterparty_sort_order WHERE counterparty_id = ?', [id])[0].values[0][0])
    const tagReferences = (id: number) => {
      const result = db.exec('SELECT count FROM shared.tag_references WHERE tag_id = ?', [id])
      return result[0] ? Number(result[0].values[0][0]) : 0
    }

    expect(tagSortOrder(tagA)).toBe(2)
    expect(tagSortOrder(tagB)).toBe(1)
    expect(counterpartySortOrder(cpA)).toBe(2)
    expect(tagReferences(tagA)).toBe(2) // 2 trx_base rows reference tagA
    expect(tagReferences(tagB)).toBe(2) // 1 trx_base row + 1 budget reference tagB
  })

  it('zeroes out tag_sort_order/counterparty_sort_order for a tag/counterparty with no remaining references', () => {
    resetTestDatabase()
    const db = getTestDatabase()

    const tagId = insertTag({ name: 'Unused' })
    const cpId = insertCounterparty({ name: 'Unused Counterparty' })
    db.run('UPDATE shared.tag_sort_order SET count = 7 WHERE tag_id = ?', [tagId])
    db.run('UPDATE shared.counterparty_sort_order SET count = 3 WHERE counterparty_id = ?', [cpId])

    db.run(RECOMPUTE_SHARED_COUNTERS_SQL)

    const tagCount = Number(db.exec('SELECT count FROM shared.tag_sort_order WHERE tag_id = ?', [tagId])[0].values[0][0])
    const cpCount = Number(db.exec('SELECT count FROM shared.counterparty_sort_order WHERE counterparty_id = ?', [cpId])[0].values[0][0])
    expect(tagCount).toBe(0)
    expect(cpCount).toBe(0)
  })
})
