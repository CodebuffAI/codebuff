import { describe, expect, it } from 'bun:test'
import { handleReadOutline } from '../tools/handlers/tool/read-outline'

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
      fileContext: { projectRoot: '/repo' },
    } as any)

    const result = output[0].value
    expect(result.path).toBe('test.ts')
    // AST-backed outline: imports as header lines, definitions with line spans.
    expect(result.outline).toContain(
      "Line 2: import { something } from './somewhere'",
    )
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
      fileContext: { projectRoot: '/repo' },
    } as any)

    const result = output[0].value
    expect(result.outline).toBe('Error: File does not exist.')
  })
})

describe('read_outline path containment', () => {
  const makeParams = (
    path: string,
    requestOptionalFile: (p: { filePath: string }) => Promise<string | null>,
  ) =>
    ({
      previousToolCallFinished: Promise.resolve(),
      toolCall: { input: { path } },
      requestOptionalFile,
      // Anchor containment to a synthetic project root so the rejection
      // cases (`/etc/passwd`, `../outside.ts`) resolve as outside the
      // project and the acceptance case (`src/file.ts`) resolves as
      // inside, regardless of `process.cwd()` at test time.
      fileContext: { projectRoot: '/repo' },
    }) as any

  it('rejects absolute paths outside the project with the legacy error message', async () => {
    let called = false
    const requestOptionalFile = async (_p: { filePath: string }) => {
      called = true
      return 'content'
    }
    const { output } = await handleReadOutline(
      makeParams('/etc/passwd', requestOptionalFile),
    )
    const result = output[0].value
    expect(result.outline).toBe('Error: File does not exist.')
    expect(called).toBe(false)
  })

  it('rejects parent-traversal paths with the legacy error message', async () => {
    let called = false
    const requestOptionalFile = async (_p: { filePath: string }) => {
      called = true
      return 'content'
    }
    const { output } = await handleReadOutline(
      makeParams('../outside.ts', requestOptionalFile),
    )
    const result = output[0].value
    expect(result.outline).toBe('Error: File does not exist.')
    expect(called).toBe(false)
  })

  it('still loads project-relative paths', async () => {
    const requestOptionalFile = async (p: { filePath: string }) => {
      if (p.filePath === 'src/file.ts') {
        return 'export const x = 1\n'
      }
      return null
    }
    const { output } = await handleReadOutline(
      makeParams('src/file.ts', requestOptionalFile),
    )
    const result = output[0].value
    // AST outline surfaces `export const x = 1` as a variable on line 1.
    expect(result.outline).toContain('variable x')
  })
})
