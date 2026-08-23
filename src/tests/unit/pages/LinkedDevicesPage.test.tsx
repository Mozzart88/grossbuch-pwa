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
  linkedDeviceRepository: {
    findAll: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
  },
}))

vi.mock('../../../services/database/connection', () => ({
  onDbWrite: vi.fn(() => () => {}),
}))

vi.mock('../../../services/sync', () => ({
  getInstallationData: vi.fn(),
  sendUnlinkCommand: vi.fn(),
  sendRenameCommand: vi.fn(),
}))

import { settingsRepository, linkedDeviceRepository, type LinkedDevice } from '../../../services/repositories'
import { getInstallationData, sendUnlinkCommand, sendRenameCommand } from '../../../services/sync'

const mockRepo = vi.mocked(settingsRepository)
const mockLinkedDeviceRepo = vi.mocked(linkedDeviceRepository)
const mockGetInstallationData = vi.mocked(getInstallationData)
const mockSendUnlinkCommand = vi.mocked(sendUnlinkCommand)
const mockSendRenameCommand = vi.mocked(sendRenameCommand)

const INSTALLATION_ID = 'abcdef1234567890'
const INSTALLATION_ID_2 = 'fedcba0987654321'

function device(id: string, publicKey: string): LinkedDevice {
  return { id, name: 'Unnamed device', public_key: publicKey, linked_at: 0, workspace_scope: null }
}

const ONE_DEVICE = [device(INSTALLATION_ID, 'pubkey1')]
const TWO_DEVICES = [device(INSTALLATION_ID, 'pubkey1'), device(INSTALLATION_ID_2, 'pubkey2')]

function mockGet(linked: LinkedDevice[] | null, pending: string | null = null) {
  mockLinkedDeviceRepo.findAll.mockResolvedValue(linked ?? [])
  mockRepo.get.mockImplementation((key: string) => {
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

// Kebab-menu buttons have no text/aria-label (icon only), so they can't be targeted by
// accessible name — target by the DropdownMenu's aria-haspopup attribute instead. Excludes
// the PageHeader back button, which is also an icon-only button with an empty accessible name.
function kebabButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('[aria-haspopup="menu"]'))
}

function openKebabMenu(container: HTMLElement, index: number) {
  fireEvent.click(kebabButtons(container)[index])
}

describe('LinkedDevicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRepo.set.mockResolvedValue(undefined)
    mockRepo.delete.mockResolvedValue(undefined)
    mockLinkedDeviceRepo.remove.mockResolvedValue(undefined)
    mockLinkedDeviceRepo.rename.mockResolvedValue(undefined)
    mockSendUnlinkCommand.mockResolvedValue(undefined)
    mockSendRenameCommand.mockResolvedValue(undefined)
    // No self card by default — keeps peer-card kebab indices stable across tests that
    // don't care about the "This device" section. Self-specific tests override this.
    mockGetInstallationData.mockResolvedValue(null)
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
      mockGet([])
      renderPage()
      await waitFor(() => expect(screen.getByText(/No linked devices/i)).toBeInTheDocument())
    })
  })

  describe('This device section', () => {
    it('renders a highlighted card for this installation', async () => {
      mockGet([])
      mockGetInstallationData.mockResolvedValue({ id: 'myownid1-2345-6789', jwt: 'token', device_name: 'My Laptop' })
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('This Device')).toBeInTheDocument()
        expect(screen.getByText('My Laptop')).toBeInTheDocument()
        expect(screen.getByText('myownid1…')).toBeInTheDocument()
      })
    })

    it('falls back to a generic label when device_name is unset', async () => {
      mockGet([])
      mockGetInstallationData.mockResolvedValue({ id: 'myownid1-2345-6789', jwt: 'token' })
      renderPage()

      await waitFor(() => expect(screen.getByText('This device')).toBeInTheDocument())
    })

    it('does not render when installation data is unavailable', async () => {
      mockGet([])
      mockGetInstallationData.mockResolvedValue(null)
      renderPage()

      await waitFor(() => expect(screen.getByText(/No linked devices/i)).toBeInTheDocument())
      expect(screen.queryByText('This Device')).not.toBeInTheDocument()
    })

    it('renames this device: updates local setting and notifies linked devices', async () => {
      mockGet([])
      mockGetInstallationData.mockResolvedValue({ id: 'myownid1-2345-6789', jwt: 'token', device_name: 'My Laptop' })
      const { container } = renderPage()

      await waitFor(() => expect(screen.getByText('My Laptop')).toBeInTheDocument())

      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))

      const input = screen.getByLabelText('Name')
      fireEvent.change(input, { target: { value: 'Renamed Laptop' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(mockRepo.set).toHaveBeenCalledWith('device_name', 'Renamed Laptop')
        expect(mockSendRenameCommand).toHaveBeenCalledWith('myownid1-2345-6789', 'Renamed Laptop')
      })
    })

    it('shows an error toast and keeps the modal open when the local rename write fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRepo.set.mockRejectedValueOnce(new Error('DB error'))
      mockGet([])
      mockGetInstallationData.mockResolvedValue({ id: 'myownid1-2345-6789', jwt: 'token', device_name: 'My Laptop' })
      const { container } = renderPage()

      await waitFor(() => expect(screen.getByText('My Laptop')).toBeInTheDocument())

      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed Laptop' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to rename this device:', expect.any(Error))
      })
      expect(screen.getByText('Rename device')).toBeInTheDocument()
      expect(mockSendRenameCommand).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('has no Unlink option in its kebab menu', async () => {
      mockGet([])
      mockGetInstallationData.mockResolvedValue({ id: 'myownid1-2345-6789', jwt: 'token', device_name: 'My Laptop' })
      const { container } = renderPage()

      await waitFor(() => expect(screen.getByText('My Laptop')).toBeInTheDocument())

      openKebabMenu(container, 0)
      expect(screen.queryByRole('menuitem', { name: /Unlink/i })).not.toBeInTheDocument()
    })
  })

  describe('Device list', () => {
    it('renders abbreviated installation IDs', async () => {
      mockGet(TWO_DEVICES)
      renderPage()
      await waitFor(() => {
        expect(screen.getByText('abcdef12…')).toBeInTheDocument()
        expect(screen.getByText('fedcba09…')).toBeInTheDocument()
      })
    })

    it('renders a kebab menu with an Unlink option for each non-pending device', async () => {
      mockGet(TWO_DEVICES)
      const { container } = renderPage()
      await waitFor(() => expect(kebabButtons(container)).toHaveLength(2))

      openKebabMenu(container, 0)
      expect(screen.getByRole('menuitem', { name: 'Unlink' })).toBeInTheDocument()
    })
  })

  describe('Renaming a peer', () => {
    it('renames the peer locally and notifies linked devices', async () => {
      mockGet(ONE_DEVICE)
      const { container } = renderPage()
      await waitFor(() => expect(kebabButtons(container)).toHaveLength(1))

      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))

      const input = screen.getByLabelText('Name')
      fireEvent.change(input, { target: { value: 'Renamed Peer' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(mockLinkedDeviceRepo.rename).toHaveBeenCalledWith(INSTALLATION_ID, 'Renamed Peer')
        expect(mockSendRenameCommand).toHaveBeenCalledWith(INSTALLATION_ID, 'Renamed Peer')
      })
    })

    it('shows an error toast and keeps the modal open when the local rename write fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockLinkedDeviceRepo.rename.mockRejectedValueOnce(new Error('DB error'))
      mockGet(ONE_DEVICE)
      const { container } = renderPage()
      await waitFor(() => expect(kebabButtons(container)).toHaveLength(1))

      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed Peer' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to rename device:', expect.any(Error))
      })
      expect(screen.getByText('Rename device')).toBeInTheDocument()
      expect(mockSendRenameCommand).not.toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('shows an error toast when the rename command fails to send', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSendRenameCommand.mockRejectedValueOnce(new Error('Network error'))
      mockGet(ONE_DEVICE)
      const { container } = renderPage()
      await waitFor(() => expect(kebabButtons(container)).toHaveLength(1))

      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed Peer' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to send rename command:', expect.any(Error))
      })
      consoleSpy.mockRestore()
    })
  })

  describe('Pending devices', () => {
    it('shows "Waiting for confirmation" and a Force Unlink option for a pending device', async () => {
      const pending = JSON.stringify([{ target_id: INSTALLATION_ID, started_at: 0, keep_data: true }])
      mockGet(ONE_DEVICE, pending)
      const { container } = renderPage()
      await waitFor(() => {
        expect(screen.getByText('Waiting for confirmation…')).toBeInTheDocument()
      })

      openKebabMenu(container, 0)
      expect(screen.getByRole('menuitem', { name: 'Force Unlink' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Unlink' })).not.toBeInTheDocument()
    })

    it('force unlink removes device from both settings keys', async () => {
      const pending = JSON.stringify([{ target_id: INSTALLATION_ID, started_at: 0, keep_data: true }])
      mockGet(ONE_DEVICE, pending)
      const { container } = renderPage()

      await waitFor(() => expect(kebabButtons(container)).toHaveLength(1))
      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Force Unlink' }))

      await waitFor(() => {
        expect(mockLinkedDeviceRepo.remove).toHaveBeenCalledWith(INSTALLATION_ID)
        expect(mockRepo.delete).toHaveBeenCalledWith('pending_unlink_requests')
      })
    })

    it('force unlink keeps remaining pending requests when multiple exist', async () => {
      const pending = JSON.stringify([
        { target_id: INSTALLATION_ID, started_at: 0, keep_data: true },
        { target_id: INSTALLATION_ID_2, started_at: 1, keep_data: false },
      ])
      mockGet(TWO_DEVICES, pending)
      const { container } = renderPage()

      await waitFor(() => expect(kebabButtons(container)).toHaveLength(2))
      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Force Unlink' }))

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
      mockLinkedDeviceRepo.remove.mockRejectedValueOnce(new Error('Save failed'))
      const pending = JSON.stringify([{ target_id: INSTALLATION_ID, started_at: 0, keep_data: true }])
      mockGet(ONE_DEVICE, pending)
      const { container } = renderPage()

      await waitFor(() => expect(kebabButtons(container)).toHaveLength(1))
      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Force Unlink' }))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to force unlink device:', expect.any(Error))
      })
      consoleSpy.mockRestore()
    })
  })

  describe('Unlink dialog', () => {
    it('opens dialog when Unlink is clicked', async () => {
      mockGet(ONE_DEVICE)
      const { container } = renderPage()
      await waitFor(() => expect(kebabButtons(container)).toHaveLength(1))

      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Unlink' }))

      expect(screen.getByText('Unlink device')).toBeInTheDocument()
      expect(screen.getByText(/What should happen/i)).toBeInTheDocument()
    })

    it('closes dialog when Cancel is clicked without sending command', async () => {
      mockGet(ONE_DEVICE)
      const { container } = renderPage()
      await waitFor(() => expect(kebabButtons(container)).toHaveLength(1))
      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Unlink' }))

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => expect(screen.queryByText('Unlink device')).not.toBeInTheDocument())
      expect(mockSendUnlinkCommand).not.toHaveBeenCalled()
    })

    it('sends unlink command with keepData=true when "Keep data" chosen', async () => {
      mockGet(ONE_DEVICE)
      const { container } = renderPage()
      await waitFor(() => expect(kebabButtons(container)).toHaveLength(1))
      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Unlink' }))
      fireEvent.click(screen.getByRole('button', { name: /Keep data/i }))

      await waitFor(() => {
        expect(mockSendUnlinkCommand).toHaveBeenCalledWith(INSTALLATION_ID, true)
      })
    })

    it('sends unlink command with keepData=false when "Delete everything" chosen', async () => {
      mockGet(ONE_DEVICE)
      const { container } = renderPage()
      await waitFor(() => expect(kebabButtons(container)).toHaveLength(1))
      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Unlink' }))
      fireEvent.click(screen.getByRole('button', { name: /Delete everything/i }))

      await waitFor(() => {
        expect(mockSendUnlinkCommand).toHaveBeenCalledWith(INSTALLATION_ID, false)
      })
    })

    it('saves pending_unlink_requests after sending command', async () => {
      mockGet(ONE_DEVICE)
      const { container } = renderPage()
      await waitFor(() => expect(kebabButtons(container)).toHaveLength(1))
      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Unlink' }))
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
      mockGet(ONE_DEVICE)
      const { container } = renderPage()
      await waitFor(() => expect(kebabButtons(container)).toHaveLength(1))
      openKebabMenu(container, 0)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Unlink' }))
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
