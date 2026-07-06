import { describe, expect, test } from 'bun:test'

import { handleReadOutline } from '../tools/handlers/tool/read-outline'
import { handleReadSlices } from '../tools/handlers/tool/read-slices'
import { processStrReplace } from '../process-str-replace'
import { extractSlices, extendRangeToPrecedingComment } from '../structural-read'
import { mockFileContext } from './test-utils'

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

const PY_SRC = [
  'import pathlib', // 1
  '', // 2
  'class Greeter:', // 3
  '    def greet(self, name):', // 4
  '        return f"hi {name}"', // 5
  '', // 6
  'def helper():', // 7
  '    return pathlib.Path(".")', // 8
].join('\n')

const RUST_SRC = [
  'use std::path::PathBuf;', // 1
  '', // 2
  'struct Counter {', // 3
  '    value: i32,', // 4
  '}', // 5
  '', // 6
  'impl Counter {', // 7
  '    fn new() -> Self {', // 8
  '        Self { value: 0 }', // 9
  '    }', // 10
  '}', // 11
  '', // 12
  'fn main() {', // 13
  '    println!("ok");', // 14
  '}', // 15
].join('\n')

const GO_SRC = [
  'package main', // 1
  '', // 2
  'type Server struct {', // 3
  '\tName string', // 4
  '}', // 5
  '', // 6
  'func New(name string) *Server {', // 7
  '\treturn &Server{Name: name}', // 8
  '}', // 9
  '', // 10
  'func (s *Server) Run() error {', // 11
  '\treturn nil', // 12
  '}', // 13
].join('\n')

describe('read_outline handler (AST-backed)', () => {
  test('produces a structural outline with line spans and imports', async () => {
    const result = await handleReadOutline({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path: 'svc.ts' } },
      requestOptionalFile: fileResponder(TS_SRC),
      fileContext: mockFileContext,
    } as any)
    const { outline } = outputJson(result)

    expect(outline).toContain('import { z } from "zod"')
    expect(outline).toContain('function greet')
    expect(outline).toContain('class Service')
    expect(outline).toMatch(/method run/)
    // greet spans lines 3-6 despite the brace inside the string on line 4.
    expect(outline).toMatch(/Lines 3-6: function greet/)
  })

  test('produces non-TS structural outlines with imports, nesting, and spans', async () => {
    const python = await handleReadOutline({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path: 'service.py' } },
      requestOptionalFile: fileResponder(PY_SRC),
      fileContext: mockFileContext,
    } as any)
    const rust = await handleReadOutline({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path: 'counter.rs' } },
      requestOptionalFile: fileResponder(RUST_SRC),
      fileContext: mockFileContext,
    } as any)
    const go = await handleReadOutline({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path: 'server.go' } },
      requestOptionalFile: fileResponder(GO_SRC),
      fileContext: mockFileContext,
    } as any)

    expect(outputJson(python).outline).toContain('Line 1: import pathlib')
    expect(outputJson(python).outline).toMatch(/Lines 3-5: class Greeter/)
    expect(outputJson(python).outline).toMatch(/  Lines 4-5: method greet/)
    expect(outputJson(python).outline).toMatch(/Lines 7-8: function helper/)

    expect(outputJson(rust).outline).toContain('Line 1: use std::path::PathBuf;')
    expect(outputJson(rust).outline).toMatch(/Lines 3-5: struct Counter/)
    expect(outputJson(rust).outline).toMatch(/Lines 7-11: impl impl Counter/)
    expect(outputJson(rust).outline).toMatch(/  Lines 8-10: method new/)
    expect(outputJson(rust).outline).toMatch(/Lines 13-15: function main/)

    expect(outputJson(go).outline).toContain('Line 1: package main')
    expect(outputJson(go).outline).toMatch(/Lines 3-5: type Server/)
    expect(outputJson(go).outline).toMatch(/Lines 7-9: function New/)
    expect(outputJson(go).outline).toMatch(/Lines 11-13: method Run/)
  })

  test('falls back gracefully and never throws on unknown extensions', async () => {
    const result = await handleReadOutline({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path: 'data.unknownext' } },
      requestOptionalFile: fileResponder('function x() {}'),
      fileContext: mockFileContext,
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

  test('slices non-TS functions and methods with exact parser-backed ranges', async () => {
    const python = await handleReadSlices({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path: 'service.py', symbols: ['greet', 'helper'] } },
      requestOptionalFile: fileResponder(PY_SRC),
    } as any)
    const pySlices = outputJson(python).slices
    expect(pySlices).toHaveLength(2)
    expect(pySlices.find((s: any) => s.symbol === 'greet')).toMatchObject({
      kind: 'method',
      startLine: 4,
      endLine: 5,
    })
    expect(pySlices.find((s: any) => s.symbol === 'helper')).toMatchObject({
      kind: 'function',
      startLine: 7,
      endLine: 8,
    })

    const rust = await handleReadSlices({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path: 'counter.rs', symbols: ['new', 'main'] } },
      requestOptionalFile: fileResponder(RUST_SRC),
    } as any)
    const rustSlices = outputJson(rust).slices
    expect(rustSlices).toHaveLength(2)
    expect(rustSlices.find((s: any) => s.symbol === 'new')).toMatchObject({
      kind: 'method',
      startLine: 8,
      endLine: 10,
    })
    expect(rustSlices.find((s: any) => s.symbol === 'main')).toMatchObject({
      kind: 'function',
      startLine: 13,
      endLine: 15,
    })

    const go = await handleReadSlices({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path: 'server.go', symbols: ['New', 'Run'] } },
      requestOptionalFile: fileResponder(GO_SRC),
    } as any)
    const goSlices = outputJson(go).slices
    expect(goSlices).toHaveLength(2)
    expect(goSlices.find((s: any) => s.symbol === 'New')).toMatchObject({
      kind: 'function',
      startLine: 7,
      endLine: 9,
    })
    expect(goSlices.find((s: any) => s.symbol === 'Run')).toMatchObject({
      kind: 'method',
      startLine: 11,
      endLine: 13,
    })
    expect(goSlices.find((s: any) => s.symbol === 'Run')?.readCapability).toMatch(
      /^cap\./,
    )
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

describe('extractSlices (shared core for read_files symbols + read_slices)', () => {
  test('extracts symbol spans with reusable capability tokens', async () => {
    const slices = await extractSlices(TS_SRC, 'svc.ts', ['greet', 'Service'])
    expect(slices).toHaveLength(2)

    const greet = slices.find((s) => s.symbol === 'greet')!
    expect(greet).toMatchObject({ symbol: 'greet', startLine: 3, endLine: 6 })
    expect(greet.content).toContain('return msg + name')
    expect(greet.readCapability).toMatch(/^cap\./)

    const service = slices.find((s) => s.symbol === 'Service')!
    expect(service).toMatchObject({ symbol: 'Service', startLine: 8, endLine: 12 })
  })

  test('extracts non-TS symbols with reusable capability tokens', async () => {
    const slices = await extractSlices(GO_SRC, 'server.go', ['Server', 'Run'])
    expect(slices).toHaveLength(2)

    const server = slices.find((s) => s.symbol === 'Server')!
    expect(server).toMatchObject({
      kind: 'type',
      startLine: 3,
      endLine: 5,
    })
    expect(server.content).toContain('\tName string')

    const run = slices.find((s) => s.symbol === 'Run')!
    expect(run).toMatchObject({
      kind: 'method',
      startLine: 11,
      endLine: 13,
    })
    expect(run.content).toContain('\treturn nil')
    expect(run.readCapability).toMatch(/^cap\./)
  })

  test('omits symbols that are not found', async () => {
    const slices = await extractSlices(TS_SRC, 'svc.ts', ['doesNotExist'])
    expect(slices).toEqual([])
  })
})

describe('extendRangeToPrecedingComment', () => {
  test('extends upward to include a single-line JSDoc block', () => {
    const lines = [
      '/** JSDoc */',
      'export function foo() {',
      '  return 1',
      '}',
    ]
    const result = extendRangeToPrecedingComment(lines, 2)
    expect(result.startLine).toBe(1)
    expect(result.commentPrefix).toContain('/** JSDoc */')
  })

  test('extends upward to include a multi-line JSDoc block', () => {
    const lines = [
      '/**',
      ' * First line.',
      ' * Second line.',
       ' */',
      'export function bar() {',
      '  return 2',
      '}',
    ]
    const result = extendRangeToPrecedingComment(lines, 5)
    expect(result.startLine).toBe(1)
    expect(result.commentPrefix).toContain('* First line.')
    expect(result.commentPrefix).toContain('*/')
  })

  test('extends upward to include a run of // line comments', () => {
    const lines = [
      '// line one',
      '// line two',
      'export function baz() {',
      '  return 3',
      '}',
    ]
    const result = extendRangeToPrecedingComment(lines, 3)
    expect(result.startLine).toBe(1)
    expect(result.commentPrefix).toContain('// line one')
    expect(result.commentPrefix).toContain('// line two')
  })

  test('does NOT extend when there is a blank line gap before the doc block', () => {
    const lines = [
      '/** doc */',
      '',
      'export function qux() {',
      '  return 4',
      '}',
    ]
    const result = extendRangeToPrecedingComment(lines, 3)
    expect(result.startLine).toBe(3)
    expect(result.commentPrefix).toBe('')
  })

  test('does NOT extend when there is no preceding comment', () => {
    const lines = [
      'export function noDoc() {',
      '  return 5',
      '}',
    ]
    const result = extendRangeToPrecedingComment(lines, 1)
    expect(result.startLine).toBe(1)
    expect(result.commentPrefix).toBe('')
  })

  test('does NOT extend when preceding line is regular code', () => {
    const lines = [
      'const x = 1',
      'export function afterCode() {',
      '  return 6',
      '}',
    ]
    const result = extendRangeToPrecedingComment(lines, 2)
    expect(result.startLine).toBe(2)
    expect(result.commentPrefix).toBe('')
  })
})
