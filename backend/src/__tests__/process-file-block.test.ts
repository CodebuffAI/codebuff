import { describe, expect, it, mock } from 'bun:test'
import { TEST_USER_ID } from 'common/constants'
import { cleanMarkdownCodeBlock } from 'common/util/file'
import { applyPatch } from 'common/util/patch'

import { processFileBlock } from '../process-file-block'
import * as originalModule from '../process-file-block'

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

// Mock handleLargeFile
const mockHandleLargeFile = mock(() => Promise.resolve('mocked large file content'))

mock.module('../process-file-block', () => ({
  ...originalModule,
  handleLargeFile: mockHandleLargeFile,
}))

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
      null, // userPrompt
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      'normal',
      null, // orgId
      null // repoUrl
    )

    expect(result).not.toBeNull()
    if ('error' in result) {
      throw new Error(`Expected success but got error: ${result.error}`)
    }
    expect(result.path).toBe('test.ts')
    expect(result.patch).toBeUndefined()
    expect(result.content).toBe(expectedContent)
  })

  it('should handle Windows line endings with multi-line changes', async () => {
    const oldContent =
      'function hello() {\r\n' +
      '  console.log("Hello, world!");\r\n' +
      '  return "Goodbye";\r\n' +
      '}\r\n'

    const newContent =
      'function hello() {\r\n' +
      '  console.log("Hello, Manicode!");\r\n' +
      '  return "See you later!";\r\n' +
      '}\r\n'

    const result = await processFileBlock(
      'test.ts',
      Promise.resolve(oldContent),
      newContent,
      [],
      '',
      null, // userPrompt
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      'normal',
      null, // orgId
      null // repoUrl
    )

    expect(result).not.toBeNull()
    if ('error' in result) {
      throw new Error(`Expected success but got error: ${result.error}`)
    }

    expect(result.path).toBe('test.ts')
    expect(result.content).toBe(newContent)
    expect(result.patch).toBeDefined()
    if (result.patch) {
      const updatedFile = applyPatch(oldContent, result.patch)
      expect(updatedFile).toBe(newContent)
    }
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
      null, // userPrompt
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      'normal',
      null, // orgId
      null // repoUrl
    )

    expect(result).not.toBeNull()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('same as the old content')
    }
  })

  it('should handle multiple diff blocks in a single file', async () => {
    const oldContent = `
function add(a: number, b: number) {
  return a + b;
}

function multiply(a: number, b: number) {
  return a * b;
}

function divide(a: number, b: number) {
  return a / b;
}
`.trim()

    const newContent =
      `<<<<<<< SEARCH
function add(a: number, b: number) {
  return a + b;
}
=======
function add(a: number, b: number) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Invalid arguments');
  }
  return a + b;
}
>>>>>>> REPLACE` +
      `
 
` +
      `<<<<<<< SEARCH
function multiply(a: number, b: number) {
  return a * b;
}
=======
function multiply(a: number, b: number) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Invalid arguments');
  }
  return a * b;
}
>>>>>>> REPLACE

function divide(a: number, b: number) {
  return a / b;
}`

    const result = await processFileBlock(
      'test.ts',
      Promise.resolve(oldContent),
      newContent,
      [],
      '',
      null, // userPrompt
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      'normal',
      null, // orgId
      null // repoUrl
    )

    expect(result).not.toBeNull()
    if ('error' in result) {
      throw new Error(`Expected success but got error: ${result.error}`)
    }
    expect(result.path).toBe('test.ts')
    expect(result.patch).toBeDefined()
    if (result.patch) {
      const updatedContent = applyPatch(oldContent, result.patch)
      expect(updatedContent).toContain(
        "if (typeof a !== 'number' || typeof b !== 'number')"
      )
      expect(
        updatedContent.match(
          /if \(typeof a !== 'number' \|\| typeof b !== 'number'\)/g
        )?.length
      ).toBe(2)
    }
  })

  it('should preserve Windows line endings in patch and content', async () => {
    const oldContent = 'const x = 1;\r\nconst y = 2;\r\n'
    const newContent = 'const x = 1;\r\nconst z = 3;\r\n'

    const result = await processFileBlock(
      'test.ts',
      Promise.resolve(oldContent),
      newContent,
      [],
      '',
      null, // userPrompt
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      'normal',
      null, // orgId
      null // repoUrl
    )

    expect(result).not.toBeNull()
    if ('error' in result) {
      throw new Error(`Expected success but got error: ${result.error}`)
    }

    // Verify content has Windows line endings
    expect(result.content).toBe(newContent)
    expect(result.content).toContain('\r\n')
    expect(result.content.split('\r\n').length).toBe(3) // 2 lines + empty line

    // Verify patch has Windows line endings
    expect(result.patch).toBeDefined()
    if (result.patch) {
      expect(result.patch).toContain('\r\n')
      const updatedFile = applyPatch(oldContent, result.patch)
      expect(updatedFile).toBe(newContent)

      // Verify patch can be applied and preserves line endings
      const patchLines = result.patch.split('\r\n')
      expect(patchLines.some((line) => line.startsWith('-const y'))).toBe(true)
      expect(patchLines.some((line) => line.startsWith('+const z'))).toBe(true)
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
      null, // userPrompt
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      'normal',
      null, // orgId
      null // repoUrl
    )

    expect(result).not.toBeNull()
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('placeholder comment')
      expect(result.error).toContain('meant to modify an existing file')
    }
  })

  it('should handle new file creation with initial content', async () => {
    const result = await processFileBlock(
      'test.txt',
      Promise.resolve('initial content'),
      'new content',
      [], // messages
      '', // fullResponse
      null, // userPrompt
      'test-client-session-id',
      'test-fingerprint-id',
      'test-user-input-id',
      'test-user-id',
      'normal', // costMode
      null, // orgId
      null // repoUrl
    )
    expect(result.tool).toBe('write_file')
    if (result.tool === 'write_file' && 'content' in result) {
      expect(result.content).toBe('new content')
    }
  })

  it('should handle new file creation with no initial content', async () => {
    const result = await processFileBlock(
      'test.txt',
      Promise.resolve(null), // No initial content (new file)
      'new file content',
      [], // messages
      '', // fullResponse
      null, // userPrompt
      'test-client-session-id',
      'test-fingerprint-id',
      'test-user-input-id',
      'test-user-id',
      'normal', // costMode
      null, // orgId
      null // repoUrl
    )
    expect(result.tool).toBe('write_file')
    if (result.tool === 'write_file' && 'content' in result) {
      expect(result.content).toBe('new file content')
    }
  })

  it('should handle new file creation with same content', async () => {
    const result = await processFileBlock(
      'test.txt',
      Promise.resolve('initial content'),
      'initial content', // Same content
      [], // messages
      '', // fullResponse
      null, // userPrompt
      'test-client-session-id',
      'test-fingerprint-id',
      'test-user-input-id',
      'test-user-id',
      'normal', // costMode
      null, // orgId
      null // repoUrl
    )
    expect(result.tool).toBe('write_file')
    expect(result).toHaveProperty('error')
  })

  it('should handle large file creation with initial content', async () => {
    const largeInitialContent = 'large initial content'
    const largeEditSnippet = 'large edit snippet'

    const result = await processFileBlock(
      'large-file.txt',
      Promise.resolve(largeInitialContent),
      largeEditSnippet,
      [], // messages
      '', // fullResponse
      null, // userPrompt
      'test-client-session-id',
      'test-fingerprint-id',
      'test-user-input-id',
      'test-user-id',
      'normal', // costMode
      null, // orgId
      null // repoUrl
    )

    expect(mockHandleLargeFile).toHaveBeenCalledWith(
      largeInitialContent,
      largeEditSnippet,
      'test-client-session-id',
      'test-fingerprint-id',
      'test-user-input-id',
      'test-user-id',
      'large-file.txt', // filePath
      'normal', // costMode
      null, // orgId
      null // repoUrl
    )
  })

  it('should handle large file creation with no initial content', async () => {
    const largeEditSnippet = 'large edit snippet'

    const result = await processFileBlock(
      'large-file.txt',
      Promise.resolve(null), // No initial content (new file)
      largeEditSnippet,
      [], // messages
      '', // fullResponse
      null, // userPrompt
      'test-client-session-id',
      'test-fingerprint-id',
      'test-user-input-id',
      'test-user-id',
      'normal', // costMode
      null, // orgId
      null // repoUrl
    )

    expect(mockHandleLargeFile).toHaveBeenCalledWith(
      null,
      largeEditSnippet,
      'test-client-session-id',
      'test-fingerprint-id',
      'test-user-input-id',
      'test-user-id',
      'large-file.txt', // filePath
      'normal', // costMode
      null, // orgId
      null // repoUrl
    )
  })

  it('should handle lazy edit in new file', async () => {
    const result = await processFileBlock(
      'lazy-edit-new-file.txt',
      Promise.resolve(null), // New file
      '// ... existing code ...\nnew stuff', // Lazy edit
      [], // messages
      '', // fullResponse
      null, // userPrompt
      'test-client-session-id',
      'test-fingerprint-id',
      'test-user-input-id',
      'test-user-id',
      'normal', // costMode
      null, // orgId
      null // repoUrl
    )
    expect(result.tool).toBe('write_file')
    expect(result).toHaveProperty('error')
  })

  it('should handle lazy edit in markdown file', async () => {
    const result = await processFileBlock(
      'test.md', // Markdown file
      Promise.resolve(null), // New file
      '# Title\n// ... existing code ...', // Lazy edit in MD
      [], // messages
      '', // fullResponse
      null, // userPrompt
      'test-client-session-id',
      'test-fingerprint-id',
      'test-user-input-id',
      'test-user-id',
      'normal', // costMode
      null, // orgId
      null // repoUrl
    )
    expect(result.tool).toBe('write_file')
    if (result.tool === 'write_file' && 'content' in result) {
      expect(result.content).toBe('# Title\nnew stuff')
    }
  })
})
