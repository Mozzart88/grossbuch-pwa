import { beforeAll, expect, it } from 'vitest'
import initPlain from 'sql.js'
import { loadSqlcipher, mainKey, sharedKey, seedEvidence, rawRows, readCipherFile } from '../helpers/sqlcipher'

let cipher: any
let plain: any
beforeAll(async () => {
  cipher = await loadSqlcipher()
  plain = await initPlain()
})

it('exports every keyed schema with raw records, objects and explicit metadata readable by ordinary SQLite', () => {
  const db = new cipher.oo1.DB('/capability-main', 'c')
  try {
    db.exec(`PRAGMA key="x'${mainKey}'";
      ATTACH '/capability-shared' AS shared KEY "x'${sharedKey}'";
      ATTACH '/capability-active' AS workspace KEY "x'${sharedKey}'";
      ATTACH '/capability-inactive' AS export_source KEY "x'${sharedKey}'";`)
    for (const [i, schema] of ['main', 'shared', 'workspace', 'export_source'].entries()) {
      seedEvidence(db, schema, i + 10)
      const before = readCipherFile(cipher, db, schema)
      expect(new TextDecoder().decode(before.slice(0, 16))).not.toBe('SQLite format 3\0')
      db.exec(`ATTACH '/capability-output-${i}' AS plaintext KEY ''; BEGIN`)
      const version = db.selectValue(`PRAGMA ${schema}.user_version`)
      const appId = db.selectValue(`PRAGMA ${schema}.application_id`)
      db.exec(`SELECT sqlcipher_export('plaintext','${schema}');
        PRAGMA plaintext.user_version=${version}; PRAGMA plaintext.application_id=${appId}; COMMIT;`)
      const result = new plain.Database(cipher.capi.sqlite3_js_db_export(db.pointer, 'plaintext'))
      expect(result.exec('SELECT * FROM lines ORDER BY id')[0].values).toEqual(rawRows)
      expect(result.exec('PRAGMA user_version')[0].values).toEqual([[i + 10]])
      expect(result.exec('PRAGMA application_id')[0].values).toEqual([[410 + i]])
      expect(result.exec('SELECT type,name FROM sqlite_master ORDER BY type,name')[0].values).toEqual([
        ['index', 'line_tag'], ['table', 'lines'], ['trigger', 'positive_id'], ['view', 'raw_lines'],
      ])
      result.close()
      db.exec('DETACH plaintext')
      expect(readCipherFile(cipher, db, schema)).toEqual(before)
    }
  } finally {
    db.close()
  }
})
