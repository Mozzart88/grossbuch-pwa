import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { ToastProvider, useToast } from '../../../../components/ui/Toast'

// Test component to trigger toasts
function TestConsumer() {
  const { showToast } = useToast()
  return (
    <div>
      <button data-testid="show-info" onClick={() => showToast('Info message')}>
        Show Info
      </button>
      <button data-testid="show-success" onClick={() => showToast('Success message', 'success')}>
        Show Success
      </button>
      <button data-testid="show-error" onClick={() => showToast('Error message', 'error')}>
        Show Error
      </button>
    </div>
  )
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('ToastProvider', () => {
    it('renders children', () => {
      render(
        <ToastProvider>
          <div data-testid="child">Child content</div>
        </ToastProvider>
      )

      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('provides toast context', () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      )

      expect(screen.getByTestId('show-info')).toBeInTheDocument()
    })
  })

  describe('showToast', () => {
    it('displays toast message', () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      )

      act(() => {
        screen.getByTestId('show-info').click()
      })

      expect(screen.getByText('Info message')).toBeInTheDocument()
    })

    it('displays success toast with correct styling', () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      )

      act(() => {
        screen.getByTestId('show-success').click()
      })

      const toast = screen.getByText('Success message')
      expect(toast.className).toContain('bg-green-600')
    })

    it('displays error toast with correct styling', () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      )

      act(() => {
        screen.getByTestId('show-error').click()
      })

      const toast = screen.getByText('Error message')
      expect(toast.className).toContain('bg-red-600')
    })

    it('displays info toast with correct styling', () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      )

      act(() => {
        screen.getByTestId('show-info').click()
      })

      const toast = screen.getByText('Info message')
      expect(toast.className).toContain('bg-gray-800')
    })

    it('defaults to info type', () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      )

      act(() => {
        screen.getByTestId('show-info').click()
      })

      const toast = screen.getByText('Info message')
      expect(toast.className).toContain('bg-gray-800')
    })
  })

  describe('multiple toasts', () => {
    it('displays multiple toasts simultaneously', () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      )

      act(() => {
        screen.getByTestId('show-info').click()
        screen.getByTestId('show-success').click()
        screen.getByTestId('show-error').click()
      })

      expect(screen.getByText('Info message')).toBeInTheDocument()
      expect(screen.getByText('Success message')).toBeInTheDocument()
      expect(screen.getByText('Error message')).toBeInTheDocument()
    })
  })

  describe('auto-dismiss', () => {
    it('removes toast after timeout', async () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      )

      act(() => {
        screen.getByTestId('show-info').click()
      })

      expect(screen.getByText('Info message')).toBeInTheDocument()

      // Fast-forward timer and flush all pending timers
      await act(async () => {
        vi.advanceTimersByTime(3500)
      })

      expect(screen.queryByText('Info message')).not.toBeInTheDocument()
    })

    it('removes each toast independently', async () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      )

      act(() => {
        screen.getByTestId('show-info').click()
      })

      await act(async () => {
        vi.advanceTimersByTime(1500)
      })

      act(() => {
        screen.getByTestId('show-success').click()
      })

      // First toast should disappear after 1.5 more seconds (3 seconds total)
      await act(async () => {
        vi.advanceTimersByTime(1600)
      })

      expect(screen.queryByText('Info message')).not.toBeInTheDocument()
      // Second toast should still be visible (only 1.6 seconds passed for it)
      expect(screen.getByText('Success message')).toBeInTheDocument()
    })
  })

  describe('useToast', () => {
    it('returns showToast function', () => {
      let showToastFn: ((message: string, type?: 'success' | 'error' | 'info') => void) | undefined

      function CaptureToast() {
        const { showToast } = useToast()
        showToastFn = showToast
        return null
      }

      render(
        <ToastProvider>
          <CaptureToast />
        </ToastProvider>
      )

      expect(typeof showToastFn).toBe('function')
    })

    it('works outside provider with no-op', () => {
      function TestOutsideProvider() {
        const { showToast } = useToast()
        return <button onClick={() => showToast('Test')}>Show</button>
      }

      render(<TestOutsideProvider />)

      // Should not throw
      expect(() => {
        screen.getByText('Show').click()
      }).not.toThrow()
    })
  })

  describe('styling', () => {
    it('applies animation class', () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      )

      act(() => {
        screen.getByTestId('show-info').click()
      })

      const toast = screen.getByText('Info message')
      expect(toast.className).toContain('animate-slide-up')
    })

    it('applies rounded corners', () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      )

      act(() => {
        screen.getByTestId('show-info').click()
      })

      const toast = screen.getByText('Info message')
      expect(toast.className).toContain('rounded-lg')
    })

    it('applies shadow', () => {
      render(
        <ToastProvider>
          <TestConsumer />
        </ToastProvider>
      )

      act(() => {
        screen.getByTestId('show-info').click()
      })

      const toast = screen.getByText('Info message')
      expect(toast.className).toContain('shadow-lg')
    })
  })
})
