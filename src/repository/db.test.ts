import { describe, it, expect, beforeAll } from 'vitest'
import DB, { type dbRequestOptions } from './db'

describe('DB class test', _ => {

  beforeAll(_ => {
    class MockWorker {
      url: URL
      options: { [key: string]: any }
      onmessage: ((event: any) => void) | null = null

      constructor(url: URL, options?: any) {
        this.url = url
        this.options = options
      }

      postMessage(opts: dbRequestOptions) {
        let fakeResponse: { type: string, payload: any }
        const type: string = (() => {
          switch (opts.query) {
            case 'error':
            case 'log':
              return opts.query
            default:
              return 'result'
          }
        })()
        switch (opts.cmd) {
          case 'init':
            fakeResponse = { type, payload: [true] }
            break
          case 'exec':
            fakeResponse = { type, payload: 'exec' }
            break
          case 'select':
            fakeResponse = { type, payload: `select_${type}` }
            break
          case 'close':
            fakeResponse = { type, payload: true }
            break
          case 'purge':
            fakeResponse = { type, payload: true }
            break
        }
        setTimeout(() => {
          this.onmessage?.({ data: fakeResponse })
        }, 0)
      }
      terminate() { }
    }
    (globalThis as any).Worker = MockWorker as any
  })

  it('calls init method', async _ => {
    const db = new DB()
    expect(async () => await db.init('init_key')).not.toThrow()
  })

  it('calls exec method', async _ => {
    const db = new DB()
    await db.init('exec_key')
    const actual = await db.exec<string>('result')
    expect(actual).toBe('exec')
  })

  it('calls select method', async _ => {
    const db = new DB()
    await db.init('select_key')
    expect(await db.select('result')).toEqual('select_result')
    expect(async () => { await db.select('error') }).rejects.toThrow()
  })

  it('calls purge method', async _ => {
    const db = new DB()
    await db.init('purge_key')
    expect(await db.purge()).toEqual(true)
  })

  it('calls close method', async _ => {
    const db = new DB()
    await db.init('close_key')
    expect(await db.close()).toEqual(true)
  })
})
