/**
 * Rename a file in OPFS (Origin Private File System)
 * OPFS has no native rename, so we copy content to new name and delete old
 */
export async function renameOpfsFile(oldName: string, newName: string): Promise<void> {
  const root = await navigator.storage.getDirectory()

  // Get old file handle and read content
  const oldHandle = await root.getFileHandle(oldName)
  const oldFile = await oldHandle.getFile()
  const content = await oldFile.arrayBuffer()

  // Create new file and write content
  const newHandle = await root.getFileHandle(newName, { create: true })
  const writable = await newHandle.createWritable()
  await writable.write(content)
  await writable.close()

  // Delete old file
  await root.removeEntry(oldName)
}

/**
 * Upload a file to OPFS with a custom name
 */
export async function uploadFileWithName(file: File, customName: string): Promise<void> {
  const root = await navigator.storage.getDirectory()
  const opfsFH = await root.getFileHandle(customName, { create: true })
  const writable = await opfsFH.createWritable()
  await writable.write(await file.arrayBuffer())
  await writable.close()
}
