# Architectural Patterns

This document describes patterns and conventions used throughout the codebase.

## Repository Pattern

All database access goes through repository objects. Each entity has a dedicated repository.

**Location:** `src/services/repositories/`

**Structure:**
- Exported as singleton objects (not classes)
- All methods are async
- Standard methods: `findAll()`, `findById()`, `create()`, `update()`, `delete()`
- Create/update methods return the complete entity (via `findById()` after insert)

**Examples:**
- `src/services/repositories/transactionRepository.ts:4-282`
- `src/services/repositories/accountRepository.ts:5-147`
- `src/services/repositories/categoryRepository.ts:4-89`

**Database Primitives Used:**
- `querySQL<T>()` - Returns array of typed results
- `queryOne<T>()` - Returns single result or null
- `execSQL()` - Execute without return (INSERT/UPDATE/DELETE)
- `getLastInsertId()` - Get ID after INSERT

See: `src/services/database/connection.ts:44-91`

## Context Provider Pattern

Global state uses React Context with a provider + hook pattern.

**Location:** `src/store/`

**Structure:**
1. Create context with default value
2. Export Provider component that manages state
3. Export custom hook that calls `useContext()`

**Examples:**
- `src/store/DatabaseContext.tsx:9-36` - Database readiness state
- `src/store/ThemeContext.tsx:17-59` - Theme with localStorage persistence
- `src/components/ui/Toast.tsx:13-58` - Toast notifications

**Context Hierarchy:** See `src/App.tsx:64-76`
```
BrowserRouter
  └── ThemeProvider
      └── ToastProvider
          └── DatabaseProvider
              └── AppContent
```

## Component Organization

Components are organized in three layers:

### 1. UI Primitives (`src/components/ui/`)
- Generic, reusable components
- Extend HTML element attributes for native props
- Support variants via props (e.g., Button variant/size)
- Barrel exported via `index.ts`

**Examples:**
- `src/components/ui/Button.tsx:3-39` - Variant pattern
- `src/components/ui/Select.tsx:3-45` - Form input with options
- `src/components/ui/Modal.tsx:3-55` - Portal-based modal

### 2. Feature Components (`src/components/{feature}/`)
- Domain-specific components
- Import from UI primitives
- Handle feature-specific logic and state

**Examples:**
- `src/components/transactions/TransactionForm.tsx` - Complex form with validation
- `src/components/transactions/TransactionList.tsx` - List with data loading
- `src/components/accounts/AccountForm.tsx` - Entity form pattern

### 3. Page Components (`src/pages/`)
- Thin wrappers that compose feature components
- Handle route-level concerns
- Pass route params to feature components

**Examples:**
- `src/pages/TransactionsPage.tsx:1-5` - Minimal wrapper
- `src/pages/EditTransactionPage.tsx:1-30` - Route param handling

## Two-Interface Type Pattern

Each database entity has two TypeScript interfaces.

**Location:** `src/types/index.ts`

**Structure:**
1. **Entity Interface** - Full database model with all fields
   - Includes `id`, `created_at`, `updated_at`
   - Includes optional joined/computed fields
2. **Input Interface** - For create/update operations
   - Omits auto-generated fields
   - Uses optional properties for partial updates

**Examples:**
- `src/types/index.ts:2-18` - Currency / CurrencyInput
- `src/types/index.ts:21-45` - Account / AccountInput
- `src/types/index.ts:91-132` - Transaction / TransactionInput

**Joined Fields Convention:**
Entity interfaces include optional fields for denormalized data from JOINs:
```typescript
// src/types/index.ts:107-117
category_name?: string
category_icon?: string
account_name?: string
currency_code?: string
```

## Worker-Based Database Access

SQLite runs in a Web Worker for non-blocking operations.

**Files:**
- `src/services/database/worker.ts` - Worker that runs SQLite
- `src/services/database/connection.ts` - Main thread interface

**Message Protocol:**
1. Main thread sends message with `id`, `type`, `payload`
2. Worker processes and posts response with same `id`
3. Main thread resolves/rejects pending promise by `id`

See: `src/services/database/connection.ts:15-42` (pending request tracking)

## Form Component Pattern

Entity forms follow a consistent pattern.

**Structure:**
1. Accept optional entity for edit mode
2. Initialize state from entity or defaults
3. Load related data on mount (accounts, categories, etc.)
4. Validate on submit
5. Call `onSubmit` prop with input data
6. Parent handles repository call

**Examples:**
- `src/components/transactions/TransactionForm.tsx:13-169`
- `src/components/accounts/AccountForm.tsx`
- `src/components/categories/CategoryForm.tsx`

**Validation Pattern:**
```typescript
// src/components/transactions/TransactionForm.tsx:97-126
const validate = (): boolean => {
  const newErrors: Record<string, string> = {}
  if (!amount) newErrors.amount = 'Required'
  // ... more validation
  setErrors(newErrors)
  return Object.keys(newErrors).length === 0
}
```

## Date/Time Handling

All datetimes stored as local time strings (not UTC).

**Location:** `src/utils/dateUtils.ts`

**Format:** `YYYY-MM-DD HH:MM:SS`

**Key Functions:**
- `toDateTimeLocal()` - Convert DB string or Date to HTML input format
- `fromDateTimeLocal()` - Convert HTML input to DB format
- `toLocalDateTime()` - Format Date as local time string
- `formatTime()` / `formatDate()` - Display formatting

See: `src/utils/dateUtils.ts:24-74`

## Barrel Exports

Feature directories use `index.ts` files to re-export components.

**Examples:**
- `src/components/ui/index.ts:1-8`
- `src/components/transactions/index.ts:1-5`
- `src/services/repositories/index.ts:1-6`

**Usage:**
```typescript
// Clean imports from barrel
import { Button, Input, Modal } from '../components/ui'
import { transactionRepository, accountRepository } from '../services/repositories'
```

## Delete Protection Pattern

Entities with foreign key relationships implement delete protection.

**Pattern:**
1. Before delete, query for dependent records
2. If count > 0, throw descriptive error
3. Otherwise proceed with delete

**Examples:**
- `src/services/repositories/categoryRepository.ts:71-82`
- `src/services/repositories/counterpartyRepository.ts:76-87`
- `src/services/repositories/currencyRepository.ts:61-78`
- `src/services/repositories/accountRepository.ts:109-120`
