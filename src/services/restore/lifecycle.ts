const active = new Set<Promise<unknown>>()
let paused = false
let recoveryRequired = false
export function assertDatabaseUsable(): void {
  if (recoveryRequired) throw new Error('Database recovery is required. Reload to finish recovery before continuing.')
}
export function assertDatabaseActivityAllowed(): void {
  assertDatabaseUsable()
  if (paused) throw new Error('Database restore is in progress; try again afterward')
}
export async function runDatabaseActivity<T>(action: () => Promise<T>): Promise<T> {
  assertDatabaseActivityAllowed()
  const result = Promise.resolve().then(action)
  active.add(result)
  try { return await result } finally { active.delete(result) }
}
export async function pauseDatabaseActivities(): Promise<() => void> {
  assertDatabaseActivityAllowed()
  paused = true
  await Promise.allSettled([...active])
  return () => { paused = false }
}

export function requireDatabaseRecovery(): void { recoveryRequired = true }
