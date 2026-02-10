import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock blobUtils
vi.mock('../../../../utils/blobUtils', () => ({
  hexToBlob: vi.fn((hex: string) => {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    return bytes
  }),
}))

// Mock repositories
vi.mock('../../../../services/repositories', () => ({
  transactionRepository: {
    existsByTrxId: vi.fn(),
    createWithId: vi.fn(),
    addImportLine: vi.fn(),
  },
  walletRepository: {
    findByName: vi.fn(),
    create: vi.fn(),
    addAccount: vi.fn(),
  },
  tagRepository: {
    findById: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
  },
  counterpartyRepository: {
    findById: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
  },
  currencyRepository: {
    findByCode: vi.fn(),
    setExchangeRate: vi.fn(),
  },
  accountRepository: {
    findById: vi.fn(),
    findByWalletAndCurrency: vi.fn(),
  },
}))

// Mock database
vi.mock('../../../../services/database', () => ({
  execSQL: vi.fn(),
}))

import { importTransactionsFromCSV } from '../../../../services/import/csvImport'
import {
  transactionRepository,
  walletRepository,
  tagRepository,
  counterpartyRepository,
  currencyRepository,
  accountRepository,
} from '../../../../services/repositories'
import { execSQL } from '../../../../services/database'

const mockExistsByTrxId = vi.mocked(transactionRepository.existsByTrxId)
const mockCreateWithId = vi.mocked(transactionRepository.createWithId)
const mockAddImportLine = vi.mocked(transactionRepository.addImportLine)
const mockWalletFindByName = vi.mocked(walletRepository.findByName)
const mockWalletCreate = vi.mocked(walletRepository.create)
const mockWalletAddAccount = vi.mocked(walletRepository.addAccount)
const mockTagFindById = vi.mocked(tagRepository.findById)
const mockTagFindByName = vi.mocked(tagRepository.findByName)
const mockTagCreate = vi.mocked(tagRepository.create)
const mockCpFindById = vi.mocked(counterpartyRepository.findById)
const mockCpFindByName = vi.mocked(counterpartyRepository.findByName)
const mockCpCreate = vi.mocked(counterpartyRepository.create)
const mockCurrencyFindByCode = vi.mocked(currencyRepository.findByCode)
const mockSetExchangeRate = vi.mocked(currencyRepository.setExchangeRate)
const mockAccountFindById = vi.mocked(accountRepository.findById)
const mockAccountFindByWalletAndCurrency = vi.mocked(accountRepository.findByWalletAndCurrency)
const mockExecSQL = vi.mocked(execSQL)

const VALID_HEADER = 'date_time,trx_id,account_id,wallet,currency_code,tag_id,tag,amount,rate,counterparty_id,counterparty,note'

function makeRow(overrides: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    date_time: '2025-01-09T14:30:00',
    trx_id: '0102030405060708',
    account_id: '1',
    wallet: 'Cash',
    currency_code: 'USD',
    tag_id: '12',
    tag: 'food',
    amount: '-50.25',
    rate: '100',
    counterparty_id: '1',
    counterparty: 'Supermarket',
    note: 'Groceries',
  }
  const merged = { ...defaults, ...overrides }
  return [
    merged.date_time,
    merged.trx_id,
    merged.account_id,
    merged.wallet,
    merged.currency_code,
    merged.tag_id,
    merged.tag,
    merged.amount,
    merged.rate,
    merged.counterparty_id,
    merged.counterparty,
    merged.note,
  ].join(',')
}

function makeCSV(...rows: string[]): string {
  return [VALID_HEADER, ...rows].join('\n')
}

/** Set up mocks for a standard successful import flow */
function setupDefaultMocks() {
  mockExistsByTrxId.mockResolvedValue(false)
  mockCreateWithId.mockResolvedValue(undefined)
  mockAddImportLine.mockResolvedValue(undefined)
  mockExecSQL.mockResolvedValue(undefined as any)

  mockCurrencyFindByCode.mockResolvedValue({
    id: 1,
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimal_places: 2,
    is_default: true,
  } as any)

  mockTagFindById.mockResolvedValue({ id: 12, name: 'food' } as any)

  mockWalletFindByName.mockResolvedValue({ id: 1, name: 'Cash', color: null } as any)

  mockAccountFindById.mockResolvedValue({
    id: 1,
    wallet_id: 1,
    currency_id: 1,
    wallet: 'Cash',
    currency: 'USD',
    symbol: '$',
    decimal_places: 2,
  } as any)

  mockCpFindById.mockResolvedValue({ id: 1, name: 'Supermarket' } as any)
}

describe('csvImport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Header validation
  describe('header validation', () => {
    it('returns error on invalid headers', async () => {
      const csv = 'wrong_header,trx_id,account_id,wallet,currency_code,tag_id,tag,amount,rate,counterparty_id,counterparty,note\n'
      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].row).toBe(1)
      expect(result.errors[0].message).toContain('Invalid header')
      expect(result.errors[0].message).toContain('date_time')
      expect(result.errors[0].message).toContain('wrong_header')
      expect(result.importedRows).toBe(0)
    })

    it('returns error when a middle header is wrong', async () => {
      const csv = 'date_time,trx_id,account_id,wallet,currency_code,WRONG,tag,amount,rate,counterparty_id,counterparty,note\n'
      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toContain('tag_id')
      expect(result.errors[0].message).toContain('WRONG')
    })
  })

  // 2. Basic import
  describe('basic import', () => {
    it('successfully imports a single transaction row', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow())

      const result = await importTransactionsFromCSV(csv)

      expect(result.totalRows).toBe(1)
      expect(result.importedRows).toBe(1)
      expect(result.skippedDuplicates).toBe(0)
      expect(result.errors).toHaveLength(0)

      expect(mockExistsByTrxId).toHaveBeenCalledOnce()
      expect(mockCreateWithId).toHaveBeenCalledOnce()
      expect(mockAddImportLine).toHaveBeenCalledOnce()

      // Verify the transaction line parameters
      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.account_id).toBe(1)
      expect(lineArg.tag_id).toBe(12)
      expect(lineArg.sign).toBe('-')
      expect(lineArg.amount).toBe(5025) // |-50.25| * 10^2
      expect(lineArg.rate).toBe(100)
    })
  })

  // 3. Duplicate detection
  describe('duplicate detection', () => {
    it('skips rows where existsByTrxId returns true', async () => {
      setupDefaultMocks()
      mockExistsByTrxId.mockResolvedValue(true)
      const csv = makeCSV(makeRow())

      const result = await importTransactionsFromCSV(csv)

      expect(result.skippedDuplicates).toBe(1)
      expect(result.importedRows).toBe(0)
      expect(mockCreateWithId).not.toHaveBeenCalled()
      expect(mockAddImportLine).not.toHaveBeenCalled()
    })
  })

  // 4. Invalid date_time
  describe('invalid date_time', () => {
    it('adds error for unparseable dates', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ date_time: 'not-a-date' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toContain('Invalid date_time')
      expect(result.errors[0].message).toContain('not-a-date')
      expect(result.importedRows).toBe(0)
      expect(mockCreateWithId).not.toHaveBeenCalled()
    })
  })

  // 5. Multiple lines per transaction
  describe('multiple lines per transaction', () => {
    it('groups rows by trx_id, inserts one trx but multiple lines', async () => {
      setupDefaultMocks()
      const row1 = makeRow({ trx_id: 'aabbccdd11223344', tag_id: '12', tag: 'food', amount: '-50.25' })
      const row2 = makeRow({ trx_id: 'aabbccdd11223344', tag_id: '12', tag: 'food', amount: '50.25' })
      const csv = makeCSV(row1, row2)

      const result = await importTransactionsFromCSV(csv)

      expect(result.totalRows).toBe(2)
      expect(result.importedRows).toBe(2)
      expect(mockCreateWithId).toHaveBeenCalledOnce()
      expect(mockAddImportLine).toHaveBeenCalledTimes(2)

      // Second line should be positive
      const line2 = mockAddImportLine.mock.calls[1][1]
      expect(line2.sign).toBe('+')
      expect(line2.amount).toBe(5025)
    })
  })

  // 6-9. Counterparty resolution
  describe('counterparty resolution', () => {
    it('finds counterparty by ID', async () => {
      setupDefaultMocks()
      mockCpFindById.mockResolvedValue({ id: 5, name: 'Store' } as any)
      const csv = makeCSV(makeRow({ counterparty_id: '5', counterparty: 'Store' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockCpFindById).toHaveBeenCalledWith(5)
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)',
        [expect.any(Uint8Array), 5],
      )
    })

    it('falls back to name lookup when ID exists but name does not match', async () => {
      setupDefaultMocks()
      // ID 5 exists in target DB but with a different name
      mockCpFindById.mockResolvedValue({ id: 5, name: 'WrongStore' } as any)
      mockCpFindByName.mockResolvedValue({ id: 9, name: 'Store' } as any)
      const csv = makeCSV(makeRow({ counterparty_id: '5', counterparty: 'Store' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockCpFindById).toHaveBeenCalledWith(5)
      // Should fall through to name lookup since name didn't match
      expect(mockCpFindByName).toHaveBeenCalledWith('Store')
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)',
        [expect.any(Uint8Array), 9],
      )
    })

    it('falls back to name lookup when ID not found', async () => {
      setupDefaultMocks()
      mockCpFindById.mockResolvedValue(null as any)
      mockCpFindByName.mockResolvedValue({ id: 7, name: 'Bakery' } as any)
      const csv = makeCSV(makeRow({ counterparty_id: '999', counterparty: 'Bakery' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockCpFindById).toHaveBeenCalledWith(999)
      expect(mockCpFindByName).toHaveBeenCalledWith('Bakery')
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)',
        [expect.any(Uint8Array), 7],
      )
    })

    it('creates new counterparty when not found', async () => {
      setupDefaultMocks()
      mockCpFindById.mockResolvedValue(null as any)
      mockCpFindByName.mockResolvedValue(null as any)
      mockCpCreate.mockResolvedValue({ id: 10, name: 'NewPlace' } as any)
      const csv = makeCSV(makeRow({ counterparty_id: '', counterparty: 'NewPlace' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockCpCreate).toHaveBeenCalledWith({ name: 'NewPlace' })
      expect(result.createdCounterparties).toContain('NewPlace')
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)',
        [expect.any(Uint8Array), 10],
      )
    })

    it('uses cache on second occurrence of the same counterparty', async () => {
      setupDefaultMocks()
      mockCpFindById.mockResolvedValue({ id: 5, name: 'Store' } as any)
      const row1 = makeRow({ trx_id: 'aa00000000000001', counterparty_id: '5', counterparty: 'Store' })
      const row2 = makeRow({ trx_id: 'aa00000000000002', counterparty_id: '5', counterparty: 'Store' })
      const csv = makeCSV(row1, row2)

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      // findById should only be called once because the second lookup uses cache
      expect(mockCpFindById).toHaveBeenCalledTimes(1)
    })
  })

  // 10. Currency not found
  describe('currency resolution', () => {
    it('errors when currency code does not exist', async () => {
      setupDefaultMocks()
      mockCurrencyFindByCode.mockResolvedValue(null as any)
      const csv = makeCSV(makeRow({ currency_code: 'XYZ' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toContain('Currency not found')
      expect(result.errors[0].message).toContain('XYZ')
      expect(result.importedRows).toBe(0)
    })
  })

  // 11-14. Tag resolution
  describe('tag resolution', () => {
    it('finds tag by ID', async () => {
      setupDefaultMocks()
      mockTagFindById.mockResolvedValue({ id: 12, name: 'food' } as any)
      const csv = makeCSV(makeRow({ tag_id: '12', tag: 'food' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockTagFindById).toHaveBeenCalledWith(12)
    })

    it('falls back to name lookup when ID exists but name does not match', async () => {
      setupDefaultMocks()
      // ID 12 exists in target DB but with a different name
      mockTagFindById.mockResolvedValue({ id: 12, name: 'WrongTag' } as any)
      mockTagFindByName.mockResolvedValue({ id: 25, name: 'food' } as any)
      const csv = makeCSV(makeRow({ tag_id: '12', tag: 'food' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockTagFindById).toHaveBeenCalledWith(12)
      // Should fall through to name lookup since name didn't match
      expect(mockTagFindByName).toHaveBeenCalledWith('food')

      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.tag_id).toBe(25)
    })

    it('falls back to name lookup when ID not found', async () => {
      setupDefaultMocks()
      mockTagFindById.mockResolvedValue(null as any)
      mockTagFindByName.mockResolvedValue({ id: 20, name: 'transport' } as any)
      const csv = makeCSV(makeRow({ tag_id: '999', tag: 'transport' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockTagFindByName).toHaveBeenCalledWith('transport')

      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.tag_id).toBe(20)
    })

    it('creates new tag when not found', async () => {
      setupDefaultMocks()
      mockTagFindById.mockResolvedValue(null as any)
      mockTagFindByName.mockResolvedValue(null as any)
      mockTagCreate.mockResolvedValue({ id: 30, name: 'newtag' } as any)
      const csv = makeCSV(makeRow({ tag_id: '', tag: 'newtag' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockTagCreate).toHaveBeenCalledWith({ name: 'newtag' })
      expect(result.createdTags).toContain('newtag')

      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.tag_id).toBe(30)
    })

    it('uses cache for repeated tags', async () => {
      setupDefaultMocks()
      mockTagFindById.mockResolvedValue({ id: 12, name: 'food' } as any)
      const row1 = makeRow({ trx_id: 'aa00000000000001', tag_id: '12', tag: 'food' })
      const row2 = makeRow({ trx_id: 'aa00000000000002', tag_id: '12', tag: 'food' })
      const csv = makeCSV(row1, row2)

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      // findById should only be called once because the second lookup uses cache
      expect(mockTagFindById).toHaveBeenCalledTimes(1)
    })
  })

  // 15-17. Wallet resolution
  describe('wallet resolution', () => {
    it('finds existing wallet by name', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow())

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockWalletFindByName).toHaveBeenCalledWith('Cash')
      expect(result.createdWallets).toHaveLength(0)
    })

    it('creates new wallet when not found', async () => {
      setupDefaultMocks()
      mockWalletFindByName.mockResolvedValue(null as any)
      mockWalletCreate.mockResolvedValue({ id: 5, name: 'NewWallet' } as any)
      // After creating wallet, we need account resolution to work too
      mockAccountFindById.mockResolvedValue(null as any)
      mockAccountFindByWalletAndCurrency.mockResolvedValue(null as any)
      mockWalletAddAccount.mockResolvedValue({ id: 10 } as any)
      const csv = makeCSV(makeRow({ wallet: 'NewWallet', account_id: '' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockWalletCreate).toHaveBeenCalledWith({ name: 'NewWallet' })
      expect(result.createdWallets).toContain('NewWallet')
    })

    it('uses cache for repeated wallets', async () => {
      setupDefaultMocks()
      const row1 = makeRow({ trx_id: 'aa00000000000001' })
      const row2 = makeRow({ trx_id: 'aa00000000000002' })
      const csv = makeCSV(row1, row2)

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      // findByName should only be called once because the second lookup uses cache
      expect(mockWalletFindByName).toHaveBeenCalledTimes(1)
    })
  })

  // 18-21. Account resolution
  describe('account resolution', () => {
    it('finds account by ID with wallet+currency match', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ account_id: '1' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockAccountFindById).toHaveBeenCalledWith(1)
      expect(result.createdAccounts).toHaveLength(0)
    })

    it('falls back to findByWalletAndCurrency when account ID not set', async () => {
      setupDefaultMocks()
      mockAccountFindByWalletAndCurrency.mockResolvedValue({
        id: 3,
        wallet_id: 1,
        currency_id: 1,
      } as any)
      const csv = makeCSV(makeRow({ account_id: '' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockAccountFindByWalletAndCurrency).toHaveBeenCalledWith(1, 1)
    })

    it('creates new account via walletRepository.addAccount', async () => {
      setupDefaultMocks()
      mockAccountFindById.mockResolvedValue(null as any)
      mockAccountFindByWalletAndCurrency.mockResolvedValue(null as any)
      mockWalletAddAccount.mockResolvedValue({ id: 20 } as any)
      const csv = makeCSV(makeRow({ account_id: '' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockWalletAddAccount).toHaveBeenCalledWith(1, 1)
      expect(result.createdAccounts).toContain('Cash - USD')
    })

    it('uses cache for repeated accounts', async () => {
      setupDefaultMocks()
      mockAccountFindByWalletAndCurrency.mockResolvedValue({
        id: 3, wallet_id: 1, currency_id: 1,
      } as any)
      // Two different transactions, same wallet+currency, no account_id so cache path is used
      const row1 = makeRow({ trx_id: 'aa00000000000001', account_id: '' })
      const row2 = makeRow({ trx_id: 'aa00000000000002', account_id: '' })
      const csv = makeCSV(row1, row2)

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      // findByWalletAndCurrency should only be called once because the second lookup uses cache
      expect(mockAccountFindByWalletAndCurrency).toHaveBeenCalledTimes(1)
    })
  })

  // 22-23. Amount parsing
  describe('amount parsing', () => {
    it('correctly parses positive amounts', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ amount: '123.45' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.sign).toBe('+')
      expect(lineArg.amount).toBe(12345)
    })

    it('correctly parses negative amounts', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ amount: '-99.99' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.sign).toBe('-')
      expect(lineArg.amount).toBe(9999)
    })

    it('errors on non-numeric amounts', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ amount: 'abc' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toContain('Invalid amount')
      expect(result.errors[0].message).toContain('abc')
      expect(result.importedRows).toBe(0)
    })
  })

  // 24-25. Rate parsing
  describe('rate parsing', () => {
    it('parses integer rate from CSV', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ rate: '31500' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.rate).toBe(31500)
    })

    it('defaults to 0 for empty rate', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ rate: '' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.rate).toBe(0)
    })

    it('falls back to 0 for non-numeric rate', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ rate: 'abc' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.rate).toBe(0)
    })
  })

  // 26-27. Note and counterparty insertion
  describe('note and counterparty insertion', () => {
    it('inserts note via execSQL', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ note: 'My grocery trip' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO trx_note (trx_id, note) VALUES (?, ?)',
        [expect.any(Uint8Array), 'My grocery trip'],
      )
    })

    it('skips note and counterparty insertion when both empty', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ counterparty_id: '', counterparty: '', note: '' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      // execSQL should not have been called for note or counterparty
      expect(mockExecSQL).not.toHaveBeenCalled()
    })
  })

  // 28. CSV with BOM
  describe('CSV with BOM', () => {
    it('handles UTF-8 BOM at start of file', async () => {
      setupDefaultMocks()
      const bom = '\uFEFF'
      const csv = bom + makeCSV(makeRow())

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(result.importedRows).toBe(1)
    })
  })

  // 29. CSV with quoted fields
  describe('CSV with quoted fields', () => {
    it('handles commas inside quoted fields', async () => {
      setupDefaultMocks()
      mockWalletFindByName.mockImplementation(async (name: string) => {
        if (name === 'Cash, Bank') return { id: 1, name: 'Cash, Bank', color: null } as any
        return null
      })
      // Build the row manually to include quotes
      const row = '2025-01-09T14:30:00,0102030405060708,1,"Cash, Bank",USD,12,food,-50.25,100,1,Supermarket,Groceries'
      const csv = makeCSV(row)

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockWalletFindByName).toHaveBeenCalledWith('Cash, Bank')
    })

    it('handles escaped quotes inside quoted fields', async () => {
      setupDefaultMocks()
      // Note with embedded quotes: Said "Hello"
      const row = '2025-01-09T14:30:00,0102030405060708,1,Cash,USD,12,food,-50.25,100,1,Supermarket,"Said ""Hello"""'
      const csv = makeCSV(row)

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO trx_note (trx_id, note) VALUES (?, ?)',
        [expect.any(Uint8Array), 'Said "Hello"'],
      )
    })
  })

  // 30. CSV with \r\n line endings
  describe('CSV with Windows line endings', () => {
    it('handles \\r\\n line endings', async () => {
      setupDefaultMocks()
      const csv = VALID_HEADER + '\r\n' + makeRow() + '\r\n'

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(result.totalRows).toBe(1)
      expect(result.importedRows).toBe(1)
    })
  })

  // 31. Empty wallet name
  describe('empty wallet name', () => {
    it('returns error when wallet name is empty', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ wallet: '' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some(e => e.message.includes('Could not resolve wallet'))).toBe(true)
      expect(result.importedRows).toBe(0)
    })
  })

  // 32. No tag_id and no tag name
  describe('no tag_id and no tag name', () => {
    it('returns error when both tag_id and tag name are empty', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ tag_id: '', tag: '' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.some(e => e.message.includes('Could not resolve tag'))).toBe(true)
      expect(result.importedRows).toBe(0)
    })
  })

  // 33. Account ID doesn't match wallet+currency
  describe('account ID mismatch', () => {
    it('falls through to findByWalletAndCurrency when account ID does not match wallet+currency', async () => {
      setupDefaultMocks()
      // Account exists but with a different wallet_id
      mockAccountFindById.mockResolvedValue({
        id: 1,
        wallet_id: 999,
        currency_id: 1,
      } as any)
      mockAccountFindByWalletAndCurrency.mockResolvedValue({
        id: 5,
        wallet_id: 1,
        currency_id: 1,
      } as any)
      const csv = makeCSV(makeRow({ account_id: '1' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockAccountFindById).toHaveBeenCalledWith(1)
      expect(mockAccountFindByWalletAndCurrency).toHaveBeenCalledWith(1, 1)

      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.account_id).toBe(5)
    })
  })

  // 34. Error in line processing
  describe('error in line processing', () => {
    it('catches and records individual line errors', async () => {
      setupDefaultMocks()
      mockAddImportLine.mockRejectedValueOnce(new Error('DB write failed'))
      const csv = makeCSV(makeRow())

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toBe('DB write failed')
      expect(result.importedRows).toBe(0)
    })

    it('continues processing other lines after a line error', async () => {
      setupDefaultMocks()
      // Two lines in the same transaction: first line fails, second succeeds
      mockAddImportLine
        .mockRejectedValueOnce(new Error('Line 1 failed'))
        .mockResolvedValueOnce(undefined)

      const row1 = makeRow({ trx_id: 'aa00000000000001', tag_id: '12', amount: '-10.00' })
      const row2 = makeRow({ trx_id: 'aa00000000000001', tag_id: '12', amount: '10.00' })
      const csv = makeCSV(row1, row2)

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toBe('Line 1 failed')
      expect(result.importedRows).toBe(1)
    })
  })

  // 35. Error in transaction processing
  describe('error in transaction processing', () => {
    it('catches and records trx-level errors', async () => {
      setupDefaultMocks()
      mockCreateWithId.mockRejectedValueOnce(new Error('Transaction insert failed'))
      const csv = makeCSV(makeRow())

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toBe('Transaction insert failed')
      expect(result.importedRows).toBe(0)
    })

    it('records non-Error throws as string', async () => {
      setupDefaultMocks()
      mockCreateWithId.mockRejectedValueOnce('string error')
      const csv = makeCSV(makeRow())

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toBe('string error')
    })
  })

  // Additional edge cases for thorough coverage
  describe('edge cases', () => {
    it('skips empty lines in CSV', async () => {
      setupDefaultMocks()
      const csv = VALID_HEADER + '\n\n' + makeRow() + '\n\n'

      const result = await importTransactionsFromCSV(csv)

      expect(result.totalRows).toBe(1)
      expect(result.importedRows).toBe(1)
    })

    it('skips rows with fewer than 12 fields', async () => {
      setupDefaultMocks()
      const shortRow = '2025-01-09T14:30:00,0102030405060708,1,Cash,USD,12,food,-50.25,100,1,Supermarket'
      const csv = makeCSV(shortRow, makeRow())

      const result = await importTransactionsFromCSV(csv)

      // The short row should be silently skipped (not counted as totalRows)
      expect(result.totalRows).toBe(1)
      expect(result.importedRows).toBe(1)
    })

    it('handles counterparty resolved by name when no id provided', async () => {
      setupDefaultMocks()
      mockCpFindByName.mockResolvedValue({ id: 3, name: 'Cafe' } as any)
      const csv = makeCSV(makeRow({ counterparty_id: '', counterparty: 'Cafe' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockCpFindByName).toHaveBeenCalledWith('Cafe')
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)',
        [expect.any(Uint8Array), 3],
      )
    })

    it('handles tag resolved by name when tag_id is non-numeric', async () => {
      setupDefaultMocks()
      mockTagFindByName.mockResolvedValue({ id: 15, name: 'travel' } as any)
      const csv = makeCSV(makeRow({ tag_id: 'abc', tag: 'travel' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockTagFindByName).toHaveBeenCalledWith('travel')
    })

    it('handles counterparty with non-numeric id falling through to name', async () => {
      setupDefaultMocks()
      mockCpFindByName.mockResolvedValue({ id: 8, name: 'Pub' } as any)
      const csv = makeCSV(makeRow({ counterparty_id: 'xyz', counterparty: 'Pub' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockCpFindByName).toHaveBeenCalledWith('Pub')
    })

    it('handles account with non-numeric id falling through to wallet+currency lookup', async () => {
      setupDefaultMocks()
      mockAccountFindByWalletAndCurrency.mockResolvedValue({
        id: 3,
        wallet_id: 1,
        currency_id: 1,
      } as any)
      const csv = makeCSV(makeRow({ account_id: 'bad' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockAccountFindByWalletAndCurrency).toHaveBeenCalledWith(1, 1)
    })

    it('counterparty cache works for name-based lookups', async () => {
      setupDefaultMocks()
      mockCpFindById.mockResolvedValue(null as any)
      mockCpFindByName.mockResolvedValue({ id: 3, name: 'Cafe' } as any)
      const row1 = makeRow({ trx_id: 'aa00000000000001', counterparty_id: '', counterparty: 'Cafe' })
      const row2 = makeRow({ trx_id: 'aa00000000000002', counterparty_id: '', counterparty: 'Cafe' })
      const csv = makeCSV(row1, row2)

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      // findByName should only be called once due to caching
      expect(mockCpFindByName).toHaveBeenCalledTimes(1)
    })

    it('tag cache works for name-based lookups', async () => {
      setupDefaultMocks()
      mockTagFindById.mockResolvedValue(null as any)
      mockTagFindByName.mockResolvedValue({ id: 15, name: 'travel' } as any)
      const row1 = makeRow({ trx_id: 'aa00000000000001', tag_id: '', tag: 'travel' })
      const row2 = makeRow({ trx_id: 'aa00000000000002', tag_id: '', tag: 'travel' })
      const csv = makeCSV(row1, row2)

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      // findByName should only be called once due to caching
      expect(mockTagFindByName).toHaveBeenCalledTimes(1)
    })

    it('currency cache prevents repeated lookups', async () => {
      setupDefaultMocks()
      const row1 = makeRow({ trx_id: 'aa00000000000001' })
      const row2 = makeRow({ trx_id: 'aa00000000000002' })
      const csv = makeCSV(row1, row2)

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      // findByCode should only be called once due to caching
      expect(mockCurrencyFindByCode).toHaveBeenCalledTimes(1)
    })

    it('handles CSV with newline inside quoted field', async () => {
      setupDefaultMocks()
      // Note field contains a newline inside quotes
      const csv = VALID_HEADER + '\n2025-01-09T14:30:00,0102030405060708,1,Cash,USD,12,food,-50.25,100,1,Supermarket,"Line 1\nLine 2"'

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT INTO trx_note (trx_id, note) VALUES (?, ?)',
        [expect.any(Uint8Array), 'Line 1\nLine 2'],
      )
    })

    it('handles multiple transactions some duplicate some not', async () => {
      setupDefaultMocks()
      // First transaction is a duplicate, second is new
      mockExistsByTrxId
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)

      const row1 = makeRow({ trx_id: 'aa00000000000001' })
      const row2 = makeRow({ trx_id: 'bb00000000000002' })
      const csv = makeCSV(row1, row2)

      const result = await importTransactionsFromCSV(csv)

      expect(result.totalRows).toBe(2)
      expect(result.skippedDuplicates).toBe(1)
      expect(result.importedRows).toBe(1)
    })

    it('duplicate transaction with multiple rows skips all rows', async () => {
      setupDefaultMocks()
      mockExistsByTrxId.mockResolvedValue(true)
      const row1 = makeRow({ trx_id: 'aa00000000000001', amount: '-50.00' })
      const row2 = makeRow({ trx_id: 'aa00000000000001', amount: '50.00' })
      const csv = makeCSV(row1, row2)

      const result = await importTransactionsFromCSV(csv)

      expect(result.skippedDuplicates).toBe(2)
      expect(result.importedRows).toBe(0)
      expect(mockCreateWithId).not.toHaveBeenCalled()
    })

    it('handles zero amount correctly', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ amount: '0' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.sign).toBe('+')
      expect(lineArg.amount).toBe(0)
    })

    it('handles different decimal places for currency', async () => {
      setupDefaultMocks()
      mockCurrencyFindByCode.mockResolvedValue({
        id: 2,
        code: 'BTC',
        name: 'Bitcoin',
        symbol: 'B',
        decimal_places: 8,
        is_default: false,
      } as any)
      // Need a fresh account lookup for this currency
      mockAccountFindById.mockResolvedValue({
        id: 2,
        wallet_id: 1,
        currency_id: 2,
      } as any)
      const csv = makeCSV(makeRow({ currency_code: 'BTC', amount: '0.12345678' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.amount).toBe(12345678) // 0.12345678 * 10^8
    })

    it('upgrades currency decimal_places when CSV has more precision', async () => {
      setupDefaultMocks()
      // Currency has 6 decimal places but CSV amount has 8
      mockCurrencyFindByCode.mockResolvedValue({
        id: 3,
        code: 'USDC',
        name: 'USD Coin',
        symbol: '$C',
        decimal_places: 6,
        is_default: false,
      } as any)
      mockAccountFindById.mockResolvedValue({
        id: 2,
        wallet_id: 1,
        currency_id: 3,
      } as any)
      const csv = makeCSV(makeRow({ currency_code: 'USDC', amount: '85.20659999' }))

      const result = await importTransactionsFromCSV(csv)

      expect(result.errors).toHaveLength(0)
      // Should have updated the currency's decimal_places
      expect(mockExecSQL).toHaveBeenCalledWith(
        'UPDATE currency SET decimal_places = ? WHERE id = ?',
        [8, 3]
      )
      // Amount should use the upgraded 8 decimal places
      const lineArg = mockAddImportLine.mock.calls[0][1]
      expect(lineArg.amount).toBe(8520659999) // 85.20659999 * 10^8
    })
  })

  describe('exchange rate population', () => {
    it('inserts latest rate per currency into exchange_rate table', async () => {
      setupDefaultMocks()
      // Two transactions with different rates for same currency
      const row1 = makeRow({ trx_id: 'aa00000000000001', rate: '14500' })
      const row2 = makeRow({ trx_id: 'aa00000000000002', rate: '14600' })
      const csv = makeCSV(row1, row2)

      await importTransactionsFromCSV(csv)

      // Should call setExchangeRate with latest rate (14600) for currency id 1
      expect(mockSetExchangeRate).toHaveBeenCalledWith(1, 14600)
      expect(mockSetExchangeRate).toHaveBeenCalledTimes(1)
    })

    it('inserts rates for multiple currencies', async () => {
      setupDefaultMocks()
      mockCurrencyFindByCode.mockImplementation(async (code: string) => {
        if (code === 'USD') return { id: 1, code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_default: false } as any
        if (code === 'EUR') return { id: 2, code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, is_default: false } as any
        return null
      })
      mockAccountFindById.mockImplementation(async (id: number) => {
        if (id === 1) return { id: 1, wallet_id: 1, currency_id: 1 } as any
        if (id === 2) return { id: 2, wallet_id: 1, currency_id: 2 } as any
        return null
      })
      const row1 = makeRow({ trx_id: 'aa00000000000001', currency_code: 'USD', account_id: '1', rate: '100' })
      const row2 = makeRow({ trx_id: 'aa00000000000002', currency_code: 'EUR', account_id: '2', rate: '110' })
      const csv = makeCSV(row1, row2)

      await importTransactionsFromCSV(csv)

      expect(mockSetExchangeRate).toHaveBeenCalledWith(1, 100)
      expect(mockSetExchangeRate).toHaveBeenCalledWith(2, 110)
      expect(mockSetExchangeRate).toHaveBeenCalledTimes(2)
    })

    it('does not insert exchange rate when rate is 0', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ rate: '0' }))

      await importTransactionsFromCSV(csv)

      expect(mockSetExchangeRate).not.toHaveBeenCalled()
    })
  })

  describe('tag parent relationships for newly created tags', () => {
    // SYSTEM_TAGS: DEFAULT=2, INCOME=9, EXPENSE=10

    it('assigns EXPENSE + DEFAULT parents for expense tag (negative amount)', async () => {
      setupDefaultMocks()
      mockTagFindById.mockResolvedValue(null as any)
      mockTagFindByName.mockResolvedValue(null as any)
      mockTagCreate.mockResolvedValue({ id: 30, name: 'newtag' } as any)
      const csv = makeCSV(makeRow({ tag_id: '', tag: 'newtag', amount: '-50.00' }))

      await importTransactionsFromCSV(csv)

      // Should insert DEFAULT parent
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [30, 2] // DEFAULT
      )
      // Should insert EXPENSE parent
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [30, 10] // EXPENSE
      )
      // Should NOT insert INCOME parent
      const incomeCall = mockExecSQL.mock.calls.find(
        (c) => c[0] === 'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)' &&
               (c[1] as any[])[0] === 30 && (c[1] as any[])[1] === 9
      )
      expect(incomeCall).toBeUndefined()
    })

    it('assigns INCOME + DEFAULT parents for income tag (positive amount)', async () => {
      setupDefaultMocks()
      mockTagFindById.mockResolvedValue(null as any)
      mockTagFindByName.mockResolvedValue(null as any)
      mockTagCreate.mockResolvedValue({ id: 31, name: 'salary' } as any)
      const csv = makeCSV(makeRow({ tag_id: '', tag: 'salary', amount: '5000.00' }))

      await importTransactionsFromCSV(csv)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [31, 2] // DEFAULT
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [31, 9] // INCOME
      )
      // Should NOT insert EXPENSE parent
      const expenseCall = mockExecSQL.mock.calls.find(
        (c) => c[0] === 'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)' &&
               (c[1] as any[])[0] === 31 && (c[1] as any[])[1] === 10
      )
      expect(expenseCall).toBeUndefined()
    })

    it('assigns EXPENSE + INCOME + DEFAULT parents when tag used in both signs', async () => {
      setupDefaultMocks()
      mockTagFindById.mockResolvedValue(null as any)
      mockTagFindByName.mockResolvedValue(null as any)
      mockTagCreate.mockResolvedValue({ id: 32, name: 'transfer' } as any)
      const row1 = makeRow({ trx_id: 'aa00000000000001', tag_id: '', tag: 'transfer', amount: '-100.00' })
      const row2 = makeRow({ trx_id: 'aa00000000000002', tag_id: '', tag: 'transfer', amount: '100.00' })
      const csv = makeCSV(row1, row2)

      await importTransactionsFromCSV(csv)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [32, 2] // DEFAULT
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [32, 10] // EXPENSE
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [32, 9] // INCOME
      )
    })

    it('does not add parent relationships for existing tags', async () => {
      setupDefaultMocks()
      // Tag already exists — found by ID with matching name
      mockTagFindById.mockResolvedValue({ id: 12, name: 'food' } as any)
      const csv = makeCSV(makeRow({ tag_id: '12', tag: 'food', amount: '-50.00' }))

      await importTransactionsFromCSV(csv)

      // Should NOT insert any tag_to_tag entries
      const tagToTagCalls = mockExecSQL.mock.calls.filter(
        (c) => (c[0] as string).includes('tag_to_tag')
      )
      expect(tagToTagCalls).toHaveLength(0)
    })
  })

  describe('counterparty-to-tag linking', () => {
    it('links counterparty to transaction tag', async () => {
      setupDefaultMocks()
      mockCpFindById.mockResolvedValue({ id: 5, name: 'Supermarket' } as any)
      mockTagFindById.mockResolvedValue({ id: 12, name: 'food' } as any)
      const csv = makeCSV(makeRow({ counterparty_id: '5', counterparty: 'Supermarket', tag_id: '12', tag: 'food' }))

      await importTransactionsFromCSV(csv)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)',
        [5, 12]
      )
    })

    it('links counterparty to multiple tags from different transactions', async () => {
      setupDefaultMocks()
      mockCpFindById.mockResolvedValue({ id: 5, name: 'Store' } as any)
      mockTagFindById.mockImplementation(async (id: number) => {
        if (id === 12) return { id: 12, name: 'food' } as any
        if (id === 14) return { id: 14, name: 'transport' } as any
        return null
      })
      const row1 = makeRow({ trx_id: 'aa00000000000001', counterparty_id: '5', counterparty: 'Store', tag_id: '12', tag: 'food' })
      const row2 = makeRow({ trx_id: 'aa00000000000002', counterparty_id: '5', counterparty: 'Store', tag_id: '14', tag: 'transport' })
      const csv = makeCSV(row1, row2)

      await importTransactionsFromCSV(csv)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)',
        [5, 12]
      )
      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)',
        [5, 14]
      )
    })

    it('does not link counterparty to tags when no counterparty', async () => {
      setupDefaultMocks()
      const csv = makeCSV(makeRow({ counterparty_id: '', counterparty: '' }))

      await importTransactionsFromCSV(csv)

      const cpTagCalls = mockExecSQL.mock.calls.filter(
        (c) => (c[0] as string).includes('counterparty_to_tags')
      )
      expect(cpTagCalls).toHaveLength(0)
    })

    it('links newly created counterparty to tags', async () => {
      setupDefaultMocks()
      mockCpFindById.mockResolvedValue(null as any)
      mockCpFindByName.mockResolvedValue(null as any)
      mockCpCreate.mockResolvedValue({ id: 10, name: 'NewPlace' } as any)
      mockTagFindById.mockResolvedValue({ id: 12, name: 'food' } as any)
      const csv = makeCSV(makeRow({ counterparty_id: '', counterparty: 'NewPlace', tag_id: '12', tag: 'food' }))

      await importTransactionsFromCSV(csv)

      expect(mockExecSQL).toHaveBeenCalledWith(
        'INSERT OR IGNORE INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)',
        [10, 12]
      )
    })
  })
})
