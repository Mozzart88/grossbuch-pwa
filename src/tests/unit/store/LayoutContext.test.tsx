import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import {
  LayoutProvider,
  useLayoutContext,
  useLayoutContextSafe,
  type ActionBarConfig,
  type PlusButtonConfig,
} from '../../../store/LayoutContext'

describe('LayoutContext', () => {
  describe('LayoutProvider', () => {
    it('renders children', () => {
      render(
        <LayoutProvider>
          <div data-testid="child">Child content</div>
        </LayoutProvider>
      )

      expect(screen.getByTestId('child')).toBeInTheDocument()
      expect(screen.getByText('Child content')).toBeInTheDocument()
    })

    it('provides initial null values for configs', () => {
      const TestComponent = () => {
        const { actionBarConfig, plusButtonConfig } = useLayoutContext()
        return (
          <div>
            <span data-testid="action-bar">{actionBarConfig === null ? 'null' : 'set'}</span>
            <span data-testid="plus-button">{plusButtonConfig === null ? 'null' : 'set'}</span>
          </div>
        )
      }

      render(
        <LayoutProvider>
          <TestComponent />
        </LayoutProvider>
      )

      expect(screen.getByTestId('action-bar')).toHaveTextContent('null')
      expect(screen.getByTestId('plus-button')).toHaveTextContent('null')
    })
  })

  describe('useLayoutContext', () => {
    it('throws error when used outside provider', () => {
      const TestComponent = () => {
        useLayoutContext()
        return null
      }

      expect(() => render(<TestComponent />)).toThrow(
        'useLayoutContext must be used within a LayoutProvider'
      )
    })

    it('returns context value when used inside provider', () => {
      const { result } = renderHook(() => useLayoutContext(), {
        wrapper: ({ children }) => <LayoutProvider>{children}</LayoutProvider>,
      })

      expect(result.current).toHaveProperty('actionBarConfig')
      expect(result.current).toHaveProperty('setActionBarConfig')
      expect(result.current).toHaveProperty('plusButtonConfig')
      expect(result.current).toHaveProperty('setPlusButtonConfig')
    })
  })

  describe('useLayoutContextSafe', () => {
    it('returns null when used outside provider', () => {
      const { result } = renderHook(() => useLayoutContextSafe())

      expect(result.current).toBeNull()
    })

    it('returns context value when used inside provider', () => {
      const { result } = renderHook(() => useLayoutContextSafe(), {
        wrapper: ({ children }) => <LayoutProvider>{children}</LayoutProvider>,
      })

      expect(result.current).not.toBeNull()
      expect(result.current).toHaveProperty('actionBarConfig')
    })
  })

  describe('setActionBarConfig', () => {
    it('updates actionBarConfig state', () => {
      const { result } = renderHook(() => useLayoutContext(), {
        wrapper: ({ children }) => <LayoutProvider>{children}</LayoutProvider>,
      })

      const config: ActionBarConfig = {
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      }

      act(() => {
        result.current.setActionBarConfig(config)
      })

      expect(result.current.actionBarConfig).toEqual(config)
    })

    it('can set actionBarConfig back to null', () => {
      const { result } = renderHook(() => useLayoutContext(), {
        wrapper: ({ children }) => <LayoutProvider>{children}</LayoutProvider>,
      })

      const config: ActionBarConfig = {
        primaryLabel: 'Update',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      }

      act(() => {
        result.current.setActionBarConfig(config)
      })

      expect(result.current.actionBarConfig).not.toBeNull()

      act(() => {
        result.current.setActionBarConfig(null)
      })

      expect(result.current.actionBarConfig).toBeNull()
    })

    it('supports disabled and loading flags', () => {
      const { result } = renderHook(() => useLayoutContext(), {
        wrapper: ({ children }) => <LayoutProvider>{children}</LayoutProvider>,
      })

      const config: ActionBarConfig = {
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
        disabled: true,
        loading: true,
      }

      act(() => {
        result.current.setActionBarConfig(config)
      })

      expect(result.current.actionBarConfig?.disabled).toBe(true)
      expect(result.current.actionBarConfig?.loading).toBe(true)
    })
  })

  describe('setPlusButtonConfig', () => {
    it('updates plusButtonConfig with onClick', () => {
      const { result } = renderHook(() => useLayoutContext(), {
        wrapper: ({ children }) => <LayoutProvider>{children}</LayoutProvider>,
      })

      const onClick = vi.fn()
      const config: PlusButtonConfig = { onClick }

      act(() => {
        result.current.setPlusButtonConfig(config)
      })

      expect(result.current.plusButtonConfig).toEqual(config)
      expect(result.current.plusButtonConfig?.onClick).toBe(onClick)
    })

    it('updates plusButtonConfig with navigation route', () => {
      const { result } = renderHook(() => useLayoutContext(), {
        wrapper: ({ children }) => <LayoutProvider>{children}</LayoutProvider>,
      })

      const config: PlusButtonConfig = { to: '/add?type=exchange' }

      act(() => {
        result.current.setPlusButtonConfig(config)
      })

      expect(result.current.plusButtonConfig).toEqual(config)
      expect(result.current.plusButtonConfig?.to).toBe('/add?type=exchange')
    })

    it('can set plusButtonConfig back to null', () => {
      const { result } = renderHook(() => useLayoutContext(), {
        wrapper: ({ children }) => <LayoutProvider>{children}</LayoutProvider>,
      })

      act(() => {
        result.current.setPlusButtonConfig({ onClick: vi.fn() })
      })

      expect(result.current.plusButtonConfig).not.toBeNull()

      act(() => {
        result.current.setPlusButtonConfig(null)
      })

      expect(result.current.plusButtonConfig).toBeNull()
    })
  })

  describe('Multiple state updates', () => {
    it('maintains independent state for action bar and plus button', () => {
      const { result } = renderHook(() => useLayoutContext(), {
        wrapper: ({ children }) => <LayoutProvider>{children}</LayoutProvider>,
      })

      const actionBarConfig: ActionBarConfig = {
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      }

      const plusConfig: PlusButtonConfig = { onClick: vi.fn() }

      act(() => {
        result.current.setActionBarConfig(actionBarConfig)
        result.current.setPlusButtonConfig(plusConfig)
      })

      expect(result.current.actionBarConfig).toEqual(actionBarConfig)
      expect(result.current.plusButtonConfig).toEqual(plusConfig)

      act(() => {
        result.current.setActionBarConfig(null)
      })

      expect(result.current.actionBarConfig).toBeNull()
      expect(result.current.plusButtonConfig).toEqual(plusConfig)
    })
  })
})
