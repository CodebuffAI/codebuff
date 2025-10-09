import { describe, expect, it } from 'bun:test'

import {
  simplifyReadFileResults,
  simplifyTerminalCommandResults,
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
    } as any

    const result = simplifyTerminalCommandResults(malformedInput)

    expect(result).toEqual([
      {
        type: 'json',
        value: {
          command: '',
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
          stdoutOmittedForLength: true,
          exitCode: 0,
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
          stdoutOmittedForLength: true,
          exitCode: 0,
        },
      },
    ])
  })
})
