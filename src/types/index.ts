// Currency
export interface Currency {
  id: number
  code: string
  name: string
  symbol: string
  decimal_places: number
  is_preset: number
  created_at: string
  updated_at: string
}

export interface CurrencyInput {
  code: string
  name: string
  symbol: string
  decimal_places?: number
}

// Account
export interface Account {
  id: number
  name: string
  currency_id: number
  initial_balance: number
  icon: string | null
  color: string | null
  is_active: number
  sort_order: number
  created_at: string
  updated_at: string
  // Joined fields
  currency_code?: string
  currency_symbol?: string
  currency_decimal_places?: number
  current_balance?: number
}

export interface AccountInput {
  name: string
  currency_id: number
  initial_balance?: number
  icon?: string
  color?: string
}

// Category
export type CategoryType = 'income' | 'expense' | 'both'

export interface Category {
  id: number
  name: string
  type: CategoryType
  icon: string | null
  color: string | null
  parent_id: number | null
  is_preset: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface CategoryInput {
  name: string
  type: CategoryType
  icon?: string
  color?: string
  parent_id?: number
}

// Counterparty
export interface Counterparty {
  id: number
  name: string
  notes: string | null
  created_at: string
  updated_at: string
  // Joined fields
  category_ids?: number[]
}

export interface CounterpartyInput {
  name: string
  notes?: string
  category_ids?: number[]
}

// Transaction
export type TransactionType = 'income' | 'expense' | 'transfer' | 'exchange'

export interface Transaction {
  id: number
  type: TransactionType
  amount: number
  currency_id: number
  account_id: number
  category_id: number | null
  counterparty_id: number | null
  to_account_id: number | null
  to_amount: number | null
  to_currency_id: number | null
  exchange_rate: number | null
  date_time: string
  notes: string | null
  created_at: string
  updated_at: string
  // Joined fields
  category_name?: string
  category_icon?: string
  account_name?: string
  counterparty_name?: string
  currency_code?: string
  currency_symbol?: string
  to_account_name?: string
  to_currency_code?: string
  to_currency_symbol?: string
}

export interface TransactionInput {
  type: TransactionType
  amount: number
  currency_id: number
  account_id: number
  category_id?: number
  counterparty_id?: number
  to_account_id?: number
  to_amount?: number
  to_currency_id?: number
  exchange_rate?: number
  date_time?: string
  notes?: string
}

// Monthly summary
export interface MonthSummary {
  income: number
  expenses: number
  totalBalance: number
  displayCurrencySymbol: string
}

// Settings
export interface Settings {
  default_currency_id: number
  theme: 'light' | 'dark' | 'system'
}
