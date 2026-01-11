import { useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, useToast } from '../components/ui'
import { downloadFile } from '../services/export/csvExport'

type opfsList = { name: string, handle: FileSystemFileHandle }[]

export function DownloadPage() {
  const { showToast } = useToast()
  const [files, setFiles] = useState<opfsList>([])


  useEffect(() => {
    navigator.storage.getDirectory()
      .then(async (d) => {
        const files: opfsList = []
        // @ts-ignore
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
        // @ts-ignore
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
      </div>
    </div>
  )
}
