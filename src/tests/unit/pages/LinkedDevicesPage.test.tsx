import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui'
import { LinkedDevicesPage } from '../../../pages/LinkedDevicesPage'

// Mock repositories
vi.mock('../../../services/repositories', () => ({
  settingsRepository: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

// Mock confirm
const mockConfirm = vi.spyOn(window, 'confirm')

import { settingsRepository } from '../../../services/repositories'

const mockSettingsRepository = vi.mocked(settingsRepository)

describe('LinkedDevicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfirm.mockReturnValue(true)
    mockSettingsRepository.set.mockResolvedValue(undefined)
  })

  const renderPage = () => {
    return render(
      <MemoryRouter>
        <ToastProvider>
          <LinkedDevicesPage />
        </ToastProvider>
      </MemoryRouter>
    )
  }

  describe('Header', () => {
    it('renders page title', async () => {
      mockSettingsRepository.get.mockResolvedValue(null)
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Linked Devices')).toBeInTheDocument()
      })
    })
  })

  describe('Empty state', () => {
    it('shows empty state when no linked installations', async () => {
      mockSettingsRepository.get.mockResolvedValue(null)
      renderPage()

      await waitFor(() => {
        expect(screen.getByText(/No linked devices/i)).toBeInTheDocument()
      })
    })

    it('shows empty state when installations is empty object', async () => {
      mockSettingsRepository.get.mockResolvedValue('{}')
      renderPage()

      await waitFor(() => {
        expect(screen.getByText(/No linked devices/i)).toBeInTheDocument()
      })
    })

    it('shows loading text initially', () => {
      mockSettingsRepository.get.mockResolvedValue(null)
      renderPage()

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })
  })

  describe('Device list', () => {
    const installationId1 = 'abcdef1234567890'
    const installationId2 = 'fedcba0987654321'
    const installations = JSON.stringify({
      [installationId1]: 'pubkey1',
      [installationId2]: 'pubkey2',
    })

    it('renders abbreviated installation IDs', async () => {
      mockSettingsRepository.get.mockResolvedValue(installations)
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('abcdef12…')).toBeInTheDocument()
        expect(screen.getByText('fedcba09…')).toBeInTheDocument()
      })
    })

    it('renders Unlink button for each device', async () => {
      mockSettingsRepository.get.mockResolvedValue(installations)
      renderPage()

      await waitFor(() => {
        const unlinkButtons = screen.getAllByRole('button', { name: /unlink/i })
        expect(unlinkButtons).toHaveLength(2)
      })
    })
  })

  describe('Unlink flow', () => {
    const installationId = 'abcdef1234567890abcdef12'
    const installations = JSON.stringify({ [installationId]: 'pubkey1' })

    it('shows confirm dialog before unlinking', async () => {
      mockSettingsRepository.get.mockResolvedValue(installations)
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /unlink/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /unlink/i }))

      expect(mockConfirm).toHaveBeenCalled()
    })

    it('removes device when confirmed', async () => {
      mockConfirm.mockReturnValue(true)
      mockSettingsRepository.get.mockResolvedValue(installations)
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /unlink/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /unlink/i }))

      await waitFor(() => {
        expect(mockSettingsRepository.set).toHaveBeenCalledWith(
          'linked_installations',
          JSON.stringify({})
        )
      })
    })

    it('does not remove device when cancelled', async () => {
      mockConfirm.mockReturnValue(false)
      mockSettingsRepository.get.mockResolvedValue(installations)
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /unlink/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /unlink/i }))

      expect(mockSettingsRepository.set).not.toHaveBeenCalled()
    })

    it('shows device in abbreviated form in confirm message', async () => {
      mockConfirm.mockReturnValue(false)
      mockSettingsRepository.get.mockResolvedValue(installations)
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /unlink/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /unlink/i }))

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.stringContaining('abcdef12')
      )
    })

    it('handles error during unlink', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockConfirm.mockReturnValue(true)
      mockSettingsRepository.get.mockResolvedValue(installations)
      mockSettingsRepository.set.mockRejectedValueOnce(new Error('Save failed'))
      renderPage()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /unlink/i })).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: /unlink/i }))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to unlink device:', expect.any(Error))
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Error handling', () => {
    it('handles error when loading installations', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSettingsRepository.get.mockRejectedValueOnce(new Error('Load failed'))
      renderPage()

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load linked installations:', expect.any(Error))
      })

      // Shows empty state on error
      await waitFor(() => {
        expect(screen.getByText(/No linked devices/i)).toBeInTheDocument()
      })

      consoleSpy.mockRestore()
    })
  })
})
