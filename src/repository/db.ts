
const dbMsgTypes = ['log', 'error', 'result'] as const
export type dbMsgType = (typeof dbMsgTypes)[number]

export type dbMsg = {
  type: dbMsgType
  payload: any
}

const dbRequestTypes = [
  'init',
  'select',
  'exec',
  'purge',
  'close',
] as const
export type dbRequestType = (typeof dbRequestTypes)[number]

export type dbRequestOptions = {
  cmd: dbRequestType
  query?: string
  values?: any[] | { [key: string]: any }
}

export default class DB {
  private _worker: Worker

  constructor() {
    this._worker = new Worker(new URL('../workers/sqlite.worker.ts', import.meta.url), { type: 'module' })
  }

  public async init(key: string) {
    if ((await this._dbRequest<boolean[]>({ cmd: 'init' }))[0] !== true)
      throw new Error('Fail to initiate DB')

    await this._dbRequest({
      cmd: 'exec',
      query: 'PRAGMA cipher_page_size = 4096'
    })
    return await this._dbRequest<string[]>({
      cmd: 'exec',
      query: `PRAGMA key = '${key}'`
    })
  }

  public close() {
    return this._dbRequest<boolean>({ cmd: 'close' })
  }

  public purge() {
    return this._dbRequest<boolean>({ cmd: 'purge' })
  }

  public exec<T>(query?: string, values?: any[] | { [key: string]: any }) {
    return this._dbRequest<T>({
      cmd: 'exec',
      query,
      values
    })
  }

  public select<T>(query: string, values?: any[] | { [key: string]: any }) {
    return this._dbRequest<T>({
      cmd: 'select',
      query,
      values
    })
  }

  private async _dbRequest<T>(opts: dbRequestOptions) {
    return new Promise((resolve, reject) => {
      this._worker.onmessage = (e) => {
        const { type, payload } = e.data as dbMsg
        switch (type) {
          case 'log': console.log(payload)
            break
          case 'error': reject(payload)
            break
          case 'result': resolve(payload)
            break
        }
      }
      this._worker.postMessage(opts)
    }) as Promise<T>
  }
  public static async readDBFile() {
    return navigator.storage.getDirectory()
      .then(dir => dir.getFileHandle('db.sqlite'))
      .then(file => file.getFile())
      .then(file => file.arrayBuffer())
      .then(buf => new TextDecoder().decode(buf.slice(0, 16)))
      .catch(console.error)
  }
}
