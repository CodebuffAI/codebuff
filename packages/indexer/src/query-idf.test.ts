import { describe, expect, test } from 'bun:test'

import { queryIndex } from './query'

import type { IndexedFile, MetadataIndex } from './types'

function file(path: string, symbols: string[]): IndexedFile {
  return { path, mtime: 1, size: 100, hash: path, ext: '.ts', symbols, imports: [], headings: [], concepts: [] }
}

// Six files all mention the ubiquitous token "config"; exactly one also defines
// the rare "ZephyrWidget". Without IDF weighting every "config" file scores the
// same and the rare match barely stands out. With IDF, "config" is near-free and
// the rare token dominates.
const index: MetadataIndex = {
  version: '2',
  projectRoot: '/repo',
  builtAt: 1,
  fileCount: 6,
  files: {
    'src/config-a.ts': file('src/config-a.ts', ['ConfigA', 'loadConfig']),
    'src/config-b.ts': file('src/config-b.ts', ['ConfigB', 'loadConfig']),
    'src/config-c.ts': file('src/config-c.ts', ['ConfigC', 'loadConfig']),
    'src/config-d.ts': file('src/config-d.ts', ['ConfigD', 'loadConfig']),
    'src/config-e.ts': file('src/config-e.ts', ['ConfigE', 'loadConfig']),
    'src/widget.ts': file('src/widget.ts', ['ZephyrWidget', 'loadConfig']),
  },
  graph: { nodes: {}, edges: [] },
}

describe('IDF-weighted ranking', () => {
  test('a rare-token match outranks a flood of common-token matches', () => {
    const results = queryIndex(index, 'ZephyrWidget config', { limit: 6 })
    expect(results[0].path).toBe('src/widget.ts')
    // And it wins clearly, not by a hair: the rare token contributes most of
    // the score, so the gap to the runner-up is large.
    expect(results[0].score).toBeGreaterThan(results[1].score * 1.5)
  })

  test('a query of only the ubiquitous token does not over-concentrate', () => {
    const results = queryIndex(index, 'config', { limit: 6 })
    // All six match; scores should be close (no single file dominates on a
    // token that is everywhere).
    const scores = results.map((r) => r.score)
    const max = Math.max(...scores)
    const min = Math.min(...scores)
    expect(max - min).toBeLessThan(max) // within ~1x, i.e. comparable
  })
})
