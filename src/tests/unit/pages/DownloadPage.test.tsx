import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { DownloadPage } from '../../../pages/DownloadPage'

// Mock dependencies
vi.mock('../../../services/export/csvExport', () => ({
  downloadFile: vi.fn(),
}))

vi.mock('../../../components/ui', async () => {
  const actual = await vi.importActual('../../../components/ui')
  return {
    ...actual,
    useToast: () => ({ showToast: mockShowToast }),
  }
})

import { downloadFile } from '../../../services/export/csvExport'

const mockDownloadFile = vi.mocked(downloadFile)
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
})

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
      expect(screen.getByText('Now DataBase Files yet')).toBeInTheDocument()
      expect(screen.getByText('Add your first account to get started')).toBeInTheDocument()
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

  it('displays Download and Delete buttons for each file', async () => {
    const mockFileHandle = createMockFileHandle('test.db')
    mockGetDirectory.mockResolvedValue(
      createMockDirectoryHandle([['test.db', mockFileHandle]])
    )

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Download')).toBeInTheDocument()
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })
  })

  describe('Download functionality', () => {
    it('downloads file when Download button is clicked', async () => {
      const mockFileHandle = createMockFileHandle('test.db', 'db content')
      mockGetDirectory.mockResolvedValue(
        createMockDirectoryHandle([['test.db', mockFileHandle]])
      )

      renderWithRouter()

      await waitFor(() => {
        expect(screen.getByText('Download')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Download'))

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
        expect(screen.getByText('Download')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Download'))

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
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete'))

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
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete'))

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
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete'))

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
})
