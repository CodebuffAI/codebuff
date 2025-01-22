import { expect, describe, it, mock } from 'bun:test'
import path from 'path'
import fs from 'fs'

import { WebSocket } from 'ws'
import { applyPatch } from 'common/util/patch'
import { processFileBlock } from 'backend/process-file-block'
import { TEST_USER_ID } from 'common/constants'
import { cleanMarkdownCodeBlock } from 'common/util/file'

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

describe('parseAndGetDiffBlocksSingleFile', () => {
  it('should handle markdown code blocks when creating new files', async () => {
    const mockWs = {
      send: mock(),
    } as unknown as WebSocket

    const mockRequestFile = mock().mockResolvedValue(null)
    mock.module('backend/websockets/websocket-action', () => ({
      requestFile: mockRequestFile,
    }))

    const newContent =
      '```typescript\nfunction test() {\n  return true;\n}\n```'
    const expectedContent = 'function test() {\n  return true;\n}'

    const result = await processFileBlock(
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      mockWs,
      [],
      '',
      'test.ts',
      newContent,
      'normal',
      'userId'
    )

    expect(result).not.toBeNull()
    expect(result?.content).toBe(expectedContent)
    expect(result?.type).toBe('file')
  })

  it('should handle Windows line endings with multi-line changes', async () => {
    const mockWs = {
      send: mock(),
    } as unknown as WebSocket

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
    const newContentNormalized = newContent.replace(/\r\n/g, '\n')

    const mockRequestFile = mock().mockResolvedValue(oldContent)
    mock.module('backend/websockets/websocket-action', () => ({
      requestFile: mockRequestFile,
    }))

    const filePath = 'test.ts'

    const result = await processFileBlock(
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      mockWs,
      [],
      '',
      filePath,
      newContent,
      'normal',
      'userId'
    )
    expect(result).not.toBeNull()
    if (!result) {
      throw new Error('Result is null')
    }
    const { type, content } = result
    const updatedFile =
      type === 'patch' ? applyPatch(oldContent, content) : content
    expect(updatedFile).toEqual(newContent)

    expect(mockRequestFile).toHaveBeenCalledWith(mockWs, filePath)
  })

  it('should handle non-matching diff blocks by retrying with indentation variations', async () => {
    const mockWs = {
      send: mock(),
    } as unknown as WebSocket

    const oldContent = `function test() {
    const x = 1;
    console.log(x);
    return x;
}`

    const newContent = `<<<<<<< SEARCH
function test() {
  const x = 1;
  console.log(x);
  return x;
}
=======
function test() {
  const x = 1;
  if (!x) return 0;
  console.log(x);
  return x;
}
>>>>>>> REPLACE`

    const mockRequestFile = mock().mockResolvedValue(oldContent)
    mock.module('backend/websockets/websocket-action', () => ({
      requestFile: mockRequestFile,
    }))

    const result = await processFileBlock(
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      mockWs,
      [],
      '',
      'test.ts',
      newContent,
      'normal',
      'userId'
    )

    expect(result).not.toBeNull()
    expect(result?.type).toBe('patch')
    if (result?.type === 'patch') {
      const updatedContent = applyPatch(oldContent, result.content)
      expect(updatedContent).toContain('if (!x) return 0;')
    }
  })

  it('applyRemainingChanges handles non-matching diff blocks', async () => {
    const oldContent = readMockFile('remaining-changes/old.ts')
    const expectedContent = readMockFile('remaining-changes/expected.ts')

    const mockWs = {
      send: mock(),
    } as unknown as WebSocket

    const mockRequestFile = mock().mockResolvedValue(oldContent)

    // Create git-style diff block
    const searchContent = `export function processData(items: string[]) {
  const results = []
  for (const item of items) {
    // Process each item
    const processed = item.toUpperCase()
    results.push(processed)
  }
  return results
}`
    const replaceContent = `export function processData(items: string[]) {
  const results = []
  for (const item of items) {
    // Add validation check
    if (!item) continue

    // Process each item
    const processed = item.toUpperCase()
    results.push(processed)
  }
  return results
}`
    const incorrectSearchContent = searchContent + ' hi'
    const incorrectNewContent = `<<<<<<< SEARCH\n${incorrectSearchContent}\n=======\n${replaceContent}\n>>>>>>> REPLACE`

    const mockRetryDiffBlocksPrompt = mock().mockResolvedValue({
      newDiffBlocks: [],
      newDiffBlocksThatDidntMatch: [
        {
          searchContent: incorrectSearchContent,
          replaceContent,
        },
      ],
    })
    mock.module('backend/websockets/websocket-action', () => ({
      requestFile: mockRequestFile,
    }))
    mock.module('backend/generate-diffs-prompt', () => ({
      retryDiffBlocksPrompt: mockRetryDiffBlocksPrompt,
    }))

    const result = await processFileBlock(
      'test-session',
      'test-fingerprint',
      'test-input',
      mockWs,
      [], // No message history needed
      '', // No full response needed
      'remaining-changes/test.ts',
      incorrectNewContent,
      'normal',
      TEST_USER_ID
    )

    expect(result).not.toBeNull()
    expect(result?.type).toBe('patch')

    // Apply the patch to old content and verify it matches expected
    const patch = result?.content || ''
    const updatedContent = applyPatch(oldContent, patch)
    expect(updatedContent).toBe(expectedContent)
  })

  it('should handle empty or whitespace-only changes', async () => {
    const mockWs = {
      send: mock(),
    } as unknown as WebSocket

    const oldContent = 'function test() {\n  return true;\n}\n'
    const newContent = 'function test() {\n  return true;\n}\n'

    const mockRequestFile = mock().mockResolvedValue(oldContent)
    mock.module('backend/websockets/websocket-action', () => ({
      requestFile: mockRequestFile,
    }))

    const result = await processFileBlock(
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      mockWs,
      [],
      '',
      'test.ts',
      newContent,
      'normal',
      'userId'
    )

    expect(result).toBeNull()
  })

  it('should handle files marked as updated by another assistant', async () => {
    const mockWs = {
      send: mock(),
    } as unknown as WebSocket

    const result = await processFileBlock(
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      mockWs,
      [],
      '',
      'test.ts',
      '[UPDATED_BY_ANOTHER_ASSISTANT]',
      'normal',
      'userId'
    )

    expect(result).toBeNull()
  })

  it('should handle multiple diff blocks in a single file', async () => {
    const mockWs = {
      send: mock(),
    } as unknown as WebSocket

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

    const newContent = `<<<<<<< SEARCH
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
>>>>>>> REPLACE

<<<<<<< SEARCH
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

    const mockRequestFile = mock().mockResolvedValue(oldContent)
    mock.module('backend/websockets/websocket-action', () => ({
      requestFile: mockRequestFile,
    }))

    const result = await processFileBlock(
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      mockWs,
      [],
      '',
      'test.ts',
      newContent,
      'normal',
      'userId'
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

const mockDataPath = path.join(__dirname, '..', '__mock-data__')
function readMockFile(filePath: string) {
  const fullPath = path.join(mockDataPath, filePath)
  return fs.readFileSync(fullPath, 'utf-8')
}
