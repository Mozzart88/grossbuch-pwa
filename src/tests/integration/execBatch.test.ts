import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupTestDatabase, closeTestDatabase, resetTestDatabase, createDatabaseMock, insertTag } from './setup'

// Exercises createDatabaseMock's execBatch against a real sql.js database — it mirrors
// worker.ts's execBatchSQL loop (each statement keeps its own bind values, first error
// aborts the rest), so this is the closest we can get to testing that loop's actual SQL
// execution semantics without instantiating the real Web Worker.
describe('execBatch', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(() => {
    closeTestDatabase()
  })

  it('applies each statement with its own distinct bind values, in order', async () => {
    resetTestDatabase()
    const db = createDatabaseMock()
    const tagA = insertTag({ name: 'Distinct-Binds Original A' })
    const tagB = insertTag({ name: 'Distinct-Binds Original B' })

    await db.execBatch([
      { sql: 'UPDATE shared.tag SET name = ? WHERE id = ?', bind: ['Distinct-Binds Renamed A', tagA] },
      { sql: 'UPDATE shared.tag SET name = ? WHERE id = ?', bind: ['Distinct-Binds Renamed B', tagB] },
    ])

    const nameA = await db.queryOne<{ name: string }>('SELECT name FROM shared.tag WHERE id = ?', [tagA])
    const nameB = await db.queryOne<{ name: string }>('SELECT name FROM shared.tag WHERE id = ?', [tagB])
    expect(nameA?.name).toBe('Distinct-Binds Renamed A')
    expect(nameB?.name).toBe('Distinct-Binds Renamed B')
  })

  it('aborts remaining statements and propagates the error on a mid-batch failure', async () => {
    resetTestDatabase()
    const db = createDatabaseMock()
    const tagA = insertTag({ name: 'Mid-Batch Original A' })
    const tagB = insertTag({ name: 'Mid-Batch Original B' })

    let caught: unknown
    try {
      await db.execBatch([
        { sql: 'UPDATE shared.tag SET name = ? WHERE id = ?', bind: ['Mid-Batch Renamed A', tagA] },
        { sql: 'UPDATE shared.nonexistent_table SET name = ? WHERE id = ?', bind: ['x', tagA] },
        { sql: 'UPDATE shared.tag SET name = ? WHERE id = ?', bind: ['Should not apply', tagB] },
      ])
    } catch (e) {
      caught = e
    }
    expect(caught).toBeDefined()

    const nameA = await db.queryOne<{ name: string }>('SELECT name FROM shared.tag WHERE id = ?', [tagA])
    const nameB = await db.queryOne<{ name: string }>('SELECT name FROM shared.tag WHERE id = ?', [tagB])
    expect(nameA?.name).toBe('Mid-Batch Renamed A') // first statement applied before the failure
    expect(nameB?.name).toBe('Mid-Batch Original B') // third statement never ran
  })

  it('is a no-op for an empty statements array', async () => {
    resetTestDatabase()
    const db = createDatabaseMock()

    await expect(db.execBatch([])).resolves.toBeUndefined()
  })
})
