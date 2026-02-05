import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renameOpfsFile, uploadFileWithName } from '../../../../services/export/opfsUtils'

describe('opfsUtils', () => {
  let mockGetDirectory: ReturnType<typeof vi.fn>
  let mockDirectoryHandle: {
    getFileHandle: ReturnType<typeof vi.fn>
    removeEntry: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDirectoryHandle = {
      getFileHandle: vi.fn(),
      removeEntry: vi.fn().mockResolvedValue(undefined),
    }
    mockGetDirectory = vi.fn().mockResolvedValue(mockDirectoryHandle)
    Object.defineProperty(navigator, 'storage', {
      value: { getDirectory: mockGetDirectory },
      writable: true,
      configurable: true,
    })
  })

  describe('renameOpfsFile', () => {
    it('copies file content to new name and deletes old file', async () => {
      const oldContent = new ArrayBuffer(8)
      const mockOldFile = { arrayBuffer: vi.fn().mockResolvedValue(oldContent) }
      const mockOldHandle = { getFile: vi.fn().mockResolvedValue(mockOldFile) }

      const mockWritable = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }
      const mockNewHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      }

      mockDirectoryHandle.getFileHandle
        .mockResolvedValueOnce(mockOldHandle) // First call for old file
        .mockResolvedValueOnce(mockNewHandle) // Second call for new file with create: true

      await renameOpfsFile('old.db', 'new.db')

      expect(mockDirectoryHandle.getFileHandle).toHaveBeenCalledWith('old.db')
      expect(mockDirectoryHandle.getFileHandle).toHaveBeenCalledWith('new.db', { create: true })
      expect(mockOldHandle.getFile).toHaveBeenCalled()
      expect(mockOldFile.arrayBuffer).toHaveBeenCalled()
      expect(mockNewHandle.createWritable).toHaveBeenCalled()
      expect(mockWritable.write).toHaveBeenCalledWith(oldContent)
      expect(mockWritable.close).toHaveBeenCalled()
      expect(mockDirectoryHandle.removeEntry).toHaveBeenCalledWith('old.db')
    })

    it('throws error if source file does not exist', async () => {
      mockDirectoryHandle.getFileHandle.mockRejectedValue(new Error('File not found'))

      await expect(renameOpfsFile('nonexistent.db', 'new.db')).rejects.toThrow('File not found')
    })
  })

  describe('uploadFileWithName', () => {
    // Create a mock File with arrayBuffer method
    const createMockFile = (content: ArrayBuffer, name: string) => {
      return {
        name,
        arrayBuffer: vi.fn().mockResolvedValue(content),
      } as unknown as File
    }

    it('uploads file with custom name to OPFS', async () => {
      const fileContent = new ArrayBuffer(16)
      const mockFile = createMockFile(fileContent, 'original.db')

      const mockWritable = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }
      const mockFileHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      }

      mockDirectoryHandle.getFileHandle.mockResolvedValue(mockFileHandle)

      await uploadFileWithName(mockFile, 'custom-name.db')

      expect(mockDirectoryHandle.getFileHandle).toHaveBeenCalledWith('custom-name.db', { create: true })
      expect(mockFileHandle.createWritable).toHaveBeenCalled()
      expect(mockWritable.write).toHaveBeenCalledWith(fileContent)
      expect(mockWritable.close).toHaveBeenCalled()
    })

    it('creates file if it does not exist', async () => {
      const fileContent = new ArrayBuffer(7)
      const mockFile = createMockFile(fileContent, 'test.db')

      const mockWritable = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }
      const mockFileHandle = {
        createWritable: vi.fn().mockResolvedValue(mockWritable),
      }

      mockDirectoryHandle.getFileHandle.mockResolvedValue(mockFileHandle)

      await uploadFileWithName(mockFile, 'new-file.db')

      expect(mockDirectoryHandle.getFileHandle).toHaveBeenCalledWith('new-file.db', { create: true })
    })
  })
})
