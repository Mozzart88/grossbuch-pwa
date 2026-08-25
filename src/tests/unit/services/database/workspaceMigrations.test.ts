import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../../services/database/connection', () => ({
  execSQL: vi.fn(),
  queryOne: vi.fn(),
}))

import { execSQL, queryOne } from '../../../../services/database/connection'
import { CURRENT_WORKSPACE_VERSION, runWorkspaceMigrations } from '../../../../services/database/workspaceMigrations'

const mockExecSQL = vi.mocked(execSQL)
const mockQueryOne = vi.mocked(queryOne)

describe('workspaceMigrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSQL.mockResolvedValue(undefined)
  })

  it('sets current workspace version to 4', () => {
    expect(CURRENT_WORKSPACE_VERSION).toBe(4)
  })

  it('adds payment_pin and notify_days_before columns to recurring_plan when upgrading from workspace version 2', async () => {
    mockQueryOne.mockResolvedValue({ value: '2' })

    await runWorkspaceMigrations()

    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE workspace.recurring_plan ADD COLUMN payment_pin TEXT')
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE workspace.recurring_plan ADD COLUMN notify_days_before INTEGER')
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining(`VALUES ('schema_version', ?`),
      ['3']
    )
  })

  it('creates the standalone goal entity (goal/goal_to_tags/goal_note) when upgrading from workspace version 3', async () => {
    mockQueryOne.mockResolvedValue({ value: '3' })

    await runWorkspaceMigrations()

    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringMatching(/CREATE TABLE IF NOT EXISTS workspace\.goal\s*\(/)
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS workspace.goal_to_tags')
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS workspace.goal_note')
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TRIGGER IF NOT EXISTS workspace.trg_goal_insert')
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TRIGGER IF NOT EXISTS workspace.trg_goal_update')
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TRIGGER IF NOT EXISTS workspace.trg_goal_note_insert')
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining('trg_sync_del_goal')
    )
    expect(mockExecSQL).toHaveBeenCalledWith(
      expect.stringContaining(`VALUES ('schema_version', ?`),
      ['4']
    )
  })

  it('does not run any migration when already at the current workspace version', async () => {
    mockQueryOne.mockResolvedValue({ value: '4' })

    await runWorkspaceMigrations()

    expect(mockExecSQL).not.toHaveBeenCalled()
  })
})
