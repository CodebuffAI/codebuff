import { describe, expect, it, mock } from 'bun:test'
import { TEST_USER_ID } from 'common/constants'
import { cleanMarkdownCodeBlock } from 'common/util/file'
import { applyPatch } from 'common/util/patch'

// Mock logger
mock.module('../util/logger', () => ({
  logger: {
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
  },
  withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
}))

// Mock database interactions
mock.module('pg-pool', () => ({
  Pool: class {
    connect() {
      return {
        query: () => ({
          rows: [{ id: 'test-user-id' }],
          rowCount: 1,
        }),
        release: () => {},
      }
    }
  },
}))

// Mock message saving
mock.module('backend/llm-apis/message-cost-tracker', () => ({
  saveMessage: () => Promise.resolve(),
}))

// Mock the circular dependency with more realistic responses
mock.module('../llm-apis/vercel-ai-sdk/ai-sdk', () => ({
  promptAiSdk: mock((options: any) => {
    // Return the content that would be expected for the test
    const messages = options.messages || []
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.content) {
      // For the test cases, return the expected content
      if (lastMessage.content.includes('Hello, Manicode!')) {
        return Promise.resolve('function hello() {\r\n  console.log("Hello, Manicode!");\r\n  return "See you later!";\r\n}\r\n')
      }
      if (lastMessage.content.includes('typeof a !== \'number\'')) {
        return Promise.resolve('function add(a: number, b: number) {\n  if (typeof a !== \'number\' || typeof b !== \'number\') {\n    throw new Error(\'Invalid arguments\');\n  }\n  return a + b;\n}\n\nfunction multiply(a: number, b: number) {\n  if (typeof a !== \'number\' || typeof b !== \'number\') {\n    throw new Error(\'Invalid arguments\');\n  }\n  return a * b;\n}\n\nfunction divide(a: number, b: number) {\n  return a / b;\n}')
      }
      if (lastMessage.content.includes('const z = 3')) {
        return Promise.resolve('const x = 1;\r\nconst z = 3;\r\n')
      }
    }
    return Promise.resolve('mocked response')
  }),
}))

// Mock relace API with more realistic responses
mock.module('../llm-apis/relace-api', () => ({
  promptRelaceAI: mock((initialCode: string, editSnippet: string) => {
    // Return the edit snippet applied to the initial code for test cases
    if (editSnippet.includes('Hello, Manicode!')) {
      return Promise.resolve('function hello() {\r\n  console.log("Hello, Manicode!");\r\n  return "See you later!";\r\n}\r\n')
    }
    if (editSnippet.includes('const z = 3')) {
      return Promise.resolve('const x = 1;\r\nconst z = 3;\r\n')
    }
    return Promise.resolve('mocked relace response')
  }),
}))

import { processFileBlock } from '../process-file-block'

describe('cleanMarkdownCodeBlock', () => {
  it('should remove markdown code block syntax with language tag', () => {
    const input = '```typescript\nconst x = 1;\n```'
    expect(cleanMarkdownCodeBlock(input)).toBe('const x = 1;')
  })

  it('should remove markdown code block syntax without language tag', () => {
    const input = '```\nconst x = 1;\n```'
    expect(cleanMarkdownCodeBlock(input)).toBe('const x = 1;')
  })

  it('should return original content if not a code block', () => {
    const input = 'const x = 1;'
    expect(cleanMarkdownCodeBlock(input)).toBe('const x = 1;')
  })

  it('should handle multiline code blocks', () => {
    const input = '```javascript\nconst x = 1;\nconst y = 2;\n```'
    expect(cleanMarkdownCodeBlock(input)).toBe('const x = 1;\nconst y = 2;')
  })
})

describe('processFileBlock', () => {
  it('should handle markdown code blocks when creating new files', async () => {
    const newContent =
      '```typescript\nfunction test() {\n  return true;\n}\n```'
    const expectedContent = 'function test() {\n  return true;\n}'

    const result = await processFileBlock(
      'test.ts',
      Promise.resolve(null),
      newContent,
      [],
      '',
      undefined,
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      'normal'
    )

    expect(result).not.toBeNull()
    if ('error' in result) {
      throw new Error(`Expected success but got error: ${result.error}`)
    }
    expect(result.path).toBe('test.ts')
    expect(result.patch).toBeUndefined()
    expect(result.content).toBe(expectedContent)
  })

  it('should handle empty or whitespace-only changes', async () => {
    const oldContent = 'function test() {\n  return true;\n}\n'
    const newContent = 'function test() {\n  return true;\n}\n'

    const result = await processFileBlock(
      'test.ts',
      Promise.resolve(oldContent),
      newContent,
      [],
      '',
      undefined,
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      'normal'
    )

    expect(result).not.toBeNull()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('same as the old content')
    }
  })

  it('should return error when creating new file with lazy edit', async () => {
    const newContent = '// ... existing code ...\nconst x = 1;\n// ... existing code ...'

    const result = await processFileBlock(
      'test.ts',
      Promise.resolve(null),
      newContent,
      [],
      '',
      undefined,
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      'normal'
    )

    expect(result).not.toBeNull()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('placeholder comment')
      expect(result.error).toContain('meant to modify an existing file')
    }
  })
})
