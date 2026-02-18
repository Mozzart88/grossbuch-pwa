import { hexToBlob } from '../../utils/blobUtils'
import { transactionRepository, walletRepository, tagRepository, counterpartyRepository, currencyRepository, accountRepository } from '../repositories'
import { execSQL } from '../database'
import { SYSTEM_TAGS } from '../../types'
import { toIntFrac } from '../../utils/amount'

export interface ImportResult {
  totalRows: number
  importedRows: number
  skippedDuplicates: number
  createdWallets: string[]
  createdAccounts: string[]
  createdTags: string[]
  createdCounterparties: string[]
  errors: { row: number; message: string }[]
}

interface ParsedRow {
  rowNum: number
  date_time: string
  trx_id: string
  account_id: string
  wallet: string
  currency_code: string
  tag_id: string
  tag: string
  amount: string
  rate: string
  counterparty_id: string
  counterparty: string
  note: string
}

function countDecimalPlaces(amountStr: string): number {
  const abs = amountStr.startsWith('-') ? amountStr.slice(1) : amountStr
  const dot = abs.indexOf('.')
  if (dot === -1) return 0
  return abs.length - dot - 1
}

const EXPECTED_HEADERS = [
  'date_time', 'trx_id', 'account_id', 'wallet', 'currency_code',
  'tag_id', 'tag', 'amount', 'rate', 'counterparty_id', 'counterparty', 'note',
]

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  // Split handling both \r\n and \n, but respect quoted fields with embedded newlines
  const lines: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '""'
          i++
        } else {
          inQuotes = false
        }
        current += ch
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        current += ch
      } else if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
        lines.push(current)
        current = ''
        i++
      } else if (ch === '\n') {
        lines.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  if (current.length > 0) {
    lines.push(current)
  }

  // Remove BOM if present
  if (lines.length > 0 && lines[0].charCodeAt(0) === 0xFEFF) {
    lines[0] = lines[0].slice(1)
  }

  const headerLine = lines[0]
  const headers = parseCSVLine(headerLine)

  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = parseCSVLine(line)
    if (fields.length < 12) continue

    rows.push({
      rowNum: i + 1,
      date_time: fields[0],
      trx_id: fields[1],
      account_id: fields[2],
      wallet: fields[3],
      currency_code: fields[4],
      tag_id: fields[5],
      tag: fields[6],
      amount: fields[7],
      rate: fields[8],
      counterparty_id: fields[9],
      counterparty: fields[10],
      note: fields[11],
    })
  }

  return { headers, rows }
}

export async function importTransactionsFromCSV(csvText: string): Promise<ImportResult> {
  const result: ImportResult = {
    totalRows: 0,
    importedRows: 0,
    skippedDuplicates: 0,
    createdWallets: [],
    createdAccounts: [],
    createdTags: [],
    createdCounterparties: [],
    errors: [],
  }

  const { headers, rows } = parseCSV(csvText)

  // Validate headers
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    if (headers[i]?.trim() !== EXPECTED_HEADERS[i]) {
      result.errors.push({ row: 1, message: `Invalid header: expected "${EXPECTED_HEADERS[i]}" at column ${i + 1}, got "${headers[i]}"` })
      return result
    }
  }

  result.totalRows = rows.length

  // Group rows by trx_id
  const groups = new Map<string, ParsedRow[]>()
  for (const row of rows) {
    const existing = groups.get(row.trx_id)
    if (existing) {
      existing.push(row)
    } else {
      groups.set(row.trx_id, [row])
    }
  }

  // Cache for resolved entities
  const walletCache = new Map<string, number>()
  const accountCache = new Map<string, number>() // "walletId:currencyCode" -> accountId
  const tagCache = new Map<string, number>() // name -> id
  const counterpartyCache = new Map<string, number>() // name -> id
  const currencyCache = new Map<string, { id: number; decimal_places: number }>()

  // Track latest rate per currency for exchange_rate table
  const latestRates = new Map<number, { int: number; frac: number }>() // currencyId -> rate IntFrac

  // Track signs used for newly created tags (to assign parent relationships)
  const newTagSigns = new Map<number, Set<string>>() // tagId -> set of '+'/'-'
  const createdTagNames = new Set<string>()

  // Track counterparty-to-tag associations (to link counterparties to tags)
  const counterpartyTags = new Map<number, Set<number>>() // counterpartyId -> set of tagIds

  for (const [trxIdHex, trxRows] of groups) {
    const firstRow = trxRows[0]

    try {
      // Duplicate check
      const trxIdBlob = hexToBlob(trxIdHex)
      const exists = await transactionRepository.existsByTrxId(trxIdBlob)
      if (exists) {
        result.skippedDuplicates += trxRows.length
        continue
      }

      // Parse timestamp from first row's date_time
      const timestamp = Math.floor(new Date(firstRow.date_time).getTime() / 1000)
      if (isNaN(timestamp)) {
        result.errors.push({ row: firstRow.rowNum, message: `Invalid date_time: "${firstRow.date_time}"` })
        continue
      }

      // Resolve counterparty (shared across all lines in a trx)
      let counterpartyId: number | null = null
      if (firstRow.counterparty_id || firstRow.counterparty) {
        counterpartyId = await resolveCounterparty(
          firstRow.counterparty_id,
          firstRow.counterparty,
          counterpartyCache,
          result,
        )
      }

      // Create the transaction
      await transactionRepository.createWithId(trxIdBlob, timestamp)

      // Link counterparty
      if (counterpartyId) {
        await execSQL(
          'INSERT INTO trx_to_counterparty (trx_id, counterparty_id) VALUES (?, ?)',
          [trxIdBlob, counterpartyId]
        )
      }

      // Insert note (from first row)
      if (firstRow.note) {
        await execSQL(
          'INSERT INTO trx_note (trx_id, note) VALUES (?, ?)',
          [trxIdBlob, firstRow.note]
        )
      }

      // Process each line
      for (const row of trxRows) {
        try {
          // Resolve currency
          const currency = await resolveCurrency(row.currency_code, currencyCache)
          if (!currency) {
            result.errors.push({ row: row.rowNum, message: `Currency not found: "${row.currency_code}"` })
            continue
          }

          // Resolve tag
          const tagId = await resolveTag(row.tag_id, row.tag, tagCache, result, createdTagNames)
          if (!tagId) {
            result.errors.push({ row: row.rowNum, message: `Could not resolve tag: id="${row.tag_id}", name="${row.tag}"` })
            continue
          }

          // Resolve wallet
          const walletId = await resolveWallet(row.wallet, walletCache, result)
          if (!walletId) {
            result.errors.push({ row: row.rowNum, message: `Could not resolve wallet: "${row.wallet}"` })
            continue
          }

          // Resolve account
          const accountId = await resolveAccount(
            row.account_id,
            walletId,
            row.wallet,
            currency.id,
            row.currency_code,
            accountCache,
            result,
          )
          if (!accountId) {
            result.errors.push({ row: row.rowNum, message: `Could not resolve account for wallet "${row.wallet}" + currency "${row.currency_code}"` })
            continue
          }

          // Parse amount
          const amountFloat = parseFloat(row.amount)
          if (isNaN(amountFloat)) {
            result.errors.push({ row: row.rowNum, message: `Invalid amount: "${row.amount}"` })
            continue
          }

          // Detect CSV decimal places and upgrade currency precision if needed
          const csvDecimals = countDecimalPlaces(row.amount)
          if (csvDecimals > currency.decimal_places) {
            await execSQL(
              'UPDATE currency SET decimal_places = ? WHERE id = ?',
              [csvDecimals, currency.id]
            )
            currency.decimal_places = csvDecimals
            currencyCache.set(row.currency_code, { ...currency })
          }

          const sign: '+' | '-' = amountFloat < 0 ? '-' : '+'
          const { int: amount_int, frac: amount_frac } = toIntFrac(Math.abs(amountFloat))

          // Track sign usage for newly created tags
          if (createdTagNames.has(row.tag)) {
            const signs = newTagSigns.get(tagId) || new Set()
            signs.add(sign)
            newTagSigns.set(tagId, signs)
          }

          // Parse rate as float and convert to IntFrac
          const rateFloat = row.rate ? parseFloat(row.rate) : 0
          const safeRateFloat = isNaN(rateFloat) ? 0 : rateFloat
          const { int: rate_int, frac: rate_frac } = toIntFrac(safeRateFloat)

          // Track latest rate per currency for exchange_rate table
          if (safeRateFloat > 0) {
            latestRates.set(currency.id, { int: rate_int, frac: rate_frac })
          }

          await transactionRepository.addImportLine(trxIdBlob, {
            account_id: accountId,
            tag_id: tagId,
            sign,
            amount_int,
            amount_frac,
            rate_int,
            rate_frac,
          })

          // Track counterparty-tag association
          if (counterpartyId) {
            const tags = counterpartyTags.get(counterpartyId) || new Set()
            tags.add(tagId)
            counterpartyTags.set(counterpartyId, tags)
          }

          result.importedRows++
        } catch (err) {
          result.errors.push({ row: row.rowNum, message: err instanceof Error ? err.message : String(err) })
        }
      }
    } catch (err) {
      result.errors.push({ row: firstRow.rowNum, message: err instanceof Error ? err.message : String(err) })
    }
  }

  // Populate exchange_rate table with latest rates from CSV
  for (const [currencyId, rate] of latestRates) {
    await currencyRepository.setExchangeRate(currencyId, rate.int, rate.frac)
  }

  // Assign parent relationships for newly created tags based on sign usage
  for (const [tagId, signs] of newTagSigns) {
    const parentIds: number[] = [SYSTEM_TAGS.DEFAULT]
    if (signs.has('-')) parentIds.push(SYSTEM_TAGS.EXPENSE)
    if (signs.has('+')) parentIds.push(SYSTEM_TAGS.INCOME)
    for (const parentId of parentIds) {
      await execSQL(
        'INSERT OR IGNORE INTO tag_to_tag (child_id, parent_id) VALUES (?, ?)',
        [tagId, parentId]
      )
    }
  }

  // Link counterparties to tags they were used with
  for (const [cpId, tagIds] of counterpartyTags) {
    for (const tagId of tagIds) {
      await execSQL(
        'INSERT OR IGNORE INTO counterparty_to_tags (counterparty_id, tag_id) VALUES (?, ?)',
        [cpId, tagId]
      )
    }
  }

  return result
}

async function resolveCurrency(
  code: string,
  cache: Map<string, { id: number; decimal_places: number }>
): Promise<{ id: number; decimal_places: number } | null> {
  if (cache.has(code)) return cache.get(code)!

  const currency = await currencyRepository.findByCode(code)
  if (!currency) return null

  const entry = { id: currency.id, decimal_places: currency.decimal_places }
  cache.set(code, entry)
  return entry
}

async function resolveTag(
  tagIdStr: string,
  tagName: string,
  cache: Map<string, number>,
  result: ImportResult,
  createdNames: Set<string>,
): Promise<number | null> {
  // Always resolve by name — source DB IDs are unreliable in target DB
  if (tagName) {
    if (cache.has(tagName)) return cache.get(tagName)!

    // Try findById as fast path, but only accept if name matches
    if (tagIdStr) {
      const id = parseInt(tagIdStr, 10)
      if (!isNaN(id)) {
        const tag = await tagRepository.findById(id)
        if (tag && tag.name === tagName) {
          cache.set(tagName, tag.id)
          return tag.id
        }
      }
    }

    // Fallback to name lookup
    const tag = await tagRepository.findByName(tagName)
    if (tag) {
      cache.set(tagName, tag.id)
      return tag.id
    }

    // Create new tag (without parent_ids — parents assigned after import based on sign usage)
    const newTag = await tagRepository.create({ name: tagName })
    cache.set(tagName, newTag.id)
    result.createdTags.push(tagName)
    createdNames.add(tagName)
    return newTag.id
  }

  return null
}

async function resolveWallet(
  walletName: string,
  cache: Map<string, number>,
  result: ImportResult,
): Promise<number | null> {
  if (!walletName) return null

  if (cache.has(walletName)) return cache.get(walletName)!

  const wallet = await walletRepository.findByName(walletName)
  if (wallet) {
    cache.set(walletName, wallet.id)
    return wallet.id
  }

  // Create new wallet
  const newWallet = await walletRepository.create({ name: walletName })
  cache.set(walletName, newWallet.id)
  result.createdWallets.push(walletName)
  return newWallet.id
}

async function resolveAccount(
  accountIdStr: string,
  walletId: number,
  walletName: string,
  currencyId: number,
  currencyCode: string,
  cache: Map<string, number>,
  result: ImportResult,
): Promise<number | null> {
  const cacheKey = `${walletId}:${currencyId}`

  // Try by ID first
  if (accountIdStr) {
    const id = parseInt(accountIdStr, 10)
    if (!isNaN(id)) {
      const account = await accountRepository.findById(id)
      if (account && account.wallet_id === walletId && account.currency_id === currencyId) {
        cache.set(cacheKey, account.id)
        return account.id
      }
    }
  }

  // Check cache
  if (cache.has(cacheKey)) return cache.get(cacheKey)!

  // Fallback: find by wallet + currency
  const account = await accountRepository.findByWalletAndCurrency(walletId, currencyId)
  if (account) {
    cache.set(cacheKey, account.id)
    return account.id
  }

  // Create new account
  const newAccount = await walletRepository.addAccount(walletId, currencyId)
  cache.set(cacheKey, newAccount.id)
  result.createdAccounts.push(`${walletName} - ${currencyCode}`)
  return newAccount.id
}

async function resolveCounterparty(
  cpIdStr: string,
  cpName: string,
  cache: Map<string, number>,
  result: ImportResult,
): Promise<number | null> {
  // Always resolve by name — source DB IDs are unreliable in target DB
  if (cpName) {
    if (cache.has(cpName)) return cache.get(cpName)!

    // Try findById as fast path, but only accept if name matches
    if (cpIdStr) {
      const id = parseInt(cpIdStr, 10)
      if (!isNaN(id)) {
        const cp = await counterpartyRepository.findById(id)
        if (cp && cp.name === cpName) {
          cache.set(cpName, cp.id)
          return cp.id
        }
      }
    }

    // Fallback to name lookup
    const cp = await counterpartyRepository.findByName(cpName)
    if (cp) {
      cache.set(cpName, cp.id)
      return cp.id
    }

    // Create new counterparty
    const newCp = await counterpartyRepository.create({ name: cpName })
    cache.set(cpName, newCp.id)
    result.createdCounterparties.push(cpName)
    return newCp.id
  }

  return null
}
