import { describe, it, expect, mock } from 'bun:test'

import { handleGlob } from '../tool/glob'

import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'

interface GlobResultValue {
  files?: string[]
  count?: number
  message?: string
  errorMessage?: string
}

describe('handleGlob', () => {
  it('delegates to requestClientToolCall and returns matching files', async () => {
    const mockRequestClientToolCall = mock(
      async (): Promise<CodebuffToolOutput<'glob'>> => [
        {
          type: 'json',
          value: {
            files: [
              'src/index.ts',
              'src/utils.ts',
              'src/components/Button.tsx',
            ],
            count: 3,
            message: 'Found 3 file(s) matching pattern "**/*.ts"',
          },
        },
      ],
    )

    const toolCall: CodebuffToolCall<'glob'> = {
      toolName: 'glob',
      toolCallId: 'tc-1',
      input: {
        pattern: '**/*.ts',
      },
    }

    const { output } = await handleGlob({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall: mockRequestClientToolCall,
    })

    expect(mockRequestClientToolCall).toHaveBeenCalledWith(toolCall)
    expect(Array.isArray(output)).toBe(true)
    expect(output[0].type).toBe('json')
    const value = output[0].value as GlobResultValue
    expect(value.files).toEqual([
      'src/index.ts',
      'src/utils.ts',
      'src/components/Button.tsx',
    ])
    expect(value.count).toBe(3)
    expect(value.message).toContain('Found 3 file(s)')
  })

  it('handles glob pattern with cwd parameter', async () => {
    const mockRequestClientToolCall = mock(
      async (): Promise<CodebuffToolOutput<'glob'>> => [
        {
          type: 'json',
          value: {
            files: ['src/components/Button.tsx', 'src/components/Input.tsx'],
            count: 2,
            message:
              'Found 2 file(s) matching pattern "*.tsx" in directory "src/components"',
          },
        },
      ],
    )

    const toolCall: CodebuffToolCall<'glob'> = {
      toolName: 'glob',
      toolCallId: 'tc-2',
      input: {
        pattern: '*.tsx',
        cwd: 'src/components',
      },
    }

    const { output } = await handleGlob({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall: mockRequestClientToolCall,
    })

    expect(mockRequestClientToolCall).toHaveBeenCalledWith(toolCall)
    expect(output[0].type).toBe('json')
    const value = output[0].value as GlobResultValue
    expect(value.files).toEqual([
      'src/components/Button.tsx',
      'src/components/Input.tsx',
    ])
    expect(value.count).toBe(2)
    expect(value.message).toContain('src/components')
  })

  it('handles glob pattern that matches all files with **/*', async () => {
    const mockRequestClientToolCall = mock(
      async (): Promise<CodebuffToolOutput<'glob'>> => [
        {
          type: 'json',
          value: {
            files: [
              'package.json',
              'README.md',
              'src/index.ts',
              'src/utils.ts',
              'lib/helper.js',
            ],
            count: 5,
            message: 'Found 5 file(s) matching pattern "**/*"',
          },
        },
      ],
    )

    const toolCall: CodebuffToolCall<'glob'> = {
      toolName: 'glob',
      toolCallId: 'tc-3',
      input: {
        pattern: '**/*',
      },
    }

    const { output } = await handleGlob({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall: mockRequestClientToolCall,
    })

    expect(mockRequestClientToolCall).toHaveBeenCalledWith(toolCall)
    const value = output[0].value as GlobResultValue
    expect(value.count).toBe(5)
    expect(value.files?.length).toBe(5)
  })

  it('handles glob pattern with no matches', async () => {
    const mockRequestClientToolCall = mock(
      async (): Promise<CodebuffToolOutput<'glob'>> => [
        {
          type: 'json',
          value: {
            files: [],
            count: 0,
            message: 'Found 0 file(s) matching pattern "*.py"',
          },
        },
      ],
    )

    const toolCall: CodebuffToolCall<'glob'> = {
      toolName: 'glob',
      toolCallId: 'tc-4',
      input: {
        pattern: '*.py',
      },
    }

    const { output } = await handleGlob({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall: mockRequestClientToolCall,
    })

    expect(mockRequestClientToolCall).toHaveBeenCalledWith(toolCall)
    const value = output[0].value as GlobResultValue
    expect(value.files).toEqual([])
    expect(value.count).toBe(0)
  })

  it('handles brace expansion patterns', async () => {
    const mockRequestClientToolCall = mock(
      async (): Promise<CodebuffToolOutput<'glob'>> => [
        {
          type: 'json',
          value: {
            files: [
              'src/index.ts',
              'src/utils.ts',
              'src/components/Button.tsx',
              'lib/helper.js',
            ],
            count: 4,
            message: 'Found 4 file(s) matching pattern "**/*.{ts,tsx,js}"',
          },
        },
      ],
    )

    const toolCall: CodebuffToolCall<'glob'> = {
      toolName: 'glob',
      toolCallId: 'tc-5',
      input: {
        pattern: '**/*.{ts,tsx,js}',
      },
    }

    const { output } = await handleGlob({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall: mockRequestClientToolCall,
    })

    expect(mockRequestClientToolCall).toHaveBeenCalledWith(toolCall)
    const value = output[0].value as GlobResultValue
    expect(value.count).toBe(4)
    expect(value.files?.length).toBe(4)
  })

  it('handles error responses from client', async () => {
    const mockRequestClientToolCall = mock(
      async (): Promise<CodebuffToolOutput<'glob'>> => [
        {
          type: 'json',
          value: {
            errorMessage: 'Failed to search for files: Invalid pattern',
          },
        },
      ],
    )

    const toolCall: CodebuffToolCall<'glob'> = {
      toolName: 'glob',
      toolCallId: 'tc-6',
      input: {
        pattern: '[invalid',
      },
    }

    const { output } = await handleGlob({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall: mockRequestClientToolCall,
    })

    expect(mockRequestClientToolCall).toHaveBeenCalledWith(toolCall)
    const value = output[0].value as GlobResultValue
    expect(value.errorMessage).toBeDefined()
    expect(value.errorMessage).toContain('Failed to search for files')
  })

  it('waits for previous tool call to finish before executing', async () => {
    let previousFinished = false
    const previousToolCallFinished = new Promise<void>((resolve) => {
      setTimeout(() => {
        previousFinished = true
        resolve()
      }, 10)
    })

    const mockRequestClientToolCall = mock(
      async (): Promise<CodebuffToolOutput<'glob'>> => {
        expect(previousFinished).toBe(true)
        return [
          {
            type: 'json',
            value: {
              files: ['test.ts'],
              count: 1,
              message: 'Found 1 file(s) matching pattern "test.ts"',
            },
          },
        ]
      },
    )

    const toolCall: CodebuffToolCall<'glob'> = {
      toolName: 'glob',
      toolCallId: 'tc-7',
      input: {
        pattern: 'test.ts',
      },
    }

    const { output: _output } = await handleGlob({
      previousToolCallFinished,
      toolCall,
      requestClientToolCall: mockRequestClientToolCall,
    })

    expect(previousFinished).toBe(true)
    expect(mockRequestClientToolCall).toHaveBeenCalled()
  })

  it('handles nested directory patterns with cwd', async () => {
    const mockRequestClientToolCall = mock(
      async (): Promise<CodebuffToolOutput<'glob'>> => [
        {
          type: 'json',
          value: {
            files: [
              'src/components/Button.tsx',
              'src/components/Input.tsx',
              'src/components/Modal.tsx',
            ],
            count: 3,
            message:
              'Found 3 file(s) matching pattern "components/*.tsx" in directory "src"',
          },
        },
      ],
    )

    const toolCall: CodebuffToolCall<'glob'> = {
      toolName: 'glob',
      toolCallId: 'tc-8',
      input: {
        pattern: 'components/*.tsx',
        cwd: 'src',
      },
    }

    const { output } = await handleGlob({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      requestClientToolCall: mockRequestClientToolCall,
    })

    expect(mockRequestClientToolCall).toHaveBeenCalledWith(toolCall)
    const value = output[0].value as GlobResultValue
    expect(value.files?.length).toBe(3)
    expect(value.files?.every((f) => f.includes('components'))).toBe(
      true,
    )
  })
})
