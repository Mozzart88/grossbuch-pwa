import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { SharePage } from '../../../pages/SharePage'

// Mock settingsRepository
vi.mock('../../../services/repositories', () => ({
  settingsRepository: {
    get: vi.fn(),
  },
}))

// Mock authService
vi.mock('../../../services/auth/authService', () => ({
  getPublicKey: vi.fn(),
}))

import { settingsRepository } from '../../../services/repositories'
import { getPublicKey } from '../../../services/auth/authService'

const mockSettingsGet = vi.mocked(settingsRepository.get)
const mockGetPublicKey = vi.mocked(getPublicKey)

// Mock QRCodeSVG
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, size }: { value: string; size: number }) => (
    <svg data-testid="qr-code" data-value={value} data-size={size} />
  ),
}))

describe('SharePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset navigator mocks
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  const renderPage = () => {
    return render(
      <BrowserRouter>
        <SharePage />
      </BrowserRouter>
    )
  }

  describe('Loading state', () => {
    it('shows spinner while loading', () => {
      mockSettingsGet.mockImplementation(() => new Promise(() => {})) // never resolves
      const { container } = renderPage()
      expect(container.querySelector('.animate-spin')).toBeTruthy()
    })

    it('shows page header with back button while loading', () => {
      mockSettingsGet.mockImplementation(() => new Promise(() => {}))
      renderPage()
      expect(screen.getByText('Share')).toBeInTheDocument()
    })
  })

  describe('Not registered state', () => {
    it('shows registration not complete message when no installation_id', async () => {
      mockSettingsGet.mockResolvedValue(null)
      renderPage()

      await waitFor(() => {
        expect(screen.getByText(/Registration not complete/)).toBeInTheDocument()
      })
    })

    it('shows registration not complete when installation_id has no id field', async () => {
      mockSettingsGet.mockResolvedValue(JSON.stringify({}) as never)
      renderPage()

      await waitFor(() => {
        expect(screen.getByText(/Registration not complete/)).toBeInTheDocument()
      })
    })
  })

  describe('Registered state', () => {
    const installationData = JSON.stringify({ id: 'test-uuid-123', jwt: 'some-jwt' })

    beforeEach(() => {
      mockSettingsGet.mockResolvedValue(installationData as never)
      mockGetPublicKey.mockResolvedValue('test-public-key-base64url')
    })

    it('renders QR code with correct share URL', async () => {
      renderPage()

      await waitFor(() => {
        const qr = screen.getByTestId('qr-code')
        expect(qr).toBeInTheDocument()
        expect(qr.getAttribute('data-value')).toBe(
          `${window.location.origin}/share?uuid=test-uuid-123&pub=test-public-key-base64url`
        )
      })
    })

    it('renders share URL without pub param when no public key', async () => {
      mockGetPublicKey.mockResolvedValue(null)
      renderPage()

      await waitFor(() => {
        const qr = screen.getByTestId('qr-code')
        expect(qr.getAttribute('data-value')).toBe(
          `${window.location.origin}/share?uuid=test-uuid-123`
        )
      })
    })

    it('displays the share URL in monospace', async () => {
      renderPage()

      await waitFor(() => {
        expect(
          screen.getByText(`${window.location.origin}/share?uuid=test-uuid-123&pub=test-public-key-base64url`)
        ).toBeInTheDocument()
      })
    })

    it('renders Copy Link button', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Copy Link')).toBeInTheDocument()
      })
    })

    it('copies URL to clipboard and shows feedback', async () => {
      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Copy Link')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Copy Link'))

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          `${window.location.origin}/share?uuid=test-uuid-123&pub=test-public-key-base64url`
        )
        expect(screen.getByText('Copied!')).toBeInTheDocument()
      })
    })

    it('shows Share button when Web Share API is available', async () => {
      Object.defineProperty(navigator, 'share', {
        value: vi.fn().mockResolvedValue(undefined),
        writable: true,
        configurable: true,
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Share')).toBeInTheDocument()
      })
    })

    it('does not show Share button when Web Share API is unavailable', async () => {
      Object.defineProperty(navigator, 'share', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Copy Link')).toBeInTheDocument()
      })

      const buttons = screen.getAllByRole('button')
      const shareButton = buttons.find(b => b.textContent === 'Share')
      expect(shareButton).toBeUndefined()
    })

    it('calls navigator.share when Share button clicked', async () => {
      const mockShare = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'share', {
        value: mockShare,
        writable: true,
        configurable: true,
      })

      renderPage()

      await waitFor(() => {
        const buttons = screen.getAllByRole('button')
        const shareButton = buttons.find(b => b.textContent === 'Share')
        expect(shareButton).toBeTruthy()
      })

      const buttons = screen.getAllByRole('button')
      const shareButton = buttons.find(b => b.textContent === 'Share')!
      fireEvent.click(shareButton)

      await waitFor(() => {
        expect(mockShare).toHaveBeenCalledWith({
          title: 'GrossBuch',
          text: 'Install GrossBuch on your device',
          url: `${window.location.origin}/share?uuid=test-uuid-123&pub=test-public-key-base64url`,
        })
      })
    })

    it('handles share cancellation gracefully', async () => {
      const mockShare = vi.fn().mockRejectedValue(new Error('User cancelled'))
      Object.defineProperty(navigator, 'share', {
        value: mockShare,
        writable: true,
        configurable: true,
      })

      renderPage()

      await waitFor(() => {
        const buttons = screen.getAllByRole('button')
        const shareButton = buttons.find(b => b.textContent === 'Share')
        expect(shareButton).toBeTruthy()
      })

      const buttons = screen.getAllByRole('button')
      const shareButton = buttons.find(b => b.textContent === 'Share')!
      fireEvent.click(shareButton)

      await waitFor(() => {
        expect(mockShare).toHaveBeenCalled()
      })
    })

    it('handles clipboard failure gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockRejectedValue(new Error('Not allowed')) },
        writable: true,
        configurable: true,
      })

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Copy Link')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Copy Link'))

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled()
      })

      consoleError.mockRestore()
    })
  })

  describe('Error handling', () => {
    it('handles settingsRepository.get failure', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSettingsGet.mockRejectedValue(new Error('DB error'))

      renderPage()

      await waitFor(() => {
        expect(screen.getByText(/Registration not complete/)).toBeInTheDocument()
      })

      consoleError.mockRestore()
    })
  })
})
