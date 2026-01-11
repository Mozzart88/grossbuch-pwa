import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock connection module
vi.mock('../../../../services/database/connection', () => ({
  execSQL: vi.fn(),
  queryOne: vi.fn(),
}))

import { execSQL, queryOne } from '../../../../services/database/connection'
import { runMigrations } from '../../../../services/database/migrations'

const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)

describe('migrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
  })

  describe('runMigrations', () => {
    it('runs all migrations when db_version is 0', async () => {
      // Simulate table doesn't exist yet
      mockQueryOne.mockRejectedValue(new Error('no such table: settings'))

      await runMigrations()

      // Should run all migration statements
      expect(mockExecSQL).toHaveBeenCalled()
      // First migration creates currencies table
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS currencies')
      )
    })

    it('skips migrations when already at current version', async () => {
      // Already at version 1
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      // Should not run any migrations
      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('creates currencies table with correct schema', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('currencies')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('code TEXT NOT NULL UNIQUE')
      )
    })

    it('creates accounts table with foreign key', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS accounts')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('FOREIGN KEY (currency_id) REFERENCES currencies(id)')
      )
    })

    it('creates categories table with type constraint', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS categories')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("type IN ('income', 'expense', 'both')")
      )
    })

    it('creates counterparties table', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS counterparties')
      )
    })

    it('creates counterparty_categories junction table', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS counterparty_categories')
      )
    })

    it('creates transactions table with type constraint', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS transactions')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("type IN ('income', 'expense', 'transfer', 'exchange')")
      )
    })

    it('creates settings table', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS settings')
      )
    })

    it('inserts default settings', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR IGNORE INTO settings (key, value) VALUES ('db_version', '1')")
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR IGNORE INTO settings (key, value) VALUES ('default_currency_id', '1')")
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'system')")
      )
    })

    it('creates indexes for accounts', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_accounts_currency')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_accounts_active')
      )
    })

    it('creates indexes for categories', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_categories_type')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_categories_parent')
      )
    })

    it('creates indexes for transactions', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_transactions_date')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_transactions_type')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_transactions_month')
      )
    })

    it('handles query returning null', async () => {
      // Settings table exists but no db_version row
      mockQueryOne.mockResolvedValue(null)

      await runMigrations()

      // Should run migrations from version 1
      expect(mockExecSQL).toHaveBeenCalled()
    })

    it('parses db_version correctly', async () => {
      // Already at version 1
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      // No migrations should run since we're at version 1
      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('runs all statements for a migration version', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      // Version 1 has many statements - ensure all were called
      // Count should be >= 20 (tables, indexes, default settings)
      expect(mockExecSQL.mock.calls.length).toBeGreaterThanOrEqual(20)
    })
  })
})
