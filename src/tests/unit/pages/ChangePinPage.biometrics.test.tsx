import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChangePinPage } from '../../../pages/ChangePinPage'

const mockEnableBiometrics = vi.fn()
const mockDisableBiometrics = vi.fn()
const mockShowToast = vi.fn()

let mockAuthState = {
  status: 'authenticated' as const,
  failedAttempts: 0,
  error: null as string | null,
  changePin: vi.fn().mockResolvedValue(true),
  wipeAndReset: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn(),
  clearError: vi.fn(),
  biometricsAvailable: true,
  biometricsEnabled: false,
  enableBiometrics: mockEnableBiometrics,
  disableBiometrics: mockDisableBiometrics,
}

vi.mock('../../../store/AuthContext', () => ({
  useAuth: () => mockAuthState,
}))

vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: mockShowToast }),
  }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

function renderPage() {
  return render(
    <MemoryRouter>
      <ChangePinPage />
    </MemoryRouter>
  )
}

describe('ChangePinPage — biometric section', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState = {
      status: 'authenticated',
      failedAttempts: 0,
      error: null,
      changePin: vi.fn().mockResolvedValue(true),
      wipeAndReset: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn(),
      clearError: vi.fn(),
      biometricsAvailable: true,
      biometricsEnabled: false,
      enableBiometrics: mockEnableBiometrics,
      disableBiometrics: mockDisableBiometrics,
    }
    mockEnableBiometrics.mockResolvedValue(true)
  })

  it('shows Biometric Unlock section when biometricsAvailable', () => {
    renderPage()

    expect(screen.getByText('Biometric Unlock')).toBeInTheDocument()
  })

  it('does not show Biometric Unlock section when biometricsAvailable is false', () => {
    mockAuthState.biometricsAvailable = false

    renderPage()

    expect(screen.queryByText('Biometric Unlock')).not.toBeInTheDocument()
  })

  it('shows Enable button when biometrics not yet enabled', () => {
    mockAuthState.biometricsEnabled = false

    renderPage()

    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument()
  })

  it('shows Disable button and Enabled badge when biometrics enabled', () => {
    mockAuthState.biometricsEnabled = true

    renderPage()

    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
  })

  it('calls enableBiometrics and shows success toast on Enable click', async () => {
    mockEnableBiometrics.mockResolvedValue(true)

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }))

    await waitFor(() => {
      expect(mockEnableBiometrics).toHaveBeenCalledOnce()
      expect(mockShowToast).toHaveBeenCalledWith('Biometric unlock enabled', 'success')
    })
  })

  it('shows error toast when enableBiometrics returns false', async () => {
    mockEnableBiometrics.mockResolvedValue(false)

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }))

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Could not enable biometric unlock', 'error')
    })
  })

  it('calls disableBiometrics and shows success toast on Disable click', () => {
    mockAuthState.biometricsEnabled = true

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))

    expect(mockDisableBiometrics).toHaveBeenCalledOnce()
    expect(mockShowToast).toHaveBeenCalledWith('Biometric unlock disabled', 'success')
  })
})
