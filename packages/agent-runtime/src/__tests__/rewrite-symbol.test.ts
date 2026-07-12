import { describe, expect, test } from 'bun:test'

import { handleRewriteSymbol } from '../tools/handlers/tool/rewrite-symbol'

import type { FileProcessingState } from '../tools/handlers/tool/write-file'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
} as unknown as Logger

function freshState(): FileProcessingState {
  return {
    promisesByPath: {},
    allPromises: [],
    fileChangeErrors: [],
    fileChanges: [],
    firstFileProcessed: false,
    failedEditRequiresReadByPath: {},
    consecutiveStrReplaceFailuresByPath: {},
  }
}

const SRC = [
  'export function greet(name: string) {', // 1
  '  return `hi ${name}`', // 2
  '}', // 3
  '', // 4
  'export function other() {', // 5
  '  return 2', // 6
  '}', // 7
].join('\n')

function outputJson(result: { output: any }): any {
  const out = result.output
  if (Array.isArray(out)) return out[0]?.value ?? out[0]
  return out?.value ?? out
}

async function captureRewritePatch(params: {
  path: string
  symbol: string
  content: string
  source: string
  occurrence?: number
}): Promise<{ value: any; patch: string | undefined }> {
  let patch: string | undefined
  const result = await handleRewriteSymbol({
    previousToolCallFinished: Promise.resolve(),
    toolCall: {
      toolCallId: 'rewrite-test',
      input: {
        path: params.path,
        symbol: params.symbol,
        content: params.content,
        occurrence: params.occurrence,
      },
    },
    fileProcessingState: freshState(),
    logger: noopLogger,
    requestClientToolCall: async (toolCall: any) => {
      patch = toolCall?.input?.content
      return [
        {
          type: 'json' as const,
          value: { file: toolCall?.input?.path, message: 'applied' },
        },
      ]
    },
    writeToClient: () => {},
    requestOptionalFile: async () => params.source,
  } as any)

  return { value: outputJson(result), patch }
}

describe('rewrite_symbol handler', () => {
  test('replaces a symbol by name via the str_replace path (captures correct patch)', async () => {
    let capturedPatch: string | undefined
    const requestClientToolCall = async (toolCall: any) => {
      capturedPatch = toolCall?.input?.content
      return [
        {
          type: 'json' as const,
          value: { file: toolCall?.input?.path, message: 'applied' },
        },
      ]
    }

    const result = await handleRewriteSymbol({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 't1',
        input: {
          path: 'svc.ts',
          symbol: 'greet',
          content:
            'export function greet(name: string) {\n  return `hello, ${name}!`\n}',
        },
      },
      fileProcessingState: freshState(),
      logger: noopLogger,
      requestClientToolCall,
      writeToClient: () => {},
      requestOptionalFile: async () => SRC,
    } as any)

    const value = outputJson(result)
    expect(value.errorMessage).toBeUndefined()
    // The patch replaces greet's body, not other().
    expect(capturedPatch).toBeDefined()
    expect(capturedPatch).toContain('+  return `hello, ${name}!`')
    expect(capturedPatch).toContain('-  return `hi ${name}`')
    // other()'s body is untouched: it must not appear as an added/removed line
    // (it may appear as an unchanged context line, which is fine).
    expect(capturedPatch).not.toMatch(/^[-+].*return 2/m)
  })

  test('remains available as structural recovery after raw str_replace trips its breaker', async () => {
    const state = freshState()
    state.consecutiveStrReplaceFailuresByPath['svc.ts'] = 3
    state.failedEditRequiresReadByPath['svc.ts'] = true
    let capturedPatch: string | undefined

    const result = await handleRewriteSymbol({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'structural-recovery',
        input: {
          path: 'svc.ts',
          symbol: 'greet',
          content:
            'export function greet(name: string) {\n  return `recovered ${name}`\n}',
        },
      },
      fileProcessingState: state,
      logger: noopLogger,
      requestClientToolCall: async (toolCall: any) => {
        capturedPatch = toolCall?.input?.content
        return [
          {
            type: 'json' as const,
            value: {
              kind: 'file_mutation_result',
              version: 1,
              operationId: 'structural-recovery',
              outcome: 'applied',
              actions: [
                {
                  actionId: 'structural-recovery:0',
                  index: 0,
                  action: 'update',
                  path: toolCall?.input?.path,
                  outcome: 'applied',
                  beforeHash: 'before',
                  afterHash: 'after',
                },
              ],
              authorityTier: 'portable_path',
              receiptId: 'structural-recovery',
              errors: [],
              freshCapabilities: [],
            },
          },
        ]
      },
      writeToClient: () => {},
      requestOptionalFile: async () => SRC,
    } as any)

    expect(outputJson(result).errorMessage).toBeUndefined()
    expect(capturedPatch).toContain('+  return `recovered ${name}`')
    expect(state.consecutiveStrReplaceFailuresByPath['svc.ts']).toBeUndefined()
  })

  test('does not clear the failure budget when structural recovery is rejected by the client', async () => {
    const state = freshState()
    state.consecutiveStrReplaceFailuresByPath['svc.ts'] = 3

    const result = await handleRewriteSymbol({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'rejected-structural-recovery',
        input: {
          path: 'svc.ts',
          symbol: 'greet',
          content:
            'export function greet(name: string) {\n  return `recovered ${name}`\n}',
        },
      },
      fileProcessingState: state,
      logger: noopLogger,
      requestClientToolCall: async () => [
        {
          type: 'json' as const,
          value: { file: 'svc.ts', errorMessage: 'client rejected patch' },
        },
      ],
      writeToClient: () => {},
      requestOptionalFile: async () => SRC,
    } as any)

    expect(outputJson(result).errorMessage).toContain('client rejected patch')
    expect(state.consecutiveStrReplaceFailuresByPath['svc.ts']).toBe(3)
    expect(state.failedEditRequiresReadByPath['svc.ts']).toBe(true)
  })

  test('errors clearly when the symbol is not found', async () => {
    const result = await handleRewriteSymbol({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 't2',
        input: { path: 'svc.ts', symbol: 'missing', content: 'x' },
      },
      fileProcessingState: freshState(),
      logger: noopLogger,
      requestClientToolCall: async () => [],
      writeToClient: () => {},
      requestOptionalFile: async () => SRC,
    } as any)
    expect(outputJson(result).errorMessage).toMatch(/not found/i)
  })

  test('falls back to a heuristic symbol slice for unparseable files', async () => {
    let capturedPatch: string | undefined
    const result = await handleRewriteSymbol({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 't3',
        input: {
          path: 'data.unknownext',
          symbol: 'x',
          content: 'function x() {\n  return "updated"\n}',
        },
      },
      fileProcessingState: freshState(),
      logger: noopLogger,
      requestClientToolCall: async (toolCall: any) => {
        capturedPatch = toolCall?.input?.content
        return [
          {
            type: 'json' as const,
            value: { file: toolCall?.input?.path, message: 'applied' },
          },
        ]
      },
      writeToClient: () => {},
      requestOptionalFile: async () => 'function x(){}',
    } as any)
    expect(outputJson(result).errorMessage).toBeUndefined()
    expect(capturedPatch).toBeDefined()
    expect(capturedPatch).toContain('-function x(){}')
    expect(capturedPatch).toContain('+  return "updated"')
  })

  test('can rewrite a default exported TSX function when parser support is unavailable or incomplete', async () => {
    let capturedPatch: string | undefined
    const tsx = [
      'import React from "react"',
      '',
      'export default function HeroSeedling() {',
      '  const open = useRef(0)',
      '  return <group />',
      '}',
    ].join('\n')

    const result = await handleRewriteSymbol({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 't4',
        input: {
          path: 'src/components/garden/scenes/HeroSeedling.tsx',
          symbol: 'HeroSeedling',
          content:
            'export default function HeroSeedling() {\n  const open = useRef(1)\n  return <GardenFloor />\n}',
        },
      },
      fileProcessingState: freshState(),
      logger: noopLogger,
      requestClientToolCall: async (toolCall: any) => {
        capturedPatch = toolCall?.input?.content
        return [
          {
            type: 'json' as const,
            value: { file: toolCall?.input?.path, message: 'applied' },
          },
        ]
      },
      writeToClient: () => {},
      requestOptionalFile: async () => tsx,
    } as any)

    expect(outputJson(result).errorMessage).toBeUndefined()
    expect(capturedPatch).toBeDefined()
    expect(capturedPatch).toContain('-  const open = useRef(0)')
    expect(capturedPatch).toContain('+  const open = useRef(1)')
  })

  test('includes a contiguous preceding JSDoc block in the replaced range (no orphan/duplication)', async () => {
    const src = [
      '/**',
      ' * Original doc.',
      ' */',
      'export function documented() {',
      '  return 1',
      '}',
    ].join('\n')

    // Capture the apply patch passed through to str_replace so we can verify
    // end-to-end that the preceding JSDoc block is removed as part of the
    // replaced range (not left orphaned to be duplicated by the new content's
    // own doc block).
    let capturedPatch: string | undefined
    const requestClientToolCall = async (toolCall: any) => {
      capturedPatch = toolCall?.input?.content
      return [
        {
          type: 'json' as const,
          value: { file: 'svc.ts', message: 'applied' },
        },
      ]
    }

    const result = await handleRewriteSymbol({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 't5',
        input: {
          path: 'svc.ts',
          symbol: 'documented',
          content:
            '/**\n * New doc.\n */\nexport function documented() {\n  return 2\n}',
        },
      },
      fileProcessingState: freshState(),
      logger: noopLogger,
      requestClientToolCall,
      writeToClient: () => {},
      requestOptionalFile: async () => src,
    } as any)

    const value = outputJson(result)
    expect(value.errorMessage).toBeUndefined()
    expect(value.file).toBe('svc.ts')
    // The apply patch must REMOVE the old JSDoc block (as `-` diff lines) so it
    // is deleted atomically with the symbol — this is the end-to-end wiring
    // check for Gap #1. If the range were not extended, these lines would be
    // left as unchanged context and the new content's own doc block would
    // duplicate them.
    expect(capturedPatch).toBeDefined()
    // The old doc interior line must be REMOVED (prefixed with `-`), proving
    // the preceding JSDoc block was included in the replaced range. If the
    // range were not extended, this line would be left as unchanged context
    // (space-prefixed) and the new content's own doc block would duplicate it.
    expect(capturedPatch).toContain('- * Original doc.')
    // The new doc interior must be added.
    expect(capturedPatch).toContain('+ * New doc.')
    // No duplication: the old doc line must NOT also appear as unchanged
    // context (space-prefixed) in the same patch.
    expect(capturedPatch).not.toMatch(/^ \* Original doc\.$/m)
  })

  test('rewrites Python functions and class methods with indentation-aware spans', async () => {
    const source = [
      'class Greeter:',
      '    def greet(self, name):',
      '        return f"hi {name}"',
      '',
      'def helper():',
      '    return 1',
    ].join('\n')

    const method = await captureRewritePatch({
      path: 'service.py',
      symbol: 'greet',
      source,
      content: [
        '    def greet(self, name):',
        '        return f"hello {name}"',
      ].join('\n'),
    })
    expect(method.value.errorMessage).toBeUndefined()
    expect(method.patch).toContain('-        return f"hi {name}"')
    expect(method.patch).toContain('+        return f"hello {name}"')
    expect(method.patch).not.toMatch(/^[-+].*return 1/m)

    const fn = await captureRewritePatch({
      path: 'service.py',
      symbol: 'helper',
      source,
      content: ['def helper():', '    return 2'].join('\n'),
    })
    expect(fn.value.errorMessage).toBeUndefined()
    expect(fn.patch).toContain('-    return 1')
    expect(fn.patch).toContain('+    return 2')
  })

  test('rewrites Rust functions and impl methods without touching sibling items', async () => {
    const source = [
      'struct Counter {',
      '    value: i32,',
      '}',
      '',
      'impl Counter {',
      '    fn new() -> Self {',
      '        Self { value: 0 }',
      '    }',
      '}',
      '',
      'fn main() {',
      '    println!("ok");',
      '}',
    ].join('\n')

    const method = await captureRewritePatch({
      path: 'counter.rs',
      symbol: 'new',
      source,
      content: [
        '    fn new() -> Self {',
        '        Self { value: 1 }',
        '    }',
      ].join('\n'),
    })
    expect(method.value.errorMessage).toBeUndefined()
    expect(method.patch).toContain('-        Self { value: 0 }')
    expect(method.patch).toContain('+        Self { value: 1 }')
    expect(method.patch).not.toMatch(/^[-+].*println!/m)

    const fn = await captureRewritePatch({
      path: 'counter.rs',
      symbol: 'main',
      source,
      content: ['fn main() {', '    println!("done");', '}'].join('\n'),
    })
    expect(fn.value.errorMessage).toBeUndefined()
    expect(fn.patch).toContain('-    println!("ok");')
    expect(fn.patch).toContain('+    println!("done");')
  })

  test('rewrites Go functions and receiver methods without confusing type references', async () => {
    const source = [
      'package main',
      '',
      'type Server struct {',
      '\tName string',
      '}',
      '',
      'func New(name string) *Server {',
      '\treturn &Server{Name: name}',
      '}',
      '',
      'func (s *Server) Run() error {',
      '\treturn nil',
      '}',
    ].join('\n')

    const method = await captureRewritePatch({
      path: 'server.go',
      symbol: 'Run',
      source,
      content: [
        'func (s *Server) Run() error {',
        '\treturn fmt.Errorf("stopped")',
        '}',
      ].join('\n'),
    })
    expect(method.value.errorMessage).toBeUndefined()
    expect(method.patch).toContain('-\treturn nil')
    expect(method.patch).toContain('+\treturn fmt.Errorf("stopped")')
    expect(method.patch).not.toMatch(/^[-+].*Name string/m)

    const fn = await captureRewritePatch({
      path: 'server.go',
      symbol: 'New',
      source,
      content: [
        'func New(name string) *Server {',
        '\treturn &Server{Name: "updated-" + name}',
        '}',
      ].join('\n'),
    })
    expect(fn.value.errorMessage).toBeUndefined()
    expect(fn.patch).toContain('-\treturn &Server{Name: name}')
    expect(fn.patch).toContain('+\treturn &Server{Name: "updated-" + name}')
  })

  test('rewrites parser-supported Java and C# methods', async () => {
    const javaSource = [
      'class Service {',
      '  public void run() { helper(); }',
      '  private void helper() {}',
      '}',
    ].join('\n')
    const java = await captureRewritePatch({
      path: 'Service.java',
      symbol: 'run',
      source: javaSource,
      content: '  public void run() { helper(); helper(); }',
    })
    expect(java.value.errorMessage).toBeUndefined()
    expect(java.patch).toContain('-  public void run() { helper(); }')
    expect(java.patch).toContain('+  public void run() { helper(); helper(); }')
    expect(java.patch).not.toMatch(/^[-+].*private void helper/m)

    const csharpSource = [
      'class Worker {',
      '  public void Run() { Helper(); }',
      '  private void Helper() {}',
      '}',
    ].join('\n')
    const csharp = await captureRewritePatch({
      path: 'Worker.cs',
      symbol: 'Run',
      source: csharpSource,
      content: '  public void Run() { Helper(); Helper(); }',
    })
    expect(csharp.value.errorMessage).toBeUndefined()
    expect(csharp.patch).toContain('-  public void Run() { Helper(); }')
    expect(csharp.patch).toContain(
      '+  public void Run() { Helper(); Helper(); }',
    )
    expect(csharp.patch).not.toMatch(/^[-+].*private void Helper/m)
  })
})
