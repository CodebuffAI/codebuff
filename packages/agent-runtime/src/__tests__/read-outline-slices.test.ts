import { describe, expect, it } from 'bun:test'
import { handleReadOutline } from '../tools/handlers/tool/read-outline'
import { handleReadSlices } from '../tools/handlers/tool/read-slices'

describe('read_outline handler', () => {
  it('returns outline of exports, imports, functions, classes, and types', async () => {
    const mockFileContent = `
import { something } from './somewhere'

export type MyType = {
  foo: string
}

export interface MyInterface {
  bar: number
}

export class MyClass {
  constructor() {}
  myMethod() {
    return 1
  }
}

export function myFunction(x: number) {
  return x + 1
}

const myArrow = (y: string) => {
  return y
}
`
    const requestOptionalFile = async (params: { filePath: string }) => {
      if (params.filePath === 'test.ts') {
        return mockFileContent
      }
      return null
    }

    const { output } = await handleReadOutline({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: 'test.ts',
        },
      },
      requestOptionalFile,
    } as any)

    const result = output[0].value
    expect(result.path).toBe('test.ts')
    // AST-backed outline: imports as header lines, definitions with line spans.
    expect(result.outline).toContain("Line 2: import { something } from './somewhere'")
    expect(result.outline).toContain('type MyType')
    expect(result.outline).toContain('interface MyInterface')
    expect(result.outline).toContain('class MyClass')
    expect(result.outline).toContain('method myMethod')
    expect(result.outline).toContain('function myFunction')
    // Spans are real ranges (start-end), not single lines.
    expect(result.outline).toMatch(/Lines 12-\d+: class MyClass/)
  })

  it('returns error message if file does not exist', async () => {
    const requestOptionalFile = async () => null

    const { output } = await handleReadOutline({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: 'nonexistent.ts',
        },
      },
      requestOptionalFile,
    } as any)

    const result = output[0].value
    expect(result.outline).toBe('Error: File does not exist.')
  })
})

describe('read_slices handler', () => {
  it('extracts targeted symbol implementation slices', async () => {
    const mockFileContent = `
const unusedValue = 42

function getTarget(a: number) {
  const b = a * 2
  return b
}

class AnotherSymbol {
  constructor() {
    this.hello = "world"
  }
}
`
    const requestOptionalFile = async (params: { filePath: string }) => {
      if (params.filePath === 'test.ts') {
        return mockFileContent
      }
      return null
    }

    const { output } = await handleReadSlices({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: 'test.ts',
          symbols: ['getTarget', 'AnotherSymbol'],
        },
      },
      requestOptionalFile,
    } as any)

    const result = output[0].value
    expect(result.path).toBe('test.ts')
    expect(result.slices).toHaveLength(2)

    const getTargetSlice = result.slices.find((s) => s.symbol === 'getTarget')
    expect(getTargetSlice).toBeDefined()
    expect(getTargetSlice!.content).toContain('function getTarget(a: number)')
    expect(getTargetSlice!.content).toContain('return b')
    expect(getTargetSlice!.startLine).toBe(4)
    expect(getTargetSlice!.endLine).toBe(7)

    const anotherSymbolSlice = result.slices.find((s) => s.symbol === 'AnotherSymbol')
    expect(anotherSymbolSlice).toBeDefined()
    expect(anotherSymbolSlice!.content).toContain('class AnotherSymbol')
    expect(anotherSymbolSlice!.startLine).toBe(9)
    expect(anotherSymbolSlice!.endLine).toBe(13)
  })

  it('returns empty slices if file does not exist', async () => {
    const requestOptionalFile = async () => null

    const { output } = await handleReadSlices({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        input: {
          path: 'nonexistent.ts',
          symbols: ['someSymbol'],
        },
      },
      requestOptionalFile,
    } as any)

    const result = output[0].value
    expect(result.slices).toHaveLength(0)
  })
})
