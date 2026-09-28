// Run after npm run build. Serves the actual production worker on an isolated
// localhost origin; all fixtures are disposable and no existing OPFS is erased.
import { createServer } from 'node:http'
import { readFile, readdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'

const worker = (await readdir('dist/assets')).find(name => /^worker-.*\.js$/.test(name))
if (!worker) throw new Error('Run npm run build first')
const outputDir = await mkdtemp(join(tmpdir(), 'decrypted-export-probe-'))
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="manifest" href="/probe.webmanifest"><title>Export Verification</title><style>body{font:16px system-ui;margin:2rem;max-width:900px}pre{white-space:pre-wrap}button{font:inherit;padding:12px}</style><h1>Disposable export verification</h1><p>Tests the production worker in this origin's empty OPFS. Refuses to run if any files already exist.</p><button id="run">Run verification</button><pre id="results">Ready. Add this page to Dock to test Safari PWA mode, then run.</pre><script src="/sql-wasm.js"></script><script>window.productionWorker='/assets/${worker}'</script><script type="module" src="/probe.js"></script></html>`
const server = createServer(async (req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  res.setHeader('Cache-Control', 'no-store')
  const path = new URL(req.url, 'http://127.0.0.1').pathname
  try {
    if (req.method === 'POST' && /^\/result\/(main|shared|workspace-1|workspace-2|expense-tracker)-decrypted\.(db|sqlite3)$/.test(path)) {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      await writeFile(join(outputDir, basename(path)), Buffer.concat(chunks))
      res.end('saved')
      return
    }
    if (req.method === 'POST' && path === '/report') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      await writeFile(join(outputDir, 'report.json'), Buffer.concat(chunks))
      res.end('saved')
      return
    }
    if (path === '/' || path === '/probe.html') {
      res.setHeader('Content-Type', 'text/html')
      res.end(html)
      return
    }
    if (path === '/probe.webmanifest') {
      res.setHeader('Content-Type', 'application/manifest+json')
      res.end(JSON.stringify({name:'Export Verification',short_name:'Export Verify',start_url:'/probe.html',display:'standalone'}))
      return
    }
    let file
    if (path === '/probe.js') file = 'src/tests/browser/decryptedExportProbe.js'
    else if (path === '/sql-wasm.js' || path === '/sql-wasm.wasm') file = `node_modules/sql.js/dist${path}`
    else if (/^\/assets\/[^/]+$/.test(path)) file = `dist${path}`
    else { res.writeHead(404); res.end(); return }
    res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
    res.end(await readFile(file))
  } catch (error) { res.writeHead(500); res.end(String(error)) }
})
server.listen(4189, '127.0.0.1', () => {
  console.log('Probe: http://127.0.0.1:4189/probe.html')
  console.log(`Artifacts: ${outputDir}`)
  console.log(`Production worker: ${worker}`)
})
