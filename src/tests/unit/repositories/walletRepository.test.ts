import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Wallet, WalletInput, Account } from '../../../types'
import { SYSTEM_TAGS } from '../../../types'

// Mock the database module
vi.mock('../../../services/database', () => ({
  execSQL: vi.fn(),
  querySQL: vi.fn(),
  queryOne: vi.fn(),
  getLastInsertId: vi.fn(),
}))

// Mock transactionRepository for addAccount with initialBalance
vi.mock('../../../services/repositories/transactionRepository', () => ({
  transactionRepository: {
    create: vi.fn().mockResolvedValue({ id: new Uint8Array(8), timestamp: 0, lines: [] }),
  },
}))

import { walletRepository } from '../../../services/repositories/walletRepository'
import { execSQL, querySQL, queryOne, getLastInsertId } from '../../../services/database'
import { transactionRepository } from '../../../services/repositories/transactionRepository'

const mockExecSQL = vi.mocked(execSQL)
const mockQuerySQL = vi.mocked(querySQL)
const mockQueryOne = vi.mocked(queryOne)
const mockGetLastInsertId = vi.mocked(getLastInsertId)
const mockTransactionRepository = vi.mocked(transactionRepository)

describe('walletRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sampleWallet: Wallet = {
    id: 1,
    name: 'Cash Wallet',
    color: '#22c55e',
    is_default: true,
    is_archived: false,
    accounts: [],
  }

  const sampleAccount: Account = {
    id: 1,
    wallet_id: 1,
    currency_id: 1,
    balance: 100000,
    updated_at: 1704067200,
    currency: 'USD',
    is_default: true,
  }

  describe('findAll', () => {
    it('returns all wallets with accounts', async () => {
      mockQuerySQL
        .mockResolvedValueOnce([sampleWallet])
        .mockResolvedValueOnce([sampleAccount])

      const result = await walletRepository.findAll()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.ARCHIVED, SYSTEM_TAGS.SYSTEM]
      )
      expect(result).toHaveLength(1)
      expect(result[0].accounts).toEqual([sampleAccount])
    })

    it('returns empty array when no wallets exist', async () => {
      mockQuerySQL.mockResolvedValue([])

      const result = await walletRepository.findAll()

      expect(result).toEqual([])
    })

    it('loads accounts for each wallet', async () => {
      const wallet1 = { ...sampleWallet, id: 1, name: 'Wallet 1' }
      const wallet2 = { ...sampleWallet, id: 2, name: 'Wallet 2' }
      const account1 = { ...sampleAccount, wallet_id: 1 }
      const account2 = { ...sampleAccount, id: 2, wallet_id: 2 }

      mockQuerySQL
        .mockResolvedValueOnce([wallet1, wallet2])
        .mockResolvedValueOnce([account1])
        .mockResolvedValueOnce([account2])

      const result = await walletRepository.findAll()

      expect(mockQuerySQL).toHaveBeenCalledTimes(3)
      expect(result[0].accounts).toEqual([account1])
      expect(result[1].accounts).toEqual([account2])
    })
  })

  describe('findActive', () => {
    it('returns only non-archived and non-system wallets', async () => {
      mockQuerySQL
        .mockResolvedValueOnce([sampleWallet])
        .mockResolvedValueOnce([sampleAccount])

      const result = await walletRepository.findActive()

      expect(mockQuerySQL).toHaveBeenCalledWith(
        expect.stringContaining('WHERE NOT EXISTS'),
        [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.ARCHIVED, SYSTEM_TAGS.SYSTEM]
      )
      expect(result).toHaveLength(1)
    })
  })

  describe('findById', () => {
    it('returns wallet with accounts when found', async () => {
      mockQueryOne.mockResolvedValue(sampleWallet)
      mockQuerySQL.mockResolvedValue([sampleAccount])

      const result = await walletRepository.findById(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE w.id = ?'),
        [SYSTEM_TAGS.DEFAULT, SYSTEM_TAGS.ARCHIVED, 1]
      )
      expect(result).toEqual({ ...sampleWallet, accounts: [sampleAccount] })
    })

    it('returns null when wallet not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await walletRepository.findById(999)

      expect(result).toBeNull()
    })
  })

  describe('findByName', () => {
    it('returns wallet when found by name', async () => {
      mockQueryOne.mockResolvedValue(sampleWallet)

      const result = await walletRepository.findByName('Cash Wallet')

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT * FROM wallet WHERE name = ?',
        ['Cash Wallet']
      )
      expect(result).toEqual(sampleWallet)
    })

    it('returns null when wallet name not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await walletRepository.findByName('NonExistent')

      expect(result).toBeNull()
    })
  })

  describe('findDefault', () => {
    it('returns default wallet with accounts', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleWallet, is_default: 1 })
      mockQuerySQL.mockResolvedValue([sampleAccount])

      const result = await walletRepository.findDefault()

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE wt.tag_id = ?'),
        [SYSTEM_TAGS.DEFAULT]
      )
      expect(result?.is_default).toBeTruthy()
    })

    it('returns null when no default wallet exists', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await walletRepository.findDefault()

      expect(result).toBeNull()
    })
  })

  describe('create', () => {
    it('creates a new wallet', async () => {
      const input: WalletInput = {
        name: 'New Wallet',
        color: '#3b82f6',
      }

      mockQueryOne
        .mockResolvedValueOnce(null) // findByName check
        .mockResolvedValueOnce({ ...sampleWallet, ...input, id: 2 }) // findById
      mockQuerySQL.mockResolvedValue([])
      mockGetLastInsertId.mockResolvedValue(2)

      const result = await walletRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO wallet'),
        ['New Wallet', '#3b82f6']
      )
      expect(result.name).toBe('New Wallet')
    })

    it('creates wallet with null color when not provided', async () => {
      const input: WalletInput = { name: 'Simple Wallet' }

      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...sampleWallet, name: 'Simple Wallet', color: null })
      mockQuerySQL.mockResolvedValue([])
      mockGetLastInsertId.mockResolvedValue(2)

      await walletRepository.create(input)

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO wallet'),
        ['Simple Wallet', null]
      )
    })

    it('throws error when wallet name already exists', async () => {
      const input: WalletInput = { name: 'Cash Wallet' }
      mockQueryOne.mockResolvedValueOnce(sampleWallet)

      await expect(walletRepository.create(input)).rejects.toThrow(
        'Wallet with this name already exists'
      )
    })

    it('throws error when wallet creation fails', async () => {
      const input: WalletInput = { name: 'New Wallet' }

      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null) // findById returns null
      mockGetLastInsertId.mockResolvedValue(2)

      await expect(walletRepository.create(input)).rejects.toThrow(
        'Failed to create wallet'
      )
    })
  })

  describe('update', () => {
    it('updates wallet name', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // findByName for uniqueness check
        .mockResolvedValueOnce({ ...sampleWallet, name: 'Updated Wallet' }) // findById
      mockQuerySQL.mockResolvedValue([])

      const result = await walletRepository.update(1, { name: 'Updated Wallet' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wallet SET name = ?'),
        expect.arrayContaining(['Updated Wallet', 1])
      )
      expect(result.name).toBe('Updated Wallet')
    })

    it('updates wallet color', async () => {
      mockQueryOne.mockResolvedValue({ ...sampleWallet, color: '#ef4444' })
      mockQuerySQL.mockResolvedValue([])

      await walletRepository.update(1, { color: '#ef4444' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('color = ?'),
        expect.arrayContaining(['#ef4444', 1])
      )
    })

    it('throws error when updating to existing name', async () => {
      mockQueryOne.mockResolvedValueOnce({ ...sampleWallet, id: 2 }) // Different wallet has this name

      await expect(walletRepository.update(1, { name: 'Cash Wallet' })).rejects.toThrow(
        'Wallet with this name already exists'
      )
    })

    it('allows updating to same name (own name)', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ ...sampleWallet, id: 1 }) // Same wallet
        .mockResolvedValueOnce(sampleWallet) // findById
      mockQuerySQL.mockResolvedValue([])

      const result = await walletRepository.update(1, { name: 'Cash Wallet' })

      expect(result).toBeDefined()
    })

    it('throws error when wallet not found', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // findByName
        .mockResolvedValueOnce(null) // findById

      await expect(walletRepository.update(999, { name: 'New Name' })).rejects.toThrow(
        'Wallet not found'
      )
    })

    it('updates multiple fields at once', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...sampleWallet, name: 'New', color: '#000' })
      mockQuerySQL.mockResolvedValue([])

      await walletRepository.update(1, { name: 'New', color: '#000' })

      expect(mockExecSQL).toHaveBeenCalledWith(
        expect.stringContaining('name = ?'),
        expect.arrayContaining(['New', '#000', 1])
      )
    })
  })

  describe('setDefault', () => {
    it('sets wallet as default', async () => {
      await walletRepository.setDefault(1)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)',
        [1, SYSTEM_TAGS.DEFAULT]
      )
    })
  })

  describe('archive', () => {
    it('archives wallet by adding archived tag', async () => {
      await walletRepository.archive(1)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)',
        [1, SYSTEM_TAGS.ARCHIVED]
      )
    })
  })

  describe('unarchive', () => {
    it('unarchives wallet by removing archived tag', async () => {
      await walletRepository.unarchive(1)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM wallet_to_tags WHERE wallet_id = ? AND tag_id = ?',
        [1, SYSTEM_TAGS.ARCHIVED]
      )
    })
  })

  describe('delete', () => {
    it('deletes wallet when no transactions linked', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      await walletRepository.delete(1)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'DELETE FROM wallet WHERE id = ?',
        [1]
      )
    })

    it('throws error when transactions are linked', async () => {
      mockQueryOne.mockResolvedValue({ count: 5 })

      await expect(walletRepository.delete(1)).rejects.toThrow(
        'Cannot delete: 5 transactions linked to accounts in this wallet'
      )
    })

    it('checks for linked transactions before deleting', async () => {
      mockQueryOne.mockResolvedValue({ count: 0 })

      await walletRepository.delete(1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count FROM trx_base'),
        [1]
      )
    })
  })

  describe('addAccount', () => {
    it('adds new account to wallet', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // Existing account check
        .mockResolvedValueOnce({ ...sampleAccount, id: 2, currency_id: 2, currency: 'EUR' })
      mockGetLastInsertId.mockResolvedValue(2)

      const result = await walletRepository.addAccount(1, 2)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO account (wallet_id, currency_id) VALUES (?, ?)',
        [1, 2]
      )
      expect(result.currency).toBe('EUR')
    })

    it('throws error when account with currency already exists', async () => {
      mockQueryOne.mockResolvedValueOnce(sampleAccount)

      await expect(walletRepository.addAccount(1, 1)).rejects.toThrow(
        'This wallet already has an account with this currency'
      )
    })

    it('throws error when account creation fails', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null) // Account not created

      mockGetLastInsertId.mockResolvedValue(2)

      await expect(walletRepository.addAccount(1, 2)).rejects.toThrow(
        'Failed to create account'
      )
    })

    it('returns account with is_default flag from account_to_tags', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...sampleAccount, is_default: 1 })
      mockGetLastInsertId.mockResolvedValue(2)

      const result = await walletRepository.addAccount(1, 2)

      expect(mockQueryOne).toHaveBeenLastCalledWith(
        expect.stringContaining('EXISTS(SELECT 1 FROM account_to_tags'),
        [SYSTEM_TAGS.DEFAULT, 2]
      )
      expect(result.is_default).toBeTruthy()
    })

    it('creates INITIAL transaction when initialBalance provided', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // Existing account check
        .mockResolvedValueOnce({ ...sampleAccount, id: 2, currency_id: 2, currency: 'EUR' })
      mockGetLastInsertId.mockResolvedValue(2)

      await walletRepository.addAccount(1, 2, 10000)

      expect(mockTransactionRepository.create).toHaveBeenCalledWith({
        lines: [{
          account_id: 2,
          tag_id: SYSTEM_TAGS.INITIAL,
          sign: '+',
          amount: 10000,
          rate: 0
        }]
      })
    })

    it('does not create INITIAL transaction when initialBalance is 0', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // Existing account check
        .mockResolvedValueOnce({ ...sampleAccount, id: 2, currency_id: 2, currency: 'EUR' })
      mockGetLastInsertId.mockResolvedValue(2)

      await walletRepository.addAccount(1, 2, 0)

      expect(mockTransactionRepository.create).not.toHaveBeenCalled()
    })

    it('does not create INITIAL transaction when initialBalance is undefined', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // Existing account check
        .mockResolvedValueOnce({ ...sampleAccount, id: 2, currency_id: 2, currency: 'EUR' })
      mockGetLastInsertId.mockResolvedValue(2)

      await walletRepository.addAccount(1, 2)

      expect(mockTransactionRepository.create).not.toHaveBeenCalled()
    })
  })

  describe('findAccountByCurrency', () => {
    it('returns account when found in wallet with currency', async () => {
      mockQueryOne.mockResolvedValue(sampleAccount)

      const result = await walletRepository.findAccountByCurrency(1, 1)

      expect(mockQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.wallet_id = ? AND a.currency_id = ?'),
        [SYSTEM_TAGS.DEFAULT, 1, 1]
      )
      expect(result).toEqual(sampleAccount)
    })

    it('returns null when account not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await walletRepository.findAccountByCurrency(1, 99)

      expect(result).toBeNull()
    })
  })

  describe('createVirtualAccount', () => {
    const virtualWallet: Wallet = {
      id: 10,
      name: 'Virtual',
      color: '#808080',
      is_default: false,
      accounts: [],
    }

    it('creates virtual wallet and account if not exist', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null) // No existing virtual wallet
        .mockResolvedValueOnce(virtualWallet) // findById returns wallet
        .mockResolvedValueOnce(null) // No existing virtual account
        .mockResolvedValueOnce({ ...sampleAccount, id: 20, wallet_id: 10, currency_id: 2 }) // Created account
      mockQuerySQL.mockResolvedValue([])
      mockGetLastInsertId
        .mockResolvedValueOnce(10) // Wallet id
        .mockResolvedValueOnce(20) // Account id

      const result = await walletRepository.createVirtualAccount(2)

      // Wallet creation
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO wallet (name, color) VALUES (?, ?)',
        ['Virtual', '#808080']
      )
      // Wallet tagged as SYSTEM
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO wallet_to_tags (wallet_id, tag_id) VALUES (?, ?)',
        [10, SYSTEM_TAGS.SYSTEM]
      )
      // Account creation
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO account (wallet_id, currency_id) VALUES (?, ?)',
        [10, 2]
      )
      // Account tagged as SYSTEM
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO account_to_tags (account_id, tag_id) VALUES (?, ?)',
        [20, SYSTEM_TAGS.SYSTEM]
      )
      expect(result.wallet_id).toBe(10)
    })

    it('uses existing virtual wallet if found', async () => {
      mockQueryOne
        .mockResolvedValueOnce(virtualWallet) // Existing virtual wallet
        .mockResolvedValueOnce(null) // No existing virtual account for currency
        .mockResolvedValueOnce({ ...sampleAccount, id: 21, wallet_id: 10, currency_id: 3 }) // Created account
      mockGetLastInsertId.mockResolvedValue(21)

      const result = await walletRepository.createVirtualAccount(3)

      // Should not create wallet
      expect(mockExecSQL).not.toHaveBeenCalledWith(
        'INSERT INTO wallet (name, color) VALUES (?, ?)',
        expect.anything()
      )
      expect(result.currency_id).toBe(3)
    })

    it('returns existing virtual account if already exists', async () => {
      const existingVirtualAccount = { ...sampleAccount, id: 22, wallet_id: 10, currency_id: 2 }
      mockQueryOne
        .mockResolvedValueOnce(virtualWallet) // Existing virtual wallet
        .mockResolvedValueOnce(existingVirtualAccount) // Existing virtual account

      const result = await walletRepository.createVirtualAccount(2)

      expect(result).toEqual(existingVirtualAccount)
    })

    it('throws error when account creation fails', async () => {
      mockQueryOne
        .mockResolvedValueOnce(virtualWallet)
        .mockResolvedValueOnce(null) // No existing account
        .mockResolvedValueOnce(null) // Account query returns null
      mockGetLastInsertId.mockResolvedValue(99)

      await expect(walletRepository.createVirtualAccount(5)).rejects.toThrow(
        'Failed to create virtual account'
      )
    })
  })

  describe('findOrCreateAccountForCurrency', () => {
    it('returns existing account from same wallet', async () => {
      mockQueryOne.mockResolvedValue(sampleAccount)

      const result = await walletRepository.findOrCreateAccountForCurrency(1, 1)

      expect(result).toEqual(sampleAccount)
    })

    it('creates virtual account when not in same wallet (skips findAnyAccountByCurrency)', async () => {
      const virtualAccount = { ...sampleAccount, id: 30, wallet_id: 10, currency_id: 1 }
      const virtualWallet: Wallet = {
        id: 10,
        name: 'Virtual',
        color: '#808080',
        is_default: false,
        accounts: [],
      }

      mockQueryOne
        .mockResolvedValueOnce(null) // findAccountByCurrency
        .mockResolvedValueOnce(virtualWallet) // createVirtualAccount - find virtual wallet
        .mockResolvedValueOnce(null) // No existing virtual account
        .mockResolvedValueOnce(virtualAccount) // Created virtual account
      mockGetLastInsertId.mockResolvedValue(30)

      const result = await walletRepository.findOrCreateAccountForCurrency(1, 1)

      expect(result.wallet_id).toBe(10)
    })

    it('creates virtual account when no existing account found', async () => {
      const virtualAccount = { ...sampleAccount, id: 30, wallet_id: 10, currency_id: 2 }
      const virtualWallet: Wallet = {
        id: 10,
        name: 'Virtual',
        color: '#808080',
        is_default: false,
        accounts: [],
      }

      mockQueryOne
        .mockResolvedValueOnce(null) // findAccountByCurrency
        .mockResolvedValueOnce(null) // findAnyAccountByCurrency
        .mockResolvedValueOnce(virtualWallet) // createVirtualAccount - find virtual wallet
        .mockResolvedValueOnce(null) // No existing virtual account
        .mockResolvedValueOnce(virtualAccount) // Created virtual account
      mockGetLastInsertId.mockResolvedValue(30)

      const result = await walletRepository.findOrCreateAccountForCurrency(1, 2)

      expect(result.wallet_id).toBe(10)
    })
  })
})
