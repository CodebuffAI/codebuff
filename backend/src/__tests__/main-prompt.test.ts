jest.mock('../generate-diffs-prompt')
jest.mock('../generate-diffs-via-expansion')
jest.mock('../websockets/server', () => ({
  sendMessage: jest.fn(),
}))
jest.mock('../websockets/websocket-action', () => ({
  requestFile: jest.fn(),
}))

import { WebSocket } from 'ws'
import { applyPatch } from 'diff'
import { processFileBlock } from '../main-prompt'
import { expandNewContent } from '../generate-diffs-via-expansion'

describe('processFileBlock', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should handle Windows line endings with multi-line changes', async () => {
    // Mock WebSocket
    const mockWs = {
      send: jest.fn(),
    } as unknown as WebSocket

    const oldContent =
      'function hello() {\r\n' +
      '  console.log("Hello, world!");\r\n' +
      '  return "Goodbye";\r\n' +
      '}\r\n'
    const oldContentNormalized = oldContent.replace(/\r\n/g, '\n')

    const newContent =
      'function hello() {\r\n' +
      '  console.log("Hello, Manicode!");\r\n' +
      '  return "See you later!";\r\n' +
      '}\r\n'
    const newContentNormalized = newContent.replace(/\r\n/g, '\n')

    // Mock requestFile function with Windows line endings
    const mockRequestFile = jest.fn().mockResolvedValue(oldContent)
    jest.requireMock('../websockets/websocket-action').requestFile =
      mockRequestFile

    // Mock expandNewContent
    const mockExpandNewContent = jest
      .fn()
      .mockResolvedValue(newContentNormalized)
    ;(expandNewContent as jest.Mock).mockImplementation(mockExpandNewContent)

    const filePath = 'test.ts'

    const patch = await processFileBlock(
      'userId',
      mockWs,
      [],
      filePath,
      newContent
    )
    const updatedFile = applyPatch(oldContent, patch)
    expect(updatedFile).toEqual(newContent)

    expect(mockRequestFile).toHaveBeenCalledWith(mockWs, filePath)
    expect(mockExpandNewContent).toHaveBeenCalledWith(
      oldContentNormalized,
      newContentNormalized,
      filePath,
      []
    )
  })
})
