import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PinLoginPage } from '../../../pages/PinLoginPage'

const mockLoginWithBiometrics = vi.fn()

let mockAuthState = {
  status: 'needs_auth' as const,
  failedAttempts: 0,
  error: null as string | null,
  login: vi.fn().mockResolvedValue(true),
  logout: vi.fn(),
  wipeAndReset: vi.fn().mockResolvedValue(undefined),
  clearError: vi.fn(),
  loginWithBiometrics: mockLoginWithBiometrics,
  biometricsEnabled: true,
  biometricsAvailable: true,
}

vi.mock('../../../store/AuthContext', () => ({
  useAuth: () => mockAuthState,
}))

vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: vi.fn() }),
  }
})

describe('PinLoginPage — biometrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState = {
      status: 'needs_auth',
      failedAttempts: 0,
      error: null,
      login: vi.fn().mockResolvedValue(true),
      logout: vi.fn(),
      wipeAndReset: vi.fn().mockResolvedValue(undefined),
      clearError: vi.fn(),
      loginWithBiometrics: mockLoginWithBiometrics,
      biometricsEnabled: true,
      biometricsAvailable: true,
    }
    mockLoginWithBiometrics.mockResolvedValue(true)
  })

  it('shows "Unlock with Biometrics" button when biometrics enabled and available', async () => {
    render(<PinLoginPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unlock with Biometrics' })).toBeInTheDocument()
    })
  })

  it('shows biometric subtitle when biometrics enabled', async () => {
    render(<PinLoginPage />)

    await waitFor(() => {
      expect(screen.getByText(/Use biometrics or PIN to unlock/)).toBeInTheDocument()
    })
  })

  it('auto-triggers loginWithBiometrics on mount', async () => {
    render(<PinLoginPage />)

    await waitFor(() => {
      expect(mockLoginWithBiometrics).toHaveBeenCalledOnce()
    })
  })

  it('shows biometric loading spinner while authenticating', async () => {
    let resolve: (v: boolean) => void
    mockLoginWithBiometrics.mockImplementation(
      () => new Promise<boolean>(r => { resolve = r })
    )

    render(<PinLoginPage />)

    await waitFor(() => {
      expect(screen.getByText('Waiting for biometrics...')).toBeInTheDocument()
    })

    resolve!(true)
  })

  it('hides biometric loading after loginWithBiometrics resolves', async () => {
    render(<PinLoginPage />)

    await waitFor(() => {
      expect(mockLoginWithBiometrics).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.queryByText('Waiting for biometrics...')).not.toBeInTheDocument()
    })
  })

  it('keeps PIN visible after loginWithBiometrics returns false', async () => {
    mockLoginWithBiometrics.mockResolvedValue(false)

    render(<PinLoginPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('PIN')).toBeInTheDocument()
    })
  })

  it('keeps PIN visible after loginWithBiometrics throws', async () => {
    mockLoginWithBiometrics.mockRejectedValue(new Error('Biometric cancelled'))

    render(<PinLoginPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('PIN')).toBeInTheDocument()
    })
  })

  it('shows PIN section when biometrics enabled but device authenticator not available', () => {
    mockAuthState.biometricsEnabled = true
    mockAuthState.biometricsAvailable = false

    render(<PinLoginPage />)

    expect(screen.getByLabelText('PIN')).toBeInTheDocument()
  })

  it('clears error when user types in PIN field while error is set', () => {
    mockAuthState.error = 'Incorrect PIN'
    const clearError = vi.fn()
    mockAuthState.clearError = clearError

    render(<PinLoginPage />)

    // error is set — typing in the PIN field should trigger clearError
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1' } })

    expect(clearError).toHaveBeenCalled()
  })

  it('manually triggering biometric unlock calls loginWithBiometrics again', async () => {
    // Let auto-trigger resolve first
    render(<PinLoginPage />)
    await waitFor(() => { expect(mockLoginWithBiometrics).toHaveBeenCalledOnce() })

    // Manually click the biometric button
    fireEvent.click(screen.getByRole('button', { name: 'Unlock with Biometrics' }))

    await waitFor(() => {
      expect(mockLoginWithBiometrics).toHaveBeenCalledTimes(2)
    })
  })
})
