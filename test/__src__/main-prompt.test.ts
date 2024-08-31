import { describe, it, expect, mock } from 'bun:test'

import { WebSocket } from 'ws'
import { applyPatch } from 'diff'
import { processFileBlock } from 'backend/main-prompt'

describe('processFileBlock', () => {
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

    mock.module('backend/generate-diffs-via-expansion', () => ({
      expandNewContent: mock().mockResolvedValue(newContentNormalized),
    }))

    const filePath = 'test.ts'

    const patch = await processFileBlock(
      'userId',
      mockWs,
      [],
      '',
      filePath,
      newContent
    )
    const updatedFile = applyPatch(oldContent, patch)
    expect(updatedFile).toEqual(newContent)

    expect(mockRequestFile).toHaveBeenCalledWith(mockWs, filePath)
  })
})
