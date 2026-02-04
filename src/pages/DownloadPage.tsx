import { useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Button, Card, useToast } from '../components/ui'
import { downloadFile, uploadFile } from '../services/export/csvExport'

type opfsList = { name: string, handle: FileSystemFileHandle }[]

export function DownloadPage() {
  const { showToast } = useToast()
  const [files, setFiles] = useState<opfsList>([])


  useEffect(() => {
    navigator.storage.getDirectory()
      .then(async (d) => {
        const files: opfsList = []
        // @ts-expect-error OPFS entries() returns AsyncIterableIterator but TS types are incomplete
        for await (const [name, handle] of d.entries()) {
          files.push({ name, handle })
        }
        setFiles(files)
      })
  }, [])

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
    } catch (error) {
      console.error('Failed to remove DB File:', error)
      showToast('Failed to remove DB file', 'error')
    }
  }

  const fileSystemFallback = () => {
    return new Promise<File>((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.db,.sqlite'
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

  const handleUpload = async () => {
    try {
      let file
      if ('showOpenFilePicker' in window) {
        const [handle] = await window.showOpenFilePicker({ multiple: false })
        file = await handle.getFile()
      } else {
        file = await fileSystemFallback()
      }
      await uploadFile(file)
      showToast('Download successful', 'success')
    } catch (error) {
      console.error('Failed to download:', error)
      showToast('Failed to download DB file', 'error')
    }
  }
  return (
    <div>
      <PageHeader title="Download Raw Sqlite DB" showBack />

      <div className="p-4 space-y-3">
        {files.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>Now DataBase Files yet</p>
            <p className="text-sm mt-1">Add your first account to get started</p>
          </div>
        ) : (
          files.map((entry) => (
            <Card key={entry.name + "sqlite-file"} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{entry.name}</p>
                </div>
                <div className="text-right">
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleDownload(entry.name, entry.handle)}
                      className="text-xs text-primary-600 dark:text-primary-400"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => handleDelete(entry.name, entry.handle)}
                      className="text-xs text-red-600 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
        <Card className='py-2'>
          <div className='flex justify-center items-center'>
            <Button
              onClick={() => handleUpload()}
              type='button'
              variant='ghost'
            >
              Upload DB file
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
