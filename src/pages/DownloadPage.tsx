import { useEffect, useState, useCallback } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, useToast, DropdownMenu, PinPromptModal, TextInputModal } from '../components/ui'
import type { DropdownMenuItem } from '../components/ui'
import { downloadFile } from '../services/export/csvExport'
import { renameOpfsFile, uploadFileWithName } from '../services/export/opfsUtils'
import { exportDecryptedDatabase } from '../services/database/connection'
import { deriveEncryptionKey } from '../services/auth/crypto'
import { AUTH_STORAGE_KEYS } from '../types/auth'

type OpfsList = { name: string, handle: FileSystemFileHandle }[]

export function DownloadPage() {
  const { showToast } = useToast()
  const [files, setFiles] = useState<OpfsList>([])

  // Modal states
  const [pinPromptModal, setPinPromptModal] = useState<{
    isOpen: boolean
    filename: string
    fileHandle: FileSystemFileHandle | null
  }>({ isOpen: false, filename: '', fileHandle: null })

  const [renameModal, setRenameModal] = useState<{
    isOpen: boolean
    oldName: string
  }>({ isOpen: false, oldName: '' })

  const [uploadFilenameModal, setUploadFilenameModal] = useState<{
    isOpen: boolean
    file: File | null
  }>({ isOpen: false, file: null })

  const refreshFileList = useCallback(async () => {
    const d = await navigator.storage.getDirectory()
    const fileList: OpfsList = []
    // @ts-expect-error OPFS entries() returns AsyncIterableIterator but TS types are incomplete
    for await (const [name, handle] of d.entries()) {
      fileList.push({ name, handle })
    }
    setFiles(fileList)
  }, [])

  useEffect(() => {
    refreshFileList()
  }, [refreshFileList])

  const handleDownload = async (filename: string, fileHandler: FileSystemFileHandle) => {
    try {
      const file = await fileHandler.getFile()
      downloadFile(file, filename)
      showToast('Download successful', 'success')
    } catch (error) {
      console.error('Failed to download:', error)
      showToast('Failed to download DB file', 'error')
    }
  }

  const handleDownloadDecrypted = async (pin: string) => {
    if (!pinPromptModal.filename) return

    // Get PBKDF2 salt from localStorage
    const saltHex = localStorage.getItem(AUTH_STORAGE_KEYS.PBKDF2_SALT)
    if (!saltHex) {
      throw new Error('Encryption salt not found')
    }

    // Derive key from PIN
    const { key } = await deriveEncryptionKey(pin, saltHex)

    // Export decrypted database
    const decryptedData = await exportDecryptedDatabase(
      '/' + pinPromptModal.filename,
      key
    )

    // Create blob and download
    const blob = new Blob([decryptedData], { type: 'application/x-sqlite3' })
    const decryptedFilename = pinPromptModal.filename.replace('.sqlite3', '-decrypted.sqlite3')
    downloadFile(blob, decryptedFilename)

    showToast('Decrypted export successful', 'success')
  }

  const handleDelete = async (filename: string, fileHandler: FileSystemFileHandle) => {
    try {
      if ('remove' in fileHandler) {
        // @ts-expect-error FileSystemFileHandle.remove() is not in TS types yet
        await fileHandler.remove()
      } else {
        const d = await navigator.storage.getDirectory()
        await d.removeEntry(filename)
      }
      showToast('DB File removed', 'success')
      refreshFileList()
    } catch (error) {
      console.error('Failed to remove DB File:', error)
      showToast('Failed to remove DB file', 'error')
    }
  }

  const handleRename = async (newName: string) => {
    try {
      await renameOpfsFile(renameModal.oldName, newName)
      showToast('File renamed successfully', 'success')
      refreshFileList()
    } catch (error) {
      console.error('Failed to rename file:', error)
      throw new Error('Failed to rename file')
    }
  }

  const handleUploadWithName = async (customName: string) => {
    if (!uploadFilenameModal.file) return

    try {
      await uploadFileWithName(uploadFilenameModal.file, customName)
      showToast('Upload successful', 'success')
      refreshFileList()
    } catch (error) {
      console.error('Failed to upload:', error)
      throw new Error('Failed to upload file')
    }
  }

  const fileSystemFallback = () => {
    return new Promise<File>((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.db,.sqlite,.sqlite3'
      input.onchange = () => {
        const file = input.files?.[0]
        if (file) {
          resolve(file)
        } else {
          reject('file not selected')
        }
      }
      input.click()
    })
  }

  const openUploadPicker = async () => {
    try {
      let file: File
      if ('showOpenFilePicker' in window) {
        const [handle] = await window.showOpenFilePicker({ multiple: false })
        file = await handle.getFile()
      } else {
        file = await fileSystemFallback()
      }
      // Show modal to set custom filename
      setUploadFilenameModal({ isOpen: true, file })
    } catch (error) {
      // User cancelled file picker
      if (error !== 'file not selected') {
        console.error('Failed to select file:', error)
        showToast('Failed to select file', 'error')
      }
    }
  }

  const getFileMenuItems = (entry: OpfsList[0]): DropdownMenuItem[] => {
    const items: DropdownMenuItem[] = [
      {
        label: 'Download',
        onClick: () => handleDownload(entry.name, entry.handle)
      },
      {
        label: 'Download Decrypted',
        onClick: () => setPinPromptModal({
          isOpen: true,
          filename: entry.name,
          fileHandle: entry.handle
        })
      },
      {
        label: 'Rename',
        onClick: () => setRenameModal({ isOpen: true, oldName: entry.name })
      },
      {
        label: 'Delete',
        variant: 'danger',
        onClick: () => handleDelete(entry.name, entry.handle)
      }
    ]
    return items
  }

  return (
    <div>
      <PageHeader title="Download Raw Sqlite DB" showBack />

      <div className="p-4 space-y-3">
        {files.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>No Database Files yet</p>
            <p className="text-sm mt-1">Upload a database file to get started</p>
          </div>
        ) : (
          files.map((entry) => (
            <Card key={entry.name + "sqlite-file"} className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {entry.name}
                  </p>
                </div>
                <div className="ml-4">
                  <DropdownMenu items={getFileMenuItems(entry)} />
                </div>
              </div>
            </Card>
          ))
        )}
        <Card className='py-2'>
          <div className='flex justify-center items-center'>
            <Button
              onClick={openUploadPicker}
              type='button'
              variant='ghost'
            >
              Upload DB file
            </Button>
          </div>
        </Card>
      </div>

      {/* PIN Prompt Modal for Decrypted Export */}
      <PinPromptModal
        isOpen={pinPromptModal.isOpen}
        onClose={() => setPinPromptModal({ isOpen: false, filename: '', fileHandle: null })}
        onSubmit={handleDownloadDecrypted}
        title="Enter PIN to Decrypt"
        description="Enter your PIN to export a decrypted copy of the database. The exported file will be readable without a PIN."
      />

      {/* Rename Modal */}
      <TextInputModal
        isOpen={renameModal.isOpen}
        onClose={() => setRenameModal({ isOpen: false, oldName: '' })}
        onSubmit={handleRename}
        title="Rename File"
        label="New filename"
        initialValue={renameModal.oldName}
        submitLabel="Rename"
        placeholder="Enter new filename"
      />

      {/* Upload Filename Modal */}
      <TextInputModal
        isOpen={uploadFilenameModal.isOpen}
        onClose={() => setUploadFilenameModal({ isOpen: false, file: null })}
        onSubmit={handleUploadWithName}
        title="Upload File"
        label="Save as"
        initialValue={uploadFilenameModal.file?.name || ''}
        submitLabel="Upload"
        placeholder="Enter filename"
      />
    </div>
  )
}
