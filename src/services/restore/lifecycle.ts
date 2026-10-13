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
/** Admission is scoped to one operation; nested work must explicitly inherit it. */
export interface DatabaseActivity {
  run<T>(action: (activity: DatabaseActivity) => Promise<T>): Promise<T>
}

export async function runDatabaseActivity<T>(
  action: (activity: DatabaseActivity) => Promise<T>,
  owner?: DatabaseActivity
): Promise<T> {
  if (owner) return owner.run(action)
  assertDatabaseActivityAllowed()
  let admitted = true
  const activity: DatabaseActivity = {
    async run<A>(nested: (activity: DatabaseActivity) => Promise<A>): Promise<A> {
      assertDatabaseUsable()
      if (!admitted) throw new Error('Database activity admission expired')
      const result = Promise.resolve().then(() => nested(activity))
      active.add(result)
      try { return await result } finally { active.delete(result) }
    },
  }
  try { return await activity.run(action) } finally { admitted = false }
}
export async function pauseDatabaseActivities(): Promise<() => void> {
  assertDatabaseActivityAllowed()
  paused = true
  // Admitted operations may enqueue nested work while we drain them.
  while (active.size) await Promise.allSettled([...active])
  return () => { paused = false }
}

export function requireDatabaseRecovery(): void { recoveryRequired = true }
