import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  createDatabaseMock,
  getTestDatabase,
} from './setup'

let dbMock: ReturnType<typeof createDatabaseMock>

// Regression test built from a real production tag export (sql/expense-tracker.sqlite3,
// a genuine long-lived install) that caught three separate bugs during development of
// the fresh-install-tag-seeding change:
//  1. Tips/VAT id-shift when extracted from the migration chain (see design.md Context) —
//     fixed by keeping v16/v21/v23 unmodified and removing Tips/VAT post-migration instead.
//  2. resolveTagNameConflicts skipping conflict detection whenever the incoming id already
//     had a local row, and being unable to resolve a direct two-way name swap.
//  3. resolveTagIdConflict pre-moving a tag_sort_order row onto a target id that doesn't
//     have its own local tag row yet, colliding with the auto-insert trigger that fires
//     when the main import loop later creates that tag row.
// This device's own real tag numbering drifted from what today's migration chain produces
// on `Food` (28 vs. a fresh install's 12), `add-on` (56 vs. 25), `savings` (76 vs. 27),
// `credits` (77 vs. 28), and `recurent` (78 vs. 29) — ids 12, 16, 27, 55, 60 are missing
// entirely from this device's real history (rows deleted at some point).
describe('Real device sync reproduction (regression)', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  beforeEach(() => {
    resetTestDatabase()
    dbMock = createDatabaseMock()
    vi.doMock('../../services/database/connection', () => dbMock)
  })

  it('imports a real long-lived install\'s full tag set into a fresh linked device without any UNIQUE violation', async () => {
    const { removeDefaultAssets } = await import('../../services/database/removeDefaultAssets')
    await removeDefaultAssets()

    const deviceATags: [number, string][] = [
      [1, 'system'], [2, 'default'], [3, 'initial'], [4, 'fiat'], [5, 'crypto'], [6, 'transfer'], [7, 'exchange'], [8, 'purchase'], [9, 'income'], [10, 'expense'],
      [11, 'Sales'], [13, 'Fees'], [14, 'Transport'], [15, 'House'], [17, 'Utilities'], [18, 'Discounts'], [19, 'Fines'], [20, 'Households'], [21, 'Auto'], [22, 'archived'], [23, 'adjustment'],
      [24, 'Dividends'], [25, 'Education'], [26, 'Entertainment'], [28, 'Food'], [29, 'Freelance'], [30, 'Gifts'], [31, 'Healthcare'], [32, 'Housing'], [33, 'Investment'], [34, 'Loans'],
      [35, 'Other Expense'], [36, 'Other Income'], [37, 'Personal Care'], [38, 'Refunds'], [39, 'Salary'], [40, 'Shopping'], [41, 'Tabaco'], [42, 'Taxes'], [43, 'Teia'], [44, 'Tips'],
      [45, 'Travel'], [46, 'Work'], [47, 'Rent'], [48, 'Cellular'], [49, 'Bars'], [50, 'Cafe & Restaurants'], [52, 'Self care'], [53, 'Hobby'], [54, 'Cashback'],
      [56, 'add-on'], [57, 'VAT'], [58, 'Subscription'], [59, 'IOU'], [61, 'Clothes'], [62, 'Water'], [63, 'Taxi'], [64, 'Delivery'], [65, 'Public transport'], [66, 'Verdure'],
      [67, 'Cleaning'], [68, 'Web'], [69, 'Coffee & Snacks'], [70, 'Dining'], [71, 'Alcohol'], [72, 'Coworking'], [73, 'Launch'], [74, 'Toys'], [75, 'Business'],
      [76, 'savings'], [77, 'credits'], [78, 'recurent'],
    ]
    const tagToTag: [number, number][] = [
      [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1],
      [11, 2], [11, 9], [13, 2], [13, 9], [13, 10], [13, 56], [14, 2], [14, 10], [15, 2], [15, 10], [17, 2], [17, 10], [17, 32],
      [18, 2], [18, 9], [18, 56], [19, 2], [19, 10], [20, 2], [20, 10], [21, 2], [21, 10], [22, 1], [23, 1],
      [24, 9], [25, 1], [25, 10], [26, 10], [28, 2], [28, 10], [29, 9], [30, 2], [30, 9], [30, 10], [31, 10], [31, 43], [32, 10], [33, 9], [34, 10], [35, 10],
      [36, 9], [37, 10], [38, 9], [39, 9], [40, 10], [41, 10], [42, 10], [43, 2], [43, 9], [43, 10], [44, 2], [44, 10], [44, 56],
      [45, 10], [46, 10], [47, 2], [47, 9], [47, 10], [47, 32], [48, 2], [48, 10], [49, 2], [49, 10], [49, 50], [50, 2], [50, 10], [52, 2], [52, 10], [53, 2], [53, 10], [54, 9],
      [57, 2], [57, 10], [57, 42], [57, 56], [58, 2], [58, 10], [58, 26], [58, 46], [59, 2], [59, 9], [59, 10], [61, 10], [61, 43], [62, 28], [63, 14], [64, 14], [65, 14],
      [66, 28], [67, 32], [68, 32], [69, 46], [69, 50], [70, 50], [71, 28], [72, 46], [73, 46], [74, 2], [74, 10], [74, 43], [75, 42], [76, 1], [77, 1], [78, 1],
    ]

    const childToParents = new Map<number, number[]>()
    const parentToChildren = new Map<number, number[]>()
    for (const [child, parent] of tagToTag) {
      childToParents.set(child, [...(childToParents.get(child) ?? []), parent])
      parentToChildren.set(parent, [...(parentToChildren.get(parent) ?? []), child])
    }

    const exportedAt = Math.floor(Date.now() / 1000) - 86400
    const tags = deviceATags.map(([id, name]) => ({
      id, name, updated_at: exportedAt,
      parents: childToParents.get(id) ?? [],
      children: parentToChildren.get(id) ?? [],
      icon: null,
    }))

    const { importSyncPackage } = await import('../../services/sync/syncImport')

    const result = await importSyncPackage({
      version: 2,
      sender_id: 'device-a',
      created_at: exportedAt,
      since: 0,
      icons: [],
      tags,
      wallets: [],
      accounts: [],
      counterparties: [],
      currencies: [],
      transactions: [],
      budgets: [],
      deletions: [],
    })

    expect(result.errors).toEqual([])
    expect(result.imported.tags).toBe(deviceATags.length)

    const db = getTestDatabase()
    for (const [id, name] of deviceATags) {
      const row = db.exec(`SELECT name FROM tag WHERE id = ${id}`)
      expect(row[0]?.values[0]?.[0]).toBe(name)
    }
  })
})
