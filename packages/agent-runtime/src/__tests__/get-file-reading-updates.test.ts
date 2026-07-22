import { describe, expect, it } from 'bun:test'

import { buildReadFilesResultV1 } from '@codebuff/common/tools/results/filesystem'

import { getFileReadingUpdates } from '../get-file-reading-updates'

describe('getFileReadingUpdates', () => {
  it('[COR-M06][ABI-M04] preserves every selector in one structured batch call', async () => {
    const calls: unknown[] = []
    const result = await getFileReadingUpdates({
      requestFiles: async (input) => {
        calls.push(input)
        return buildReadFilesResultV1([
          {
            selector: 'file',
            requestIndex: 0,
            path: 'whole.ts',
            status: 'ok',
            content: 'export const whole = true\n',
            complete: true,
            template: false,
          },
          {
            selector: 'range',
            requestIndex: 1,
            path: 'range.ts',
            status: 'error',
            error: {
              code: 'not_found',
              message: '[FILE_DOES_NOT_EXIST]',
              retryable: true,
              recovery: 'discover_path',
            },
          },
        ])
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
    const legacyCapability =
      'cap.v2.1.2.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const currentCapability =
      'cap.v3.1.2.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC.DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'
    const result = await getFileReadingUpdates({
      requestFiles: async () =>
        buildReadFilesResultV1([
          {
            selector: 'range',
            requestIndex: 0,
            path: 'range.ts',
            status: 'partial',
            content:
              `[RANGE_BLOCK lines 1-2 of 20 in range.ts; rangeHash=sha256:abc; readCapability=${currentCapability}; preferred block edit: replace_range { readCapability: "${currentCapability}", newContent: "..." }; scoped str_replace: basedOnRead="${legacyCapability}"]\n` +
              '1\tline one\n2\tline two\n[FILE_TOO_LARGE: truncated]',
            startLine: 1,
            endLine: 2,
            totalLines: 20,
            complete: false,
            truncation: { reason: 'character_limit' },
          },
        ]),
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
      expect(item.content).toBe(
        '[RANGE_BLOCK lines 1-2 of 20 in range.ts; rangeHash=omitted]\n' +
          '1\tline one\n2\tline two\n[FILE_TOO_LARGE: truncated]',
      )
      expect(item.content).not.toContain(legacyCapability)
      expect(item.content).not.toContain(currentCapability)
      expect(item.content).not.toContain('preferred block edit')
      expect(item.content).not.toContain('basedOnRead')
      expect(item).not.toHaveProperty('editAnchor')
      expect(item).not.toHaveProperty('readCapability')
    }
  })

  it('accepts clamped, partial, and open-ended ranges that match the request', async () => {
    const result = await getFileReadingUpdates({
      requestFiles: async () =>
        buildReadFilesResultV1([
          {
            selector: 'range',
            requestIndex: 0,
            path: 'clamped.ts',
            status: 'ok',
            content: '[RANGE_BLOCK lines 1-30 of 30 in clamped.ts]',
            startLine: 1,
            endLine: 30,
            totalLines: 30,
            complete: true,
          },
          {
            selector: 'range',
            requestIndex: 1,
            path: 'partial.ts',
            status: 'partial',
            content: '[RANGE_BLOCK lines 10-60 of 200 in partial.ts]',
            startLine: 10,
            endLine: 60,
            totalLines: 200,
            complete: false,
            truncation: { reason: 'character_limit' as const },
          },
          {
            selector: 'range',
            requestIndex: 2,
            path: 'open-ended.ts',
            status: 'ok',
            content: '[RANGE_BLOCK lines 7-120 of 120 in open-ended.ts]',
            startLine: 7,
            endLine: 120,
            totalLines: 120,
            complete: true,
          },
        ]),
      requestedFiles: [],
      ranges: [
        { path: 'clamped.ts', startLine: 1, endLine: 50 },
        { path: 'partial.ts', startLine: 10, endLine: 90 },
        { path: 'open-ended.ts', startLine: 7 },
      ],
    })

    expect(result.results).toHaveLength(3)
    expect(result.results[0]).toMatchObject({
      selector: 'range',
      requestIndex: 0,
      path: 'clamped.ts',
      status: 'ok',
      startLine: 1,
      endLine: 30,
      complete: true,
    })
    expect(result.results[1]).toMatchObject({
      selector: 'range',
      requestIndex: 1,
      path: 'partial.ts',
      status: 'partial',
      startLine: 10,
      endLine: 60,
      complete: false,
    })
    expect(result.results[2]).toMatchObject({
      selector: 'range',
      requestIndex: 2,
      path: 'open-ended.ts',
      status: 'ok',
      startLine: 7,
      endLine: 120,
      complete: true,
    })
  })

  it('fails closed when a returned range does not match the requested window', async () => {
    const result = await getFileReadingUpdates({
      requestFiles: async () =>
        buildReadFilesResultV1([
          {
            selector: 'range',
            requestIndex: 0,
            path: 'wrong-start.ts',
            status: 'ok',
            content: '[RANGE_BLOCK lines 6-50 of 100 in wrong-start.ts]',
            startLine: 6,
            endLine: 50,
            totalLines: 100,
            complete: true,
          },
          {
            selector: 'range',
            requestIndex: 1,
            path: 'over-end.ts',
            status: 'ok',
            content: '[RANGE_BLOCK lines 1-60 of 100 in over-end.ts]',
            startLine: 1,
            endLine: 60,
            totalLines: 100,
            complete: true,
          },
        ]),
      requestedFiles: [],
      ranges: [
        { path: 'wrong-start.ts', startLine: 5, endLine: 50 },
        { path: 'over-end.ts', startLine: 1, endLine: 40 },
      ],
    })

    expect(result.results).toHaveLength(2)
    expect(result.results[0]).toMatchObject({
      selector: 'range',
      requestIndex: 0,
      path: 'wrong-start.ts',
      status: 'error',
      error: { code: 'invalid_request' },
    })
    expect(result.results[1]).toMatchObject({
      selector: 'range',
      requestIndex: 1,
      path: 'over-end.ts',
      status: 'error',
      error: { code: 'invalid_request' },
    })
  })

  it('fails closed when a whole-file request returns a mismatched selector', async () => {
    const result = await getFileReadingUpdates({
      requestFiles: async () =>
        buildReadFilesResultV1([
          {
            selector: 'range',
            requestIndex: 0,
            path: 'whole.ts',
            status: 'ok',
            content: '[RANGE_BLOCK lines 1-2 of 2 in whole.ts]',
            startLine: 1,
            endLine: 2,
            totalLines: 2,
            complete: true,
          },
        ]),
      requestedFiles: ['whole.ts'],
      ranges: [],
    })

    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({
      selector: 'file',
      requestIndex: 0,
      path: 'whole.ts',
      status: 'error',
      error: { code: 'invalid_request' },
    })
    expect(result.results[0]).not.toHaveProperty('content')
    expect(result.results[0]).not.toHaveProperty('readCapability')
  })

  it('fails closed when the returned batch length does not match the request', async () => {
    const shortResult = await getFileReadingUpdates({
      requestFiles: async () =>
        buildReadFilesResultV1([
          {
            selector: 'file',
            requestIndex: 0,
            path: 'whole.ts',
            status: 'ok',
            content: 'export const whole = true\n',
            complete: true,
            template: false,
          },
        ]),
      requestedFiles: ['whole.ts'],
      ranges: [{ path: 'range.ts', startLine: 1, endLine: 5 }],
    })

    expect(shortResult.results).toHaveLength(2)
    expect(shortResult.results[0]).toMatchObject({
      selector: 'file',
      requestIndex: 0,
      path: 'whole.ts',
      status: 'error',
      error: { code: 'invalid_request' },
    })
    expect(shortResult.results[0]).not.toHaveProperty('content')
    expect(shortResult.results[1]).toMatchObject({
      selector: 'range',
      requestIndex: 1,
      path: 'range.ts',
      status: 'error',
      error: { code: 'invalid_request' },
    })
    expect(shortResult.results[1]).not.toHaveProperty('content')

    const longResult = await getFileReadingUpdates({
      requestFiles: async () =>
        buildReadFilesResultV1([
          {
            selector: 'file',
            requestIndex: 0,
            path: 'whole.ts',
            status: 'ok',
            content: 'export const whole = true\n',
            complete: true,
            template: false,
          },
          {
            selector: 'file',
            requestIndex: 1,
            path: 'unexpected.ts',
            status: 'ok',
            content: 'export const unexpected = true\n',
            complete: true,
            template: false,
          },
        ]),
      requestedFiles: ['whole.ts'],
      ranges: [],
    })

    expect(longResult.results).toHaveLength(1)
    expect(longResult.results[0]).toMatchObject({
      selector: 'file',
      requestIndex: 0,
      path: 'whole.ts',
      status: 'error',
      error: { code: 'invalid_request' },
    })
    expect(longResult.results[0]).not.toHaveProperty('content')
  })

  it('preserves distinct structured selectors for the same path', async () => {
    const result = await getFileReadingUpdates({
      requestFiles: async () =>
        buildReadFilesResultV1([
          {
            selector: 'file',
            requestIndex: 0,
            path: 'mixed.ts',
            status: 'ok',
            content: 'one\ntwo\n',
            complete: true,
            template: false,
          },
          {
            selector: 'range',
            requestIndex: 1,
            path: 'mixed.ts',
            status: 'ok',
            content: '1\tone\n2\ttwo',
            sourceContent: 'one\ntwo',
            startLine: 1,
            endLine: 2,
            totalLines: 2,
            complete: true,
          },
        ]),
      requestedFiles: ['mixed.ts'],
      ranges: [{ path: 'mixed.ts', startLine: 1, endLine: 2 }],
    })

    expect(result.results).toHaveLength(2)
    expect(result.results[0]).toMatchObject({
      selector: 'file',
      requestIndex: 0,
      path: 'mixed.ts',
      status: 'ok',
      content: 'one\ntwo\n',
    })
    expect(result.results[1]).toMatchObject({
      selector: 'range',
      requestIndex: 1,
      path: 'mixed.ts',
      status: 'ok',
      sourceContent: 'one\ntwo',
    })
  })

  it('preserves structured errors for paths matching prototype member names', async () => {
    const paths = ['constructor', 'toString', 'hasOwnProperty']
    const result = await getFileReadingUpdates({
      requestFiles: async () =>
        buildReadFilesResultV1(
          paths.map((path, requestIndex) => ({
            selector: 'file' as const,
            requestIndex,
            path,
            status: 'error' as const,
            error: {
              code: 'not_found' as const,
              message: '[FILE_DOES_NOT_EXIST]',
              retryable: true,
              recovery: 'discover_path' as const,
            },
          })),
        ),
      requestedFiles: paths,
      ranges: [],
    })

    expect(result.results).toHaveLength(3)
    for (const [index, path] of paths.entries()) {
      expect(result.results[index]).toMatchObject({
        selector: 'file',
        requestIndex: index,
        path,
        status: 'error',
        error: { code: 'not_found' },
      })
      expect(result.results[index]).not.toHaveProperty('content')
    }
  })

  it('preserves a genuine per-item range error in an untrusted batch', async () => {
    const result = await getFileReadingUpdates({
      requestFiles: async () =>
        buildReadFilesResultV1([
          {
            selector: 'range',
            requestIndex: 0,
            path: 'missing.ts',
            status: 'error',
            error: {
              code: 'not_found',
              message: '[FILE_DOES_NOT_EXIST]',
              retryable: true,
              recovery: 'discover_path',
            },
          },
          {
            selector: 'range',
            requestIndex: 1,
            path: 'wrong-start.ts',
            status: 'ok',
            content: '[RANGE_BLOCK lines 6-50 of 100 in wrong-start.ts]',
            startLine: 6,
            endLine: 50,
            totalLines: 100,
            complete: true,
          },
        ]),
      requestedFiles: [],
      ranges: [
        { path: 'missing.ts', startLine: 1, endLine: 50 },
        { path: 'wrong-start.ts', startLine: 5, endLine: 50 },
      ],
    })

    expect(result.results).toHaveLength(2)
    expect(result.results[0]).toMatchObject({
      selector: 'range',
      requestIndex: 0,
      path: 'missing.ts',
      status: 'error',
      error: { code: 'not_found' },
    })
    expect(result.results[1]).toMatchObject({
      selector: 'range',
      requestIndex: 1,
      path: 'wrong-start.ts',
      status: 'error',
      error: { code: 'invalid_request' },
    })
  })
})
