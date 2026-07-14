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
  writeFileSync(
    join(root, 'src', 'util.ts'),
    'export function computeTax(p: number) { return p * 0.1 }\n',
  )
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

  test('resolves duplicate symbol names through imports and refuses ambiguous raw-name edges', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openbuff-qualified-callers-'))
    roots.push(root)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'a.ts'),
      'export function collide() { return "a" }\n',
    )
    writeFileSync(
      join(root, 'src', 'b.ts'),
      'export function collide() { return "b" }\n',
    )
    writeFileSync(
      join(root, 'src', 'caller.ts'),
      "import { collide } from './b'\nexport const value = collide()\n",
    )

    const index = await buildMetadataIndex(root)
    const calls = index.graph.edges.filter(
      (edge) => edge.type === 'calls' && edge.label === 'collide',
    )
    expect(calls).toContainEqual(
      expect.objectContaining({
        from: 'file:src/caller.ts',
        to: 'file:src/b.ts',
      }),
    )
    expect(calls).not.toContainEqual(
      expect.objectContaining({
        from: 'file:src/caller.ts',
        to: 'file:src/a.ts',
      }),
    )

    const symbolNodes = Object.values(index.graph.nodes).filter(
      (node) => node.type === 'symbol' && node.label === 'collide',
    )
    expect(symbolNodes).toHaveLength(2)
    expect(new Set(symbolNodes.map((node) => node.id)).size).toBe(2)
    expect(symbolNodes.map((node) => node.path).sort()).toEqual([
      'src/a.ts',
      'src/b.ts',
    ])
  })

  test('does not create cross-language raw-name call edges', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openbuff-language-callers-'))
    roots.push(root)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'worker.py'),
      'def shared_name():\n    return 1\n',
    )
    writeFileSync(
      join(root, 'src', 'caller.ts'),
      'export const value = shared_name()\n',
    )

    const index = await buildMetadataIndex(root)
    expect(
      index.graph.edges.some(
        (edge) =>
          edge.type === 'calls' &&
          edge.from === 'file:src/caller.ts' &&
          edge.to === 'file:src/worker.py',
      ),
    ).toBe(false)
  })
})
