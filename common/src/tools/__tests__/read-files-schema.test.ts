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

  test('infers a missing recovery range path from one paths entry', () => {
    const parsed = readFilesParams.inputSchema.safeParse({
      paths: ['server/src/services/ip.ts'],
      ranges: [{ startLine: 338, endLine: 345 }],
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual({
        paths: [],
        ranges: [
          {
            path: 'server/src/services/ip.ts',
            startLine: 338,
            endLine: 345,
          },
        ],
      })
    }
  })

  test('keeps a missing range path invalid when multiple paths are ambiguous', () => {
    const parsed = readFilesParams.inputSchema.safeParse({
      paths: ['src/a.ts', 'src/b.ts'],
      ranges: [{ startLine: 1, endLine: 2 }],
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({ path: ['ranges', 0, 'path'] }),
      )
    }
  })

  test('infers a missing symbol path from one paths entry', () => {
    const parsed = readFilesParams.inputSchema.safeParse({
      paths: ['server/src/services/account.ts'],
      symbols: [{ names: ['listFeatureFlags', 'upsertFeatureFlag'] }],
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual({
        paths: [],
        symbols: [
          {
            path: 'server/src/services/account.ts',
            names: ['listFeatureFlags', 'upsertFeatureFlag'],
          },
        ],
      })
    }
  })

  test('decodes provider-fragmented symbol selectors before inferring the path', () => {
    const parsed = readFilesParams.inputSchema.safeParse({
      paths: ['server/src/services/account.ts'],
      symbols: [
        '[{"names": ["setUserRole"',
        '"changePlanForUser"',
        '"listFeatureFlags"]}]',
      ],
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual({
        paths: [],
        symbols: [
          {
            path: 'server/src/services/account.ts',
            names: ['setUserRole', 'changePlanForUser', 'listFeatureFlags'],
          },
        ],
      })
    }
  })
})
