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
})
