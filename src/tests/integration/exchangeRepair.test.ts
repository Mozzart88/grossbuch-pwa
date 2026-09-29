import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

it('repairs exact manifests atomically, rejects changed and partial states, and preserves sources', () => {
  expect(execFileSync('python3', ['tools/exchange-repair/test_exchange_repair.py'], { encoding: 'utf8' })).toContain('repair checks passed')
})
