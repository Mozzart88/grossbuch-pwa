import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WipeConfirmModal } from '../../../../components/auth/WipeConfirmModal'
import { FailedAttemptsModal } from '../../../../components/auth/FailedAttemptsModal'

describe('WipeConfirmModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue(undefined),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders when open', () => {
      render(<WipeConfirmModal {...defaultProps} />)
      expect(screen.getByText('Forgot PIN?')).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      render(<WipeConfirmModal {...defaultProps} isOpen={false} />)
      expect(screen.queryByText('Forgot PIN?')).not.toBeInTheDocument()
    })

    it('shows warning about data loss', () => {
      render(<WipeConfirmModal {...defaultProps} />)
      expect(screen.getByText(/This will delete ALL your data/)).toBeInTheDocument()
    })

    it('lists items that will be deleted', () => {
      render(<WipeConfirmModal {...defaultProps} />)
      expect(screen.getByText('All transactions')).toBeInTheDocument()
      expect(screen.getByText('All accounts and wallets')).toBeInTheDocument()
      expect(screen.getByText('All categories and tags')).toBeInTheDocument()
    })

    it('shows DELETE confirmation input', () => {
      render(<WipeConfirmModal {...defaultProps} />)
      expect(screen.getByPlaceholderText('DELETE')).toBeInTheDocument()
    })
  })

  describe('confirmation input', () => {
    it('converts input to uppercase', () => {
      render(<WipeConfirmModal {...defaultProps} />)
      const input = screen.getByPlaceholderText('DELETE')

      fireEvent.change(input, { target: { value: 'delete' } })

      expect(input).toHaveValue('DELETE')
    })

    it('enables confirm button when DELETE typed', () => {
      render(<WipeConfirmModal {...defaultProps} />)
      const input = screen.getByPlaceholderText('DELETE')
      const confirmButton = screen.getByText('Delete All Data')

      expect(confirmButton).toBeDisabled()

      fireEvent.change(input, { target: { value: 'DELETE' } })

      expect(confirmButton).not.toBeDisabled()
    })

    it('keeps confirm button disabled for partial input', () => {
      render(<WipeConfirmModal {...defaultProps} />)
      const input = screen.getByPlaceholderText('DELETE')
      const confirmButton = screen.getByText('Delete All Data')

      fireEvent.change(input, { target: { value: 'DEL' } })

      expect(confirmButton).toBeDisabled()
    })
  })

  describe('actions', () => {
    it('calls onClose when Cancel clicked', () => {
      const onClose = vi.fn()
      render(<WipeConfirmModal {...defaultProps} onClose={onClose} />)

      fireEvent.click(screen.getByText('Cancel'))

      expect(onClose).toHaveBeenCalled()
    })

    it('calls onConfirm when confirmed', async () => {
      const onConfirm = vi.fn().mockResolvedValue(undefined)
      render(<WipeConfirmModal {...defaultProps} onConfirm={onConfirm} />)

      fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } })
      fireEvent.click(screen.getByText('Delete All Data'))

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalled()
      })
    })

    it('does not call onConfirm without DELETE typed', () => {
      const onConfirm = vi.fn()
      render(<WipeConfirmModal {...defaultProps} onConfirm={onConfirm} />)

      fireEvent.click(screen.getByText('Delete All Data'))

      expect(onConfirm).not.toHaveBeenCalled()
    })

    it('closes modal after successful confirmation', async () => {
      const onClose = vi.fn()
      const onConfirm = vi.fn().mockResolvedValue(undefined)
      render(<WipeConfirmModal {...defaultProps} onClose={onClose} onConfirm={onConfirm} />)

      fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } })
      fireEvent.click(screen.getByText('Delete All Data'))

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled()
      })
    })

    it('shows loading state during wipe', async () => {
      let resolveWipe: () => void
      const onConfirm = vi.fn().mockImplementation(() => new Promise(r => { resolveWipe = r }))
      render(<WipeConfirmModal {...defaultProps} onConfirm={onConfirm} />)

      fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } })
      fireEvent.click(screen.getByText('Delete All Data'))

      await waitFor(() => {
        expect(screen.getByText('Deleting...')).toBeInTheDocument()
      })

      resolveWipe!()
    })

    it('does not allow cancel during wipe', async () => {
      let resolveWipe: () => void
      const onConfirm = vi.fn().mockImplementation(() => new Promise(r => { resolveWipe = r }))
      const onClose = vi.fn()
      render(<WipeConfirmModal {...defaultProps} onConfirm={onConfirm} onClose={onClose} />)

      fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } })
      fireEvent.click(screen.getByText('Delete All Data'))

      // Try to cancel during wipe
      fireEvent.click(screen.getByText('Cancel'))

      // Should not have called close
      expect(onClose).not.toHaveBeenCalled()

      resolveWipe!()
    })
  })
})

describe('FailedAttemptsModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    failedAttempts: 3,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders when open', () => {
      render(<FailedAttemptsModal {...defaultProps} />)
      expect(screen.getByText('Too Many Failed Attempts')).toBeInTheDocument()
    })

    it('does not render when closed', () => {
      render(<FailedAttemptsModal {...defaultProps} isOpen={false} />)
      expect(screen.queryByText('Too Many Failed Attempts')).not.toBeInTheDocument()
    })

    it('shows failed attempts count', () => {
      render(<FailedAttemptsModal {...defaultProps} failedAttempts={5} />)
      expect(screen.getByText('5 Failed Attempts')).toBeInTheDocument()
    })

    it('shows singular form for 1 attempt', () => {
      render(<FailedAttemptsModal {...defaultProps} failedAttempts={1} />)
      expect(screen.getByText('1 Failed Attempts')).toBeInTheDocument()
    })

    it('shows security notice', () => {
      render(<FailedAttemptsModal {...defaultProps} />)
      expect(screen.getByText(/Security Notice/)).toBeInTheDocument()
    })

    it('mentions future data deletion', () => {
      render(<FailedAttemptsModal {...defaultProps} />)
      expect(screen.getByText(/future version.*automatic data deletion/)).toBeInTheDocument()
    })

    it('suggests using forgot PIN option', () => {
      render(<FailedAttemptsModal {...defaultProps} />)
      expect(screen.getByText(/Forgot PIN/)).toBeInTheDocument()
    })
  })

  describe('actions', () => {
    it('calls onClose when button clicked', () => {
      const onClose = vi.fn()
      render(<FailedAttemptsModal {...defaultProps} onClose={onClose} />)

      fireEvent.click(screen.getByText('I Understand'))

      expect(onClose).toHaveBeenCalled()
    })
  })
})
