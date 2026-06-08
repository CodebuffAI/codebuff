import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { afterAll, describe, expect, test } from 'bun:test'

import { buildMetadataIndex } from './metadata-indexer'

const roots: string[] = []
afterAll(() => {
  for (const r of roots) {
    try {
      rmSync(r, { recursive: true, force: true })
    } catch {}
  }
})

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'openbuff-imports-'))
  roots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

function hasReferenceEdge(
  graph: { edges: { from: string; to: string; type: string }[] },
  fromPath: string,
  toPath: string,
): boolean {
  return graph.edges.some(
    (e) =>
      e.type === 'references' &&
      e.from === `file:${fromPath}` &&
      e.to === `file:${toPath}`,
  )
}

describe('import graph: alias + re-export resolution', () => {
  test('resolves tsconfig path aliases into reference edges', async () => {
    const root = project({
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@pkg/common/*': ['./common/src/*'],
            '@pkg/sdk': ['./sdk/src/index.ts'],
          },
        },
      }),
      'common/src/util.ts': 'export const helper = () => 1\n',
      'sdk/src/index.ts': 'export const sdk = 2\n',
      'app/main.ts': [
        "import { helper } from '@pkg/common/util'",
        "import { sdk } from '@pkg/sdk'",
        'export function main() { return helper() + sdk }',
      ].join('\n'),
    })

    const index = await buildMetadataIndex(root)
    // Alias imports must resolve to real files as `references` edges.
    expect(hasReferenceEdge(index.graph, 'app/main.ts', 'common/src/util.ts')).toBe(true)
    expect(hasReferenceEdge(index.graph, 'app/main.ts', 'sdk/src/index.ts')).toBe(true)
  })

  test('captures re-export (export ... from) specifiers', async () => {
    const root = project({
      'src/inner.ts': 'export const x = 1\n',
      'src/barrel.ts': "export { x } from './inner'\n",
    })
    const index = await buildMetadataIndex(root)
    expect(index.files['src/barrel.ts'].imports).toContain('./inner')
    expect(hasReferenceEdge(index.graph, 'src/barrel.ts', 'src/inner.ts')).toBe(true)
  })
})
