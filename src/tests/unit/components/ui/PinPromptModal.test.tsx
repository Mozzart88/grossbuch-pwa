import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PinPromptModal } from '../../../../components/ui/PinPromptModal'

describe('PinPromptModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnSubmit.mockResolvedValue(undefined)
  })

  const renderModal = (props = {}) => {
    return render(
      <PinPromptModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        title="Test Title"
        {...props}
      />
    )
  }

  it('renders modal with title', () => {
    renderModal()
    expect(screen.getByText('Test Title')).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    renderModal({ description: 'Test description text' })
    expect(screen.getByText('Test description text')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByText('Test Title')).not.toBeInTheDocument()
  })

  it('renders PIN input and buttons', () => {
    renderModal()
    expect(screen.getByLabelText('Enter PIN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('Confirm button is disabled when PIN is too short', () => {
    renderModal()
    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    expect(confirmButton).toBeDisabled()

    const pinInput = screen.getByLabelText('Enter PIN')
    fireEvent.change(pinInput, { target: { value: '12345' } })
    expect(confirmButton).toBeDisabled()
  })

  it('Confirm button is enabled when PIN is valid', () => {
    renderModal()
    const pinInput = screen.getByLabelText('Enter PIN')
    fireEvent.change(pinInput, { target: { value: '123456' } })

    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    expect(confirmButton).not.toBeDisabled()
  })

  it('calls onSubmit with PIN when Confirm is clicked', async () => {
    renderModal()
    const pinInput = screen.getByLabelText('Enter PIN')
    fireEvent.change(pinInput, { target: { value: '123456' } })

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('123456')
    })
  })

  it('calls onClose when Cancel is clicked', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('shows Processing... text when loading', async () => {
    mockOnSubmit.mockImplementation(() => new Promise(() => { })) // Never resolves
    renderModal()

    const pinInput = screen.getByLabelText('Enter PIN')
    fireEvent.change(pinInput, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.getByText('Processing...')).toBeInTheDocument()
    })
  })

  it('shows error message when onSubmit rejects', async () => {
    mockOnSubmit.mockRejectedValue(new Error('Invalid PIN'))
    renderModal()

    const pinInput = screen.getByLabelText('Enter PIN')
    fireEvent.change(pinInput, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.getByText('Invalid PIN')).toBeInTheDocument()
    })
  })

  it('shows generic error when onSubmit rejects with non-Error', async () => {
    mockOnSubmit.mockRejectedValue('Something went wrong')
    renderModal()

    const pinInput = screen.getByLabelText('Enter PIN')
    fireEvent.change(pinInput, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.getByText('Invalid PIN')).toBeInTheDocument()
    })
  })

  it('calls onClose after successful submit', async () => {
    renderModal()

    const pinInput = screen.getByLabelText('Enter PIN')
    fireEvent.change(pinInput, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('resets PIN and error when modal is closed', async () => {
    mockOnSubmit.mockRejectedValueOnce(new Error('Invalid PIN'))
    const { rerender } = renderModal()

    // First, enter invalid PIN
    const pinInput = screen.getByLabelText('Enter PIN')
    fireEvent.change(pinInput, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.getByText('Invalid PIN')).toBeInTheDocument()
    })

    // Close modal via Cancel
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    // Reopen modal
    rerender(
      <PinPromptModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        title="Test Title"
      />
    )

    // Error and PIN should be reset
    expect(screen.queryByText('Invalid PIN')).not.toBeInTheDocument()
  })

  it('disables buttons during loading', async () => {
    mockOnSubmit.mockImplementation(() => new Promise(() => { })) // Never resolves
    renderModal()

    const pinInput = screen.getByLabelText('Enter PIN')
    fireEvent.change(pinInput, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled()
    })
  })

  it('submits when Enter is pressed with valid PIN', async () => {
    renderModal()

    const pinInput = screen.getByLabelText('Enter PIN')
    fireEvent.change(pinInput, { target: { value: '123456' } })
    fireEvent.keyDown(pinInput, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('123456')
    })
  })

  it('does not submit when Enter is pressed with short PIN', async () => {
    renderModal()

    const pinInput = screen.getByLabelText('Enter PIN')
    fireEvent.change(pinInput, { target: { value: '123' } })
    fireEvent.keyDown(pinInput, { key: 'Enter', code: 'Enter' })

    await new Promise(r => setTimeout(r, 0))
    expect(mockOnSubmit).not.toHaveBeenCalled()
  })
})
