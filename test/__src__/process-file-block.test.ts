import { describe, it, expect, mock } from 'bun:test'
import { WebSocket } from 'ws'
import { applyPatch } from 'common/util/patch'
import { processFileBlock } from 'backend/process-file-block'
import { TEST_USER_ID } from 'common/constants'
import { cleanMarkdownCodeBlock } from 'common/util/file'

// Mock WebSocket
const mockWs = {
  send: mock(() => {}),
} as unknown as WebSocket

// Mock requestFile function
const mockRequestFile = mock()
mock.module('backend/websockets/websocket-action', () => ({
  requestFile: mockRequestFile,
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
    mockRequestFile.mockResolvedValue(null)

    const newContent =
      '```typescript\nfunction test() {\n  return true;\n}\n```'
    const expectedContent = 'function test() {\n  return true;\n}'

    const result = await processFileBlock(
      'test.ts',
      newContent,
      [],
      '',
      undefined,
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      mockWs,
      'normal'
    )

    expect(result).not.toBeNull()
    expect(result?.type).toBe('file')
    expect(result?.content).toBe(expectedContent)
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

    mockRequestFile.mockResolvedValue(oldContent)

    const result = await processFileBlock(
      'test.ts',
      newContent,
      [],
      '',
      undefined,
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      mockWs,
      'normal'
    )

    expect(result).not.toBeNull()
    if (!result) throw new Error('Result is null')

    const { type, content } = result
    const updatedFile =
      type === 'patch' ? applyPatch(oldContent, content) : content
    expect(updatedFile).toBe(newContent)
  })

  it('should handle empty or whitespace-only changes', async () => {
    const oldContent = 'function test() {\n  return true;\n}\n'
    const newContent = 'function test() {\n  return true;\n}\n'

    mockRequestFile.mockResolvedValue(oldContent)

    const result = await processFileBlock(
      'test.ts',
      newContent,
      [],
      '',
      undefined,
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      mockWs,
      'normal'
    )

    expect(result).toBeNull()
  })

  it('should handle files marked as updated by another assistant', async () => {
    const result = await processFileBlock(
      'test.ts',
      '[UPDATED_BY_ANOTHER_ASSISTANT]',
      [],
      '',
      undefined,
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      mockWs,
      'normal'
    )

    expect(result).toBeNull()
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

    mockRequestFile.mockResolvedValue(oldContent)

    const result = await processFileBlock(
      'test.ts',
      newContent,
      [],
      '',
      undefined,
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID,
      mockWs,
      'normal'
    )

    expect(result).not.toBeNull()
    expect(result?.type).toBe('patch')
    if (result?.type === 'patch') {
      const updatedContent = applyPatch(oldContent, result.content)
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
})
