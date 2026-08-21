// ======= Workspace Package =======
//
// A portable, self-contained export of a single workspace, sibling to
// SyncPackage (see syncTypes.ts) but fundamentally different in one respect:
// SyncPackage assumes both ends share the same id space (paired devices with
// a common migration/seed history), so it imports by id. A WorkspacePackage
// may be imported into a completely unrelated installation, so every
// reference to a *shared* entity (tag/currency/counterparty/icon) travels by
// natural key, not id — the import side reconciles each one to a local id
// (reusing an existing entity or creating a new one) and rewrites every
// workspace-scoped row's foreign keys accordingly.
//
// Workspace-scoped entities (wallet, account) travel with package-local
// integer ids (the source installation's own ids, reused verbatim as opaque
// wiring within the package). `account` has no real natural key at all — two
// accounts can share the same (wallet, currency) pair, distinguished only by
// their type tag — so accounts are always net-new on import, even when
// merging into an existing workspace. `wallet.name` *is* unique within a
// workspace file (DB-enforced), so the import side still reconciles wallets
// by name when merging into an already-populated workspace (see
// workspaceImport.ts) — the package-local id exists so WorkspaceAccount can
// reference the right wallet regardless of which local id it resolves to.
//
// Recurring plans/occurrences/budgets are deliberately out of scope for v1:
// `recurring_plan.transaction_draft` is an opaque JSON blob that embeds its
// own tag_id/account_id references, which would need the same reconciliation
// applied a second time inside JSON rather than relational columns — a
// separate, nontrivial problem left for a follow-up (see design.md).
//
// See specs/workspace-data-transfer/spec.md.

export interface WorkspaceIcon {
  value: string // natural key
}

export interface WorkspaceTag {
  name: string // natural key
  parents: string[] // parent tag names (system tags are never exported — every installation has the same ones pre-seeded, see exportTags)
  children: string[]
  icon: string | null // icon value
}

export interface WorkspaceCurrency {
  code: string // natural key
  name: string
  symbol: string
  decimal_places: number
}

export interface WorkspaceCounterparty {
  name: string // natural key
  note: string | null
  tags: string[] // tag names
}

export interface WorkspaceWallet {
  id: number // package-local id (source installation's own wallet id) — referenced by WorkspaceAccount.wallet
  name: string
  color: string | null
  tags: string[] // tag names (e.g. 'savings'/'credits' type tags)
}

export interface WorkspaceAccount {
  id: number // package-local id — referenced by WorkspaceTransactionLine.account
  wallet: number // WorkspaceWallet.id
  currency: string // currency code (natural key, reconciled)
  tags: string[]
  note?: string | null
  due_date?: string | null
  rate?: number | null
  balance_int: number
  balance_frac: number
}

export interface WorkspaceTransactionLine {
  account: number // WorkspaceAccount.id
  tag: string // tag name (natural key, reconciled)
  tag_context?: string | null
  sign: '+' | '-'
  amount_int: number
  amount_frac: number
  rate_int: number
  rate_frac: number
}

export interface WorkspaceTransaction {
  timestamp: number
  counterparty: string | null // counterparty name (natural key, reconciled)
  note: string | null
  lines: WorkspaceTransactionLine[]
}

export interface WorkspaceBudget {
  start: number
  end: number
  tag: string
  tag_context?: string | null
  type: 'income' | 'expense'
  amount_int: number
  amount_frac: number
}

export interface WorkspacePackage {
  version: 1
  workspace_name: string
  created_at: number
  icons: WorkspaceIcon[]
  tags: WorkspaceTag[]
  currencies: WorkspaceCurrency[]
  counterparties: WorkspaceCounterparty[]
  wallets: WorkspaceWallet[]
  accounts: WorkspaceAccount[]
  transactions: WorkspaceTransaction[]
  budgets: WorkspaceBudget[]
}

export interface WorkspaceImportResult {
  workspaceId: number
  imported: {
    icons: number
    tags: number
    currencies: number
    counterparties: number
    wallets: number
    accounts: number
    transactions: number
    budgets: number
  }
}
