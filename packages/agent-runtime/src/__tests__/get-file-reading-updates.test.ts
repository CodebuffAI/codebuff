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

  it('removes capability metadata from truncated ranges using the current header shape', async () => {
    const capability = 'cap.v2.1.2.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const result = await getFileReadingUpdates({
      requestFiles: async () => ({
        'range.ts':
          `[RANGE_BLOCK lines 1-2 of 20 in range.ts; rangeHash=sha256:abc; readCapability=${capability}; preferred block edit: replace_range { readCapability: "${capability}", newContent: "..." }; scoped str_replace: basedOnRead="${capability}"]\n` +
          '1\tline one\n2\tline two\n[FILE_TOO_LARGE: truncated]',
      }),
      requestedFiles: [],
      ranges: [{ path: 'range.ts', startLine: 1, endLine: 20 }],
    })

    expect(result.results[0]).toMatchObject({
      selector: 'range',
      status: 'partial',
      complete: false,
    })
    const item = result.results[0]
    if (item?.status === 'partial' && 'content' in item) {
      expect(item.content).toContain('rangeHash=omitted')
      expect(item.content).not.toContain(capability)
      expect(item).not.toHaveProperty('readCapability')
    }
  })
})
