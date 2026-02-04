// Re-export auth types
export * from './auth'

// Icon
export interface Icon {
  id: number
  value: string
}

// Tag icon relationship
export interface TagIcon {
  tag_id: number
  icon_id: number
}

// Tag (replaces Category) - no timestamps
export interface Tag {
  id: number
  name: string
  // Joined fields
  parent_ids?: number[]
  parent_names?: string[]
  child_ids?: number[]
  child_names?: string[]
  icon?: string // Joined from tag_icon -> icon
}

export interface TagInput {
  name: string
  parent_ids?: number[]
  icon_id?: number
}

// Tag hierarchy relationship
export interface TagRelation {
  child_id: number
  parent_id: number
}

// Currency - no timestamps
export interface Currency {
  id: number
  code: string
  name: string
  symbol: string
  decimal_places: number
  // Joined fields
  tags?: string[]
  is_default?: boolean
  is_fiat?: boolean
  is_crypto?: boolean
}

export interface CurrencyInput {
  code: string
  name: string
  symbol: string
  decimal_places?: number
  is_fiat?: boolean
  is_crypto?: boolean
}

// Exchange Rate
export interface ExchangeRate {
  currency_id: number
  rate: number // Stored as integer, divide by 10^decimal_places
  updated_at: number
}

// Wallet - no icon or timestamps, just name and color
export interface Wallet {
  id: number
  name: string
  color: string | null
  // Joined fields
  tags?: string[]
  is_default?: boolean
  is_archived?: boolean
  accounts?: Account[]
}

export interface WalletInput {
  name: string
  color?: string
}

// Account (wallet + currency combination) - single balance, no created_at
export interface Account {
  id: number
  wallet_id: number
  currency_id: number
  balance: number // Stored as integer, divide by 10^decimal_places
  updated_at: number
  // Joined fields from 'accounts' view
  wallet?: string
  currency?: string
  symbol?: string
  decimal_places?: number
  tags?: string
  is_default?: boolean
}

export interface AccountInput {
  wallet_id: number
  currency_id: number
}

// Counterparty - no timestamps, note in separate table
export interface Counterparty {
  id: number
  name: string
  // Joined fields
  note?: string | null // Joined from counterparty_note
  tag_ids?: number[]
  tags?: string[]
}

// Counterparty note in separate table
export interface CounterpartyNote {
  counterparty_id: number
  note: string
}

export interface CounterpartyInput {
  name: string
  note?: string
  tag_ids?: number[]
}

// Transaction header - 8-byte blob id, single timestamp
export interface Transaction {
  id: Uint8Array // 8-byte BLOB
  timestamp: number
  // Joined fields
  counterparty?: string | null
  counterparty_id?: number | null
  lines?: TransactionLine[]
}

export interface TransactionInput {
  timestamp?: number
  counterparty_id?: number
  counterparty_name?: string // Auto-creates if doesn't exist
  lines: TransactionLineInput[]
  note?: string
}

// Transaction line item (trx_base) - amount/rate instead of real/actual
export interface TransactionLine {
  id: Uint8Array // 8-byte BLOB
  trx_id: Uint8Array
  account_id: number
  tag_id: number
  sign: '+' | '-'
  amount: number // Stored as integer, divide by 10^decimal_places
  rate: number // Exchange rate (1 = default currency, otherwise multiply to get default currency value)
  // Joined fields
  wallet?: string
  currency?: string
  tag?: string
  note?: string | null
}

export interface TransactionLineInput {
  account_id: number
  tag_id: number
  sign: '+' | '-'
  amount: number
  rate: number // Defaults to 1 for default currency
  note?: string
}

// Transaction note
export interface TransactionNote {
  trx_base_id: Uint8Array
  note: string
}

// Budget - 8-byte blob id, amount is INTEGER
export interface Budget {
  id: Uint8Array // 8-byte BLOB
  start: number // Unix timestamp
  end: number // Unix timestamp
  tag_id: number
  amount: number // INTEGER (not REAL)
  // Joined fields
  tag?: string
  actual: number
}

export interface BudgetInput {
  start?: number
  end?: number
  tag_id: number
  amount: number
}

// View types (from SQL views)

// From 'transactions' view
export interface TransactionView {
  id: Uint8Array
  date_time: string // datetime string from view (was created_at)
  counterparty: string | null
  wallet: string
  currency: string
  tags: string
  amount: number // Single amount instead of real/actual
}

// From 'exchanges' view
export interface ExchangeView {
  id: Uint8Array
  date_time: string
  counterparty: string | null
  wallet: string
  currency: string
  tag: string
  amount: number
}

// From 'transfers' view
export interface TransferView {
  id: Uint8Array
  date_time: string
  counterparty: string | null
  wallet: string
  currency: string
  tag: string
  amount: number
}

// From 'trx_log' view
export interface TransactionLog {
  id: Uint8Array
  date_time: string
  counterparty: string | null
  wallet: string
  currency: string
  symbol: string
  decimal_places: number
  tags: string
  amount: number
  rate: number
}

// From 'summary' view
export interface BudgetSummary {
  tag: string
  amount: number
  actual: number
}

// From 'counterparties_summary' view
export interface CounterpartySummary {
  counterparty: string
  amount: number
}

// From 'tags_summary' view
export interface TagSummary {
  tag: string
  amount: number
}

// From 'tags_hierarchy' view
export interface TagHierarchy {
  parent_id: number
  parent: string
  child_id: number
  child: string
}

// From 'tags_graph' view
export interface TagGraph {
  parent: string
  children: string // Comma-separated
}

// Settings
export interface Settings {
  default_currency_id: number
  default_payment_currency_id?: number
  theme: 'light' | 'dark' | 'system'
}

// System tag IDs (for reference)
export const SYSTEM_TAGS = {
  SYSTEM: 1,
  DEFAULT: 2,
  INITIAL: 3,
  FIAT: 4,
  CRYPTO: 5,
  TRANSFER: 6,
  EXCHANGE: 7,
  PURCHASE: 8,
  INCOME: 9,
  EXPENSE: 10,
  // User categories (11-21)
  SALE: 11,
  FOOD: 12,
  FEE: 13,
  TRANSPORT: 14,
  HOUSE: 15,
  TAX: 16,
  UTILITIES: 17,
  DISCOUNT: 18,
  FINE: 19,
  HOUSEHOLDS: 20,
  AUTO: 21,
  ARCHIVED: 22,
  ADJUSTMENT: 23,
} as const

// Helper types
export type SystemTagId = (typeof SYSTEM_TAGS)[keyof typeof SYSTEM_TAGS]

// Utility function type for formatting amounts
export type AmountFormatter = (
  amount: number,
  decimalPlaces: number
) => string

// Monthly summary (computed)
export interface MonthSummary {
  income: number
  expenses: number
  totalBalance: number
  displayCurrencySymbol: string
}

// Monthly tag summary for summaries page
export interface MonthlyTagSummary {
  tag_id: number
  tag: string
  income: number
  expense: number
  net: number
}

// Monthly counterparty summary for summaries page
export interface MonthlyCounterpartySummary {
  counterparty_id: number
  counterparty: string
  income: number
  expense: number
  net: number
}

// Monthly category breakdown for summaries page
export interface MonthlyCategoryBreakdown {
  tag_id: number
  tag: string
  amount: number
  type: 'income' | 'expense'
}

// Transaction filter for filtered navigation
export interface TransactionFilter {
  tagId?: number
  counterpartyId?: number
  type?: 'income' | 'expense'
  accountId?: number
}
