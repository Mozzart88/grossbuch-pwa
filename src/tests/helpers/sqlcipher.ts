import { readFileSync } from 'node:fs'
import init from '../../sqlite-wasm/sqlite-wasm/jswasm/sqlite3.mjs'

// The actual shipped WASM, using its default in-memory VFS. OPFS is verified
// separately in the browser; neither SQLCipher nor its SQL is mocked here.
export async function loadSqlcipher() {
  const bytes = readFileSync('src/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm')
  return init({ locateFile: () => `data:application/wasm;base64,${bytes.toString('base64')}` })
}

export const rawRows = [[11, -123, 45, 999, 98765], [12, -123, 45, 999, 98765]]
export const mainKey = '11'.repeat(32)
export const sharedKey = '22'.repeat(32)

export function seedEvidence(db: any, schema: string, marker: number) {
  db.exec(`
    CREATE TABLE ${schema}.lines(id INTEGER PRIMARY KEY, amount INTEGER, fraction INTEGER, tag_id INTEGER, balance INTEGER);
    INSERT INTO ${schema}.lines VALUES(11,-123,45,999,98765),(12,-123,45,999,98765);
    CREATE INDEX ${schema}.line_tag ON lines(tag_id);
    CREATE VIEW ${schema}.raw_lines AS SELECT * FROM lines;
    CREATE TRIGGER ${schema}.positive_id BEFORE INSERT ON lines WHEN NEW.id<0 BEGIN SELECT RAISE(ABORT,'negative id'); END;
    PRAGMA ${schema}.user_version=${marker};
    PRAGMA ${schema}.application_id=${400 + marker};
  `)
}

// Read actual VFS bytes rather than sqlite3_serialize's decrypted page cache.
export function readCipherFile(sqlite: any, db: any, schema = 'main'): Uint8Array {
  const { capi, wasm } = sqlite
  const scope = wasm.scopedAllocPush()
  try {
    const pp = wasm.scopedAlloc(8)
    if (capi.sqlite3_file_control(db.pointer, schema, capi.SQLITE_FCNTL_FILE_POINTER, pp)) {
      throw new Error('Cannot inspect fixture file')
    }
    const file = new capi.sqlite3_file(wasm.peekPtr(pp))
    const io = new capi.sqlite3_io_methods(file.$pMethods)
    if (wasm.functionEntry(io.$xFileSize)(file.pointer, pp)) throw new Error('File size failed')
    const size = Number(wasm.peek64(pp))
    const data = wasm.scopedAlloc(size)
    if (wasm.functionEntry(io.$xRead)(file.pointer, data, size, 0n)) throw new Error('Read failed')
    return wasm.heap8u().slice(data, data + size)
  } finally {
    wasm.scopedAllocPop(scope)
  }
}
