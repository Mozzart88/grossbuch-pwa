const output = document.querySelector('#results')
const button = document.querySelector('#run')
const log = message => { output.textContent += `${message}\n` }
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const mainKey = '11'.repeat(32)
const sharedKey = '22'.repeat(32)
const expectedRows = [[11,-123,45,999,98765],[12,-123,45,999,98765]]
button.onclick = async () => {
  button.disabled = true
  output.textContent = ''
  const report = { at: new Date().toISOString(), agent: navigator.userAgent, standalone: matchMedia('(display-mode: standalone)').matches, checks: [] }
  let worker
  try {
    assert(crossOriginIsolated, 'Cross-origin isolation is required')
    log(`Standalone PWA: ${report.standalone}`)
    const root = await navigator.storage.getDirectory()
    const existing = []
    for await (const name of root.keys()) existing.push(name)
    assert(existing.length === 0, 'This origin already has OPFS files. Refusing to touch them; use a fresh port/origin.')
    await root.getFileHandle('main.db', {create:true})
    const SQL = await window.initSqlJs({locateFile: name => '/' + name})
    worker = new Worker(window.productionWorker, {type:'module'})
    let nextId = 0
    const pending = new Map()
    worker.onmessage = ({data}) => { pending.get(data.id)(data); pending.delete(data.id) }
    worker.onerror = error => { log(`Worker error: ${error.message}`) }
    const request = (type, options={}) => new Promise(resolve => {
      const id = ++nextId
      pending.set(id, resolve)
      worker.postMessage({id,type,...options})
    })
    const success = async (type, options={}) => {
      const result = await request(type, options)
      assert(result.success, `${type}: ${result.error}`)
      return result.data
    }
    const exec = sql => success('exec',{sql})
    const query = sql => success('query',{sql})
    const seed = async (schema, marker) => exec(`
      CREATE TABLE ${schema}.lines(id INTEGER PRIMARY KEY, amount INTEGER, fraction INTEGER, tag_id INTEGER, balance INTEGER);
      INSERT INTO ${schema}.lines VALUES(11,-123,45,999,98765),(12,-123,45,999,98765);
      CREATE INDEX ${schema}.line_tag ON lines(tag_id);
      CREATE VIEW ${schema}.raw_lines AS SELECT * FROM lines;
      CREATE TRIGGER ${schema}.positive_id BEFORE INSERT ON lines WHEN NEW.id<0 BEGIN SELECT RAISE(ABORT,'negative id'); END;
      PRAGMA ${schema}.user_version=${marker}; PRAGMA ${schema}.application_id=${400+marker};
    `)
    const sources = [
      ['main.db', {kind:'main'}, mainKey, 10],
      ['shared.db', {kind:'shared'}, sharedKey, 11],
      ['workspace-1.db', {kind:'workspace',workspaceId:1}, sharedKey, 12],
      ['workspace-2.db', {kind:'workspace',workspaceId:2}, sharedKey, 13],
      ['expense-tracker.sqlite3', {kind:'legacy'}, mainKey, 14],
    ]
    await success('init_encrypted',{key:mainKey})
    await seed('main',10)
    for (const [filename,,key,marker] of sources.slice(1)) {
      const schema = filename === 'shared.db' ? 'shared' : filename === 'workspace-1.db' ? 'workspace' : 'seed'
      await success('attach',{schema,filename:'/'+filename,key})
      await seed(schema,marker)
      if (schema === 'shared') await exec('CREATE TABLE shared.workspace(id INTEGER PRIMARY KEY); INSERT INTO shared.workspace VALUES(1),(2)')
      if (schema === 'seed') await success('detach',{schema})
    }
    await exec('CREATE TEMP VIEW visible_lines AS SELECT * FROM workspace.lines')
    const session = await success('export_session')
    const digest = async name => {
      const bytes = await (await (await root.getFileHandle(name)).getFile()).arrayBuffer()
      assert(new TextDecoder().decode(bytes.slice(0,16)) !== 'SQLite format 3\0', `${name} is not encrypted`)
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).join(',')
    }
    const hashes = new Map()
    for (const [name] of sources) hashes.set(name, await digest(name))
    const clean = async () => {
      for await (const name of root.keys()) assert(!name.startsWith('export-decrypted-'), `Temporary file remains: ${name}`)
      const names = (await query('PRAGMA database_list')).map(row=>row.name)
      assert(JSON.stringify(names)===JSON.stringify(['main','temp','shared','workspace']), 'Topology changed')
      assert((await query('SELECT count(*) AS n FROM visible_lines'))[0].n===2, 'Live TEMP view is broken')
    }
    for (const [name,source,key,version] of sources) {
      const bytes = await success('export_decrypted',{exportRequest:{source,key,session}})
      const db = new SQL.Database(new Uint8Array(bytes))
      assert(JSON.stringify(db.exec('SELECT * FROM lines ORDER BY id')[0].values)===JSON.stringify(expectedRows), `${name}: raw rows changed`)
      assert(db.exec('PRAGMA user_version')[0].values[0][0]===version, `${name}: user_version changed`)
      assert(db.exec('PRAGMA application_id')[0].values[0][0]===400+version, `${name}: application_id changed`)
      assert(db.exec("SELECT name FROM sqlite_master WHERE name='visible_lines'").length===0, 'TEMP view copied')
      assert(db.exec("SELECT count(*) FROM sqlite_master WHERE type IN ('index','trigger','view')")[0].values[0][0]===3, 'Schema objects missing')
      db.close()
      const saved = await fetch('/result/'+name.replace(/(\.[^.]+)$/,'-decrypted$1'),{method:'POST',body:bytes})
      assert(saved.ok, 'Failed to save disposable output')
      await clean()
      for (const [filename] of sources) assert(await digest(filename)===hashes.get(filename), `${filename}: encrypted source bytes changed`)
      report.checks.push(`${name}: plaintext, metadata, raw rows, schema, source hashes, topology, cleanup PASS`)
      log(report.checks.at(-1))
    }
    const rejected = await request('export_decrypted',{exportRequest:{source:{kind:'workspace',workspaceId:2},key:mainKey,session}})
    assert(!rejected.success && !rejected.error.includes(mainKey), 'Wrong-key failure was not safe')
    await clean()
    await success('export_decrypted',{exportRequest:{source:{kind:'workspace',workspaceId:2},key:sharedKey,session}})
    await clean()
    report.checks.push('Recoverable wrong-key attachment failure and retry: PASS')
    log(report.checks.at(-1))
    const first = request('export_decrypted',{exportRequest:{source:{kind:'main'},key:mainKey,session}})
    const overlap = request('export_decrypted',{exportRequest:{source:{kind:'shared'},key:sharedKey,session}})
    const queued = query('SELECT count(*) AS n FROM visible_lines')
    assert((await first).success, 'First export failed')
    assert(/busy/i.test((await overlap).error), 'Overlap not rejected')
    assert((await queued)[0].n===2, 'Queued query failed')
    await clean()
    await exec('BEGIN; INSERT INTO workspace.lines VALUES(88,0,0,0,0)')
    const transaction = await request('export_decrypted',{exportRequest:{source:{kind:'main'},key:mainKey,session}})
    assert(/transaction/i.test(transaction.error), 'Existing transaction not rejected')
    assert((await query('SELECT count(*) AS n FROM workspace.lines WHERE id=88'))[0].n===1, 'Existing transaction altered')
    await exec('ROLLBACK')
    for (const [filename] of sources) assert(await digest(filename)===hashes.get(filename), `${filename}: source changed after recovery`)
    await exec('INSERT INTO workspace.lines VALUES(99,1,2,999,0)')
    assert((await query('SELECT amount FROM workspace.lines WHERE id=99'))[0].amount===1, 'Subsequent write failed')
    await exec('DELETE FROM workspace.lines WHERE id=99')
    await clean()
    report.checks.push('Overlap rejection, queued query, transaction ownership, subsequent read/write: PASS')
    log(report.checks.at(-1))
    await success('close')
    report.ok = true
    log('ALL CHECKS PASSED. Disposable fixtures retained only in this isolated test origin.')
  } catch (error) {
    report.ok = false
    report.error = String(error)
    log('FAIL: '+error)
  } finally {
    worker?.terminate()
    await fetch('/report',{method:'POST',body:JSON.stringify(report,null,2)})
  }
}
