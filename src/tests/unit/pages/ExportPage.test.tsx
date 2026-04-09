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
import { Account, Wallet } from '../../../types'

const mockExportTransactionsToCSV = vi.mocked(exportTransactionsToCSV)
const mockDownloadCSV = vi.mocked(downloadCSV)
const mockVerifyPin = vi.mocked(verifyPin)

const mockAccounts: Account[] = [
  {
    id: 1,
    wallet_id: 1,
    currency_id: 1,
    balance: 100,
    updated_at: 0,
    currency: 'USD',
  },
  {
    id: 2,
    wallet_id: 1,
    currency_id: 2,
    balance: 100,
    updated_at: 0,
    currency: 'EUR',
  },
  {
    id: 3,
    wallet_id: 2,
    currency_id: 1,
    balance: 100,
    updated_at: 0,
    currency: 'USD',
  },
  {
    id: 4,
    wallet_id: 3,
    currency_id: 2,
    balance: 100,
    updated_at: 0,
    currency: 'EUR',
  },
]

const mockWallets: Wallet[] = [
  {
    id: 1,
    name: 'Cash',
    color: '#fff',
    accounts: mockAccounts.filter(a => a.wallet_id == 1)
  },
  {
    id: 2,
    name: 'Bank',
    color: '#fff',
    accounts: mockAccounts.filter(a => a.wallet_id == 2)
  },
  {
    id: 3,
    name: 'Savings',
    color: '#fff',
    accounts: mockAccounts.filter(a => a.wallet_id == 3)
  },
]


describe('ExportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExportTransactionsToCSV.mockResolvedValue('header\ndata')
    mockVerifyPin.mockResolvedValue(undefined)
    vi.mocked(walletRepository.findAll).mockResolvedValue(mockWallets)
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

    it('should filter accounts by selected wallet', async () => {
      renderPage()

      const wallet = screen.getByText('Wallets')
      fireEvent.click(wallet)

      await waitFor(() => {
        expect(screen.getByText('Cash')).toBeInTheDocument()
      })
      const trigger = screen.getByText('Cash')
      fireEvent.click(trigger)
      const accounts = screen.getByText('Accounts')
      fireEvent.click(accounts)
      await waitFor(() => {
        expect(screen.getByText('Cash - USD')).toBeInTheDocument()

      })

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
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
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

  describe('branch coverage', () => {
    it('skips wallet without accounts property (branch[1][1])', async () => {
      // Wallet without accounts → if(w.accounts) false → branch[1][1]
      const walletNoAccounts = [{ id: 99, name: 'Empty Wallet', color: '#000' }] as any[]
      vi.mocked(walletRepository.findAll).mockResolvedValue(walletNoAccounts)
      renderPage()
      // Open the Wallets group to see options
      await waitFor(() => expect(screen.getByRole('button', { name: /Wallets/i })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: /Wallets/i }))
      await waitFor(() => expect(screen.getByLabelText('Empty Wallet')).toBeInTheDocument())
    })

    it('buildFilters with selected wallet/account/tag/counterparty IDs (branches [4][0],[5][0],[6][0],[7][0])', async () => {
      const mockTags = [{ id: 10, name: 'Food', sort_order: 1, is_income: false, is_system: false }]
      const mockCps = [{ id: 20, name: 'Amazon', note: null, tag_ids: [], sort_order: 1 }]
      vi.mocked(tagRepository.findAll).mockResolvedValue(mockTags as any)
      vi.mocked(counterpartyRepository.findAll).mockResolvedValue(mockCps as any)

      renderPage()
      await waitFor(() => expect(screen.getByRole('button', { name: /Wallets/i })).toBeInTheDocument())

      // Open and select wallet
      fireEvent.click(screen.getByRole('button', { name: /Wallets/i }))
      await waitFor(() => expect(screen.getByLabelText('Cash')).toBeInTheDocument())
      fireEvent.click(screen.getByLabelText('Cash'))

      // Open and select account (label format is "WalletName - Currency")
      fireEvent.click(screen.getByRole('button', { name: /Accounts/i }))
      await waitFor(() => expect(screen.getByLabelText('Cash - USD')).toBeInTheDocument())
      fireEvent.click(screen.getByLabelText('Cash - USD'))

      // Open and select tag
      fireEvent.click(screen.getByRole('button', { name: /Tags/i }))
      await waitFor(() => expect(screen.getByLabelText('Food')).toBeInTheDocument())
      fireEvent.click(screen.getByLabelText('Food'))

      // Open and select counterparty
      fireEvent.click(screen.getByRole('button', { name: /Counterparties/i }))
      await waitFor(() => expect(screen.getByLabelText('Amazon')).toBeInTheDocument())
      fireEvent.click(screen.getByLabelText('Amazon'))

      // Trigger export
      fireEvent.click(screen.getByRole('button', { name: /Export to CSV/i }))
      await waitFor(() => expect(screen.getByText('Confirm Export')).toBeInTheDocument())
      const pinInput = screen.getByLabelText(/Enter PIN/i)
      fireEvent.change(pinInput, { target: { value: '123456' } })
      fireEvent.click(screen.getByRole('button', { name: /Confirm/i }))

      await waitFor(() => {
        expect(mockExportTransactionsToCSV).toHaveBeenCalledWith(
          expect.objectContaining({
            walletIds: expect.arrayContaining([1]),
            tagIds: expect.arrayContaining([10]),
            counterpartyIds: expect.arrayContaining([20]),
          })
        )
      })
    })

    it('shows Exporting... while export runs (branch[11][0])', async () => {
      mockExportTransactionsToCSV.mockReturnValue(new Promise(() => {})) // never resolves
      renderPage()
      await waitFor(() => expect(screen.getByRole('button', { name: /Export to CSV/i })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: /Export to CSV/i }))
      await waitFor(() => expect(screen.getByText('Confirm Export')).toBeInTheDocument())
      const pinInput = screen.getByLabelText(/Enter PIN/i)
      fireEvent.change(pinInput, { target: { value: '123456' } })
      fireEvent.click(screen.getByRole('button', { name: /Confirm/i }))
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Exporting...' })).toBeInTheDocument()
      })
    })
  })
})
