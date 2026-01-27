import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MigrationPage } from '../../../pages/MigrationPage'
import { useAuth } from '../../../store/AuthContext'

// Mock the useAuth hook
vi.mock('../../../store/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    migrateDatabase: vi.fn().mockResolvedValue(true),
    error: null,
  })),
}))

const mockUseAuth = vi.mocked(useAuth)

describe('MigrationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      status: 'needs_migration',
      failedAttempts: 0,
      error: null,
      setupPin: vi.fn(),
      migrateDatabase: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
      logout: vi.fn(),
      changePin: vi.fn(),
      wipeAndReset: vi.fn(),
      clearError: vi.fn(),
    })
  })

  describe('initial render', () => {
    it('renders the migration page with initial create step', () => {
      render(<MigrationPage />)

      expect(screen.getByText('Secure Your Data')).toBeInTheDocument()
      expect(screen.getByText('Create Your PIN')).toBeInTheDocument()
      expect(screen.getByLabelText(/Enter PIN/i)).toBeInTheDocument()
    })

    it('displays upgrade notice', () => {
      render(<MigrationPage />)

      expect(screen.getByText(/Upgrade Notice/i)).toBeInTheDocument()
      expect(screen.getByText(/Your data will be migrated to an encrypted format/i)).toBeInTheDocument()
    })

    it('shows Continue button initially disabled', () => {
      render(<MigrationPage />)

      const continueButton = screen.getByRole('button', { name: /Continue/i })
      expect(continueButton).toBeDisabled()
    })
  })

  describe('create step', () => {
    it('enables Continue button when PIN length is >= 6', async () => {
      const user = userEvent.setup()
      render(<MigrationPage />)

      const pinInput = screen.getByLabelText(/Enter PIN/i)
      await user.type(pinInput, '123456')

      const continueButton = screen.getByRole('button', { name: /Continue/i })
      expect(continueButton).not.toBeDisabled()
    })

    it('shows characters needed message when PIN is too short', async () => {
      const user = userEvent.setup()
      render(<MigrationPage />)

      const pinInput = screen.getByLabelText(/Enter PIN/i)
      await user.type(pinInput, '12345')

      // PinInput component shows "X more characters needed" when under minimum
      await waitFor(() => {
        expect(screen.getByText(/1 more characters needed/i)).toBeInTheDocument()
      })

      // Continue button should still be disabled
      const continueButton = screen.getByRole('button', { name: /Continue/i })
      expect(continueButton).toBeDisabled()
    })

    it('advances to confirm step when PIN is valid', async () => {
      const user = userEvent.setup()
      render(<MigrationPage />)

      const pinInput = screen.getByLabelText(/Enter PIN/i)
      await user.type(pinInput, '123456')

      const continueButton = screen.getByRole('button', { name: /Continue/i })
      await user.click(continueButton)

      await waitFor(() => {
        expect(screen.getByText('Confirm Your PIN')).toBeInTheDocument()
        expect(screen.getByLabelText(/Confirm PIN/i)).toBeInTheDocument()
      })
    })
  })

  describe('confirm step', () => {
    async function advanceToConfirmStep(user: ReturnType<typeof userEvent.setup>) {
      const pinInput = screen.getByLabelText(/Enter PIN/i)
      await user.type(pinInput, '123456')
      const continueButton = screen.getByRole('button', { name: /Continue/i })
      await user.click(continueButton)
      await waitFor(() => {
        expect(screen.getByText('Confirm Your PIN')).toBeInTheDocument()
      })
    }

    it('shows Back and Encrypt Data buttons', async () => {
      const user = userEvent.setup()
      render(<MigrationPage />)
      await advanceToConfirmStep(user)

      expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Encrypt Data/i })).toBeInTheDocument()
    })

    it('Back button returns to create step', async () => {
      const user = userEvent.setup()
      render(<MigrationPage />)
      await advanceToConfirmStep(user)

      const backButton = screen.getByRole('button', { name: /Back/i })
      await user.click(backButton)

      await waitFor(() => {
        expect(screen.getByText('Create Your PIN')).toBeInTheDocument()
      })
    })

    it('shows error when PINs do not match', async () => {
      const user = userEvent.setup()
      render(<MigrationPage />)
      await advanceToConfirmStep(user)

      const confirmInput = screen.getByLabelText(/Confirm PIN/i)
      await user.type(confirmInput, '654321')

      const encryptButton = screen.getByRole('button', { name: /Encrypt Data/i })
      await user.click(encryptButton)

      await waitFor(() => {
        expect(screen.getByText(/PINs do not match/i)).toBeInTheDocument()
      })
    })

    it('calls migrateDatabase when PINs match', async () => {
      const mockMigrate = vi.fn().mockResolvedValue(true)
      mockUseAuth.mockReturnValue({
        status: 'needs_migration',
        failedAttempts: 0,
        error: null,
        setupPin: vi.fn(),
        migrateDatabase: mockMigrate,
        login: vi.fn(),
        logout: vi.fn(),
        changePin: vi.fn(),
        wipeAndReset: vi.fn(),
        clearError: vi.fn(),
      })

      const user = userEvent.setup()
      render(<MigrationPage />)
      await advanceToConfirmStep(user)

      const confirmInput = screen.getByLabelText(/Confirm PIN/i)
      await user.type(confirmInput, '123456')

      const encryptButton = screen.getByRole('button', { name: /Encrypt Data/i })
      await user.click(encryptButton)

      await waitFor(() => {
        expect(mockMigrate).toHaveBeenCalledWith('123456')
      })
    })

    it('shows loading spinner during migration', async () => {
      const mockMigrate = vi.fn().mockImplementation(() => new Promise(() => {})) // Never resolves
      mockUseAuth.mockReturnValue({
        status: 'needs_migration',
        failedAttempts: 0,
        error: null,
        setupPin: vi.fn(),
        migrateDatabase: mockMigrate,
        login: vi.fn(),
        logout: vi.fn(),
        changePin: vi.fn(),
        wipeAndReset: vi.fn(),
        clearError: vi.fn(),
      })

      const user = userEvent.setup()
      render(<MigrationPage />)
      await advanceToConfirmStep(user)

      const confirmInput = screen.getByLabelText(/Confirm PIN/i)
      await user.type(confirmInput, '123456')

      const encryptButton = screen.getByRole('button', { name: /Encrypt Data/i })
      await user.click(encryptButton)

      await waitFor(() => {
        expect(screen.getByText(/Encrypting your data/i)).toBeInTheDocument()
      })
    })

    it('shows error when migration fails', async () => {
      const mockMigrate = vi.fn().mockResolvedValue(false)
      mockUseAuth.mockReturnValue({
        status: 'needs_migration',
        failedAttempts: 0,
        error: 'Migration failed',
        setupPin: vi.fn(),
        migrateDatabase: mockMigrate,
        login: vi.fn(),
        logout: vi.fn(),
        changePin: vi.fn(),
        wipeAndReset: vi.fn(),
        clearError: vi.fn(),
      })

      const user = userEvent.setup()
      render(<MigrationPage />)
      await advanceToConfirmStep(user)

      const confirmInput = screen.getByLabelText(/Confirm PIN/i)
      await user.type(confirmInput, '123456')

      const encryptButton = screen.getByRole('button', { name: /Encrypt Data/i })
      await user.click(encryptButton)

      await waitFor(() => {
        expect(screen.getByText('Create Your PIN')).toBeInTheDocument()
      })
    })

    it('resets to create step on migration error with exception', async () => {
      const mockMigrate = vi.fn().mockRejectedValue(new Error('Database error'))
      mockUseAuth.mockReturnValue({
        status: 'needs_migration',
        failedAttempts: 0,
        error: null,
        setupPin: vi.fn(),
        migrateDatabase: mockMigrate,
        login: vi.fn(),
        logout: vi.fn(),
        changePin: vi.fn(),
        wipeAndReset: vi.fn(),
        clearError: vi.fn(),
      })

      const user = userEvent.setup()
      render(<MigrationPage />)
      await advanceToConfirmStep(user)

      const confirmInput = screen.getByLabelText(/Confirm PIN/i)
      await user.type(confirmInput, '123456')

      await act(async () => {
        const encryptButton = screen.getByRole('button', { name: /Encrypt Data/i })
        await user.click(encryptButton)
      })

      await waitFor(() => {
        expect(screen.getByText(/Database error/i)).toBeInTheDocument()
        expect(screen.getByText('Create Your PIN')).toBeInTheDocument()
      })
    })
  })

  describe('PIN input via onSubmit', () => {
    it('advances when pressing enter in create step', async () => {
      const user = userEvent.setup()
      render(<MigrationPage />)

      const pinInput = screen.getByLabelText(/Enter PIN/i)
      await user.type(pinInput, '123456')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByText('Confirm Your PIN')).toBeInTheDocument()
      })
    })

    it('submits when pressing enter in confirm step with matching PIN', async () => {
      const mockMigrate = vi.fn().mockResolvedValue(true)
      mockUseAuth.mockReturnValue({
        status: 'needs_migration',
        failedAttempts: 0,
        error: null,
        setupPin: vi.fn(),
        migrateDatabase: mockMigrate,
        login: vi.fn(),
        logout: vi.fn(),
        changePin: vi.fn(),
        wipeAndReset: vi.fn(),
        clearError: vi.fn(),
      })

      const user = userEvent.setup()
      render(<MigrationPage />)

      // Create step
      const pinInput = screen.getByLabelText(/Enter PIN/i)
      await user.type(pinInput, '123456')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(screen.getByText('Confirm Your PIN')).toBeInTheDocument()
      })

      // Confirm step
      const confirmInput = screen.getByLabelText(/Confirm PIN/i)
      await user.type(confirmInput, '123456')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(mockMigrate).toHaveBeenCalledWith('123456')
      })
    })
  })
})
