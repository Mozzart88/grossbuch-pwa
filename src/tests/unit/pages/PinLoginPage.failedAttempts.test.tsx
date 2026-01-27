import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PinLoginPage } from '../../../pages/PinLoginPage'

// Create a configurable mock for useAuth
let mockAuthState = {
  status: 'needs_auth' as const,
  failedAttempts: 0,
  error: null as string | null,
  setupPin: vi.fn().mockResolvedValue(true),
  login: vi.fn().mockResolvedValue(true),
  logout: vi.fn(),
  changePin: vi.fn().mockResolvedValue(true),
  wipeAndReset: vi.fn().mockResolvedValue(undefined),
  clearError: vi.fn(),
}

vi.mock('../../../store/AuthContext', () => ({
  useAuth: () => mockAuthState,
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

describe('PinLoginPage - Failed Attempts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthState = {
      status: 'needs_auth',
      failedAttempts: 0,
      error: null,
      setupPin: vi.fn().mockResolvedValue(true),
      login: vi.fn().mockResolvedValue(true),
      logout: vi.fn(),
      changePin: vi.fn().mockResolvedValue(true),
      wipeAndReset: vi.fn().mockResolvedValue(undefined),
      clearError: vi.fn(),
    }
  })

  it('does not show failed attempts when count is 0', () => {
    mockAuthState.failedAttempts = 0

    render(<PinLoginPage />)

    expect(screen.queryByText(/failed attempt/)).not.toBeInTheDocument()
  })

  it('shows 1 failed attempt with singular form', () => {
    mockAuthState.failedAttempts = 1

    render(<PinLoginPage />)

    expect(screen.getByText('1 failed attempt')).toBeInTheDocument()
  })

  it('shows 2 failed attempts with plural form', () => {
    mockAuthState.failedAttempts = 2

    render(<PinLoginPage />)

    expect(screen.getByText('2 failed attempts')).toBeInTheDocument()
  })

  it('shows 5 failed attempts', () => {
    mockAuthState.failedAttempts = 5

    render(<PinLoginPage />)

    expect(screen.getByText('5 failed attempts')).toBeInTheDocument()
  })

  it('shows FailedAttemptsModal when attempts reach threshold (3)', async () => {
    mockAuthState.failedAttempts = 3

    render(<PinLoginPage />)

    await waitFor(() => {
      expect(screen.getByText('Too Many Failed Attempts')).toBeInTheDocument()
    })
  })

  it('shows FailedAttemptsModal at 6 attempts (threshold multiple)', async () => {
    mockAuthState.failedAttempts = 6

    render(<PinLoginPage />)

    await waitFor(() => {
      expect(screen.getByText('Too Many Failed Attempts')).toBeInTheDocument()
    })
  })

  it('does not show FailedAttemptsModal at 4 attempts', () => {
    mockAuthState.failedAttempts = 4

    render(<PinLoginPage />)

    expect(screen.queryByText('Too Many Failed Attempts')).not.toBeInTheDocument()
  })

  it('shows error from auth context', () => {
    mockAuthState.error = 'Incorrect PIN'

    render(<PinLoginPage />)

    expect(screen.getByText('Incorrect PIN')).toBeInTheDocument()
  })
})
