import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../../../store/ThemeContext'

// Test component to access context
function TestConsumer() {
  const { theme, setTheme, isDark } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="isDark">{isDark ? 'dark' : 'light'}</span>
      <button data-testid="set-light" onClick={() => setTheme('light')}>Light</button>
      <button data-testid="set-dark" onClick={() => setTheme('dark')}>Dark</button>
      <button data-testid="set-system" onClick={() => setTheme('system')}>System</button>
    </div>
  )
}

describe('ThemeContext', () => {
  let mediaQueryListeners: ((e: { matches: boolean }) => void)[] = []

  beforeEach(() => {
    localStorage.clear()
    mediaQueryListeners = []

    // Reset matchMedia mock
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, cb: (e: { matches: boolean }) => void) => {
          if (event === 'change') {
            mediaQueryListeners.push(cb)
          }
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    // Reset document class
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  describe('ThemeProvider', () => {
    it('renders children', () => {
      render(
        <ThemeProvider>
          <div data-testid="child">Child content</div>
        </ThemeProvider>
      )

      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('defaults to system theme', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      expect(screen.getByTestId('theme')).toHaveTextContent('system')
    })

    it('loads theme from localStorage', () => {
      localStorage.setItem('theme', 'dark')

      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    })

    it('saves theme to localStorage on change', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      fireEvent.click(screen.getByTestId('set-dark'))

      expect(localStorage.getItem('theme')).toBe('dark')
    })

    it('sets isDark true when theme is dark', () => {
      localStorage.setItem('theme', 'dark')

      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      expect(screen.getByTestId('isDark')).toHaveTextContent('dark')
    })

    it('sets isDark false when theme is light', () => {
      localStorage.setItem('theme', 'light')

      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      expect(screen.getByTestId('isDark')).toHaveTextContent('light')
    })

    it('respects system dark preference when theme is system', () => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          matches: true, // System prefers dark
          media: '',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      })

      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      expect(screen.getByTestId('isDark')).toHaveTextContent('dark')
    })

    it('adds dark class to document when isDark', () => {
      localStorage.setItem('theme', 'dark')

      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('removes dark class from document when not isDark', () => {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'light')

      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('updates when system preference changes', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      // Initially light (system preference is false)
      expect(screen.getByTestId('isDark')).toHaveTextContent('light')

      // Simulate system preference change to dark
      act(() => {
        mediaQueryListeners.forEach((listener) => {
          listener({ matches: true })
        })
      })

      expect(screen.getByTestId('isDark')).toHaveTextContent('dark')
    })
  })

  describe('setTheme', () => {
    it('changes theme to light', () => {
      localStorage.setItem('theme', 'dark')

      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      fireEvent.click(screen.getByTestId('set-light'))

      expect(screen.getByTestId('theme')).toHaveTextContent('light')
    })

    it('changes theme to dark', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      fireEvent.click(screen.getByTestId('set-dark'))

      expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    })

    it('changes theme to system', () => {
      localStorage.setItem('theme', 'dark')

      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      fireEvent.click(screen.getByTestId('set-system'))

      expect(screen.getByTestId('theme')).toHaveTextContent('system')
    })

    it('updates isDark immediately after theme change', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      fireEvent.click(screen.getByTestId('set-dark'))

      expect(screen.getByTestId('isDark')).toHaveTextContent('dark')

      fireEvent.click(screen.getByTestId('set-light'))

      expect(screen.getByTestId('isDark')).toHaveTextContent('light')
    })
  })

  describe('useTheme', () => {
    it('provides context values', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      expect(screen.getByTestId('theme')).toBeInTheDocument()
      expect(screen.getByTestId('isDark')).toBeInTheDocument()
    })

    it('returns default values outside provider', () => {
      render(<TestConsumer />)

      expect(screen.getByTestId('theme')).toHaveTextContent('system')
      expect(screen.getByTestId('isDark')).toHaveTextContent('light')
    })
  })

  describe('cleanup', () => {
    it('removes event listener on unmount', () => {
      const removeEventListenerMock = vi.fn()

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          matches: false,
          media: '',
          addEventListener: vi.fn(),
          removeEventListener: removeEventListenerMock,
        })),
      })

      const { unmount } = render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      )

      unmount()

      expect(removeEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function))
    })
  })
})
