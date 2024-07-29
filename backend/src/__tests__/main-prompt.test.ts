jest.mock('../generate-diffs-prompt')
jest.mock('../websockets/server', () => ({
  sendMessage: jest.fn(),
}))
jest.mock('../websockets/websocket-action', () => ({
  requestFile: jest.fn(),
}))

import { WebSocket } from 'ws'
import { processFileBlock } from '../main-prompt'
import { generateDiffBlocks } from '../generate-diffs-prompt'

describe('processFileBlock', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should handle Windows line endings with multi-line changes', async () => {
    // Mock WebSocket
    const mockWs = {
      send: jest.fn(),
    } as unknown as WebSocket

    // Mock requestFile function with Windows line endings
    const mockRequestFile = jest
      .fn()
      .mockResolvedValue(
        'function hello() {\r\n' +
          '  console.log("Hello, world!");\r\n' +
          '  return "Goodbye";\r\n' +
          '}\r\n'
      )
    jest.requireMock('../websockets/websocket-action').requestFile =
      mockRequestFile

    // Mock generateDiffBlocks function with a multi-line change
    const mockGenerateDiffBlocks = jest.fn().mockResolvedValue([
      {
        searchContent: 'console.log("Hello, world!");\n  return "Goodbye";',
        replaceContent:
          'console.log("Hello, Manicode!");\n  return "See you later!";',
      },
    ])
    ;(generateDiffBlocks as jest.Mock).mockImplementation(
      mockGenerateDiffBlocks
    )

    const filePath = 'test.ts'
    const newContent =
      'function hello() {\n' +
      '  console.log("Hello, Manicode!");\n' +
      '  return "See you later!";\n' +
      '}\n'

    const result = await processFileBlock(mockWs, [], filePath, newContent)

    expect(result).toEqual([
      {
        filePath: 'test.ts',
        old: 'console.log("Hello, world!");\r\n  return "Goodbye";',
        new: 'console.log("Hello, Manicode!");\r\n  return "See you later!";',
      },
    ])

    expect(mockRequestFile).toHaveBeenCalledWith(mockWs, filePath)
    expect(mockGenerateDiffBlocks).toHaveBeenCalledWith(
      [],
      filePath,
      'function hello() {\n  console.log("Hello, world!");\n  return "Goodbye";\n}\n',
      newContent
    )
  })
})
