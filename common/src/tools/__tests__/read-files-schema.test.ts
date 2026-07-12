import { describe, expect, test } from 'bun:test'

import { readFilesParams } from '../params/tool/read-files'

describe('read_files input schema', () => {
  test('rejects an empty selector object with actionable recovery', () => {
    const parsed = readFilesParams.inputSchema.safeParse({})

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['paths'],
          message:
            'read_files requires at least one path, range, or symbol selector.',
        }),
      )
    }
  })

  test.each([
    { paths: ['src/a.ts'] },
    { ranges: [{ path: 'src/a.ts', startLine: 1, endLine: 2 }] },
    { symbols: [{ path: 'src/a.ts', names: ['run'] }] },
  ])('accepts a non-empty selector shape', (input) => {
    expect(readFilesParams.inputSchema.safeParse(input).success).toBe(true)
  })
})
