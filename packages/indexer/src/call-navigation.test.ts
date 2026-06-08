import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterAll, describe, expect, test } from 'bun:test'

import { buildMetadataIndex } from './metadata-indexer'
import { queryIndex } from './query'

const roots: string[] = []
afterAll(() => {
  for (const r of roots) {
    try {
      rmSync(r, { recursive: true, force: true })
    } catch {}
  }
})

function callGraphProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'openbuff-callers-'))
  roots.push(root)
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'util.ts'), 'export function computeTax(p: number) { return p * 0.1 }\n')
  writeFileSync(
    join(root, 'src', 'checkout.ts'),
    "import { computeTax } from './util'\nexport function checkout() { return computeTax(5) }\n",
  )
  writeFileSync(
    join(root, 'src', 'invoice.ts'),
    "import { computeTax } from './util'\nexport function invoice() { return computeTax(9) }\n",
  )
  return root
}

describe('symbol-level call navigation via query_index neighbors', () => {
  test('callers of a symbol are reachable with the connecting symbol named', async () => {
    const index = await buildMetadataIndex(callGraphProject())

    const neighbors = queryIndex(index, 'computeTax', {
      mode: 'neighbors',
      from: 'src/util.ts',
      limit: 10,
    })

    const paths = neighbors.map((n) => n.path)
    expect(paths).toContain('src/checkout.ts')
    expect(paths).toContain('src/invoice.ts')

    // Every neighbor carries the relationship reason + the connecting symbol
    // (`via`), so the agent can see "called by, via computeTax" — symbol-level
    // call navigation, not just a bag of related files.
    const checkout = neighbors.find((n) => n.path === 'src/checkout.ts')!
    const related = checkout.relatedFiles ?? []
    expect(related.some((r) => /call/i.test(r.reason))).toBe(true)
    expect(related.some((r) => r.via === 'computeTax')).toBe(true)
  })
})
