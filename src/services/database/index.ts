// import { initDatabase as initWorker } from './connection'
// import { runMigrations } from './migrations'
// import { seedDatabase } from './seed'

export { execSQL, execBatch, querySQL, queryOne, runSQL, getLastInsertId, closeDatabase } from './connection'

// let initialized = false
// let initPromise: Promise<void> | null = null

// export async function initDatabase(): Promise<void> {
//   if (initialized) return
//   if (initPromise) return initPromise
//
//   initPromise = (async () => {
//     await initWorker()
//     await runMigrations()
//     await seedDatabase()
//     initialized = true
//   })()
//
//   return initPromise
// }

export { withTransaction, withDatabaseOperation } from './connection'
export type { DatabaseExecutor, DatabaseOperation } from './connection'
