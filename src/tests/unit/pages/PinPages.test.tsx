import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PinSetupPage } from '../../../pages/PinSetupPage'
import { PinLoginPage } from '../../../pages/PinLoginPage'
import { ChangePinPage } from '../../../pages/ChangePinPage'
import { AUTH_STORAGE_KEYS } from '../../../types/auth'

// Mock AuthContext
const mockSetupPin = vi.fn().mockResolvedValue(true)
const mockLogin = vi.fn().mockResolvedValue(true)
const mockLogout = vi.fn()
const mockChangePin = vi.fn().mockResolvedValue(true)
const mockWipeAndReset = vi.fn().mockResolvedValue(undefined)
const mockClearError = vi.fn()

vi.mock('../../../store/AuthContext', () => ({
  useAuth: () => ({
    status: 'first_time_setup',
    failedAttempts: 0,
    error: null,
    setupPin: mockSetupPin,
    login: mockLogin,
    logout: mockLogout,
    changePin: mockChangePin,
    wipeAndReset: mockWipeAndReset,
    clearError: mockClearError,
  }),
}))

// Mock toast
vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({
      showToast: vi.fn(),
    }),
  }
})

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('PinSetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockSetupPin.mockResolvedValue(true)
  })

  it('renders create PIN form', () => {
    render(<PinSetupPage />)
    expect(screen.getByText('Create Your PIN')).toBeInTheDocument()
  })

  it('shows GrossBuch title', () => {
    render(<PinSetupPage />)
    expect(screen.getByText('GrossBuch')).toBeInTheDocument()
  })

  it('shows security warning about PIN recovery', () => {
    render(<PinSetupPage />)
    expect(screen.getByText(/PIN cannot be recovered/)).toBeInTheDocument()
  })

  it('shows continue button', () => {
    render(<PinSetupPage />)
    expect(screen.getByText('Continue')).toBeInTheDocument()
  })

  it('disables continue button when PIN too short', () => {
    render(<PinSetupPage />)
    expect(screen.getByText('Continue')).toBeDisabled()
  })

  it('enables continue button when PIN is valid length', () => {
    render(<PinSetupPage />)

    const input = screen.getByLabelText('Enter PIN')
    fireEvent.change(input, { target: { value: '123456' } })

    expect(screen.getByText('Continue')).not.toBeDisabled()
  })

  it('advances to confirm step', () => {
    render(<PinSetupPage />)

    const input = screen.getByLabelText('Enter PIN')
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    expect(screen.getByText('Confirm Your PIN')).toBeInTheDocument()
  })

  it('shows back button on confirm step', () => {
    render(<PinSetupPage />)

    const input = screen.getByLabelText('Enter PIN')
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    expect(screen.getByText('Back')).toBeInTheDocument()
  })

  it('goes back to create step when back clicked', () => {
    render(<PinSetupPage />)

    const input = screen.getByLabelText('Enter PIN')
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))
    fireEvent.click(screen.getByText('Back'))

    expect(screen.getByText('Create Your PIN')).toBeInTheDocument()
  })

  it('shows error when PINs do not match', async () => {
    render(<PinSetupPage />)

    // Enter PIN
    fireEvent.change(screen.getByLabelText('Enter PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // Enter different confirm PIN
    fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Create PIN'))

    await waitFor(() => {
      expect(screen.getByText('PINs do not match')).toBeInTheDocument()
    })
  })

  it('calls setupPin when PINs match', async () => {
    render(<PinSetupPage />)

    // Enter PIN
    fireEvent.change(screen.getByLabelText('Enter PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // Enter matching confirm PIN
    fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Create PIN'))

    await waitFor(() => {
      expect(mockSetupPin).toHaveBeenCalledWith('123456')
    })
  })

  it('shows loading spinner during setup', async () => {
    let resolveSetup: (value: boolean) => void
    mockSetupPin.mockImplementation(() => new Promise(r => { resolveSetup = r }))

    render(<PinSetupPage />)

    // Enter PIN
    fireEvent.change(screen.getByLabelText('Enter PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // Enter matching confirm PIN
    fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Create PIN'))

    await waitFor(() => {
      expect(screen.getByText('Setting up encrypted database...')).toBeInTheDocument()
    })

    resolveSetup!(true)
  })

  it('resets to create step when setupPin returns false', async () => {
    mockSetupPin.mockResolvedValue(false)

    render(<PinSetupPage />)

    // Enter PIN
    fireEvent.change(screen.getByLabelText('Enter PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // Enter matching confirm PIN
    fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Create PIN'))

    await waitFor(() => {
      expect(screen.getByText('Create Your PIN')).toBeInTheDocument()
      expect(screen.getByText('Failed to setup PIN')).toBeInTheDocument()
    })
  })

  it('resets to create step when setupPin throws an error', async () => {
    mockSetupPin.mockRejectedValue(new Error('Setup error'))

    render(<PinSetupPage />)

    // Enter PIN
    fireEvent.change(screen.getByLabelText('Enter PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // Enter matching confirm PIN
    fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Create PIN'))

    await waitFor(() => {
      expect(screen.getByText('Create Your PIN')).toBeInTheDocument()
      expect(screen.getByText('Setup error')).toBeInTheDocument()
    })
  })

  it('shows generic error message when setupPin throws non-Error', async () => {
    mockSetupPin.mockRejectedValue('string error')

    render(<PinSetupPage />)

    // Enter PIN
    fireEvent.change(screen.getByLabelText('Enter PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // Enter matching confirm PIN
    fireEvent.change(screen.getByLabelText('Confirm PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Create PIN'))

    await waitFor(() => {
      expect(screen.getByText('Failed to setup PIN')).toBeInTheDocument()
    })
  })

  describe('share link input', () => {
    it('renders "Have a share link?" toggle', () => {
      render(<PinSetupPage />)

      expect(screen.getByText('Have a share link?')).toBeInTheDocument()
    })

    it('shows input and button when toggle is clicked', () => {
      render(<PinSetupPage />)

      fireEvent.click(screen.getByText('Have a share link?'))

      expect(screen.getByPlaceholderText('Paste share link here')).toBeInTheDocument()
      expect(screen.getByText('Go')).toBeInTheDocument()
    })

    it('hides input when toggle is clicked again', () => {
      render(<PinSetupPage />)

      fireEvent.click(screen.getByText('Have a share link?'))
      expect(screen.getByPlaceholderText('Paste share link here')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Have a share link?'))
      expect(screen.queryByPlaceholderText('Paste share link here')).not.toBeInTheDocument()
    })

    it('updates input value on change', () => {
      render(<PinSetupPage />)

      fireEvent.click(screen.getByText('Have a share link?'))

      const input = screen.getByPlaceholderText('Paste share link here')
      fireEvent.change(input, { target: { value: 'https://example.com/share?uuid=abc' } })

      expect(input).toHaveValue('https://example.com/share?uuid=abc')
    })

    it('saves UUID to localStorage on valid submit', () => {
      render(<PinSetupPage />)

      fireEvent.click(screen.getByText('Have a share link?'))
      const input = screen.getByPlaceholderText('Paste share link here')
      fireEvent.change(input, { target: { value: 'https://example.com/share?uuid=test-123' } })
      fireEvent.click(screen.getByText('Go'))

      expect(localStorage.getItem(AUTH_STORAGE_KEYS.SHARED_UUID)).toBe('test-123')
    })

    it('shows success message after saving share link', () => {
      render(<PinSetupPage />)

      fireEvent.click(screen.getByText('Have a share link?'))
      const input = screen.getByPlaceholderText('Paste share link here')
      fireEvent.change(input, { target: { value: 'https://example.com/share?uuid=test-123' } })
      fireEvent.click(screen.getByText('Go'))

      expect(screen.getByText('Share link saved. Continue with PIN setup above.')).toBeInTheDocument()
      expect(screen.queryByPlaceholderText('Paste share link here')).not.toBeInTheDocument()
    })

    it('shows error for invalid URL', () => {
      render(<PinSetupPage />)

      fireEvent.click(screen.getByText('Have a share link?'))
      const input = screen.getByPlaceholderText('Paste share link here')
      fireEvent.change(input, { target: { value: 'not-a-url' } })
      fireEvent.click(screen.getByText('Go'))

      expect(screen.getByText('Please enter a valid share link containing /share?uuid=...')).toBeInTheDocument()
    })

    it('shows error for URL without uuid param', () => {
      render(<PinSetupPage />)

      fireEvent.click(screen.getByText('Have a share link?'))
      const input = screen.getByPlaceholderText('Paste share link here')
      fireEvent.change(input, { target: { value: 'https://example.com/share' } })
      fireEvent.click(screen.getByText('Go'))

      expect(screen.getByText('Please enter a valid share link containing /share?uuid=...')).toBeInTheDocument()
    })

    it('clears error when input changes', () => {
      render(<PinSetupPage />)

      fireEvent.click(screen.getByText('Have a share link?'))
      const input = screen.getByPlaceholderText('Paste share link here')
      fireEvent.change(input, { target: { value: 'bad' } })
      fireEvent.click(screen.getByText('Go'))

      expect(screen.getByText('Please enter a valid share link containing /share?uuid=...')).toBeInTheDocument()

      fireEvent.change(input, { target: { value: 'https://example.com/share?uuid=abc' } })
      expect(screen.queryByText('Please enter a valid share link containing /share?uuid=...')).not.toBeInTheDocument()
    })
  })

  it('clears confirm PIN on mismatch', async () => {
    render(<PinSetupPage />)

    // Enter PIN
    fireEvent.change(screen.getByLabelText('Enter PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // Enter different confirm PIN
    const confirmInput = screen.getByLabelText('Confirm PIN')
    fireEvent.change(confirmInput, { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Create PIN'))

    await waitFor(() => {
      expect(confirmInput).toHaveValue('')
    })
  })
})

describe('PinLoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogin.mockResolvedValue(true)
  })

  it('renders login form', () => {
    render(<PinLoginPage />)
    expect(screen.getByText('Welcome Back')).toBeInTheDocument()
  })

  it('shows unlock button', () => {
    render(<PinLoginPage />)
    expect(screen.getByText('Unlock')).toBeInTheDocument()
  })

  it('shows forgot PIN link', () => {
    render(<PinLoginPage />)
    expect(screen.getByText('Forgot PIN?')).toBeInTheDocument()
  })

  it('disables unlock button when PIN too short', () => {
    render(<PinLoginPage />)
    expect(screen.getByText('Unlock')).toBeDisabled()
  })

  it('enables unlock button when PIN is valid length', () => {
    render(<PinLoginPage />)

    const input = screen.getByLabelText('PIN')
    fireEvent.change(input, { target: { value: '123456' } })

    expect(screen.getByText('Unlock')).not.toBeDisabled()
  })

  it('calls login when unlock clicked', async () => {
    render(<PinLoginPage />)

    const input = screen.getByLabelText('PIN')
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Unlock'))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('123456')
    })
  })

  it('shows wipe modal when forgot PIN clicked', () => {
    render(<PinLoginPage />)

    fireEvent.click(screen.getByText('Forgot PIN?'))

    expect(screen.getByText(/This will delete ALL your data/)).toBeInTheDocument()
  })

  it('clears PIN on login failure', async () => {
    mockLogin.mockResolvedValue(false)
    render(<PinLoginPage />)

    const input = screen.getByLabelText('PIN')
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Unlock'))

    await waitFor(() => {
      expect(input).toHaveValue('')
    })
  })

  it('clears PIN when login throws an error', async () => {
    mockLogin.mockRejectedValue(new Error('Network error'))
    render(<PinLoginPage />)

    const input = screen.getByLabelText('PIN')
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Unlock'))

    await waitFor(() => {
      expect(input).toHaveValue('')
    })
  })

  it('clears error when PIN changes', async () => {
    // First set an error via useAuth mock
    mockLogin.mockResolvedValue(false)
    render(<PinLoginPage />)

    const input = screen.getByLabelText('PIN')
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Unlock'))

    await waitFor(() => {
      expect(mockClearError).toHaveBeenCalled()
    })
  })

  it('calls wipeAndReset when wipe confirmed', async () => {
    render(<PinLoginPage />)

    fireEvent.click(screen.getByText('Forgot PIN?'))

    // Type DELETE to enable confirmation
    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } })
    fireEvent.click(screen.getByText('Delete All Data'))

    await waitFor(() => {
      expect(mockWipeAndReset).toHaveBeenCalled()
    })
  })

  it('shows loading spinner during unlock', async () => {
    let resolveLogin: (value: boolean) => void
    mockLogin.mockImplementation(() => new Promise(r => { resolveLogin = r }))

    render(<PinLoginPage />)

    const input = screen.getByLabelText('PIN')
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Unlock'))

    await waitFor(() => {
      expect(screen.getByText('Unlocking...')).toBeInTheDocument()
    })

    resolveLogin!(true)
  })

  it('does not submit when PIN is too short', async () => {
    render(<PinLoginPage />)

    const input = screen.getByLabelText('PIN')
    fireEvent.change(input, { target: { value: '123' } })
    fireEvent.click(screen.getByText('Unlock'))

    expect(mockLogin).not.toHaveBeenCalled()
  })
})

describe('ChangePinPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChangePin.mockResolvedValue(true)
  })

  it('renders security page', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )
    expect(screen.getByText('Security')).toBeInTheDocument()
  })

  it('shows current PIN step first', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )
    expect(screen.getByText('Enter Current PIN')).toBeInTheDocument()
  })

  it('advances to new PIN step', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    const input = screen.getByLabelText('Current PIN')
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    expect(screen.getByText('Enter New PIN')).toBeInTheDocument()
  })

  it('advances to confirm step', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Current PIN
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // New PIN
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Continue'))

    // Check for the h2 heading text rather than the label
    expect(screen.getByRole('heading', { name: 'Confirm New PIN' })).toBeInTheDocument()
  })

  it('shows error when new PIN same as current', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Current PIN
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // Same as current
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    expect(screen.getByText('New PIN must be different from current PIN')).toBeInTheDocument()
  })

  it('shows error when confirm does not match', async () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Current PIN
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // New PIN
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Continue'))

    // Different confirm
    fireEvent.change(screen.getByLabelText('Confirm New PIN'), { target: { value: '111111' } })
    fireEvent.click(screen.getByText('Change PIN'))

    await waitFor(() => {
      expect(screen.getByText('PINs do not match')).toBeInTheDocument()
    })
  })

  it('calls changePin when all steps complete', async () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Current PIN
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // New PIN
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Continue'))

    // Confirm
    fireEvent.change(screen.getByLabelText('Confirm New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Change PIN'))

    await waitFor(() => {
      expect(mockChangePin).toHaveBeenCalledWith('123456', '654321')
    })
  })

  it('shows lock app option', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )
    expect(screen.getByText('Lock App')).toBeInTheDocument()
  })

  it('shows delete all data option', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )
    expect(screen.getByText('Delete All Data')).toBeInTheDocument()
  })

  it('calls logout when lock app clicked', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('Lock App'))
    expect(mockLogout).toHaveBeenCalled()
  })

  it('shows wipe modal when delete clicked', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('Delete All Data'))
    expect(screen.getByText(/This will delete ALL your data/)).toBeInTheDocument()
  })

  it('calls wipeAndReset when wipe confirmed', async () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Click "Delete All Data" text which is inside a button
    const deleteText = screen.getByText('Delete All Data')
    // Click the parent button
    fireEvent.click(deleteText.closest('button')!)

    // Type DELETE in the confirmation input
    fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } })

    // Now find all elements with "Delete All Data" text and click the button one in the modal
    const deleteTexts = screen.getAllByText('Delete All Data')
    // The last one should be the modal button
    for (const el of deleteTexts) {
      const btn = el.closest('button')
      if (btn && !btn.disabled && btn.className.includes('bg-red')) {
        fireEvent.click(btn)
        break
      }
    }

    await waitFor(() => {
      expect(mockWipeAndReset).toHaveBeenCalled()
    })
  })

  it('navigates back from confirm to new PIN step', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Current PIN
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // New PIN
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Continue'))

    // Should be on confirm step
    expect(screen.getByRole('heading', { name: 'Confirm New PIN' })).toBeInTheDocument()

    // Click back
    fireEvent.click(screen.getByText('Back'))

    // Should be back on new PIN step
    expect(screen.getByText('Enter New PIN')).toBeInTheDocument()
  })

  it('navigates back from new PIN to current PIN step', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Current PIN
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // Should be on new PIN step
    expect(screen.getByText('Enter New PIN')).toBeInTheDocument()

    // Click back
    fireEvent.click(screen.getByText('Back'))

    // Should be back on current PIN step
    expect(screen.getByText('Enter Current PIN')).toBeInTheDocument()
  })

  it('navigates to settings when back clicked on current step', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('Back'))

    expect(mockNavigate).toHaveBeenCalledWith('/settings')
  })

  it('disables continue button when current PIN is too short', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123' } })

    // Find the Continue button and check it's disabled
    const buttons = screen.getAllByText('Continue')
    expect(buttons[0]).toBeDisabled()
  })

  it('disables continue button when new PIN is too short', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Current PIN
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // New PIN - too short
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '123' } })

    // Find the Continue button and check it's disabled
    const buttons = screen.getAllByText('Continue')
    expect(buttons[0]).toBeDisabled()
  })

  it('disables Change PIN button when confirm PIN is too short', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Complete first two steps
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Continue'))

    // Confirm PIN - too short
    fireEvent.change(screen.getByLabelText('Confirm New PIN'), { target: { value: '123' } })

    expect(screen.getByText('Change PIN')).toBeDisabled()
  })

  it('resets to current step on incorrect current PIN', async () => {
    mockChangePin.mockResolvedValue(false)

    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Current PIN
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // New PIN
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Continue'))

    // Confirm
    fireEvent.change(screen.getByLabelText('Confirm New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Change PIN'))

    await waitFor(() => {
      expect(screen.getByText('Enter Current PIN')).toBeInTheDocument()
      expect(screen.getByText('Incorrect current PIN')).toBeInTheDocument()
    })
  })

  it('resets to current step on changePin error', async () => {
    mockChangePin.mockRejectedValue(new Error('Server error'))

    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Current PIN
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // New PIN
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Continue'))

    // Confirm
    fireEvent.change(screen.getByLabelText('Confirm New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Change PIN'))

    await waitFor(() => {
      expect(screen.getByText('Enter Current PIN')).toBeInTheDocument()
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })

  it('shows generic error message when changePin throws non-Error', async () => {
    mockChangePin.mockRejectedValue('string error')

    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Current PIN
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))

    // New PIN
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Continue'))

    // Confirm
    fireEvent.change(screen.getByLabelText('Confirm New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Change PIN'))

    await waitFor(() => {
      expect(screen.getByText('Failed to change PIN')).toBeInTheDocument()
    })
  })

  it('shows loading spinner during PIN change', async () => {
    let resolveChange: (value: boolean) => void
    mockChangePin.mockImplementation(() => new Promise(r => { resolveChange = r }))

    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Complete all steps
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Continue'))
    fireEvent.change(screen.getByLabelText('Confirm New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Change PIN'))

    await waitFor(() => {
      expect(screen.getByText('Changing PIN...')).toBeInTheDocument()
    })

    resolveChange!(true)
  })

  it('navigates to settings and shows toast on success', async () => {
    mockChangePin.mockResolvedValue(true)

    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    // Complete all steps
    fireEvent.change(screen.getByLabelText('Current PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Continue'))
    fireEvent.change(screen.getByLabelText('New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Continue'))
    fireEvent.change(screen.getByLabelText('Confirm New PIN'), { target: { value: '654321' } })
    fireEvent.click(screen.getByText('Change PIN'))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/settings')
    })
  })

  it('navigates to root on logout', () => {
    render(
      <MemoryRouter>
        <ChangePinPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByText('Lock App'))

    expect(mockLogout).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})
