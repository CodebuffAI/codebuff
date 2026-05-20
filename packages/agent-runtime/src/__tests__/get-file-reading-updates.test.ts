import { describe, expect, test } from 'bun:test'

import { getFileReadingUpdates } from '../get-file-reading-updates'

describe('getFileReadingUpdates', () => {
  test('returns files keyed by the requested paths', async () => {
    const files = await getFileReadingUpdates({
      requestedFiles: ['src/index.ts'],
      requestFiles: async () => ({
        'src/index.ts': 'console.log("hello")',
      }),
    })

    expect(files).toEqual([
      {
        path: 'src/index.ts',
        content: 'console.log("hello")',
      },
    ])
  })

  test('keeps files returned under normalized paths', async () => {
    const files = await getFileReadingUpdates({
      requestedFiles: ['/project/src/index.ts', './src/util.ts'],
      requestFiles: async () => ({
        'src/index.ts': 'console.log("hello")',
        'src/util.ts': 'export const util = true',
      }),
    })

    expect(files).toEqual([
      {
        path: 'src/index.ts',
        content: 'console.log("hello")',
      },
      {
        path: 'src/util.ts',
        content: 'export const util = true',
      },
    ])
  })

  test('omits null file results', async () => {
    const files = await getFileReadingUpdates({
      requestedFiles: ['missing.ts', 'src/index.ts'],
      requestFiles: async () => ({
        'missing.ts': null,
        'src/index.ts': 'content',
      }),
    })

    expect(files).toEqual([
      {
        path: 'src/index.ts',
        content: 'content',
      },
    ])
  })
})
