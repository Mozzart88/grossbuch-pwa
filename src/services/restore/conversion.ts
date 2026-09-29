import type { OpfsDatabase } from '../../sqlite-wasm'
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`

// Compare storage values without rounding 64-bit financial integers through JS.
export function databaseContents(db: OpfsDatabase, schema = 'main'): string {
  if (!['main', 'restore_output'].includes(schema)) throw new Error('Invalid comparison schema')
  const objects = db.selectObjects(`SELECT type,name,tbl_name,sql FROM ${schema}.sqlite_master ORDER BY type,name`)
  const tables = db.selectObjects(`SELECT name FROM ${schema}.sqlite_master WHERE type='table' ORDER BY name`) as { name: string }[]
  const data = tables.map(({ name }) => {
    const columns = db.selectObjects(`PRAGMA ${schema}.table_info(${identifier(name)})`) as { name: string }[]
    const expressions = columns.map(column => {
      const c = identifier(column.name)
      return `typeof(${c}) || ':' || CASE WHEN typeof(${c}) IN ('text','blob') THEN hex(${c}) ELSE quote(${c}) END`
    })
    const rows = db.selectArrays(`SELECT ${expressions.join(',')} FROM ${schema}.${identifier(name)}`)
    return [name, rows.map(row => JSON.stringify(row)).sort()]
  })
  return JSON.stringify({ objects, data, version: db.selectValue(`PRAGMA ${schema}.user_version`), applicationId: db.selectValue(`PRAGMA ${schema}.application_id`) })
}
export async function encryptRestoreDatabase(source: OpfsDatabase, destination: string, key: string): Promise<void> {
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('Restore encryption key unavailable')
  const before = databaseContents(source)
  const version = Number(source.selectValue('PRAGMA user_version'))
  const applicationId = Number(source.selectValue('PRAGMA application_id'))
  let attached = false
  try {
    source.exec({ sql: 'ATTACH DATABASE ? AS restore_output KEY ?', bind: [destination, `x'${key}'`] })
    attached = true
    source.exec("SELECT sqlcipher_export('restore_output')")
    source.exec(`PRAGMA restore_output.user_version=${version}`)
    source.exec(`PRAGMA restore_output.application_id=${applicationId}`)
    if (databaseContents(source, 'restore_output') !== before) throw new Error('Encrypted output differs from source')
  } catch {
    throw new Error('Database encryption or content verification failed')
  } finally {
    if (attached) source.exec('DETACH DATABASE restore_output')
  }
}
