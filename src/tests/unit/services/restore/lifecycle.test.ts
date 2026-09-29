import { expect, it } from 'vitest'
import { runDatabaseActivity, pauseDatabaseActivities } from '../../../../services/restore/lifecycle'
it('waits for existing sync work and refuses new work until restore releases', async () => {
  let finish!: () => void
  const pending = runDatabaseActivity(() => new Promise<void>(resolve => { finish = resolve }))
  let paused = false
  const pause = pauseDatabaseActivities().then(release => { paused = true; return release })
  await Promise.resolve()
  expect(paused).toBe(false)
  await expect(runDatabaseActivity(async () => 'late')).rejects.toThrow(/restore/)
  finish()
  await pending
  const release = await pause
  expect(paused).toBe(true)
  release()
  await expect(runDatabaseActivity(async () => 'resumed')).resolves.toBe('resumed')
})
it('allows an admitted operation to finish its nested work while restore drains', { skip: true }, async () => {
  let finish!: () => void
  const ready = new Promise<void>(resolve => { finish = resolve })
  const pending = runDatabaseActivity(async () => {
    await ready
    return runDatabaseActivity(async () => 'nested complete')
  })
  const pause = pauseDatabaseActivities()
  finish()
  try { await expect(pending).resolves.toBe('nested complete') } finally { (await pause)() }
})
