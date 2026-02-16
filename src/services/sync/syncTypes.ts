// ======= Sync Entity Types (natural keys, no integer IDs) =======

export interface SyncIcon {
  id: number
  value: string
  updated_at: number
}

export interface SyncTag {
  id: number
  name: string
  updated_at: number
  parents: number[]
  children: number[]
  icon: number | null
}

export interface SyncWallet {
  id: number
  name: string
  color: string | null
  updated_at: number
  tags: number[]
}

export interface SyncAccount {
  id: number
  wallet: number
  currency: number
  updated_at: number
  tags: number[]
}

export interface SyncCounterparty {
  id: number
  name: string
  updated_at: number
  note: string | null
  tags: number[]
}

export interface SyncCurrency {
  id: number
  decimal_places: number
  updated_at: number
  tags: number[]
}

export interface SyncTransactionLine {
  id: string // hex
  account: number
  tag: number
  sign: '+' | '-'
  amount: number
  rate: number
}

export interface SyncTransaction {
  id: string // hex
  timestamp: number
  updated_at: number
  counterparty: number | null
  note: string | null
  lines: SyncTransactionLine[]
}

export interface SyncBudget {
  id: string // hex
  start: number
  end: number
  tag: number
  amount: number
  updated_at: number
}

export interface SyncDeletion {
  entity: string // aka table_name
  entity_id: string
  deleted_at: number
}

// ======= Sync Package =======

export interface SyncPackage {
  version: 1
  sender_id: string
  created_at: number
  since: number
  icons: SyncIcon[]
  tags: SyncTag[]
  wallets: SyncWallet[]
  accounts: SyncAccount[]
  counterparties: SyncCounterparty[]
  currencies: SyncCurrency[]
  transactions: SyncTransaction[]
  budgets: SyncBudget[]
  deletions: SyncDeletion[]
}

// ======= Encrypted Package =======

export interface EncryptedRecipientKey {
  installation_id: string
  encrypted_key: string // base64url RSA-encrypted AES key
}

export interface EncryptedSyncPackage {
  sender_id: string
  iv: string // base64url AES-GCM IV
  ciphertext: string // base64url AES-GCM encrypted JSON
  recipient_keys: EncryptedRecipientKey[]
}

// ======= API Contract =======

export interface SyncPushRequest {
  package: EncryptedSyncPackage
}

export interface SyncPushResponse {
  success: boolean
  package_id: string
}

export interface SyncPullResponse {
  packages: Array<{
    id: string
    package: EncryptedSyncPackage
  }>
}

export interface SyncAckRequest {
  package_ids: string[]
}

export interface SyncAckResponse {
  success: boolean
}

// ======= Import Result =======

export interface ImportResult {
  imported: {
    icons: number
    tags: number
    wallets: number
    accounts: number
    counterparties: number
    currencies: number
    transactions: number
    budgets: number
    deletions: number
  }
  conflicts: number
  errors: string[]
}

// ======= Init (Handshake) =======

export interface SyncInitPostRequest {
  target_uuid: string
  encrypted_payload: string // base64url RSA-encrypted {uuid, publicKey}
}

export interface SyncInitPackage {
  id: number
  sender_uuid: string
  encrypted_payload: string
  created_at: string
}

export interface SyncInitDeleteRequest {
  ids: number[]
}

// ======= Sync State =======

export interface SyncState {
  installation_id: string
  last_sync_at: number
  last_push_at: number
}
