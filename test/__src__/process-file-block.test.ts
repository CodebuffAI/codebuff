import { describe, it, expect, mock } from 'bun:test'
import path from 'path'
import fs from 'fs'

import { WebSocket } from 'ws'
import { applyPatch } from 'common/util/patch'
import { processFileBlock } from 'backend/process-file-block'
import { TEST_USER_ID } from 'common/constants'

describe('processFileBlock', () => {
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
      TEST_USER_ID
    )

    expect(result).not.toBeNull()
    expect(result?.type).toBe('patch')

    // Apply the patch to old content and verify it matches expected
    const patch = result?.content || ''
    const updatedContent = applyPatch(oldContent, patch)
    expect(updatedContent).toBe(expectedContent)
  })
})

// TODO: Add a test to run a terminal command 10 separate times and see that it only runs 3 times.

const mockDataPath = path.join(__dirname, '..', '__mock-data__')
function readMockFile(filePath: string) {
  const fullPath = path.join(mockDataPath, filePath)
  return fs.readFileSync(fullPath, 'utf-8')
}
