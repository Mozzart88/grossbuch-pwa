import * as db from '../../services/database/connection'
import { setupPin, login, getSessionAppKey, wipeAndReset } from '../../services/auth/authService'
import { getSessionDekShared, switchWorkspace } from '../../services/database/workspace'
import { inspectDatabaseRestore, restoreDatabases } from '../../services/restore/restoreService'
import { installRestore } from '../../services/restore/journal'
import { opfsRestoreStorage } from '../../services/restore/opfsStorage'

const NativeWorker = window.Worker
window.Worker = class extends NativeWorker {
  constructor(_url: string | URL, options?: WorkerOptions) { super((window as unknown as { productionWorker: string }).productionWorker, options) }
}
const output = document.querySelector('#results')!
const button = document.querySelector<HTMLButtonElement>('#run')!
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const report = { status: 'running', checks: [] as string[], error: '', userAgent: navigator.userAgent }
const checked = (message: string) => { report.checks.push(message); output.textContent = report.checks.join('\n') }
const save = async (path = '/report') => {
  output.textContent = JSON.stringify(report, null, 2)
  await fetch(path, { method: 'POST', body: JSON.stringify(report, null, 2) })
}
async function exportSet() {
  const appKey = getSessionAppKey()!, sharedKey = getSessionDekShared()!
  const files: File[] = []
  for (const source of [{ kind: 'main' }, { kind: 'shared' }, { kind: 'workspace', workspaceId: 1 }, { kind: 'workspace', workspaceId: 2 }] as const) {
    const bytes = await db.exportDecryptedDatabase({ source, key: source.kind === 'main' ? appKey : sharedKey, session: await db.getExportSession() })
    files.push(new File([bytes], source.kind === 'workspace' ? `workspace-${source.workspaceId}-decrypted.db` : `${source.kind}-decrypted.db`))
  }
  return files
}
async function run() {
  button.disabled = true
  try {
    assert(crossOriginIsolated, 'Cross-origin isolation required')
    if (new URL(location.href).searchParams.has('competitor')) {
      try { await db.checkDatabaseExists(); throw new Error('Competing tab accessed database') }
      catch (error) { assert(String(error).includes('another tab'), 'Expected another-tab exclusion') }
      checked('Competing tab is refused before opening database files')
      report.status = 'passed'
      await save('/competitor-report')
      return
    }
    if (sessionStorage.getItem('restore-probe-restart')) {
      report.checks = JSON.parse(sessionStorage.getItem('restore-probe-checks') ?? '[]')
      assert(await login('654321'), 'PIN login failed after recovery')
      assert((await db.queryOne<{ value: string }>("SELECT value FROM app_settings WHERE key='probe_marker'"))?.value === 'original', 'Main was not recovered')
      checked('Normal startup recovered an interrupted physical replacement before PIN login')
      sessionStorage.removeItem('restore-probe-restart')
      report.status = 'passed'
      await save()
      // Keep the lease held for the separate competing-tab check.
      return
    }
    const root = await navigator.storage.getDirectory()
    const names = []; for await (const name of root.keys()) names.push(name)
    assert(names.length === 0, 'Refusing to modify nonempty OPFS; use a fresh origin')
    await setupPin('123456')
    await db.execSQL("INSERT INTO app_settings(key,value) VALUES('probe_marker','original'); INSERT INTO shared.workspace(id,name) VALUES(2,'Second probe workspace')")
    await switchWorkspace(2)
    await switchWorkspace(1)
    const files = await exportSet()
    if (new URL(location.href).searchParams.has('empty')) {
      await wipeAndReset()
      assert(!await db.checkDatabaseExists(), 'Synthetic installation was not cleared')
    }
    const review = await inspectDatabaseRestore(files)
    assert(review.plan.mode === 'full' && review.plan.files.length === 4, 'Full set not detected')
    await restoreDatabases(review, '654321')
    await db.closeDatabase()
    assert(await login('654321'), 'New PIN cannot unlock full restore')
    await switchWorkspace(2); await switchWorkspace(1)
    checked(`Full restore on ${new URL(location.href).searchParams.has('empty') ? 'empty' : 'populated'} storage encrypts four files with new PIN and reopens both workspaces`)
    for (const selected of [files.filter(file => file.name.startsWith('workspace-1')), files.filter(file => file.name.startsWith('shared')), files.filter(file => !file.name.startsWith('main'))]) {
      const before = JSON.stringify(await db.querySQL('SELECT * FROM main.app_settings ORDER BY key'))
      const partial = await inspectDatabaseRestore(selected)
      assert(partial.plan.mode === 'partial', 'Partial mode not detected')
      await restoreDatabases(partial)
      assert(JSON.stringify(await db.querySQL('SELECT * FROM main.app_settings ORDER BY key')) === before, 'Partial restore changed main metadata')
      await db.querySQL('SELECT count(*) FROM workspace.trx')
    }
    checked('Workspace-only, shared-only and combined partial restores retain main settings and usable attachments')
    await db.withRestoreAccess(async send => {
      await send('close', {})
      const storage = await opfsRestoreStorage()
      const original = (await storage.read('main.db'))!
      let interrupted = false
      const write = storage.write
      storage.write = async (name, bytes) => {
        if (name === 'main.db' && !interrupted) { interrupted = true; await write(name, new Uint8Array([0, 1, 2])); throw new Error('injected interruption') }
        await write(name, bytes)
      }
      try { await installRestore(storage, [{ destination: 'main.db', bytes: original }]) } catch { /* leave journal for real restart */ }
      assert(interrupted, 'Fault was not reached')
    })
    sessionStorage.setItem('restore-probe-checks', JSON.stringify(report.checks))
    sessionStorage.setItem('restore-probe-restart', '1')
    location.reload()
  } catch (error) {
    report.status = 'failed'; report.error = String(error)
    await save()
  }
}
button.onclick = () => void run()
if (sessionStorage.getItem('restore-probe-restart') || new URL(location.href).searchParams.has('competitor')) void run()
