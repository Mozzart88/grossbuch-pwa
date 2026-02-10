import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ImportPage } from '../../../pages/ImportPage'

// Mock import service
vi.mock('../../../services/import/csvImport', () => ({
  importTransactionsFromCSV: vi.fn(),
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

import { importTransactionsFromCSV } from '../../../services/import/csvImport'
import { verifyPin } from '../../../services/auth'
import type { ImportResult } from '../../../services/import/csvImport'

const mockImportTransactionsFromCSV = vi.mocked(importTransactionsFromCSV)
const mockVerifyPin = vi.mocked(verifyPin)

const makeSuccessResult = (overrides?: Partial<ImportResult>): ImportResult => ({
  totalRows: 2,
  importedRows: 2,
  skippedDuplicates: 0,
  createdWallets: [],
  createdAccounts: [],
  createdTags: [],
  createdCounterparties: [],
  errors: [],
  ...overrides,
})

describe('ImportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyPin.mockResolvedValue(undefined)
    mockImportTransactionsFromCSV.mockResolvedValue(makeSuccessResult())
  })

  const renderPage = () => {
    return render(
      <BrowserRouter>
        <ImportPage />
      </BrowserRouter>
    )
  }

  const createMockFile = (content: string, name: string) => {
    const file = new File([content], name, { type: 'text/csv' })
    // Polyfill text() for jsdom which may not have Blob.prototype.text
    file.text = () => Promise.resolve(content)
    return file
  }

  const selectFile = async (content = 'header\nrow1\nrow2', name = 'test.csv') => {
    const mockFile = createMockFile(content, name)
    const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement

    // Simulate file selection via onChange
    Object.defineProperty(hiddenInput, 'files', {
      value: [mockFile],
      writable: false,
      configurable: true,
    })
    fireEvent.change(hiddenInput)

    // Wait for file.text() promise to resolve and row count to update
    await waitFor(() => {
      expect(screen.getByText(name)).toBeInTheDocument()
    })

    return mockFile
  }

  const submitPin = async (pin = '123456') => {
    await waitFor(() => {
      expect(screen.getByText('Confirm Import')).toBeInTheDocument()
    })

    const pinInput = screen.getByLabelText(/Enter PIN/i)
    fireEvent.change(pinInput, { target: { value: pin } })

    const confirmButton = screen.getByRole('button', { name: /Confirm/i })
    fireEvent.click(confirmButton)
  }

  describe('Rendering', () => {
    it('renders page header', () => {
      renderPage()
      expect(screen.getByText('Import Data')).toBeInTheDocument()
    })

    it('renders import section title', () => {
      renderPage()
      expect(screen.getByText('Import Transactions')).toBeInTheDocument()
    })

    it('renders description text', () => {
      renderPage()
      expect(
        screen.getByText(/Import transactions from a CSV file exported by this app/)
      ).toBeInTheDocument()
    })

    it('renders Select CSV File button', () => {
      renderPage()
      expect(screen.getByRole('button', { name: /Select CSV File/i })).toBeInTheDocument()
    })

    it('renders Import button', () => {
      renderPage()
      expect(screen.getByRole('button', { name: /Import/i })).toBeInTheDocument()
    })

    it('renders Import button as disabled when no file selected', () => {
      renderPage()
      const importButton = screen.getByRole('button', { name: /^Import$/i })
      expect(importButton).toBeDisabled()
    })
  })

  describe('File selection via hidden input', () => {
    it('displays file name after selection', async () => {
      renderPage()
      await selectFile()

      expect(screen.getByText('test.csv')).toBeInTheDocument()
    })

    it('displays row count after selection', async () => {
      renderPage()
      await selectFile()

      // File has 1 header + 2 data rows = "2 data rows"
      expect(screen.getByText('2 data rows')).toBeInTheDocument()
    })

    it('enables Import button after file selected', async () => {
      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      expect(importButton).not.toBeDisabled()
    })

    it('counts rows correctly excluding header and empty lines', async () => {
      renderPage()
      await selectFile('header\nrow1\n\nrow2\n\n')

      await waitFor(() => {
        expect(screen.getByText('2 data rows')).toBeInTheDocument()
      })
    })
  })

  describe('Import button disabled without file', () => {
    it('Import button is disabled when no file is selected', () => {
      renderPage()
      const importButton = screen.getByRole('button', { name: /^Import$/i })
      expect(importButton).toBeDisabled()
    })
  })

  describe('PIN flow', () => {
    it('opens PIN modal when Import is clicked with a file selected', async () => {
      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)

      await waitFor(() => {
        expect(screen.getByText('Confirm Import')).toBeInTheDocument()
      })
      expect(screen.getByText('Enter your PIN to import transactions.')).toBeInTheDocument()
    })

    it('does not open PIN modal when Import is clicked without file', () => {
      renderPage()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)

      expect(screen.queryByText('Confirm Import')).not.toBeInTheDocument()
    })

    it('calls verifyPin and runs import after valid PIN', async () => {
      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)

      await submitPin('123456')

      await waitFor(() => {
        expect(mockVerifyPin).toHaveBeenCalledWith('123456')
      })

      await waitFor(() => {
        expect(mockImportTransactionsFromCSV).toHaveBeenCalled()
      })
    })

    it('closes PIN modal after successful PIN submission', async () => {
      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)

      await submitPin('123456')

      await waitFor(() => {
        expect(mockImportTransactionsFromCSV).toHaveBeenCalled()
      })
    })
  })

  describe('Success results', () => {
    it('shows import results card with totalRows, importedRows, skippedDuplicates', async () => {
      mockImportTransactionsFromCSV.mockResolvedValue(
        makeSuccessResult({
          totalRows: 10,
          importedRows: 8,
          skippedDuplicates: 2,
        })
      )

      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)

      await submitPin()

      await waitFor(() => {
        expect(screen.getByText('Import Results')).toBeInTheDocument()
      })

      expect(screen.getByText('Total rows:')).toBeInTheDocument()
      expect(screen.getByText('10')).toBeInTheDocument()
      expect(screen.getByText('Imported:')).toBeInTheDocument()
      expect(screen.getByText('8')).toBeInTheDocument()
      expect(screen.getByText('Skipped (duplicates):')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  describe('Results with auto-created entities', () => {
    it('shows created wallets', async () => {
      mockImportTransactionsFromCSV.mockResolvedValue(
        makeSuccessResult({
          createdWallets: ['Cash', 'Bank'],
        })
      )

      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)
      await submitPin()

      await waitFor(() => {
        expect(screen.getByText('Auto-created:')).toBeInTheDocument()
      })
      expect(screen.getByText('Wallets: Cash, Bank')).toBeInTheDocument()
    })

    it('shows created accounts', async () => {
      mockImportTransactionsFromCSV.mockResolvedValue(
        makeSuccessResult({
          createdAccounts: ['Savings', 'Checking'],
        })
      )

      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)
      await submitPin()

      await waitFor(() => {
        expect(screen.getByText('Auto-created:')).toBeInTheDocument()
      })
      expect(screen.getByText('Accounts: Savings, Checking')).toBeInTheDocument()
    })

    it('shows created tags', async () => {
      mockImportTransactionsFromCSV.mockResolvedValue(
        makeSuccessResult({
          createdTags: ['Food', 'Transport'],
        })
      )

      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)
      await submitPin()

      await waitFor(() => {
        expect(screen.getByText('Auto-created:')).toBeInTheDocument()
      })
      expect(screen.getByText('Tags: Food, Transport')).toBeInTheDocument()
    })

    it('shows created counterparties', async () => {
      mockImportTransactionsFromCSV.mockResolvedValue(
        makeSuccessResult({
          createdCounterparties: ['Amazon', 'Netflix'],
        })
      )

      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)
      await submitPin()

      await waitFor(() => {
        expect(screen.getByText('Auto-created:')).toBeInTheDocument()
      })
      expect(screen.getByText('Counterparties: Amazon, Netflix')).toBeInTheDocument()
    })

    it('shows all auto-created entity types together', async () => {
      mockImportTransactionsFromCSV.mockResolvedValue(
        makeSuccessResult({
          createdWallets: ['Cash'],
          createdAccounts: ['Savings'],
          createdTags: ['Food'],
          createdCounterparties: ['Amazon'],
        })
      )

      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)
      await submitPin()

      await waitFor(() => {
        expect(screen.getByText('Auto-created:')).toBeInTheDocument()
      })
      expect(screen.getByText('Wallets: Cash')).toBeInTheDocument()
      expect(screen.getByText('Accounts: Savings')).toBeInTheDocument()
      expect(screen.getByText('Tags: Food')).toBeInTheDocument()
      expect(screen.getByText('Counterparties: Amazon')).toBeInTheDocument()
    })

    it('does not show auto-created section when no entities were created', async () => {
      mockImportTransactionsFromCSV.mockResolvedValue(makeSuccessResult())

      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)
      await submitPin()

      await waitFor(() => {
        expect(screen.getByText('Import Results')).toBeInTheDocument()
      })
      expect(screen.queryByText('Auto-created:')).not.toBeInTheDocument()
    })
  })

  describe('Results with errors', () => {
    it('shows error list when import has errors', async () => {
      mockImportTransactionsFromCSV.mockResolvedValue(
        makeSuccessResult({
          importedRows: 1,
          errors: [
            { row: 3, message: 'Invalid amount' },
            { row: 7, message: 'Missing currency code' },
          ],
        })
      )

      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)
      await submitPin()

      await waitFor(() => {
        expect(screen.getByText('Errors (2):')).toBeInTheDocument()
      })
      expect(screen.getByText('Row 3: Invalid amount')).toBeInTheDocument()
      expect(screen.getByText('Row 7: Missing currency code')).toBeInTheDocument()
    })

    it('does not show error section when there are no errors', async () => {
      mockImportTransactionsFromCSV.mockResolvedValue(makeSuccessResult())

      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)
      await submitPin()

      await waitFor(() => {
        expect(screen.getByText('Import Results')).toBeInTheDocument()
      })
      expect(screen.queryByText(/Errors \(/)).not.toBeInTheDocument()
    })
  })

  describe('Toast notifications', () => {
    it('shows error toast when importTransactionsFromCSV throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockImportTransactionsFromCSV.mockRejectedValue(new Error('DB failure'))

      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)
      await submitPin()

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Failed to import transactions', 'error')
      })

      consoleSpy.mockRestore()
    })

    it('shows success toast when import has no errors', async () => {
      mockImportTransactionsFromCSV.mockResolvedValue(
        makeSuccessResult({ importedRows: 5 })
      )

      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)
      await submitPin()

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Imported 5 rows', 'success')
      })
    })

    it('shows error toast when import has errors', async () => {
      mockImportTransactionsFromCSV.mockResolvedValue(
        makeSuccessResult({
          importedRows: 3,
          errors: [
            { row: 2, message: 'Bad data' },
            { row: 5, message: 'Invalid field' },
          ],
        })
      )

      renderPage()
      await selectFile()

      const importButton = screen.getByRole('button', { name: /^Import$/i })
      fireEvent.click(importButton)
      await submitPin()

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          'Imported 3 rows with 2 errors',
          'error'
        )
      })
    })
  })
})
