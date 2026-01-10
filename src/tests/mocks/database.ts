import { vi } from 'vitest'

// Mock database functions
export const mockExecSQL = vi.fn()
export const mockQuerySQL = vi.fn()
export const mockQueryOne = vi.fn()
export const mockRunSQL = vi.fn()
export const mockGetLastInsertId = vi.fn()
export const mockInitDatabase = vi.fn()
export const mockCloseDatabase = vi.fn()

// Reset all mocks
export function resetDatabaseMocks() {
  mockExecSQL.mockReset()
  mockQuerySQL.mockReset()
  mockQueryOne.mockReset()
  mockRunSQL.mockReset()
  mockGetLastInsertId.mockReset()
  mockInitDatabase.mockReset()
  mockCloseDatabase.mockReset()
}

// Helper to setup mock query responses
export function mockQuerySQLResponse<T>(data: T[]) {
  mockQuerySQL.mockResolvedValue(data)
}

export function mockQueryOneResponse<T>(data: T | null) {
  mockQueryOne.mockResolvedValue(data)
}

export function mockLastInsertId(id: number) {
  mockGetLastInsertId.mockResolvedValue(id)
}

// Database module mock
export const databaseMock = {
  execSQL: mockExecSQL,
  querySQL: mockQuerySQL,
  queryOne: mockQueryOne,
  runSQL: mockRunSQL,
  getLastInsertId: mockGetLastInsertId,
  initDatabase: mockInitDatabase,
  closeDatabase: mockCloseDatabase,
}
