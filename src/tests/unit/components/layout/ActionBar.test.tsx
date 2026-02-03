import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ActionBar } from '../../../../components/layout/ActionBar'
import { LayoutProvider, useLayoutContext, type ActionBarConfig } from '../../../../store/LayoutContext'
import { useEffect } from 'react'

describe('ActionBar', () => {
  const renderWithProvider = (config?: ActionBarConfig) => {
    const TestSetup = () => {
      const { setActionBarConfig } = useLayoutContext()
      useEffect(() => {
        if (config) {
          setActionBarConfig(config)
        }
      }, [setActionBarConfig])
      return null
    }

    return render(
      <BrowserRouter>
        <LayoutProvider>
          <TestSetup />
          <ActionBar />
        </LayoutProvider>
      </BrowserRouter>
    )
  }

  const renderWithoutProvider = () => {
    return render(
      <BrowserRouter>
        <ActionBar />
      </BrowserRouter>
    )
  }

  describe('Visibility', () => {
    it('renders nothing when no config is set', () => {
      const { container } = renderWithProvider()

      expect(container.firstChild).toBeNull()
    })

    it('renders nothing when used outside provider', () => {
      const { container } = renderWithoutProvider()

      expect(container.firstChild).toBeNull()
    })

    it('renders when config is set', () => {
      renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      })

      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })
  })

  describe('Buttons', () => {
    it('renders primary button with custom label', () => {
      renderWithProvider({
        primaryLabel: 'Update',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      })

      expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument()
    })

    it('renders Cancel button', () => {
      renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      })

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('calls primaryAction when primary button is clicked', () => {
      const primaryAction = vi.fn()

      renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction,
        cancelAction: vi.fn(),
      })

      fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

      expect(primaryAction).toHaveBeenCalled()
    })

    it('calls cancelAction when cancel button is clicked', () => {
      const cancelAction = vi.fn()

      renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction,
      })

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(cancelAction).toHaveBeenCalled()
    })
  })

  describe('Disabled state', () => {
    it('disables primary button when disabled is true', () => {
      renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
        disabled: true,
      })

      expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled()
    })

    it('disables primary button when loading is true', () => {
      renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
        loading: true,
      })

      expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    })

    it('shows "Saving..." when loading is true', () => {
      renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
        loading: true,
      })

      expect(screen.getByRole('button', { name: 'Saving...' })).toBeInTheDocument()
    })

    it('cancel button is not disabled when primary is disabled', () => {
      renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
        disabled: true,
      })

      expect(screen.getByRole('button', { name: 'Cancel' })).not.toBeDisabled()
    })
  })

  describe('Styling', () => {
    it('has fixed positioning at bottom', () => {
      const { container } = renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      })

      const actionBar = container.firstChild as HTMLElement
      expect(actionBar.className).toContain('fixed')
      expect(actionBar.className).toContain('bottom-0')
    })

    it('has z-50 z-index (higher than TabBar z-40)', () => {
      const { container } = renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      })

      const actionBar = container.firstChild as HTMLElement
      expect(actionBar.className).toContain('z-50')
    })

    it('has safe area padding at bottom', () => {
      const { container } = renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      })

      const actionBar = container.firstChild as HTMLElement
      expect(actionBar.className).toContain('pb-safe')
    })

    it('has border at top', () => {
      const { container } = renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      })

      const actionBar = container.firstChild as HTMLElement
      expect(actionBar.className).toContain('border-t')
    })

    it('has dark mode support', () => {
      const { container } = renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      })

      const actionBar = container.firstChild as HTMLElement
      expect(actionBar.className).toContain('dark:bg-gray-800')
      expect(actionBar.className).toContain('dark:border-gray-700')
    })
  })

  describe('Layout', () => {
    it('buttons have flex-1 class for equal width', () => {
      renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      })

      const buttons = screen.getAllByRole('button')
      buttons.forEach((button) => {
        expect(button.className).toContain('flex-1')
      })
    })

    it('renders 2 buttons', () => {
      renderWithProvider({
        primaryLabel: 'Submit',
        primaryAction: vi.fn(),
        cancelAction: vi.fn(),
      })

      const buttons = screen.getAllByRole('button')
      expect(buttons).toHaveLength(2)
    })
  })
})
