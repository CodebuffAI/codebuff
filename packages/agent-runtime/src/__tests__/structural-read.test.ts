import { describe, expect, test } from 'bun:test'

import { handleReadOutline } from '../tools/handlers/tool/read-outline'
import { handleReadSlices } from '../tools/handlers/tool/read-slices'
import { processStrReplace } from '../process-str-replace'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
} as unknown as Logger

function fileResponder(content: string) {
  return async () => content
}

function outputJson(result: { output: any }): any {
  // jsonToolResult wraps as [{ type:'json', value }]; tolerate either shape.
  const out = result.output
  if (Array.isArray(out)) return out[0]?.value ?? out[0]
  return out?.value ?? out
}

const TS_SRC = [
  'import { z } from "zod"', // 1
  '', // 2
  'export function greet(name: string) {', // 3
  '  const msg = "} not a real close {"', // 4
  '  return msg + name', // 5
  '}', // 6
  '', // 7
  'export class Service {', // 8
  '  run() {', // 9
  '    return 1', // 10
  '  }', // 11
  '}', // 12
].join('\n')

describe('read_outline handler (AST-backed)', () => {
  test('produces a structural outline with line spans and imports', async () => {
    const result = await handleReadOutline({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path: 'svc.ts' } },
      requestOptionalFile: fileResponder(TS_SRC),
    } as any)
    const { outline } = outputJson(result)

    expect(outline).toContain('import { z } from "zod"')
    expect(outline).toContain('function greet')
    expect(outline).toContain('class Service')
    expect(outline).toMatch(/method run/)
    // greet spans lines 3-6 despite the brace inside the string on line 4.
    expect(outline).toMatch(/Lines 3-6: function greet/)
  })

  test('falls back gracefully and never throws on unknown extensions', async () => {
    const result = await handleReadOutline({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path: 'data.unknownext' } },
      requestOptionalFile: fileResponder('function x() {}'),
    } as any)
    const { outline } = outputJson(result)
    expect(typeof outline).toBe('string')
  })
})

describe('read_slices handler (AST-backed + capability tokens)', () => {
  test('slices a function by exact span and mints a usable capability token', async () => {
    const result = await handleReadSlices({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path: 'svc.ts', symbols: ['greet'] } },
      requestOptionalFile: fileResponder(TS_SRC),
    } as any)
    const { slices } = outputJson(result)

    expect(slices).toHaveLength(1)
    const slice = slices[0]
    expect(slice).toMatchObject({ symbol: 'greet', startLine: 3, endLine: 6 })
    // The brace inside the string did NOT truncate the slice (old bug).
    expect(slice.content).toContain('return msg + name')
    expect(slice.readCapability).toMatch(/^cap\./)

    // The minted token must validate against a real large-file str_replace.
    // Pad the file beyond the large-file threshold so basedOnRead is enforced.
    const padded = TS_SRC + '\n' + Array(1100).fill('// pad').join('\n')
    const edit = await processStrReplace({
      path: 'svc.ts',
      replacements: [
        {
          oldString: 'return msg + name',
          newString: 'return name + msg',
          allowMultiple: false,
          basedOnRead: slice.readCapability,
        },
      ],
      initialContentPromise: Promise.resolve(padded),
      logger: noopLogger,
    })
    expect('error' in edit ? edit.error : '').not.toContain('stale')
    expect('content' in edit ? edit.content : '').toContain('return name + msg')
  })

  test('returns empty slices array for a missing file', async () => {
    const result = await handleReadSlices({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path: 'nope.ts', symbols: ['greet'] } },
      requestOptionalFile: async () => null,
    } as any)
    expect(outputJson(result).slices).toEqual([])
  })
})
