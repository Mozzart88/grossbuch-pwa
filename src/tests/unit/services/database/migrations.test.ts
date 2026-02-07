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

      // Should run migration statements
      expect(mockExecSQL).toHaveBeenCalled()
      // Migration v1 creates old schema first (for new DBs to migrate through)
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS currencies')
      )
    })

    it('runs migration v2 when at version 1', async () => {
      // At version 1, need to run v2
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      // Should run migration v2 statements
      expect(mockExecSQL).toHaveBeenCalled()
      // Migration v2 creates new tables
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS tag')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS wallet')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS trx')
      )
    })

    it('creates tag table in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS tag')
      )
    })

    it('creates tag_to_tag junction table for hierarchy', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS tag_to_tag')
      )
    })

    it('creates currency table in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS currency')
      )
    })

    it('creates currency_to_tags junction table', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS currency_to_tags')
      )
    })

    it('creates wallet table in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS wallet')
      )
    })

    it('creates account table in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS account')
      )
    })

    it('creates counterparty table in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS counterparty')
      )
    })

    it('creates trx (transaction header) table', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS trx')
      )
    })

    it('creates trx_base (transaction line items) table', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS trx_base')
      )
    })

    it('creates settings table', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS settings')
      )
    })

    it('seeds system tags in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      // System tags should be seeded
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO tag (name) VALUES")
      )
    })

    it('creates accounts view in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS accounts AS')
      )
    })

    it('creates transactions view in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS transactions AS')
      )
    })

    it('creates trx_log view in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS trx_log AS')
      )
    })

    it('creates balance update trigger for trx_base', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TRIGGER trg_add_trx_base')
      )
    })

    it('drops old tables in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      // Old tables should be dropped
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('DROP TABLE IF EXISTS counterparty_categories'))
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('DROP TABLE IF EXISTS transactions'))
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('DROP TABLE IF EXISTS categories'))
    })

    it('handles query returning null', async () => {
      // Settings table exists but no db_version row
      mockQueryOne.mockResolvedValue(null)

      await runMigrations()

      // Should run migrations from version 1
      expect(mockExecSQL).toHaveBeenCalled()
    })

    it('parses db_version correctly', async () => {
      // Already at version 7 (current version)
      mockQueryOne.mockResolvedValue({ value: '10' })

      await runMigrations()

      // No migrations should run since we're at version 8
      expect(mockExecSQL).not.toHaveBeenCalled()
    })

    it('runs many statements for full migration', async () => {
      mockQueryOne.mockRejectedValue(new Error('no such table'))

      await runMigrations()

      // Full migration (v1-v7): each migration joins statements into one execSQL call
      // v1 = 1 call, v2-v7 = 2 calls each (migration + version update) = 1 + 6*2 = 13
      expect(mockExecSQL.mock.calls.length).toEqual(19)
    })

    it('updates db_version to 4 after migration', async () => {
      mockQueryOne.mockResolvedValue({ value: '2' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE settings SET value = ?"),
        ['4']
      )
    })

    // ----- BUDGET TABLE TESTS -----

    it('creates budget table in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS budget')
      )
    })

    it('budget table has correct columns', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      // Budget table should have randomblob(16) default for id
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringMatching(/CREATE TABLE IF NOT EXISTS budget.*id BLOB.*PRIMARY KEY.*DEFAULT.*randomblob/s)
      )
    })

    // ----- EXCHANGE RATE TABLE TESTS -----

    it('creates exchange_rate table in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS exchange_rate')
      )
    })

    // ----- TRX_NOTE TABLE TESTS -----

    it('creates trx_note table for transaction notes', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS trx_note')
      )
    })

    // ----- JUNCTION TABLES TESTS -----

    it('creates wallet_to_tags junction table', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS wallet_to_tags')
      )
    })

    it('creates account_to_tags junction table', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS account_to_tags')
      )
    })

    it('creates counterparty_to_tags junction table', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS counterparty_to_tags')
      )
    })

    it('creates trx_to_counterparty junction table', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS trx_to_counterparty')
      )
    })

    // ----- TRIGGER TESTS -----

    it('creates trigger to prevent deleting system tags', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TRIGGER IF NOT EXISTS trg_delete_system_tag')
      )
    })

    it('creates default currency trigger', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TRIGGER IF NOT EXISTS trg_default_currency')
      )
    })

    it('creates default wallet trigger', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TRIGGER IF NOT EXISTS trg_default_wallet')
      )
    })

    it('creates trigger for default wallet on delete', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TRIGGER IF NOT EXISTS trg_default_wallet_on_delete')
      )
    })

    it('creates trigger for first account in wallet', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TRIGGER IF NOT EXISTS trg_add_first_account')
      )
    })

    it('creates trigger for setting default account', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TRIGGER IF NOT EXISTS trg_set_default_account')
      )
    })

    it('creates trigger for deleting default account', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TRIGGER IF NOT EXISTS trg_del_default_account')
      )
    })

    it('creates trigger for deleting last account in wallet', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TRIGGER IF NOT EXISTS trg_del_last_in_wallet_account')
      )
    })

    it('creates trigger for deleting trx_base (balance rollback)', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TRIGGER IF NOT EXISTS trg_del_trx_base')
      )
    })

    it('creates trigger for updating trx_base', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TRIGGER IF NOT EXISTS trg_update_trx_base')
      )
    })

    // ----- VIEW TESTS -----

    it('creates transaction_view in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS transaction_view AS')
      )
    })

    it('creates exchanges view in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS exchanges AS')
      )
    })

    it('creates transfers view in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS transfers AS')
      )
    })

    it('creates tags_graph view in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS tags_graph AS')
      )
    })

    it('creates tags_hierarchy view in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS tags_hierarchy AS')
      )
    })

    it('creates budget_subtags view in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS budget_subtags AS')
      )
    })

    it('creates summary view in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS summary AS')
      )
    })

    it('creates counterparties_summary view in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS counterparties_summary AS')
      )
    })

    it('creates tags_summary view in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE VIEW IF NOT EXISTS tags_summary AS')
      )
    })

    // ----- TAG HIERARCHY TESTS -----

    it('seeds system tag hierarchy in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tag_to_tag (child_id, parent_id) VALUES')
      )
    })

    // ----- DATA MIGRATION TESTS -----

    it('migrates currencies from old schema', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO currency (id, code, name, symbol, decimal_places')
      )
    })

    it('migrates wallets from old accounts table', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO wallet (name)')
      )
    })

    it('migrates counterparties from old schema', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO counterparty (id, name)')
      )
    })

    // ----- OLD TABLE CLEANUP TESTS -----

    it('drops old accounts table in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('DROP TABLE IF EXISTS accounts'))
    })

    it('drops old currencies table in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('DROP TABLE IF EXISTS currencies'))
    })

    it('drops old counterparties table in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('DROP TABLE IF EXISTS counterparties'))
    })

    it('drops old views before recreating in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('DROP VIEW IF EXISTS accounts'))
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('DROP VIEW IF EXISTS transactions'))
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('DROP VIEW IF EXISTS transfers'))
      expect(mockExecSQL).toHaveBeenCalledWith(expect.stringContaining('DROP VIEW IF EXISTS exchanges'))
    })

    // ----- BALANCE RECALCULATION TESTS -----

    it('recalculates account balances in migration v2', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE account SET')
      )
    })

    // ----- TRIGGER FOR COUNTERPARTY VIEW -----

    it('creates trigger for adding counterparty via view', async () => {
      mockQueryOne.mockResolvedValue({ value: '1' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TRIGGER IF NOT EXISTS trg_trx_add_counterparty')
      )
    })

    // ----- MIGRATION V3 TESTS (Auth Settings) -----

    it('creates auth_settings table in migration v3', async () => {
      mockQueryOne.mockResolvedValue({ value: '2' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS auth_settings')
      )
    })

    it('runs migration v3 when at version 2', async () => {
      mockQueryOne.mockResolvedValue({ value: '2' })

      await runMigrations()

      // Should run migration v3 statements
      expect(mockExecSQL).toHaveBeenCalled()
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('auth_settings')
      )
    })

    // ----- MIGRATION V4 TESTS (Currency Seeding) -----

    it('seeds all currencies in migration v4', async () => {
      mockQueryOne.mockResolvedValue({ value: '3' })

      await runMigrations()

      // Should insert currencies with INSERT OR IGNORE
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO currency (code, name, symbol, decimal_places)')
      )
    })

    it('tags fiat currencies in migration v4', async () => {
      mockQueryOne.mockResolvedValue({ value: '3' })

      await runMigrations()

      // Should tag fiat currencies (tag_id = 4)
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, 4 FROM currency WHERE code IN ('AED'")
      )
    })

    it('tags crypto currencies in migration v4', async () => {
      mockQueryOne.mockResolvedValue({ value: '3' })

      await runMigrations()

      // Should tag crypto currencies (tag_id = 5)
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, 5 FROM currency WHERE code IN ('BTC'")
      )
    })

    it('sets USD as default currency in migration v4', async () => {
      mockQueryOne.mockResolvedValue({ value: '3' })

      await runMigrations()

      // Should set USD as default if no default exists
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, 2 FROM currency WHERE code = 'USD'")
      )
    })

    it('creates currencies view in migration v4', async () => {
      mockQueryOne.mockResolvedValue({ value: '3' })

      await runMigrations()

      // Should set USD as default if no default exists
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("CREATE VIEW IF NOT EXISTS currencies AS")
      )
    })

    it('runs migration v4 when at version 3', async () => {
      mockQueryOne.mockResolvedValue({ value: '3' })

      await runMigrations()

      // Should run migration v4 statements
      expect(mockExecSQL).toHaveBeenCalled()
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO currency')
      )
    })

    // ----- MIGRATION V6 TESTS (Adjustment Tag) -----

    it('creates adjustment tag in migration v6', async () => {
      mockQueryOne.mockResolvedValue({ value: '5' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR IGNORE INTO tag (id, name) VALUES (23, 'adjustment')")
      )
    })

    it('links adjustment tag to system tag in migration v6', async () => {
      mockQueryOne.mockResolvedValue({ value: '5' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (23, 1)')
      )
    })

    it('creates temp table for tag relocation in migration v6', async () => {
      mockQueryOne.mockResolvedValue({ value: '5' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TEMP TABLE IF NOT EXISTS _tag_remap')
      )
    })

    it('handles relocation of existing tag at id 23 in migration v6', async () => {
      mockQueryOne.mockResolvedValue({ value: '5' })

      await runMigrations()

      // Should update tag table to relocate conflicting tag
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tag SET id = (SELECT new_id FROM _tag_remap')
      )
    })

    it('disables and re-enables foreign keys in migration v6', async () => {
      mockQueryOne.mockResolvedValue({ value: '5' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('PRAGMA foreign_keys = OFF')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('PRAGMA foreign_keys = ON')
      )
    })

    it('updates all foreign key references when relocating tag in migration v6', async () => {
      mockQueryOne.mockResolvedValue({ value: '5' })

      await runMigrations()

      // Should update references in all related tables
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tag_to_tag SET child_id')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tag_to_tag SET parent_id')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE trx_base SET tag_id')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE counterparty_to_tags SET tag_id')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tag_icon SET tag_id')
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE budget SET tag_id')
      )
    })

    it('cleans up temp table after migration v6', async () => {
      mockQueryOne.mockResolvedValue({ value: '5' })

      await runMigrations()

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('DROP TABLE IF EXISTS _tag_remap')
      )
    })

    it('runs migration v6 when at version 5', async () => {
      mockQueryOne.mockResolvedValue({ value: '5' })

      await runMigrations()

      // Should run migration v6 statements
      expect(mockExecSQL).toHaveBeenCalled()
      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('adjustment')
      )
    })
  })
})
