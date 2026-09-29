import * as db from '../../services/database/connection'
import { transactionRepository as transactions } from '../../services/repositories/transactionRepository'
import { importSyncPackage } from '../../services/sync/syncImport'
import { sharedMigrations } from '../../services/database/sharedMigrations'
import { workspaceMigrations } from '../../services/database/workspaceMigrations'
import { TEMP_VIEW_STATEMENTS } from '../../services/database/tempViews'
import type { TransactionInput } from '../../types'

const NativeWorker = window.Worker
window.Worker = class extends NativeWorker {
  constructor(_url: string | URL, options?: WorkerOptions) {
    super((window as unknown as { productionWorker: string }).productionWorker, options)
  }
}
const output = document.querySelector('#results')!
const button = document.querySelector<HTMLButtonElement>('#run')!
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message) }
button.onclick = async () => {
  button.disabled = true
  const report = { status: 'running', checks: [] as string[], error: '', userAgent: navigator.userAgent }
  const checked = (message: string) => { report.checks.push(message); output.textContent = report.checks.join('\n') }
  try {
    assert(crossOriginIsolated, 'Cross-origin isolation required')
    const root = await navigator.storage.getDirectory()
    const names = []
    for await (const name of root.keys()) names.push(name)
    assert(names.length === 0, 'Refusing to modify nonempty OPFS; use a fresh origin')
    await root.getFileHandle('main.db', { create: true })
    const key = '11'.repeat(32)
    await db.initEncryptedDatabase(key)
    await db.attachDatabase('shared', '/shared.db', key)
    await db.attachDatabase('workspace', '/workspace-1.db', key)
    for (const statements of Object.values(sharedMigrations)) for (const sql of statements) await db.execSQL(sql)
    for (const statements of Object.values(workspaceMigrations)) for (const sql of statements) await db.execSQL(sql)
    for (const sql of TEMP_VIEW_STATEMENTS) await db.execSQL(sql)
    await db.execSQL(`
      CREATE TABLE main.sync_deletions(table_name TEXT, entity_id TEXT, deleted_at INTEGER);
      INSERT INTO shared.workspace(id,name) VALUES(1,'Synthetic');
      INSERT INTO shared.tag(id,name) VALUES(1,'system'),(2,'default'),(3,'initial'),(7,'exchange');
      INSERT INTO shared.currency(id,code,name,symbol,decimal_places) VALUES(1,'USD','Dollar','$',2),(2,'EUR','Euro','E',2);
      INSERT INTO workspace.wallet(id,name) VALUES(1,'Synthetic');
      INSERT INTO workspace.account(id,wallet_id,currency_id) VALUES(1,1,1),(2,1,2);
    `)
    const input: TransactionInput = { timestamp: 1000, lines: [
      { account_id: 1, tag_id: 7, sign: '-', amount_int: 20, amount_frac: 0, rate_int: 1, rate_frac: 0 },
      { account_id: 2, tag_id: 7, sign: '+', amount_int: 18, amount_frac: 0, rate_int: 1, rate_frac: 0 },
    ] }
    const [first, second] = await Promise.all([transactions.create(input), transactions.create(input)])
    assert(String(first.id) !== String(second.id) && first.lines?.length === 2 && second.lines?.length === 2, 'Concurrent identities/lines')
    checked('Concurrent creates retain distinct IDs and two lines each')
    await transactions.update(first.id, { ...input, lines: input.lines.map(line => ({ ...line, amount_int: line.sign === '-' ? 30 : 27 })) })
    const [imported] = await Promise.all([
      importSyncPackage({ version: 2, sender_id: 'probe', since: 0, created_at: 1, icons: [], tags: [], wallets: [], accounts: [], counterparties: [], currencies: [], transactions: [], budgets: [], deletions: [] }),
      transactions.delete(second.id),
    ])
    assert(imported.errors.length === 0, 'Sync import failed')
    const balances = await db.querySQL<{ balance_int: number }>('SELECT balance_int FROM account ORDER BY id')
    assert(JSON.stringify(balances) === JSON.stringify([{ balance_int: -30 }, { balance_int: 27 }]), 'Incorrect balances')
    assert((await db.queryOne<{ n: number }>('SELECT count(*) AS n FROM trx_base'))?.n === 2, 'Cascade failed')
    assert((await db.queryOne<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys === 1, 'Foreign keys not restored')
    checked('Edit and deletion queued with sync preserve exact balances and foreign keys')
    const session = await db.getExportSession()
    const exported = await db.exportDecryptedDatabase({ session, key, source: { kind: 'workspace', workspaceId: 1 } })
    assert(new TextDecoder().decode(exported.slice(0, 16)) === 'SQLite format 3\0', 'Export not decrypted SQLite')
    checked('Production worker exports repaired transaction state as readable SQLite')
    await transactions.delete(first.id)
    assert((await db.queryOne<{ n: number }>('SELECT count(*) AS n FROM trx_base'))?.n === 0, 'Connection unusable after export')
    checked('Connection remains usable after sync and export')
    report.status = 'passed'
  } catch (error) {
    report.status = 'failed'
    report.error = String(error)
  } finally {
    await db.closeDatabase().catch(() => {})
    output.textContent = JSON.stringify(report, null, 2)
    await fetch('/report', { method: 'POST', body: JSON.stringify(report, null, 2) })
  }
}
