import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { DownloadPage } from '../../../pages/DownloadPage'

// Mock dependencies
vi.mock('../../../services/export/csvExport', () => ({
  downloadFile: vi.fn(),
}))

vi.mock('../../../services/export/opfsUtils', () => ({
  renameOpfsFile: vi.fn(),
  uploadFileWithName: vi.fn(),
}))

vi.mock('../../../services/database/connection', () => ({
  exportDecryptedDatabase: vi.fn(),
}))

vi.mock('../../../services/auth/crypto', () => ({
  deriveEncryptionKey: vi.fn(),
}))

vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: mockShowToast }),
  }
})

import { downloadFile } from '../../../services/export/csvExport'
import { renameOpfsFile, uploadFileWithName } from '../../../services/export/opfsUtils'
import { exportDecryptedDatabase } from '../../../services/database/connection'
import { deriveEncryptionKey } from '../../../services/auth/crypto'

const mockDownloadFile = vi.mocked(downloadFile)
const mockRenameOpfsFile = vi.mocked(renameOpfsFile)
const mockUploadFileWithName = vi.mocked(uploadFileWithName)
const mockExportDecryptedDatabase = vi.mocked(exportDecryptedDatabase)
const mockDeriveEncryptionKey = vi.mocked(deriveEncryptionKey)
const mockShowToast = vi.fn()

// Mock FileSystemFileHandle
const createMockFileHandle = (name: string, content = 'test content') => ({
  name,
  getFile: vi.fn().mockResolvedValue(new File([content], name)),
  remove: vi.fn().mockResolvedValue(undefined),
})

// Mock FileSystemDirectoryHandle
const createMockDirectoryHandle = (entries: Array<[string, unknown]>) => ({
  entries: vi.fn().mockImplementation(async function* () {
    for (const entry of entries) {
      yield entry
    }
  }),
  removeEntry: vi.fn().mockResolvedValue(undefined),
  getFileHandle: vi.fn().mockImplementation(async (name: string, options?: { create?: boolean }) => {
    const existing = entries.find(([n]) => n === name)
    if (existing) return existing[1]
    if (options?.create) {
      const newHandle = createMockFileHandle(name)
      return newHandle
    }
    throw new Error('File not found')
  }),
})

// Helper to open dropdown menu and click an action
const openDropdownAndClick = async (actionLabel: string) => {
  // Find and click the dropdown trigger (three dots button)
  const dropdownTrigger = screen.getByRole('button', { expanded: false })
  fireEvent.click(dropdownTrigger)

  // Wait for menu to open and click the action
  await waitFor(() => {
    expect(screen.getByRole('menuitem', { name: actionLabel })).toBeInTheDocument()
  })
  fireEvent.click(screen.getByRole('menuitem', { name: actionLabel }))
}

describe('DownloadPage', () => {
  let mockGetDirectory: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetDirectory = vi.fn()
    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory: mockGetDirectory },
      writable: true,
      configurable: true,
    })
  })

  const renderWithRouter = () => {
    return render(
      <BrowserRouter>
        <DownloadPage />
      </BrowserRouter>
    )
  }

  it('displays page title', async () => {
    mockGetDirectory.mockResolvedValue(createMockDirectoryHandle([]))

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Download Raw Sqlite DB')).toBeInTheDocument()
    })
  })

  it('displays empty state when no files exist', async () => {
    mockGetDirectory.mockResolvedValue(createMockDirectoryHandle([]))

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('No Database Files yet')).toBeInTheDocument()
      expect(screen.getByText('Upload a database file to get started')).toBeInTheDocument()
    })
  })

  it('displays files from OPFS', async () => {
    const mockFileHandle = createMockFileHandle('test.db')
    mockGetDirectory.mockResolvedValue(
      createMockDirectoryHandle([['test.db', mockFileHandle]])
    )

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('test.db')).toBeInTheDocument()
    })
  })

  it('displays multiple files', async () => {
    const mockFileHandle1 = createMockFileHandle('database1.db')
    const mockFileHandle2 = createMockFileHandle('database2.db')
    mockGetDirectory.mockResolvedValue(
      createMockDirectoryHandle([
        ['database1.db', mockFileHandle1],
        ['database2.db', mockFileHandle2],
      ])
    )

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('database1.db')).toBeInTheDocument()
      expect(screen.getByText('database2.db')).toBeInTheDocument()
    })
  })

  it('displays dropdown menu for each file', async () => {
    const mockFileHandle = createMockFileHandle('test.db')
    mockGetDirectory.mockResolvedValue(
      createMockDirectoryHandle([['test.db', mockFileHandle]])
    )

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('test.db')).toBeInTheDocument()
    })

    // Click dropdown trigger
    const dropdownTrigger = screen.getByRole('button', { expanded: false })
    fireEvent.click(dropdownTrigger)

    // Verify menu items are visible
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Download' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Download Decrypted' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    })
  })

  describe('Download functionality', () => {
    it('downloads file when Download is clicked in dropdown', async () => {
      const mockFileHandle = createMockFileHandle('test.db', 'db content')
      mockGetDirectory.mockResolvedValue(
        createMockDirectoryHandle([['test.db', mockFileHandle]])
      )

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('test.db')).toBeInTheDocument()
      })

      await openDropdownAndClick('Download')

      await waitFor(() => {
        expect(mockFileHandle.getFile).toHaveBeenCalled()
        expect(mockDownloadFile).toHaveBeenCalledWith(
          expect.any(File),
          'test.db'
        )
        expect(mockShowToast).toHaveBeenCalledWith('Download successful', 'success')
      })
    })

    it('shows error toast when download fails', async () => {
      const mockFileHandle = createMockFileHandle('test.db')
      mockFileHandle.getFile.mockRejectedValue(new Error('File not found'))
      mockGetDirectory.mockResolvedValue(
        createMockDirectoryHandle([['test.db', mockFileHandle]])
      )

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('test.db')).toBeInTheDocument()
      })

      await openDropdownAndClick('Download')

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Failed to download DB file', 'error')
      })
    })
  })

  describe('Delete functionality', () => {
    it('deletes file using fileHandle.remove() when available', async () => {
      const mockFileHandle = createMockFileHandle('test.db')
      mockGetDirectory.mockResolvedValue(
        createMockDirectoryHandle([['test.db', mockFileHandle]])
      )

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('test.db')).toBeInTheDocument()
      })

      await openDropdownAndClick('Delete')

      await waitFor(() => {
        expect(mockFileHandle.remove).toHaveBeenCalled()
        expect(mockShowToast).toHaveBeenCalledWith('DB File removed', 'success')
      })
    })

    it('deletes file using directory.removeEntry() as fallback', async () => {
      const mockFileHandle = {
        name: 'test.db',
        getFile: vi.fn().mockResolvedValue(new File(['content'], 'test.db')),
        // No 'remove' method - simulating older browser
      }
      const mockDirectory = createMockDirectoryHandle([['test.db', mockFileHandle]])
      mockGetDirectory.mockResolvedValue(mockDirectory)

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('test.db')).toBeInTheDocument()
      })

      await openDropdownAndClick('Delete')

      await waitFor(() => {
        expect(mockDirectory.removeEntry).toHaveBeenCalledWith('test.db')
        expect(mockShowToast).toHaveBeenCalledWith('DB File removed', 'success')
      })
    })

    it('shows error toast when delete fails', async () => {
      const mockFileHandle = createMockFileHandle('test.db')
      mockFileHandle.remove.mockRejectedValue(new Error('Permission denied'))
      mockGetDirectory.mockResolvedValue(
        createMockDirectoryHandle([['test.db', mockFileHandle]])
      )

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('test.db')).toBeInTheDocument()
      })

      await openDropdownAndClick('Delete')

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Failed to remove DB file', 'error')
      })
    })
  })

  it('calls navigator.storage.getDirectory on mount', async () => {
    mockGetDirectory.mockResolvedValue(createMockDirectoryHandle([]))

    renderWithRouter()

    await waitFor(() => {
      expect(mockGetDirectory).toHaveBeenCalled()
    })
  })

  describe('Download Decrypted functionality', () => {
    it('opens PIN prompt when Download Decrypted is clicked', async () => {
      const mockFileHandle = createMockFileHandle('test.sqlite3')
      mockGetDirectory.mockResolvedValue(
        createMockDirectoryHandle([['test.sqlite3', mockFileHandle]])
      )

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('test.sqlite3')).toBeInTheDocument()
      })

      await openDropdownAndClick('Download Decrypted')

      await waitFor(() => {
        expect(screen.getByText('Enter PIN to Decrypt')).toBeInTheDocument()
      })
    })

    it('exports decrypted database when PIN is submitted', async () => {
      const mockFileHandle = createMockFileHandle('test.sqlite3')
      mockGetDirectory.mockResolvedValue(
        createMockDirectoryHandle([['test.sqlite3', mockFileHandle]])
      )

      // Setup mocks
      const mockSalt = 'abcd1234'
      localStorage.setItem('gb_pbkdf2_salt', mockSalt)
      mockDeriveEncryptionKey.mockResolvedValue({ key: 'derivedkey123', salt: mockSalt })
      mockExportDecryptedDatabase.mockResolvedValue(new ArrayBuffer(100))

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('test.sqlite3')).toBeInTheDocument()
      })

      await openDropdownAndClick('Download Decrypted')

      await waitFor(() => {
        expect(screen.getByText('Enter PIN to Decrypt')).toBeInTheDocument()
      })

      // Enter PIN and submit
      const pinInput = screen.getByLabelText('Enter PIN')
      fireEvent.change(pinInput, { target: { value: '123456' } })
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

      await waitFor(() => {
        expect(mockDeriveEncryptionKey).toHaveBeenCalledWith('123456', mockSalt)
        expect(mockExportDecryptedDatabase).toHaveBeenCalledWith('/test.sqlite3', 'derivedkey123')
        expect(mockDownloadFile).toHaveBeenCalled()
        expect(mockShowToast).toHaveBeenCalledWith('Decrypted export successful', 'success')
      })

      // Cleanup
      localStorage.removeItem('gb_pbkdf2_salt')
    })

    it('throws error when salt is not found', async () => {
      const mockFileHandle = createMockFileHandle('test.sqlite3')
      mockGetDirectory.mockResolvedValue(
        createMockDirectoryHandle([['test.sqlite3', mockFileHandle]])
      )

      // Ensure no salt in localStorage
      localStorage.removeItem('gb_pbkdf2_salt')

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('test.sqlite3')).toBeInTheDocument()
      })

      await openDropdownAndClick('Download Decrypted')

      await waitFor(() => {
        expect(screen.getByText('Enter PIN to Decrypt')).toBeInTheDocument()
      })

      // Enter PIN and submit
      const pinInput = screen.getByLabelText('Enter PIN')
      fireEvent.change(pinInput, { target: { value: '123456' } })
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

      // Should show error in modal
      await waitFor(() => {
        expect(screen.getByText('Encryption salt not found')).toBeInTheDocument()
      })
    })
  })

  describe('Rename functionality', () => {
    it('opens rename modal when Rename is clicked', async () => {
      const mockFileHandle = createMockFileHandle('test.db')
      mockGetDirectory.mockResolvedValue(
        createMockDirectoryHandle([['test.db', mockFileHandle]])
      )

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('test.db')).toBeInTheDocument()
      })

      await openDropdownAndClick('Rename')

      await waitFor(() => {
        expect(screen.getByText('Rename File')).toBeInTheDocument()
        expect(screen.getByLabelText('New filename')).toHaveValue('test.db')
      })
    })

    it('renames file when new name is submitted', async () => {
      const mockFileHandle = createMockFileHandle('old.db')
      mockGetDirectory.mockResolvedValue(
        createMockDirectoryHandle([['old.db', mockFileHandle]])
      )
      mockRenameOpfsFile.mockResolvedValue(undefined)

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('old.db')).toBeInTheDocument()
      })

      await openDropdownAndClick('Rename')

      await waitFor(() => {
        expect(screen.getByText('Rename File')).toBeInTheDocument()
      })

      // Change filename and submit
      const input = screen.getByLabelText('New filename')
      fireEvent.change(input, { target: { value: 'new.db' } })
      fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

      await waitFor(() => {
        expect(mockRenameOpfsFile).toHaveBeenCalledWith('old.db', 'new.db')
        expect(mockShowToast).toHaveBeenCalledWith('File renamed successfully', 'success')
      })
    })

    it('shows error when rename fails', async () => {
      const mockFileHandle = createMockFileHandle('old.db')
      mockGetDirectory.mockResolvedValue(
        createMockDirectoryHandle([['old.db', mockFileHandle]])
      )
      mockRenameOpfsFile.mockRejectedValue(new Error('Rename failed'))

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('old.db')).toBeInTheDocument()
      })

      await openDropdownAndClick('Rename')

      await waitFor(() => {
        expect(screen.getByText('Rename File')).toBeInTheDocument()
      })

      // Change filename and submit
      const input = screen.getByLabelText('New filename')
      fireEvent.change(input, { target: { value: 'new.db' } })
      fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

      await waitFor(() => {
        expect(screen.getByText('Failed to rename file')).toBeInTheDocument()
      })
    })
  })

  describe('Upload functionality', () => {
    it('shows upload filename modal after selecting file', async () => {
      mockGetDirectory.mockResolvedValue(createMockDirectoryHandle([]))

      // Mock showOpenFilePicker
      const mockFile = new File(['content'], 'uploaded.db')
      const mockHandle = { getFile: vi.fn().mockResolvedValue(mockFile) }
      const mockShowOpenFilePicker = vi.fn().mockResolvedValue([mockHandle])
      Object.defineProperty(window, 'showOpenFilePicker', {
        value: mockShowOpenFilePicker,
        writable: true,
        configurable: true,
      })

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Upload DB file')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Upload DB file'))

      await waitFor(() => {
        expect(mockShowOpenFilePicker).toHaveBeenCalled()
        expect(screen.getByText('Upload File')).toBeInTheDocument()
        expect(screen.getByLabelText('Save as')).toHaveValue('uploaded.db')
      })
    })

    it('uploads file with custom name', async () => {
      mockGetDirectory.mockResolvedValue(createMockDirectoryHandle([]))
      mockUploadFileWithName.mockResolvedValue(undefined)

      // Mock showOpenFilePicker
      const mockFile = new File(['content'], 'original.db')
      const mockHandle = { getFile: vi.fn().mockResolvedValue(mockFile) }
      const mockShowOpenFilePicker = vi.fn().mockResolvedValue([mockHandle])
      Object.defineProperty(window, 'showOpenFilePicker', {
        value: mockShowOpenFilePicker,
        writable: true,
        configurable: true,
      })

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Upload DB file')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Upload DB file'))

      await waitFor(() => {
        expect(screen.getByText('Upload File')).toBeInTheDocument()
      })

      // Change filename and submit
      const input = screen.getByLabelText('Save as')
      fireEvent.change(input, { target: { value: 'custom-name.db' } })
      fireEvent.click(screen.getByRole('button', { name: 'Upload' }))

      await waitFor(() => {
        expect(mockUploadFileWithName).toHaveBeenCalledWith(mockFile, 'custom-name.db')
        expect(mockShowToast).toHaveBeenCalledWith('Upload successful', 'success')
      })
    })

    it('closes upload modal when cancel is clicked', async () => {
      mockGetDirectory.mockResolvedValue(createMockDirectoryHandle([]))

      // Mock showOpenFilePicker
      const mockFile = new File(['content'], 'test.db')
      const mockHandle = { getFile: vi.fn().mockResolvedValue(mockFile) }
      const mockShowOpenFilePicker = vi.fn().mockResolvedValue([mockHandle])
      Object.defineProperty(window, 'showOpenFilePicker', {
        value: mockShowOpenFilePicker,
        writable: true,
        configurable: true,
      })

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Upload DB file')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Upload DB file'))

      await waitFor(() => {
        expect(screen.getByText('Upload File')).toBeInTheDocument()
      })

      // Click cancel
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByText('Upload File')).not.toBeInTheDocument()
      })
    })

    it('handles file picker cancellation gracefully', async () => {
      mockGetDirectory.mockResolvedValue(createMockDirectoryHandle([]))

      // Mock showOpenFilePicker to throw (user cancelled)
      const mockShowOpenFilePicker = vi.fn().mockRejectedValue(new DOMException('User cancelled'))
      Object.defineProperty(window, 'showOpenFilePicker', {
        value: mockShowOpenFilePicker,
        writable: true,
        configurable: true,
      })

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Upload DB file')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Upload DB file'))

      // Modal should not open
      await waitFor(() => {
        expect(screen.queryByText('Upload File')).not.toBeInTheDocument()
      })
    })
  })
})
