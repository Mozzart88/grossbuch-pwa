import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import DB from './repository/db'

try {
  const db = new DB()
  console.log(await DB.readDBFile())

  await db.init('somekey')
  await db.exec<string[]>('create table if not exists test(id integer, msg text)')
  console.log(`Test table created`)
  await db.exec<string[]>(
    'insert into test values (1, ?), (2, ?), (3, ?)',
    [
      'hello',
      'encrypted',
      'world'
    ]
  )
  console.log(`Test table created`)
  let res = await db.select<[{ id: number, msg: string }]>(
    'select * from test'
  )
  console.log('Select query returns data:')
  console.log(res)
  res = await db.select<[{ id: number, msg: string }]>(
    'select * from test where msg = ?',
    ['hello']
  )
  console.log('Select query returns data:')
  console.log(res)
  res = await db.select<[{ id: number, msg: string }]>(
    'select uuid()'
  )
  console.log('Select uuid query returns data:')
  console.log(res)
  let r = await db.close()
  console.log(`Close db: ${r}`)
  console.log(await DB.readDBFile())
  r = await db.purge()
  console.log(`Purge: ${r}`)
} catch (err) {
  console.error('Somthing bad with worker: ' + err)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
