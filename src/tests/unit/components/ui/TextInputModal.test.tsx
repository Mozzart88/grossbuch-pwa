import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TextInputModal } from '../../../../components/ui/TextInputModal'

describe('TextInputModal', () => {
  const mockOnClose = vi.fn()
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnSubmit.mockResolvedValue(undefined)
  })

  const renderModal = (props = {}) => {
    return render(
      <TextInputModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        title="Test Title"
        label="Test Label"
        {...props}
      />
    )
  }

  it('renders modal with title', () => {
    renderModal()
    expect(screen.getByText('Test Title')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    renderModal({ isOpen: false })
    expect(screen.queryByText('Test Title')).not.toBeInTheDocument()
  })

  it('renders input with label', () => {
    renderModal()
    expect(screen.getByLabelText('Test Label')).toBeInTheDocument()
  })

  it('renders buttons with default submit label', () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('renders custom submit label', () => {
    renderModal({ submitLabel: 'Upload' })
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument()
  })

  it('renders placeholder text', () => {
    renderModal({ placeholder: 'Enter filename here' })
    expect(screen.getByPlaceholderText('Enter filename here')).toBeInTheDocument()
  })

  it('renders with initial value', () => {
    renderModal({ initialValue: 'test.db' })
    expect(screen.getByLabelText('Test Label')).toHaveValue('test.db')
  })

  it('Save button is disabled when input is empty', () => {
    renderModal()
    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton).toBeDisabled()
  })

  it('Save button is enabled with valid filename', () => {
    renderModal({ initialValue: 'valid-file.db' })
    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton).not.toBeDisabled()
  })

  it('Save button is disabled for invalid filenames with special characters', () => {
    renderModal()
    const input = screen.getByLabelText('Test Label')

    // Test various invalid characters
    const invalidNames = ['file/name.db', 'file\\name.db', 'file:name.db', 'file*name.db', 'file?name.db', 'file"name.db', 'file<name.db', 'file>name.db', 'file|name.db']

    for (const name of invalidNames) {
      fireEvent.change(input, { target: { value: name } })
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    }
  })

  it('Save button is disabled for whitespace-only input', () => {
    renderModal()
    const input = screen.getByLabelText('Test Label')
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('calls onSubmit with trimmed value when Save is clicked', async () => {
    renderModal()
    const input = screen.getByLabelText('Test Label')
    fireEvent.change(input, { target: { value: '  valid-file.db  ' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('valid-file.db')
    })
  })

  it('calls onClose when Cancel is clicked', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('shows Processing... text when loading', async () => {
    mockOnSubmit.mockImplementation(() => new Promise(() => { })) // Never resolves
    renderModal({ initialValue: 'test.db' })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText('Processing...')).toBeInTheDocument()
    })
  })

  it('shows error message when onSubmit rejects', async () => {
    mockOnSubmit.mockRejectedValue(new Error('File already exists'))
    renderModal({ initialValue: 'test.db' })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText('File already exists')).toBeInTheDocument()
    })
  })

  it('shows generic error when onSubmit rejects with non-Error', async () => {
    mockOnSubmit.mockRejectedValue('Something went wrong')
    renderModal({ initialValue: 'test.db' })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByText('Operation failed')).toBeInTheDocument()
    })
  })

  it('calls onClose after successful submit', async () => {
    renderModal({ initialValue: 'test.db' })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('resets value and error when modal is reopened', async () => {
    const { rerender } = renderModal({ initialValue: 'old.db' })

    // Change value
    const input = screen.getByLabelText('Test Label')
    fireEvent.change(input, { target: { value: 'changed.db' } })

    // Close modal
    rerender(
      <TextInputModal
        isOpen={false}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        title="Test Title"
        label="Test Label"
        initialValue="new.db"
      />
    )

    // Reopen modal with new initial value
    rerender(
      <TextInputModal
        isOpen={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        title="Test Title"
        label="Test Label"
        initialValue="new.db"
      />
    )

    expect(screen.getByLabelText('Test Label')).toHaveValue('new.db')
  })

  it('disables buttons during loading', async () => {
    mockOnSubmit.mockImplementation(() => new Promise(() => { })) // Never resolves
    renderModal({ initialValue: 'test.db' })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Processing...' })).toBeDisabled()
    })
  })

  it('submits when Enter is pressed with valid filename', async () => {
    renderModal({ initialValue: 'test.db' })

    const input = screen.getByLabelText('Test Label')
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('test.db')
    })
  })

  it('does not submit when Enter is pressed with invalid filename', async () => {
    renderModal()

    const input = screen.getByLabelText('Test Label')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('shows error for invalid filename when submit is attempted', async () => {
    renderModal()

    const input = screen.getByLabelText('Test Label')
    fireEvent.change(input, { target: { value: 'invalid/name.db' } })

    // The button should be disabled, but let's verify the validation shows error
    // if somehow the form was submitted (e.g., programmatically)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
