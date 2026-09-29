import { useRef, useState } from 'react'
import { inspectDatabaseRestore, restoreDatabases, type RestoreReview } from '../services/restore/restoreService'
import { notifyDataRefresh } from '../hooks/useDataRefresh'

export function RestoreDatabase() {
  const [review, setReview] = useState<RestoreReview | null>(null)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const pending = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const select = async (files: File[]) => {
    if (pending.current || !files.length) return
    pending.current = true; setBusy(true); setError(''); setDone(false); setReview(null)
    try { setReview(await inspectDatabaseRestore(files)) }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to inspect databases') }
    finally { pending.current = false; setBusy(false) }
  }
  const choose = async () => {
    if (!('showOpenFilePicker' in window)) { input.current?.click(); return }
    try {
      const handles = await window.showOpenFilePicker({ multiple: true })
      await select(await Promise.all(handles.map(handle => handle.getFile())))
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'AbortError') setError('Unable to select database files')
    }
  }
  const restore = async () => {
    if (pending.current || !review) return
    if (review.plan.mode === 'full' && (!/^\d{6,12}$/.test(pin) || pin !== confirmPin)) {
      setError('PINs must match and contain 6 to 12 digits.'); return
    }
    pending.current = true; setBusy(true); setError('')
    try {
      await restoreDatabases(review, pin)
      setDone(true); setPin(''); setConfirmPin('')
      if (review.plan.mode === 'full') window.location.reload()
      else { setReview(null); notifyDataRefresh() }
    } catch (error) { setError(error instanceof Error ? error.message : 'Database restore failed') }
    finally { pending.current = false; setBusy(false) }
  }
  const fieldClass = 'block w-full rounded border border-gray-300 dark:border-gray-600 bg-transparent p-2 mt-1'
  return <section className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
    <h2 className="text-lg font-semibold">Restore decrypted databases</h2>
    <p className="text-sm">Select main, shared, and workspace files from this installation. Including main restores the complete set with a new PIN. Shared or workspace files alone retain your current PIN.</p>
    <input ref={input} className="sr-only" aria-label="Decrypted database files" type="file" multiple accept=".db,.sqlite,.sqlite3" disabled={busy} onChange={event => { void select(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    <button type="button" disabled={busy} onClick={() => void choose()} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">Select database files</button>
    {review && <div className="space-y-3">
      <h3 className="font-semibold">{review.plan.mode === 'full' ? 'Full restore' : 'Partial restore'}</h3>
      <p>The following databases will be replaced:</p>
      <ul className="list-disc pl-5">{review.plan.files.map(file => <li key={file.destination}>{file.destination}</li>)}</ul>
      {review.plan.retained.length > 0 && <p>Keeping: {review.plan.retained.join(', ')}</p>}
      {review.plan.findings.length > 0 && <div><p>Existing reference issues will be preserved:</p><ul className="list-disc pl-5 max-h-48 overflow-auto">{review.plan.findings.map((finding, index) => <li key={index}>{finding}</li>)}</ul></div>}
      {review.plan.mode === 'full' && <>
        <p className="text-sm">This replaces local data and requires unlocking with the new PIN. Existing biometric unlock will be cleared.</p>
        <label className="block">New PIN<input className={fieldClass} type="password" inputMode="numeric" autoComplete="new-password" value={pin} disabled={busy} onChange={event => setPin(event.target.value)} /></label>
        <label className="block">Confirm new PIN<input className={fieldClass} type="password" inputMode="numeric" autoComplete="new-password" value={confirmPin} disabled={busy} onChange={event => setConfirmPin(event.target.value)} /></label>
      </>}
      <div className="flex gap-3">
        <button type="button" disabled={busy} onClick={() => void restore()} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">Restore selected databases</button>
        <button type="button" disabled={busy} onClick={() => { setReview(null); setPin(''); setConfirmPin(''); setError('') }}>Cancel</button>
      </div>
    </div>}
    {busy && <p role="status">Preparing databases… Keep this page open.</p>}
    {error && <div role="alert" className="text-red-600"><p>{error}</p>{error.includes('Reload') && <button type="button" onClick={() => window.location.reload()}>Reload and recover</button>}</div>}
    {done && <p role="status">Database restore completed.</p>}
  </section>
}
