import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ExportPage } from '../../../pages/ExportPage'

// Mock export services
vi.mock('../../../services/export/csvExport', () => ({
  exportTransactionsToCSV: vi.fn(),
  downloadCSV: vi.fn(),
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

const mockExportTransactionsToCSV = vi.mocked(exportTransactionsToCSV)
const mockDownloadCSV = vi.mocked(downloadCSV)

describe('ExportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExportTransactionsToCSV.mockResolvedValue('date,type,amount\n2025-01-09,expense,50')
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

    it('renders info text about leaving dates empty', () => {
      renderPage()

      expect(screen.getByText('Leave dates empty to export all transactions')).toBeInTheDocument()
    })
  })

  describe('Export functionality', () => {
    it('exports all transactions when no dates selected', async () => {
      renderPage()

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(mockExportTransactionsToCSV).toHaveBeenCalledWith(undefined, undefined)
      })
    })

    it('exports with start date when provided', async () => {
      renderPage()

      const startDateInput = screen.getByLabelText(/Start Date/i)
      fireEvent.change(startDateInput, { target: { value: '2025-01-01' } })

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(mockExportTransactionsToCSV).toHaveBeenCalledWith('2025-01-01', undefined)
      })
    })

    it('exports with end date when provided', async () => {
      renderPage()

      const endDateInput = screen.getByLabelText(/End Date/i)
      fireEvent.change(endDateInput, { target: { value: '2025-01-31' } })

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(mockExportTransactionsToCSV).toHaveBeenCalledWith(undefined, '2025-01-31')
      })
    })

    it('exports with both dates when provided', async () => {
      renderPage()

      const startDateInput = screen.getByLabelText(/Start Date/i)
      fireEvent.change(startDateInput, { target: { value: '2025-01-01' } })

      const endDateInput = screen.getByLabelText(/End Date/i)
      fireEvent.change(endDateInput, { target: { value: '2025-01-31' } })

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(mockExportTransactionsToCSV).toHaveBeenCalledWith('2025-01-01', '2025-01-31')
      })
    })

    it('calls downloadCSV with correct content and filename', async () => {
      renderPage()

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(mockDownloadCSV).toHaveBeenCalledWith(
          'date,type,amount\n2025-01-09,expense,50',
          expect.stringMatching(/transactions_all_all_\d{4}-\d{2}-\d{2}\.csv/)
        )
      })
    })

    it('shows success toast on export', async () => {
      renderPage()

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Export successful', 'success')
      })
    })

    it('shows Exporting... text while exporting', async () => {
      mockExportTransactionsToCSV.mockImplementation(() => new Promise(() => {}))

      renderPage()

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(screen.getByText('Exporting...')).toBeInTheDocument()
      })
    })

    it('disables button while exporting', async () => {
      mockExportTransactionsToCSV.mockImplementation(() => new Promise(() => {}))

      renderPage()

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Exporting/i })).toBeDisabled()
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
        expect(mockShowToast).toHaveBeenCalledWith('Failed to export transactions', 'error')
      })

      consoleSpy.mockRestore()
    })

    it('logs error on export failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockExportTransactionsToCSV.mockRejectedValue(new Error('Export failed'))

      renderPage()

      const exportButton = screen.getByRole('button', { name: /Export to CSV/i })
      fireEvent.click(exportButton)

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to export:', expect.any(Error))
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
        expect(mockDownloadCSV).toHaveBeenCalledWith(
          expect.any(String),
          expect.stringContaining('2025-01-31')
        )
      })
    })
  })
})
