import { describe, expect, it } from 'bun:test'

import { getFileReadingUpdates } from '../get-file-reading-updates'

describe('getFileReadingUpdates', () => {
  it('[COR-M06][ABI-M04] preserves every selector in one legacy batch call', async () => {
    const calls: unknown[] = []
    const result = await getFileReadingUpdates({
      requestFiles: async (input) => {
        calls.push(input)
        return { 'whole.ts': 'export const whole = true\n' }
      },
      requestedFiles: ['whole.ts'],
      ranges: [{ path: 'range.ts', startLine: 2, endLine: 3 }],
    })

    expect(calls).toEqual([
      {
        filePaths: ['whole.ts'],
        ranges: [{ path: 'range.ts', startLine: 2, endLine: 3 }],
      },
    ])
    expect(result.results).toHaveLength(2)
    expect(result.results[0]).toMatchObject({
      selector: 'file',
      requestIndex: 0,
      path: 'whole.ts',
      status: 'ok',
    })
    expect(result.results[1]).toMatchObject({
      selector: 'range',
      requestIndex: 1,
      path: 'range.ts',
      status: 'error',
      error: { code: 'not_found' },
    })
  })
})
