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

describe('content recall via code comments', () => {
  test('a phrase only present in a comment is findable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openbuff-recall-'))
    roots.push(root)
    mkdirSync(join(root, 'src'), { recursive: true })
    // The symbol names give no hint of "throttle"/"backoff"; only the comment does.
    writeFileSync(
      join(root, 'src', 'gate.ts'),
      [
        '// Implements request throttling with exponential backoff.',
        'export function handle(x: number) {',
        '  return x + 1',
        '}',
      ].join('\n'),
    )
    writeFileSync(
      join(root, 'src', 'other.ts'),
      'export function compute(y: number) { return y * 2 }\n',
    )

    const index = await buildMetadataIndex(root)
    expect(index.files['src/gate.ts'].concepts).toContain('throttling')

    const results = queryIndex(index, 'throttling backoff', { limit: 5 })
    expect(results[0]?.path).toBe('src/gate.ts')
  })
})
