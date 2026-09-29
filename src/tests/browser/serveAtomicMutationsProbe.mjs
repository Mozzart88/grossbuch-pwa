// Run after npm run build. A new localhost origin is required for each run.
import { build } from 'vite'
import { createServer } from 'node:http'
import { readFile, readdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const output = await mkdtemp(join(tmpdir(), 'atomic-mutations-probe-'))
await build({ configFile: false, build: { outDir: join(output, 'bundle'), rollupOptions: { input: 'src/tests/browser/atomicMutationsProbe.ts' } } })
const worker = (await readdir('dist/assets')).find(name => /^worker-.*\.js$/.test(name))
const entry = (await readdir(join(output, 'bundle/assets'))).find(name => /^atomicMutationsProbe-.*\.js$/.test(name))
const port = Number(process.env.PROBE_PORT || 4191)
const server = createServer(async (req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  res.setHeader('Cache-Control', 'no-store')
  const path = new URL(req.url, 'http://localhost').pathname
  if (path === '/report' && req.method === 'POST') {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    await writeFile(join(output, 'report.json'), Buffer.concat(chunks))
    res.end('saved')
  } else if (path === '/') {
    res.setHeader('Content-Type', 'text/html')
    res.end(`<!doctype html><title>Atomic mutation verification</title><h1>Disposable atomic mutation verification</h1><p>Refuses to modify nonempty OPFS.</p><button id="run">Run verification</button><pre id="results">Ready</pre><script>window.productionWorker='/assets/${worker}'</script><script type="module" src="/probe/${entry}"></script>`)
  } else if (/^\/(assets|probe)\/[^/]+$/.test(path)) {
    try {
      const file = path.startsWith('/probe/') ? join(output, 'bundle/assets', path.split('/').at(-1)) : `dist${path}`
      res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
      res.end(await readFile(file))
    } catch { res.writeHead(404); res.end() }
  } else { res.writeHead(404); res.end() }
})
server.listen(port, '127.0.0.1', () => console.log(`Probe http://127.0.0.1:${port}/; report ${output}/report.json`))
