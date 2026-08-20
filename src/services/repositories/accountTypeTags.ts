import { querySQL, execSQL } from '../database'
import { tagReferences } from './tagReferences'

// A new account inherits its wallet's 'savings'/'credits' type tag.
// Ported from trg_account_inherit_wallet_type (see design.md — that trigger
// read `tag` by name, which becomes cross-schema and unreadable from a
// trigger body once `tag` moves to `shared`).
export async function inheritWalletTypeTags(accountId: number, walletId: number): Promise<void> {
  const walletTypeTags = await querySQL<{ tag_id: number }>(`
    SELECT wt.tag_id FROM wallet_to_tags wt
    JOIN tag t ON t.id = wt.tag_id
    WHERE wt.wallet_id = ? AND t.name IN ('savings', 'credits')
  `, [walletId])

  for (const tag of walletTypeTags) {
    await execSQL('INSERT OR IGNORE INTO account_to_tags (account_id, tag_id) VALUES (?, ?)', [accountId, tag.tag_id])
    await tagReferences.increment(tag.tag_id)
  }
}
