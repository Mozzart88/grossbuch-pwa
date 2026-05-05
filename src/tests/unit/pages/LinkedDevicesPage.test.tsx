import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../../../components/ui'
import { LinkedDevicesPage } from '../../../pages/LinkedDevicesPage'

vi.mock('../../../services/repositories', () => ({
  settingsRepository: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../../../services/database/connection', () => ({
  onDbWrite: vi.fn(() => () => {}),
}))

vi.mock('../../../services/sync', () => ({
  sendUnlinkCommand: vi.fn(),
}))

import { settingsRepository } from '../../../services/repositories'
import { sendUnlinkCommand } from '../../../services/sync'

const mockRepo = vi.mocked(settingsRepository)
const mockSendUnlinkCommand = vi.mocked(sendUnlinkCommand)

const INSTALLATION_ID = 'abcdef1234567890'
const INSTALLATION_ID_2 = 'fedcba0987654321'
const INSTALLATIONS = JSON.stringify({ [INSTALLATION_ID]: 'pubkey1' })
const TWO_INSTALLATIONS = JSON.stringify({
  [INSTALLATION_ID]: 'pubkey1',
  [INSTALLATION_ID_2]: 'pubkey2',
})

function mockGet(linked: string | null, pending: string | null = null) {
  mockRepo.get.mockImplementation((key: string) => {
    if (key === 'linked_installations') return Promise.resolve(linked)
    if (key === 'pending_unlink_requests') return Promise.resolve(pending)
    return Promise.resolve(null)
  })
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <LinkedDevicesPage />
      </ToastProvider>
    </MemoryRouter>
  )

describe('LinkedDevicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepo.set.mockResolvedValue(undefined)
    mockRepo.delete.mockResolvedValue(undefined)
    mockSendUnlinkCommand.mockResolvedValue(undefined)
  })

  describe('Header', () => {
    it('renders page title', async () => {
      mockGet(null)
      renderPage()
      await waitFor(() => expect(screen.getByText('Linked Devices')).toBeInTheDocument())
    })
  })

  describe('Loading and empty states', () => {
    it('shows loading text initially', () => {
      mockGet(null)
      renderPage()
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('shows empty state when no linked installations', async () => {
      mockGet(null)
      renderPage()
      await waitFor(() => expect(screen.getByText(/No linked devices/i)).toBeInTheDocument())
    })

    it('shows empty state when installations is empty object', async () => {
      mockGet('{}')
      renderPage()
      await waitFor(() => expect(screen.getByText(/No linked devices/i)).toBeInTheDocument())
    })
  })

  describe('Device list', () => {
    it('renders abbreviated installation IDs', async () => {
      mockGet(TWO_INSTALLATIONS)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('abcdef12…')).toBeInTheDocument()
        expect(screen.getByText('fedcba09…')).toBeInTheDocument()
      })
    })

    it('renders Unlink button for each non-pending device', async () => {
      mockGet(TWO_INSTALLATIONS)
      renderPage()
      await waitFor(() => {
        const unlinkButtons = screen.getAllByRole('button', { name: /^Unlink$/i })
        expect(unlinkButtons).toHaveLength(2)
      })
    })
  })

  describe('Pending devices', () => {
    it('shows "Waiting for confirmation" and Force Unlink for pending device', async () => {
      const pending = JSON.stringify([{ target_id: INSTALLATION_ID, started_at: 0, keep_data: true }])
      mockGet(INSTALLATIONS, pending)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('Waiting for confirmation…')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Force Unlink/i })).toBeInTheDocument()
      })
    })

    it('force unlink removes device from both settings keys', async () => {
      const pending = JSON.stringify([{ target_id: INSTALLATION_ID, started_at: 0, keep_data: true }])
      mockGet(INSTALLATIONS, pending)
      renderPage()

      await waitFor(() => screen.getByRole('button', { name: /Force Unlink/i }))
      fireEvent.click(screen.getByRole('button', { name: /Force Unlink/i }))

      await waitFor(() => {
        expect(mockRepo.set).toHaveBeenCalledWith('linked_installations', JSON.stringify({}))
        expect(mockRepo.delete).toHaveBeenCalledWith('pending_unlink_requests')
      })
    })

    it('force unlink keeps remaining pending requests when multiple exist', async () => {
      const pending = JSON.stringify([
        { target_id: INSTALLATION_ID, started_at: 0, keep_data: true },
        { target_id: INSTALLATION_ID_2, started_at: 1, keep_data: false },
      ])
      mockGet(TWO_INSTALLATIONS, pending)
      renderPage()

      await waitFor(() => screen.getAllByRole('button', { name: /Force Unlink/i }))
      fireEvent.click(screen.getAllByRole('button', { name: /Force Unlink/i })[0])

      await waitFor(() => {
        expect(mockRepo.set).toHaveBeenCalledWith(
          'pending_unlink_requests',
          JSON.stringify([{ target_id: INSTALLATION_ID_2, started_at: 1, keep_data: false }])
        )
        expect(mockRepo.delete).not.toHaveBeenCalledWith('pending_unlink_requests')
      })
    })

    it('shows error toast when force unlink fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRepo.set.mockRejectedValueOnce(new Error('Save failed'))
      const pending = JSON.stringify([{ target_id: INSTALLATION_ID, started_at: 0, keep_data: true }])
      mockGet(INSTALLATIONS, pending)
      renderPage()

      await waitFor(() => screen.getByRole('button', { name: /Force Unlink/i }))
      fireEvent.click(screen.getByRole('button', { name: /Force Unlink/i }))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to force unlink device:', expect.any(Error))
      })
      consoleSpy.mockRestore()
    })
  })

  describe('Unlink dialog', () => {
    it('opens dialog when Unlink is clicked', async () => {
      mockGet(INSTALLATIONS)
      renderPage()
      await waitFor(() => screen.getByRole('button', { name: /^Unlink$/i }))
      fireEvent.click(screen.getByRole('button', { name: /^Unlink$/i }))

      expect(screen.getByText('Unlink device')).toBeInTheDocument()
      expect(screen.getByText(/What should happen/i)).toBeInTheDocument()
    })

    it('closes dialog when Cancel is clicked without sending command', async () => {
      mockGet(INSTALLATIONS)
      renderPage()
      await waitFor(() => screen.getByRole('button', { name: /^Unlink$/i }))
      fireEvent.click(screen.getByRole('button', { name: /^Unlink$/i }))

      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))

      await waitFor(() => expect(screen.queryByText('Unlink device')).not.toBeInTheDocument())
      expect(mockSendUnlinkCommand).not.toHaveBeenCalled()
    })

    it('sends unlink command with keepData=true when "Keep data" chosen', async () => {
      mockGet(INSTALLATIONS)
      renderPage()
      await waitFor(() => screen.getByRole('button', { name: /^Unlink$/i }))
      fireEvent.click(screen.getByRole('button', { name: /^Unlink$/i }))
      fireEvent.click(screen.getByRole('button', { name: /Keep data/i }))

      await waitFor(() => {
        expect(mockSendUnlinkCommand).toHaveBeenCalledWith(INSTALLATION_ID, true)
      })
    })

    it('sends unlink command with keepData=false when "Delete everything" chosen', async () => {
      mockGet(INSTALLATIONS)
      renderPage()
      await waitFor(() => screen.getByRole('button', { name: /^Unlink$/i }))
      fireEvent.click(screen.getByRole('button', { name: /^Unlink$/i }))
      fireEvent.click(screen.getByRole('button', { name: /Delete everything/i }))

      await waitFor(() => {
        expect(mockSendUnlinkCommand).toHaveBeenCalledWith(INSTALLATION_ID, false)
      })
    })

    it('saves pending_unlink_requests after sending command', async () => {
      mockGet(INSTALLATIONS)
      renderPage()
      await waitFor(() => screen.getByRole('button', { name: /^Unlink$/i }))
      fireEvent.click(screen.getByRole('button', { name: /^Unlink$/i }))
      fireEvent.click(screen.getByRole('button', { name: /Keep data/i }))

      await waitFor(() => {
        expect(mockRepo.set).toHaveBeenCalledWith(
          'pending_unlink_requests',
          expect.stringContaining(INSTALLATION_ID)
        )
      })
    })

    it('shows error toast when sendUnlinkCommand fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSendUnlinkCommand.mockRejectedValueOnce(new Error('Network error'))
      mockGet(INSTALLATIONS)
      renderPage()
      await waitFor(() => screen.getByRole('button', { name: /^Unlink$/i }))
      fireEvent.click(screen.getByRole('button', { name: /^Unlink$/i }))
      fireEvent.click(screen.getByRole('button', { name: /Keep data/i }))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to send unlink command:', expect.any(Error))
      })
      consoleSpy.mockRestore()
    })
  })

  describe('Error handling', () => {
    it('handles error when loading installations', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRepo.get.mockRejectedValueOnce(new Error('Load failed'))
      renderPage()

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to load linked installations:', expect.any(Error))
      })
      await waitFor(() => expect(screen.getByText(/No linked devices/i)).toBeInTheDocument())
      consoleSpy.mockRestore()
    })
  })
})
