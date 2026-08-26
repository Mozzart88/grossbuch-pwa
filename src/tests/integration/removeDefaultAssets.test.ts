import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import {
  setupTestDatabase,
  closeTestDatabase,
  resetTestDatabase,
  createDatabaseMock,
  getTestDatabase,
} from './setup'

let dbMock: ReturnType<typeof createDatabaseMock>

describe('Default asset tag removal', () => {
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

  it('migration chain alone seeds Tips/VAT alongside add-on, unconditionally', () => {
    const db = getTestDatabase()

    const addOn = db.exec(`SELECT id FROM tag WHERE name = 'add-on'`)
    expect(addOn[0]?.values).toHaveLength(1)

    const tips = db.exec(`SELECT id FROM tag WHERE name = 'Tips'`)
    expect(tips[0]?.values).toHaveLength(1)

    const vat = db.exec(`SELECT id FROM tag WHERE name = 'VAT'`)
    expect(vat[0]?.values).toHaveLength(1)
  })

  it('removeDefaultAssets() deletes Tips/VAT and their tag_to_tag/tag_sort_order rows, leaving add-on and its Fees/Discounts links intact', async () => {
    const db = getTestDatabase()

    const tipsRow = db.exec(`SELECT id FROM tag WHERE name = 'Tips'`)
    const tipsId = tipsRow[0].values[0][0]
    const vatRow = db.exec(`SELECT id FROM tag WHERE name = 'VAT'`)
    const vatId = vatRow[0].values[0][0]
    const addOnRow = db.exec(`SELECT id FROM tag WHERE name = 'add-on'`)
    const addOnId = addOnRow[0].values[0][0]

    const { removeDefaultAssets } = await import('../../services/database/removeDefaultAssets')
    await removeDefaultAssets()

    expect(db.exec(`SELECT id FROM tag WHERE name IN ('Tips', 'VAT')`)[0]?.values ?? []).toHaveLength(0)
    expect(db.exec(`SELECT * FROM tag_sort_order WHERE tag_id IN (${tipsId}, ${vatId})`)[0]?.values ?? []).toHaveLength(0)
    expect(db.exec(`SELECT * FROM tag_to_tag WHERE child_id IN (${tipsId}, ${vatId}) OR parent_id IN (${tipsId}, ${vatId})`)[0]?.values ?? []).toHaveLength(0)

    // add-on itself, and its non-Tips/VAT links (Fees/Discounts under add-on, add-on under system), survive.
    expect(db.exec(`SELECT id FROM tag WHERE name = 'add-on'`)[0]?.values).toHaveLength(1)
    const addOnParents = db.exec(`SELECT parent_id FROM tag_to_tag WHERE child_id = ${addOnId}`)
    expect(addOnParents[0]?.values.map(row => row[0])).toContain(1) // SYSTEM
    const addOnChildren = db.exec(`SELECT child_id FROM tag_to_tag WHERE parent_id = ${addOnId} ORDER BY child_id`)
    const addOnChildIds = (addOnChildren[0]?.values ?? []).map(row => row[0])
    expect(addOnChildIds).not.toContain(tipsId)
    expect(addOnChildIds).not.toContain(vatId)

    const fees = db.exec(`SELECT id FROM tag WHERE name = 'Fees'`)
    if (fees[0]?.values?.[0]?.[0]) {
      expect(addOnChildIds).toContain(fees[0].values[0][0])
    }
  })

  it('removeDefaultAssets() is safe to call again (no-op the second time)', async () => {
    const { removeDefaultAssets } = await import('../../services/database/removeDefaultAssets')

    await removeDefaultAssets()
    await expect(removeDefaultAssets()).resolves.not.toThrow()

    const db = getTestDatabase()
    expect(db.exec(`SELECT id FROM tag WHERE name IN ('Tips', 'VAT')`)[0]?.values ?? []).toHaveLength(0)
  })
})
