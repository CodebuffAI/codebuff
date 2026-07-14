import { describe, expect, it } from 'bun:test'

import {
  simplifyCodeSearchResults,
  simplifyQueryIndexResults,
  simplifyReadFileResults,
  simplifyReadSubtreeResults,
  simplifyTerminalCommandResults,
  simplifyToolResultContent,
  simplifyWebSearchResults,
  SUMMARIZABLE_TOOL_NAMES,
} from '../simplify-tool-results'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'

// Mock logger for tests
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('simplifyReadFileResults', () => {
  it('should simplify read file results by omitting content', () => {
    const input: CodebuffToolOutput<'read_files'> = [
      {
        type: 'json',
        value: [
          {
            path: 'src/file1.ts',
            content: 'const x = 1;\nconsole.log(x);',
            referencedBy: { 'file2.ts': ['line 5'] },
          },
          {
            path: 'src/file2.ts',
            content:
              'import { x } from "./file1";\nfunction test() { return x; }',
          },
        ],
      },
    ]

    const result = simplifyReadFileResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: [
          {
            path: 'src/file1.ts',
            contentOmittedForLength: true,
          },
          {
            path: 'src/file2.ts',
            contentOmittedForLength: true,
          },
        ],
      },
    ])
  })

  it('should handle empty file results', () => {
    const input: CodebuffToolOutput<'read_files'> = [
      {
        type: 'json',
        value: [],
      },
    ]

    const result = simplifyReadFileResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: [],
      },
    ])
  })

  it('should handle files with contentOmittedForLength already set', () => {
    const input: CodebuffToolOutput<'read_files'> = [
      {
        type: 'json',
        value: [
          {
            path: 'src/file1.ts',
            contentOmittedForLength: true,
          },
        ],
      },
    ]

    const result = simplifyReadFileResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: [
          {
            path: 'src/file1.ts',
            contentOmittedForLength: true,
          },
        ],
      },
    ])
  })

  it('should not mutate the original input', () => {
    const originalInput: CodebuffToolOutput<'read_files'> = [
      {
        type: 'json',
        value: [
          {
            path: 'src/file1.ts',
            content: 'const x = 1;',
          },
        ],
      },
    ]
    const input = structuredClone(originalInput)

    simplifyReadFileResults(input)

    // Original input should be unchanged
    expect(input).toEqual(originalInput)
  })
})

describe('simplifyTerminalCommandResults', () => {
  it('should simplify terminal command results with stdout', () => {
    const input: CodebuffToolOutput<'run_terminal_command'> = [
      {
        type: 'json',
        value: {
          command: 'npm test',
          startingCwd: '/project',
          message: 'Tests completed',
          stderr: '',
          stdout: 'Test suite passed\n✓ All tests passed',
          exitCode: 0,
        },
      },
    ]

    const result = simplifyTerminalCommandResults({
      messageContent: input,
      logger,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          command: 'npm test',
          status: 'passed',
          message: 'Tests completed',
          stdoutOmittedForLength: true,
          exitCode: 0,
        },
      },
    ])
  })

  it('should simplify terminal command results without message', () => {
    const input: CodebuffToolOutput<'run_terminal_command'> = [
      {
        type: 'json',
        value: {
          command: 'ls -la',
          stdout: 'file1.txt\nfile2.txt',
          exitCode: 0,
        },
      },
    ]

    const result = simplifyTerminalCommandResults({
      messageContent: input,
      logger,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          command: 'ls -la',
          status: 'passed',
          stdoutOmittedForLength: true,
          exitCode: 0,
        },
      },
    ])
  })

  it('should simplify terminal command results without exitCode', () => {
    const input: CodebuffToolOutput<'run_terminal_command'> = [
      {
        type: 'json',
        value: {
          command: 'echo hello',
          stdout: 'hello',
        },
      },
    ]

    const result = simplifyTerminalCommandResults({
      messageContent: input,
      logger,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          command: 'echo hello',
          status: 'unknown',
          stdoutOmittedForLength: true,
        },
      },
    ])
  })

  it('should handle background process results without simplification', () => {
    const input: CodebuffToolOutput<'run_terminal_command'> = [
      {
        type: 'json',
        value: {
          command: 'npm start',
          processId: 12345,
          backgroundProcessStatus: 'running' as const,
        },
      },
    ]

    const result = simplifyTerminalCommandResults({
      messageContent: input,
      logger,
    })

    expect(result).toEqual(input)
  })

  it('should handle error message results without simplification', () => {
    const input: CodebuffToolOutput<'run_terminal_command'> = [
      {
        type: 'json',
        value: {
          command: 'invalid-command',
          errorMessage: 'Command not found',
        },
      },
    ]

    const result = simplifyTerminalCommandResults({
      messageContent: input,
      logger,
    })

    expect(result).toEqual(input)
  })

  it('should handle results that already have stdoutOmittedForLength', () => {
    const input: CodebuffToolOutput<'run_terminal_command'> = [
      {
        type: 'json',
        value: {
          command: 'npm test',
          status: 'passed',
          message: 'Tests completed',
          stdoutOmittedForLength: true,
          exitCode: 0,
        },
      },
    ]

    const result = simplifyTerminalCommandResults({
      messageContent: input,
      logger,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          command: 'npm test',
          status: 'passed',
          message: 'Tests completed',
          stdoutOmittedForLength: true,
          exitCode: 0,
        },
      },
    ])
  })

  it('should handle errors gracefully and return fallback result', () => {
    // Create input that will cause an error during processing
    const malformedInput = {
      invalidStructure: true,
      logger,
    } as unknown as Parameters<typeof simplifyTerminalCommandResults>[0]

    const result = simplifyTerminalCommandResults(malformedInput)

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          command: '',
          status: 'unknown',
          stdoutOmittedForLength: true,
        },
      },
    ])
  })

  it('should not mutate the original input', () => {
    const originalInput: CodebuffToolOutput<'run_terminal_command'> = [
      {
        type: 'json',
        value: {
          command: 'npm test',
          stdout: 'Test output',
          exitCode: 0,
        },
      },
    ]
    const input = structuredClone(originalInput)

    simplifyTerminalCommandResults({ messageContent: input, logger })

    // Original input should be unchanged
    expect(input).toEqual(originalInput)
  })

  it('should handle terminal command with stderr', () => {
    const input: CodebuffToolOutput<'run_terminal_command'> = [
      {
        type: 'json',
        value: {
          command: 'npm test',
          stderr: 'Warning: deprecated package',
          stdout: 'Tests passed',
          exitCode: 0,
        },
      },
    ]

    const result = simplifyTerminalCommandResults({
      messageContent: input,
      logger,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          command: 'npm test',
          status: 'passed',
          stdoutOmittedForLength: true,
          stderrExcerpt: 'Warning: deprecated package',
          exitCode: 0,
        },
      },
    ])
  })

  it('should include failed command stdout excerpt', () => {
    const input: CodebuffToolOutput<'run_terminal_command'> = [
      {
        type: 'json',
        value: {
          command: 'npm test',
          stdout: 'Expected true to be false',
          exitCode: 1,
        },
      },
    ]

    const result = simplifyTerminalCommandResults({
      messageContent: input,
      logger,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          command: 'npm test',
          status: 'failed',
          stdoutOmittedForLength: true,
          stdoutExcerpt: 'Expected true to be false',
          exitCode: 1,
        },
      },
    ])
  })

  it('should handle terminal command with startingCwd', () => {
    const input: CodebuffToolOutput<'run_terminal_command'> = [
      {
        type: 'json',
        value: {
          command: 'pwd',
          startingCwd: '/home/user/project',
          stdout: '/home/user/project',
          exitCode: 0,
        },
      },
    ]

    const result = simplifyTerminalCommandResults({
      messageContent: input,
      logger,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          command: 'pwd',
          status: 'passed',
          stdoutOmittedForLength: true,
          exitCode: 0,
        },
      },
    ])
  })
})

describe('simplifyCodeSearchResults', () => {
  it('should simplify code search results by omitting stdout', () => {
    const stdout = 'src/file1.ts:10:const x = 1\nsrc/file2.ts:20:const y = 2'
    const input: CodebuffToolOutput<'code_search'> = [
      {
        type: 'json',
        value: {
          stdout,
          stderr: '',
          exitCode: 0,
          message: 'Found 2 matches',
        },
      },
    ]

    const result = simplifyCodeSearchResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          message: 'Found 2 matches',
          status: 'passed',
          stdoutOmittedForLength: true,
          stdoutExcerpt: stdout,
          exitCode: 0,
        },
      },
    ])
  })

  it('should include stderr excerpt when stderr is present', () => {
    const stdout = 'src/file1.ts:10:const x = 1'
    const input: CodebuffToolOutput<'code_search'> = [
      {
        type: 'json',
        value: {
          stdout,
          stderr: 'Warning: deprecated',
          exitCode: 0,
          message: 'Found 1 match',
        },
      },
    ]

    const result = simplifyCodeSearchResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          message: 'Found 1 match',
          status: 'passed',
          stdoutOmittedForLength: true,
          stdoutExcerpt: stdout,
          stderrExcerpt: 'Warning: deprecated',
          exitCode: 0,
        },
      },
    ])
  })

  it('should handle results without exitCode', () => {
    const stdout = 'src/file1.ts:10:const x = 1'
    const input: CodebuffToolOutput<'code_search'> = [
      {
        type: 'json',
        value: {
          stdout,
          message: 'Found 1 match',
        },
      },
    ]

    const result = simplifyCodeSearchResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          message: 'Found 1 match',
          status: 'unknown',
          stdoutOmittedForLength: true,
          stdoutExcerpt: stdout,
        },
      },
    ])
  })

  it('should handle error message results without simplification', () => {
    const input: CodebuffToolOutput<'code_search'> = [
      {
        type: 'json',
        value: {
          errorMessage: 'Search failed',
        },
      },
    ]

    const result = simplifyCodeSearchResults(input)

    expect(result).toEqual(input)
  })

  it('should handle results that already have stdoutOmittedForLength', () => {
    const input: CodebuffToolOutput<'code_search'> = [
      {
        type: 'json',
        value: {
          message: 'Found 2 matches',
          status: 'passed',
          stdoutOmittedForLength: true,
          exitCode: 0,
        },
      },
    ]

    const result = simplifyCodeSearchResults(input)

    expect(result).toEqual(input)
  })

  it('should not mutate the original input', () => {
    const originalInput: CodebuffToolOutput<'code_search'> = [
      {
        type: 'json',
        value: {
          stdout: 'src/file1.ts:10:const x = 1',
          exitCode: 0,
          message: 'Found 1 match',
        },
      },
    ]
    const input = structuredClone(originalInput)

    simplifyCodeSearchResults(input)

    expect(input).toEqual(originalInput)
  })
})

describe('simplifyReadSubtreeResults', () => {
  it('should simplify directory entries by omitting printedTree', () => {
    const input: CodebuffToolOutput<'read_subtree'> = [
      {
        type: 'json',
        value: [
          {
            path: 'src',
            type: 'directory',
            printedTree: 'src/\n  file1.ts\n  file2.ts',
            tokenCount: 100,
            truncationLevel: 'none',
          },
        ],
      },
    ]

    const result = simplifyReadSubtreeResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: [
          {
            path: 'src',
            type: 'directory',
            tokenCount: 100,
            truncationLevel: 'none',
            printedTreeOmittedForLength: true,
          },
        ],
      },
    ])
  })

  it('should simplify file entries by omitting variables', () => {
    const input: CodebuffToolOutput<'read_subtree'> = [
      {
        type: 'json',
        value: [
          {
            path: 'src/file1.ts',
            type: 'file',
            variables: ['func1', 'func2', 'const1'],
          },
        ],
      },
    ]

    const result = simplifyReadSubtreeResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: [
          {
            path: 'src/file1.ts',
            type: 'file',
            variablesOmittedForLength: true,
          },
        ],
      },
    ])
  })

  it('should handle mixed directory and file entries', () => {
    const input: CodebuffToolOutput<'read_subtree'> = [
      {
        type: 'json',
        value: [
          {
            path: 'src',
            type: 'directory',
            printedTree: 'src/\n  file1.ts',
            tokenCount: 50,
            truncationLevel: 'none',
          },
          {
            path: 'src/file1.ts',
            type: 'file',
            variables: ['func1'],
          },
        ],
      },
    ]

    const result = simplifyReadSubtreeResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: [
          {
            path: 'src',
            type: 'directory',
            tokenCount: 50,
            truncationLevel: 'none',
            printedTreeOmittedForLength: true,
          },
          {
            path: 'src/file1.ts',
            type: 'file',
            variablesOmittedForLength: true,
          },
        ],
      },
    ])
  })

  it('should handle error message entries without simplification', () => {
    const input: CodebuffToolOutput<'read_subtree'> = [
      {
        type: 'json',
        value: [
          {
            path: 'nonexistent',
            errorMessage: 'Path not found',
          },
        ],
      },
    ]

    const result = simplifyReadSubtreeResults(input)

    expect(result).toEqual(input)
  })

  it('should handle entries that already have printedTreeOmittedForLength', () => {
    const input: CodebuffToolOutput<'read_subtree'> = [
      {
        type: 'json',
        value: [
          {
            path: 'src',
            type: 'directory',
            tokenCount: 100,
            truncationLevel: 'none',
            printedTreeOmittedForLength: true,
          },
        ],
      },
    ]

    const result = simplifyReadSubtreeResults(input)

    expect(result).toEqual(input)
  })

  it('should not mutate the original input', () => {
    const originalInput: CodebuffToolOutput<'read_subtree'> = [
      {
        type: 'json',
        value: [
          {
            path: 'src',
            type: 'directory',
            printedTree: 'src/\n  file1.ts',
            tokenCount: 50,
            truncationLevel: 'none',
          },
        ],
      },
    ]
    const input = structuredClone(originalInput)

    simplifyReadSubtreeResults(input)

    expect(input).toEqual(originalInput)
  })
})

describe('simplifyQueryIndexResults', () => {
  it('should simplify query index results by omitting matchedSnippets', () => {
    const input: CodebuffToolOutput<'query_index'> = [
      {
        type: 'json',
        value: {
          kind: 'query_index_result',
          schemaVersion: 1,
          results: [
            {
              path: 'src/file1.ts',
              score: 100,
              matchedOn: ['symbol'],
              symbols: ['func1'],
              headings: ['Overview'],
              matchedSnippets: ['const func1 = () => {}'],
              relatedFiles: [
                { path: 'src/file2.ts', score: 50, reason: 'import' },
              ],
              explanation: 'Matched by symbol name',
            },
          ],
          totalIndexed: 100,
          indexAge: 1000,
          message: 'Found 1 result',
        },
      },
    ]

    const result = simplifyQueryIndexResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          kind: 'query_index_result',
          schemaVersion: 1,
          results: [
            {
              path: 'src/file1.ts',
              score: 100,
              matchedOn: ['symbol'],
              symbols: ['func1'],
              headings: ['Overview'],
              matchedSnippetsOmittedForLength: true,
              relatedFilesOmittedForLength: true,
              explanation: 'Matched by symbol name',
            },
          ],
          totalIndexed: 100,
          indexAge: 1000,
          message: 'Found 1 result',
        },
      },
    ])
  })

  it('should handle results without relatedFiles', () => {
    const input: CodebuffToolOutput<'query_index'> = [
      {
        type: 'json',
        value: {
          kind: 'query_index_result',
          schemaVersion: 1,
          results: [
            {
              path: 'src/file1.ts',
              score: 100,
              matchedOn: ['symbol'],
              matchedSnippets: ['const func1 = () => {}'],
            },
          ],
          totalIndexed: 100,
          indexAge: 1000,
          message: 'Found 1 result',
        },
      },
    ]

    const result = simplifyQueryIndexResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          kind: 'query_index_result',
          schemaVersion: 1,
          results: [
            {
              path: 'src/file1.ts',
              score: 100,
              matchedOn: ['symbol'],
              matchedSnippetsOmittedForLength: true,
            },
          ],
          totalIndexed: 100,
          indexAge: 1000,
          message: 'Found 1 result',
        },
      },
    ])
  })

  it('should handle results that already have matchedSnippetsOmittedForLength', () => {
    const input: CodebuffToolOutput<'query_index'> = [
      {
        type: 'json',
        value: {
          kind: 'query_index_result',
          schemaVersion: 1,
          results: [
            {
              path: 'src/file1.ts',
              score: 100,
              matchedOn: ['symbol'],
              matchedSnippetsOmittedForLength: true,
            },
          ],
          totalIndexed: 100,
          indexAge: 1000,
          message: 'Found 1 result',
        },
      },
    ]

    const result = simplifyQueryIndexResults(input)

    expect(result).toEqual(input)
  })

  it('should not mutate the original input', () => {
    const originalInput: CodebuffToolOutput<'query_index'> = [
      {
        type: 'json',
        value: {
          kind: 'query_index_result',
          schemaVersion: 1,
          results: [
            {
              path: 'src/file1.ts',
              score: 100,
              matchedOn: ['symbol'],
              matchedSnippets: ['const func1 = () => {}'],
            },
          ],
          totalIndexed: 100,
          indexAge: 1000,
          message: 'Found 1 result',
        },
      },
    ]
    const input = structuredClone(originalInput)

    simplifyQueryIndexResults(input)

    expect(input).toEqual(originalInput)
  })
})

describe('simplifyWebSearchResults', () => {
  it('should simplify web search results by omitting result', () => {
    const resultText = 'This is a search result that should be omitted'
    const input: CodebuffToolOutput<'web_search'> = [
      {
        type: 'json',
        value: {
          result: resultText,
          links: [
            { href: 'https://example.com', text: 'Example' },
            { href: 'https://example2.com', text: 'Example 2' },
          ],
        },
      },
    ]

    const result = simplifyWebSearchResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          resultOmittedForLength: true,
          resultExcerpt: resultText,
          links: [
            { href: 'https://example.com', text: 'Example' },
            { href: 'https://example2.com', text: 'Example 2' },
          ],
        },
      },
    ])
  })

  it('should cap links at 5', () => {
    const links = Array.from({ length: 8 }, (_, i) => ({
      href: `https://example${i}.com`,
      text: `Example ${i}`,
    }))
    const input: CodebuffToolOutput<'web_search'> = [
      {
        type: 'json',
        value: {
          result: 'Long result text',
          links,
        },
      },
    ]

    const result = simplifyWebSearchResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          resultOmittedForLength: true,
          resultExcerpt: 'Long result text',
          links: links.slice(0, 5),
        },
      },
    ])
  })

  it('should handle results without links', () => {
    const input: CodebuffToolOutput<'web_search'> = [
      {
        type: 'json',
        value: {
          result: 'Search result text',
        },
      },
    ]

    const result = simplifyWebSearchResults(input)

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          resultOmittedForLength: true,
          resultExcerpt: 'Search result text',
        },
      },
    ])
  })

  it('should handle error message results without simplification', () => {
    const input: CodebuffToolOutput<'web_search'> = [
      {
        type: 'json',
        value: {
          errorMessage: 'Search failed',
        },
      },
    ]

    const result = simplifyWebSearchResults(input)

    expect(result).toEqual(input)
  })

  it('should handle results that already have resultOmittedForLength', () => {
    const input: CodebuffToolOutput<'web_search'> = [
      {
        type: 'json',
        value: {
          resultOmittedForLength: true,
          resultExcerpt: 'Excerpt...',
        },
      },
    ]

    const result = simplifyWebSearchResults(input)

    expect(result).toEqual(input)
  })

  it('should not mutate the original input', () => {
    const originalInput: CodebuffToolOutput<'web_search'> = [
      {
        type: 'json',
        value: {
          result: 'Search result text',
          links: [{ href: 'https://example.com', text: 'Example' }],
        },
      },
    ]
    const input = structuredClone(originalInput)

    simplifyWebSearchResults(input)

    expect(input).toEqual(originalInput)
  })
})

describe('simplifyToolResultContent', () => {
  it('should dispatch to simplifyCodeSearchResults for code_search', () => {
    const stdout = 'src/file1.ts:10:const x = 1'
    const content: CodebuffToolOutput<'code_search'> = [
      {
        type: 'json',
        value: {
          stdout,
          exitCode: 0,
          message: 'Found 1 match',
        },
      },
    ]

    const result = simplifyToolResultContent({
      toolName: 'code_search',
      content,
      logger,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          message: 'Found 1 match',
          status: 'passed',
          stdoutOmittedForLength: true,
          stdoutExcerpt: stdout,
          exitCode: 0,
        },
      },
    ])
  })

  it('should dispatch to simplifyReadSubtreeResults for read_subtree', () => {
    const content: CodebuffToolOutput<'read_subtree'> = [
      {
        type: 'json',
        value: [
          {
            path: 'src',
            type: 'directory',
            printedTree: 'src/\n  file1.ts',
            tokenCount: 50,
            truncationLevel: 'none',
          },
        ],
      },
    ]

    const result = simplifyToolResultContent({
      toolName: 'read_subtree',
      content,
      logger,
    })

    expect(result).toEqual([
      {
        type: 'json',
        value: [
          {
            path: 'src',
            type: 'directory',
            tokenCount: 50,
            truncationLevel: 'none',
            printedTreeOmittedForLength: true,
          },
        ],
      },
    ])
  })

  it('should return content unchanged for unknown tool names', () => {
    const content = [
      {
        type: 'json' as const,
        value: { someData: 'test' },
      },
    ] as unknown as CodebuffToolOutput

    const result = simplifyToolResultContent({
      toolName: 'unknown_tool',
      content,
      logger,
    })

    expect(result).toEqual(content)
  })

  it('should return content unchanged on error', () => {
    const content = { invalid: true } as unknown as CodebuffToolOutput

    const result = simplifyToolResultContent({
      toolName: 'code_search',
      content,
      logger,
    })

    expect(result).toEqual(content)
  })
})

describe('SUMMARIZABLE_TOOL_NAMES', () => {
  it('should include all summarizable tool names', () => {
    expect(SUMMARIZABLE_TOOL_NAMES.has('run_terminal_command')).toBe(true)
    expect(SUMMARIZABLE_TOOL_NAMES.has('code_search')).toBe(true)
    expect(SUMMARIZABLE_TOOL_NAMES.has('read_subtree')).toBe(true)
    expect(SUMMARIZABLE_TOOL_NAMES.has('query_index')).toBe(true)
    expect(SUMMARIZABLE_TOOL_NAMES.has('web_search')).toBe(true)
    expect(SUMMARIZABLE_TOOL_NAMES.has('read_files')).toBe(true)
  })

  it('should not include non-summarizable tool names', () => {
    expect(SUMMARIZABLE_TOOL_NAMES.has('write_file')).toBe(false)
    expect(SUMMARIZABLE_TOOL_NAMES.has('str_replace')).toBe(false)
    expect(SUMMARIZABLE_TOOL_NAMES.has('unknown_tool')).toBe(false)
  })
})
