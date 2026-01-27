import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useTheme } from '../../../store/ThemeContext'

// Test component that uses useTheme WITHOUT a provider
function DefaultsConsumer() {
  const theme = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme.theme}</span>
      <span data-testid="isDark">{String(theme.isDark)}</span>
      <button data-testid="setTheme" onClick={() => theme.setTheme('dark')}>Set Dark</button>
    </div>
  )
}

describe('ThemeContext default values (outside provider)', () => {
  it('has system theme by default', () => {
    render(<DefaultsConsumer />)
    expect(screen.getByTestId('theme')).toHaveTextContent('system')
  })

  it('has isDark false by default', () => {
    render(<DefaultsConsumer />)
    expect(screen.getByTestId('isDark')).toHaveTextContent('false')
  })

  it('default setTheme does not throw', () => {
    render(<DefaultsConsumer />)
    expect(() => screen.getByTestId('setTheme').click()).not.toThrow()
  })
})
