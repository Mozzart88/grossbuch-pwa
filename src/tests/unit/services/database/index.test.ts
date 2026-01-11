import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Store original module for reset
let mockInitialized = false
let mockInitPromise: Promise<void> | null = null

// Mock all dependencies
vi.mock('../../../../services/database/connection', () => ({
  initDatabase: vi.fn(),
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  runSQL: vi.fn(),
  getLastInsertId: vi.fn(),
  closeDatabase: vi.fn(),
}))

vi.mock('../../../../services/database/migrations', () => ({
  runMigrations: vi.fn(),
}))

vi.mock('../../../../services/database/seed', () => ({
  seedDatabase: vi.fn(),
}))

import * as connection from '../../../../services/database/connection'
import { runMigrations } from '../../../../services/database/migrations'
import { seedDatabase } from '../../../../services/database/seed'

const mockInitWorker = vi.mocked(connection.initDatabase)
const mockRunMigrations = vi.mocked(runMigrations)
const mockSeedDatabase = vi.mocked(seedDatabase)

describe('database index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockInitWorker.mockResolvedValue(undefined)
    mockRunMigrations.mockResolvedValue(undefined)
    mockSeedDatabase.mockResolvedValue(undefined)
  })

  describe('initDatabase', () => {
    it('initializes worker, runs migrations, and seeds database', async () => {
      const { initDatabase } = await import('../../../../services/database/index')

      await initDatabase()

      expect(mockInitWorker).toHaveBeenCalled()
      expect(mockRunMigrations).toHaveBeenCalled()
      expect(mockSeedDatabase).toHaveBeenCalled()
    })

    it('only initializes once', async () => {
      const { initDatabase } = await import('../../../../services/database/index')

      await initDatabase()
      await initDatabase()
      await initDatabase()

      // Should only be called once
      expect(mockInitWorker).toHaveBeenCalledTimes(1)
      expect(mockRunMigrations).toHaveBeenCalledTimes(1)
      expect(mockSeedDatabase).toHaveBeenCalledTimes(1)
    })

    it('returns same promise if init is in progress', async () => {
      const { initDatabase } = await import('../../../../services/database/index')

      // Start multiple init calls simultaneously
      const promise1 = initDatabase()
      const promise2 = initDatabase()
      const promise3 = initDatabase()

      await Promise.all([promise1, promise2, promise3])

      expect(mockInitWorker).toHaveBeenCalledTimes(1)
    })

    it('runs initialization in correct order', async () => {
      const order: string[] = []
      mockInitWorker.mockImplementation(async () => {
        order.push('initWorker')
      })
      mockRunMigrations.mockImplementation(async () => {
        order.push('runMigrations')
      })
      mockSeedDatabase.mockImplementation(async () => {
        order.push('seedDatabase')
      })

      const { initDatabase } = await import('../../../../services/database/index')
      await initDatabase()

      expect(order).toEqual(['initWorker', 'runMigrations', 'seedDatabase'])
    })
  })

  describe('Exported functions', () => {
    it('re-exports execSQL from connection', async () => {
      const mod = await import('../../../../services/database/index')
      expect(mod.execSQL).toBe(connection.execSQL)
    })

    it('re-exports querySQL from connection', async () => {
      const mod = await import('../../../../services/database/index')
      expect(mod.querySQL).toBe(connection.querySQL)
    })

    it('re-exports queryOne from connection', async () => {
      const mod = await import('../../../../services/database/index')
      expect(mod.queryOne).toBe(connection.queryOne)
    })

    it('re-exports runSQL from connection', async () => {
      const mod = await import('../../../../services/database/index')
      expect(mod.runSQL).toBe(connection.runSQL)
    })

    it('re-exports getLastInsertId from connection', async () => {
      const mod = await import('../../../../services/database/index')
      expect(mod.getLastInsertId).toBe(connection.getLastInsertId)
    })

    it('re-exports closeDatabase from connection', async () => {
      const mod = await import('../../../../services/database/index')
      expect(mod.closeDatabase).toBe(connection.closeDatabase)
    })
  })

  describe('Error handling', () => {
    it('propagates initWorker errors', async () => {
      mockInitWorker.mockRejectedValue(new Error('Worker init failed'))

      const { initDatabase } = await import('../../../../services/database/index')

      await expect(initDatabase()).rejects.toThrow('Worker init failed')
    })

    it('propagates migration errors', async () => {
      mockRunMigrations.mockRejectedValue(new Error('Migration failed'))

      const { initDatabase } = await import('../../../../services/database/index')

      await expect(initDatabase()).rejects.toThrow('Migration failed')
    })

    it('propagates seed errors', async () => {
      mockSeedDatabase.mockRejectedValue(new Error('Seed failed'))

      const { initDatabase } = await import('../../../../services/database/index')

      await expect(initDatabase()).rejects.toThrow('Seed failed')
    })
  })
})
