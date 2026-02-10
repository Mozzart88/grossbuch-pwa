import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ExportPage } from '../../../pages/ExportPage'

// Mock export services
vi.mock('../../../services/export/csvExport', () => ({
  exportTransactionsToCSV: vi.fn(),
  downloadCSV: vi.fn(),
}))

// Mock repositories
vi.mock('../../../services/repositories', () => ({
  walletRepository: {
    findAll: vi.fn().mockResolvedValue([]),
  },
  tagRepository: {
    findAll: vi.fn().mockResolvedValue([]),
  },
  counterpartyRepository: {
    findAll: vi.fn().mockResolvedValue([]),
  },
}))

// Mock verifyPin
vi.mock('../../../services/auth', () => ({
  verifyPin: vi.fn().mockResolvedValue(undefined),
}))

// Mock toast
const mockShowToast = vi.fn()
vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: mockShowToast }),
  }
})

import { exportTransactionsToCSV, downloadCSV } from '../../../services/export/csvExport'
import { verifyPin } from '../../../services/auth'
import { walletRepository, tagRepository, counterpartyRepository } from '../../../services/repositories'

const mockExportTransactionsToCSV = vi.mocked(exportTransactionsToCSV)
const mockDownloadCSV = vi.mocked(downloadCSV)
const mockVerifyPin = vi.mocked(verifyPin)

describe('ExportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExportTransactionsToCSV.mockResolvedValue('header\ndata')
    mockVerifyPin.mockResolvedValue(undefined)
    vi.mocked(walletRepository.findAll).mockResolvedValue([])
    vi.mocked(tagRepository.findAll).mockResolvedValue([])
    vi.mocked(counterpartyRepository.findAll).mockResolvedValue([])
  })

  const renderPage = () => {
    return render(
      <BrowserRouter>
        <ExportPage />
      </BrowserRouter>
    )
  }

  describe('Rendering', () => {
    it('renders page header', () => {
      renderPage()
      expect(screen.getByText('Export Data')).toBeInTheDocument()
    })

    it('renders export section title', () => {
      renderPage()
      expect(screen.getByText('Export Transactions')).toBeInTheDocument()
    })

    it('renders description text', () => {
      renderPage()
      expect(screen.getByText(/Download your transactions as a CSV file/)).toBeInTheDocument()
    })

    it('renders start date input', () => {
      renderPage()
      expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument()
    })

    it('renders end date input', () => {
      renderPage()
      expect(screen.getByLabelText(/End Date/i)).toBeInTheDocument()
    })

    it('renders export button', () => {
      renderPage()
      expect(screen.getByRole('button', { name: /Export to CSV/i })).toBeInTheDocument()
    })

    it('renders info text about leaving dates and filters empty', () => {
      renderPage()
      expect(screen.getByText('Leave dates and filters empty to export all transactions')).toBeInTheDocument()
    })

    it('renders filters section', () => {
      renderPage()
      expect(screen.getByText('Filters')).toBeInTheDocument()
    })

    it('renders filter labels', () => {
      renderPage()
      expect(screen.getByText('Wallets')).toBeInTheDocument()
      expect(screen.getByText('Accounts')).toBeInTheDocument()
      expect(screen.getByText('Tags')).toBeInTheDocument()
      expect(screen.getByText('Counterparties')).toBeInTheDocument()
    })
  })

  describe('PIN flow', () => {
    it('opens PIN modal when export button clicked', async () => {
      renderPage()

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(screen.getByText('Confirm Export')).toBeInTheDocument()
      })
    })

    it('calls verifyPin and runs export after valid PIN', async () => {
      renderPage()

      // Click export to open PIN modal
      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(screen.getByText('Confirm Export')).toBeInTheDocument()
      })

      // Enter PIN
      const pinInput = screen.getByLabelText(/Enter PIN/i)
      fireEvent.change(pinInput, { target: { value: '123456' } })

      // Click confirm
      const confirmButton = screen.getByRole('button', { name: /Confirm/i })
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockVerifyPin).toHaveBeenCalledWith('123456')
      })

      await waitFor(() => {
        expect(mockExportTransactionsToCSV).toHaveBeenCalled()
      })
    })

    it('shows success toast on export', async () => {
      renderPage()

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(screen.getByText('Confirm Export')).toBeInTheDocument()
      })

      const pinInput = screen.getByLabelText(/Enter PIN/i)
      fireEvent.change(pinInput, { target: { value: '123456' } })

      const confirmButton = screen.getByRole('button', { name: /Confirm/i })
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Export successful', 'success')
      })
    })

    it('calls downloadCSV with correct content and filename', async () => {
      renderPage()

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(screen.getByText('Confirm Export')).toBeInTheDocument()
      })

      const pinInput = screen.getByLabelText(/Enter PIN/i)
      fireEvent.change(pinInput, { target: { value: '123456' } })

      const confirmButton = screen.getByRole('button', { name: /Confirm/i })
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockDownloadCSV).toHaveBeenCalledWith(
          'header\ndata',
          expect.stringMatching(/transactions_all_all_\d{4}-\d{2}-\d{2}\.csv/)
        )
      })
    })

    it('passes date filters to export', async () => {
      renderPage()

      const startDateInput = screen.getByLabelText(/Start Date/i)
      fireEvent.change(startDateInput, { target: { value: '2025-01-01' } })

      const endDateInput = screen.getByLabelText(/End Date/i)
      fireEvent.change(endDateInput, { target: { value: '2025-01-31' } })

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(screen.getByText('Confirm Export')).toBeInTheDocument()
      })

      const pinInput = screen.getByLabelText(/Enter PIN/i)
      fireEvent.change(pinInput, { target: { value: '123456' } })

      const confirmButton = screen.getByRole('button', { name: /Confirm/i })
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockExportTransactionsToCSV).toHaveBeenCalledWith(
          expect.objectContaining({
            startDate: '2025-01-01',
            endDate: '2025-01-31',
          })
        )
      })
    })
  })

  describe('Error handling', () => {
    it('shows error toast on export failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockExportTransactionsToCSV.mockRejectedValue(new Error('Export failed'))

      renderPage()

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(screen.getByText('Confirm Export')).toBeInTheDocument()
      })

      const pinInput = screen.getByLabelText(/Enter PIN/i)
      fireEvent.change(pinInput, { target: { value: '123456' } })

      const confirmButton = screen.getByRole('button', { name: /Confirm/i })
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Failed to export transactions', 'error')
      })

      consoleSpy.mockRestore()
    })
  })

  describe('Filename generation', () => {
    it('includes start date in filename when provided', async () => {
      renderPage()

      const startDateInput = screen.getByLabelText(/Start Date/i)
      fireEvent.change(startDateInput, { target: { value: '2025-01-01' } })

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(screen.getByText('Confirm Export')).toBeInTheDocument()
      })

      const pinInput = screen.getByLabelText(/Enter PIN/i)
      fireEvent.change(pinInput, { target: { value: '123456' } })

      const confirmButton = screen.getByRole('button', { name: /Confirm/i })
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockDownloadCSV).toHaveBeenCalledWith(
          expect.any(String),
          expect.stringContaining('2025-01-01')
        )
      })
    })

    it('includes end date in filename when provided', async () => {
      renderPage()

      const endDateInput = screen.getByLabelText(/End Date/i)
      fireEvent.change(endDateInput, { target: { value: '2025-01-31' } })

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(screen.getByText('Confirm Export')).toBeInTheDocument()
      })

      const pinInput = screen.getByLabelText(/Enter PIN/i)
      fireEvent.change(pinInput, { target: { value: '123456' } })

      const confirmButton = screen.getByRole('button', { name: /Confirm/i })
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockDownloadCSV).toHaveBeenCalledWith(
          expect.any(String),
          expect.stringContaining('2025-01-31')
        )
      })
    })
  })
})
