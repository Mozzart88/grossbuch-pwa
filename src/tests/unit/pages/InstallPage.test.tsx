import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
import { InstallPage } from '../../../pages/InstallPage'

// Mock useInstallation with configurable state
let mockInstallationState = {
  isInstalled: false,
  isIOS: false,
  canPromptInstall: false,
  promptInstall: vi.fn(),
}

vi.mock('../../../hooks/useInstallation', () => ({
  useInstallation: () => mockInstallationState,
}))

describe('InstallPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInstallationState = {
      isInstalled: false,
      isIOS: false,
      canPromptInstall: false,
      promptInstall: vi.fn(),
    }
  })

  it('renders app branding', () => {
    render(<InstallPage />)

    expect(screen.getByText('GrossBuh')).toBeInTheDocument()
    expect(screen.getByText('Personal Expense Tracker')).toBeInTheDocument()
  })

  it('renders install heading', () => {
    render(<InstallPage />)

    expect(screen.getByText('Install App')).toBeInTheDocument()
    expect(screen.getByText('GrossBuh works best as an installed app')).toBeInTheDocument()
  })

  it('shows native install button when prompt is available', () => {
    mockInstallationState.canPromptInstall = true

    render(<InstallPage />)

    expect(screen.getByText('Install GrossBuh')).toBeInTheDocument()
  })

  it('calls promptInstall when install button is clicked', () => {
    mockInstallationState.canPromptInstall = true

    render(<InstallPage />)

    fireEvent.click(screen.getByText('Install GrossBuh'))
    expect(mockInstallationState.promptInstall).toHaveBeenCalled()
  })

  it('shows iOS-specific instructions on iOS', () => {
    mockInstallationState.isIOS = true

    render(<InstallPage />)

    expect(screen.getByText('To install on iOS:')).toBeInTheDocument()
    expect(screen.getByText(/Share/)).toBeInTheDocument()
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument()
  })

  it('shows generic desktop instructions when not iOS and no prompt', () => {
    mockInstallationState.isIOS = false
    mockInstallationState.canPromptInstall = false

    render(<InstallPage />)

    expect(screen.getByText('To install:')).toBeInTheDocument()
    expect(screen.getByText(/install icon/)).toBeInTheDocument()
  })

  it('does not show generic instructions when prompt is available', () => {
    mockInstallationState.canPromptInstall = true
    mockInstallationState.isIOS = false

    render(<InstallPage />)

    expect(screen.queryByText('To install:')).not.toBeInTheDocument()
  })

  it('shows info box about offline access', () => {
    render(<InstallPage />)

    expect(screen.getByText(/Installing the app enables offline access/)).toBeInTheDocument()
  })

  it('shows footer text about local encryption', () => {
    render(<InstallPage />)

    expect(screen.getByText('All data is stored locally and encrypted on your device')).toBeInTheDocument()
  })
})
