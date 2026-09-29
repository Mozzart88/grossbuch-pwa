import { createRestoreSchemaReference } from './schemaReference'
import type { Sqlite3Static } from '../../sqlite-wasm'
import type { RestoreIO } from './engine'
export async function restoreWorkerIO(sqlite: Sqlite3Static): Promise<RestoreIO> {
  const root = await navigator.storage.getDirectory()
  return {
    reference: () => createRestoreSchemaReference(sqlite),
    async write(name, bytes) {
      const writer = await (await root.getFileHandle(name, { create: true })).createWritable()
      try { await writer.write(bytes as FileSystemWriteChunkType); await writer.close() }
      catch (error) { await writer.abort().catch(() => {}); throw error }
    },
    async read(name) { return new Uint8Array(await (await (await root.getFileHandle(name)).getFile()).arrayBuffer()) },
    async remove(name) {
      try { await root.removeEntry(name) }
      catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error }
    },
    open(name) { return new sqlite.oo1.OpfsDb('/' + name, 'w') },
  }
}
