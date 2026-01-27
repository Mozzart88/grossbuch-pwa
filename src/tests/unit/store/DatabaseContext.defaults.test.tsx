import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useDatabase } from '../../../store/DatabaseContext'

// Test component that uses useDatabase WITHOUT a provider
function DefaultsConsumer() {
  const db = useDatabase()
  return (
    <div>
      <span data-testid="isReady">{String(db.isReady)}</span>
      <span data-testid="error">{db.error || 'none'}</span>
      <button data-testid="setReady" onClick={() => db.setDatabaseReady()}>Set Ready</button>
      <button data-testid="setError" onClick={() => db.setDatabaseError('test error')}>Set Error</button>
      <button data-testid="runMigrations" onClick={() => db.runDatabaseMigrations()}>Run Migrations</button>
      <button data-testid="reset" onClick={() => db.reset()}>Reset</button>
    </div>
  )
}

describe('DatabaseContext default values (outside provider)', () => {
  it('has isReady false by default', () => {
    render(<DefaultsConsumer />)
    expect(screen.getByTestId('isReady')).toHaveTextContent('false')
  })

  it('has null error by default', () => {
    render(<DefaultsConsumer />)
    expect(screen.getByTestId('error')).toHaveTextContent('none')
  })

  it('default setDatabaseReady does not throw', () => {
    render(<DefaultsConsumer />)
    expect(() => screen.getByTestId('setReady').click()).not.toThrow()
  })

  it('default setDatabaseError does not throw', () => {
    render(<DefaultsConsumer />)
    expect(() => screen.getByTestId('setError').click()).not.toThrow()
  })

  it('default runDatabaseMigrations does not throw', async () => {
    render(<DefaultsConsumer />)
    await act(async () => {
      screen.getByTestId('runMigrations').click()
    })
    // Just verify no error
  })

  it('default reset does not throw', () => {
    render(<DefaultsConsumer />)
    expect(() => screen.getByTestId('reset').click()).not.toThrow()
  })
})
