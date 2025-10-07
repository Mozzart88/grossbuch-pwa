import sqlite3InitModule, { OpfsDatabase, type Sqlite3Static } from '../sqlite-wasm'

const log = (...args: any[]) => postMessage({ type: 'log', payload: args.join(' ') })
const error = (...args: any[]) => postMessage({ type: 'error', payload: args.join(' ') })
const result = (...args: any[]) => postMessage({ type: 'result', payload: args })


class DB {
  private static _instance?: DB
  private _db: Promise<OpfsDatabase>
  private static _dbFileName = 'db.sqlite'

  private constructor() {
    this._db = DB._init()
      .then(sqlite3 => {
        log('Worker initialized')
        return this._open(sqlite3, DB._dbFileName)
      })
  }

  private static async _init() {
    return sqlite3InitModule({
      print: log,
      printErr: error,
    })
  }

  private _open(sqlite3: Sqlite3Static, file: string) {
    try {
      if (sqlite3.oo1.OpfsDb) {
        log('OPFS is supported')
        return new sqlite3.oo1.OpfsDb(file)
      } else
        throw new Error('OPFS is not supported')
    } catch (err) {
      throw err
    }
  }

  static async import(sqlite3: Sqlite3Static) {
    const res = await fetch('/db.sqlite', { cache: 'no-cache' })
    if (!res.ok) {
      error(res.status)
      return false
    }
    try {
      const buff = await res.bytes()
      await sqlite3.oo1.OpfsDb.importDb(DB._dbFileName, buff)
      log('Data imported')
    } catch (err) {
      error(err)
      return false
    }
    return true
  }

  // @ts-ignore
  private static async _dbExists() {
    const dir = await navigator.storage.getDirectory()
    return dir.getFileHandle(DB._dbFileName, { create: false })
      .then(_ => true)
      .catch(_ => false)
  }

  static async removeDB() {
    if (DB._instance) {
      const db = await DB.instance.db
      db.close()
    }
    return navigator.storage.getDirectory()
      .then(dir => {
        dir.removeEntry(DB._dbFileName)
        return true
      })
  }

  private get db(): Promise<OpfsDatabase> {
    return DB.instance._db
  }

  public static get instance() {
    if (!DB._instance) {
      DB._instance = new DB()
    }

    return this._instance!
  }

  public static get ready() {
    return DB.instance.db.then(_ => true)
  }

  static async exec(query: string, values?: any[] | { [key: string]: any }) {
    const db = await DB.instance.db
    return db.exec({
      sql: query,
      bind: values,
      returnValue: 'resultRows',
    })
  }

  static async select(query: string, values?: any[] | { [key: string]: any }) {
    const db = await DB.instance.db
    return db.selectObjects(query, values)
  }

  static async close() {
    const db = await DB.instance.db
    db.close()
    return true
  }
}


const sqlCmds = [
  'init',
  'select',
  'exec',
  'purge',
  'close',
] as const
type sqlCmd = (typeof sqlCmds)[number]

type msg = {
  cmd: sqlCmd,
  query: string,
  values?: any[] | { [key: string]: any }
}

onmessage = (e) => {
  const { cmd, query, values } = e.data as msg
  try {
    switch (cmd) {
      case 'init':
        DB.ready
          .then(result)
          .catch(error)
        break
      case 'exec':
        DB.exec(query, values)
          .then(result)
          .catch(error)
        break
      case 'select':
        DB.select(query, values)
          .then(result)
          .catch(error)
        break
      case 'purge':
        DB.removeDB()
          .then(result)
          .catch(error)
        break
      case 'close':
        DB.close()
          .then(result)
          .catch(error)
    }
  } catch (err) {
    error(err)
  }
}
