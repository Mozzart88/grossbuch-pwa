import { querySQL, queryOne, execSQL } from '../database'

export interface LinkedDevice {
  id: string
  name: string
  public_key: string
  linked_at: number
  workspace_scope: string | null
}

export const linkedDeviceRepository = {
  async findAll(): Promise<LinkedDevice[]> {
    return querySQL<LinkedDevice>('SELECT * FROM linked_device ORDER BY linked_at ASC')
  },

  async findById(id: string): Promise<LinkedDevice | null> {
    return queryOne<LinkedDevice>('SELECT * FROM linked_device WHERE id = ?', [id])
  },

  async upsert(id: string, publicKey: string, name?: string): Promise<void> {
    if (name !== undefined) {
      await execSQL(
        `INSERT INTO linked_device (id, name, public_key) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key, name = excluded.name`,
        [id, name, publicKey]
      )
    } else {
      await execSQL(
        `INSERT INTO linked_device (id, public_key) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET public_key = excluded.public_key`,
        [id, publicKey]
      )
    }
  },

  async remove(id: string): Promise<void> {
    await execSQL('DELETE FROM linked_device WHERE id = ?', [id])
  },

  async removeAll(): Promise<void> {
    await execSQL('DELETE FROM linked_device')
  },
}
