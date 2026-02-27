import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BiometricSetupPrompt } from '../../../../components/auth/BiometricSetupPrompt'

describe('BiometricSetupPrompt', () => {
  const defaultProps = {
    onEnable: vi.fn().mockResolvedValue(undefined),
    onSkip: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    defaultProps.onEnable.mockResolvedValue(undefined)
  })

  describe('rendering', () => {
    it('renders title', () => {
      render(<BiometricSetupPrompt {...defaultProps} />)
      expect(screen.getByText('Enable Biometric Unlock?')).toBeInTheDocument()
    })

    it('renders description mentioning Face ID and Touch ID', () => {
      render(<BiometricSetupPrompt {...defaultProps} />)
      expect(screen.getByText(/Face ID, Touch ID/)).toBeInTheDocument()
    })

    it('renders Enable button', () => {
      render(<BiometricSetupPrompt {...defaultProps} />)
      expect(screen.getByRole('button', { name: 'Enable Biometrics' })).toBeInTheDocument()
    })

    it('renders Skip link', () => {
      render(<BiometricSetupPrompt {...defaultProps} />)
      expect(screen.getByText('Skip for now')).toBeInTheDocument()
    })

    it('renders footer hint about enabling later', () => {
      render(<BiometricSetupPrompt {...defaultProps} />)
      expect(screen.getByText(/You can enable this later/)).toBeInTheDocument()
    })
  })

  describe('Enable action', () => {
    it('calls onEnable when Enable button is clicked', async () => {
      const onEnable = vi.fn().mockResolvedValue(undefined)
      render(<BiometricSetupPrompt {...defaultProps} onEnable={onEnable} />)

      fireEvent.click(screen.getByRole('button', { name: 'Enable Biometrics' }))

      await waitFor(() => {
        expect(onEnable).toHaveBeenCalledOnce()
      })
    })

    it('shows loading spinner while enabling', async () => {
      let resolve: () => void
      const onEnable = vi.fn().mockImplementation(
        () => new Promise<void>(r => { resolve = r })
      )
      render(<BiometricSetupPrompt {...defaultProps} onEnable={onEnable} />)

      fireEvent.click(screen.getByRole('button', { name: 'Enable Biometrics' }))

      await waitFor(() => {
        expect(screen.getByText('Setting up biometrics...')).toBeInTheDocument()
      })

      resolve!()
    })

    it('hides Enable button while loading', async () => {
      let resolve: () => void
      const onEnable = vi.fn().mockImplementation(
        () => new Promise<void>(r => { resolve = r })
      )
      render(<BiometricSetupPrompt {...defaultProps} onEnable={onEnable} />)

      fireEvent.click(screen.getByRole('button', { name: 'Enable Biometrics' }))

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Enable Biometrics' })).not.toBeInTheDocument()
      })

      resolve!()
    })

    it('hides Skip link while loading', async () => {
      let resolve: () => void
      const onEnable = vi.fn().mockImplementation(
        () => new Promise<void>(r => { resolve = r })
      )
      render(<BiometricSetupPrompt {...defaultProps} onEnable={onEnable} />)

      fireEvent.click(screen.getByRole('button', { name: 'Enable Biometrics' }))

      await waitFor(() => {
        expect(screen.queryByText('Skip for now')).not.toBeInTheDocument()
      })

      resolve!()
    })

    it('shows error message when onEnable throws an Error', async () => {
      const onEnable = vi.fn().mockRejectedValue(new Error('WebAuthn not supported'))
      render(<BiometricSetupPrompt {...defaultProps} onEnable={onEnable} />)

      fireEvent.click(screen.getByRole('button', { name: 'Enable Biometrics' }))

      await waitFor(() => {
        expect(screen.getByText('WebAuthn not supported')).toBeInTheDocument()
      })
    })

    it('shows generic error message for non-Error rejections', async () => {
      const onEnable = vi.fn().mockRejectedValue('unexpected string error')
      render(<BiometricSetupPrompt {...defaultProps} onEnable={onEnable} />)

      fireEvent.click(screen.getByRole('button', { name: 'Enable Biometrics' }))

      await waitFor(() => {
        expect(screen.getByText(/Failed to enable biometrics/)).toBeInTheDocument()
      })
    })

    it('restores Enable button after error so user can retry', async () => {
      const onEnable = vi.fn().mockRejectedValue(new Error('Cancelled'))
      render(<BiometricSetupPrompt {...defaultProps} onEnable={onEnable} />)

      fireEvent.click(screen.getByRole('button', { name: 'Enable Biometrics' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Enable Biometrics' })).toBeInTheDocument()
      })
    })

    it('clears error message on retry attempt', async () => {
      const onEnable = vi.fn()
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce(undefined)
      render(<BiometricSetupPrompt {...defaultProps} onEnable={onEnable} />)

      fireEvent.click(screen.getByRole('button', { name: 'Enable Biometrics' }))
      await waitFor(() => {
        expect(screen.getByText('First attempt failed')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Enable Biometrics' }))
      await waitFor(() => {
        expect(screen.queryByText('First attempt failed')).not.toBeInTheDocument()
      })
    })
  })

  describe('Skip action', () => {
    it('calls onSkip when Skip link is clicked', () => {
      const onSkip = vi.fn()
      render(<BiometricSetupPrompt {...defaultProps} onSkip={onSkip} />)

      fireEvent.click(screen.getByText('Skip for now'))

      expect(onSkip).toHaveBeenCalledOnce()
    })
  })
})
