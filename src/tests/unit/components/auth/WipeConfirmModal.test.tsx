import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { WipeConfirmModal } from '../../../../components/auth/WipeConfirmModal'

describe('WipeConfirmModal', () => {
  const mockOnClose = vi.fn()
  const mockOnConfirm = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnConfirm.mockResolvedValue(undefined)
  })

  const renderModal = (props = {}) =>
    render(
      <WipeConfirmModal
        isOpen={true}
        onClose={mockOnClose}
        onConfirm={mockOnConfirm}
        {...props}
      />
    )

  it('does not call onConfirm when confirm text is not DELETE', async () => {
    renderModal()

    // Button is disabled, but fireEvent bypasses the disabled guard,
    // so handleConfirm runs and hits the early-return branch
    fireEvent.click(screen.getByRole('button', { name: 'Delete All Data' }))

    await new Promise(r => setTimeout(r, 0))
    expect(mockOnConfirm).not.toHaveBeenCalled()
  })

  it('handles error gracefully when onConfirm throws', async () => {
    mockOnConfirm.mockRejectedValue(new Error('Wipe failed'))
    renderModal()

    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete All Data' }))

    await waitFor(() => {
      expect(mockOnConfirm).toHaveBeenCalled()
    })
    // Error is caught — modal stays open, no unhandled rejection
    expect(screen.getByPlaceholderText('DELETE')).toBeInTheDocument()
  })
})
