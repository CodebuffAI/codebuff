import { describe, it, expect, mock } from 'bun:test'

import { WebSocket } from 'ws'
import { applyPatch } from 'diff'
import { processFileBlock } from 'backend/process-file-block'

describe('processFileBlock', () => {
  it('should handle markdown code blocks when creating new files', async () => {
    const mockWs = {
      send: mock(),
    } as unknown as WebSocket

    const mockRequestFile = mock().mockResolvedValue(null)
    mock.module('backend/websockets/websocket-action', () => ({
      requestFile: mockRequestFile,
    }))

    const newContent = '```typescript\nfunction test() {\n  return true;\n}\n```'
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
    console.log('content', content, 'type', type)
    const updatedFile =
      type === 'patch' ? applyPatch(oldContent, content) : content
    expect(updatedFile).toEqual(newContent)

    expect(mockRequestFile).toHaveBeenCalledWith(mockWs, filePath)
  })
})

// TODO: Add a test to run a terminal command 10 separate times and see that it only runs 3 times.
