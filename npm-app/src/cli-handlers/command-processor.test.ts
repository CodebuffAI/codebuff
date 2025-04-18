// @ts-ignore: bun:test types aren't available
import { test, expect, mock, spyOn } from 'bun:test'
import { processCommand } from './command-processor'
import { Interface as ReadlineInterface } from 'readline'

// Mock all dependencies
class MockClient {
  async login() {}
  async logout() {}
  async getUsage() {}
  async handleReferralCode() {}
  lastChanges = []
}

class MockSpinner {
  start() {}
  stop() {}
  restoreCursor() {}
  static get() {
    return new MockSpinner()
  }
}

// Mock readline Interface
const mockReadlineInterface = {
  // Add any methods we need to mock
} as ReadlineInterface

// Mock handlers
mock.module('./auth', () => ({
  handleLogin: mock(async () => {}),
  handleLogout: mock(async () => {}),
}))

mock.module('./info', () => ({
  handleHelp: mock(() => {}),
  handleUsage: mock(async () => {}),
  handleDiffCommand: mock(() => {}),
  isDiffCommand: (input: string) =>
    ['diff', 'doff', 'dif', 'iff', 'd'].includes(input),
}))

mock.module('./lifecycle', () => ({
  handleExit: mock(() => {}),
  isExitCommand: (input: string) =>
    ['quit', 'exit', 'q'].includes(input),
}))

mock.module('./api-key', () => ({
  handleApiKeyInput: mock(async () => {}),
  detectApiKey: mock(() => ({ status: 'not_found' })),
}))

mock.module('./easter-egg', () => ({
  showEasterEgg: mock(() => {}),
}))

mock.module('./checkpoint', () => ({
  displayCheckpointMenu: mock(() => {}),
  handleClearCheckpoints: mock(() => {}),
  handleRedo: mock(async () => {}),
  handleRestoreCheckpoint: mock(async () => {}),
  handleUndo: mock(async () => {}),
  isCheckpointCommand: mock(() => false),
  listCheckpoints: mock(async () => {}),
  saveCheckpoint: mock(async () => {}),
}))

test('processCommand returns not_handled for empty input', async () => {
  const client = new MockClient()
  const returnControlToUser = mock(() => {})
  const readyPromise = Promise.resolve()

  const result = await processCommand(
    '',
    client as any,
    readyPromise,
    returnControlToUser,
    new MockSpinner() as any,
    mockReadlineInterface
  )

  expect(result).toEqual({ type: 'not_handled' })
})

test('processCommand handles help command', async () => {
  const client = new MockClient()
  const returnControlToUser = mock(() => {})
  const readyPromise = Promise.resolve()

  const result = await processCommand(
    'help',
    client as any,
    readyPromise,
    returnControlToUser,
    new MockSpinner() as any,
    mockReadlineInterface
  )

  expect(result).toEqual({ type: 'command_handled' })
  expect(returnControlToUser).toHaveBeenCalled()
})

test('processCommand handles login command', async () => {
  const client = new MockClient()
  const returnControlToUser = mock(() => {})
  const readyPromise = Promise.resolve()

  const result = await processCommand(
    'login',
    client as any,
    readyPromise,
    returnControlToUser,
    new MockSpinner() as any,
    mockReadlineInterface
  )

  expect(result).toEqual({ type: 'command_handled' })
})

test('processCommand handles logout command', async () => {
  const client = new MockClient()
  const returnControlToUser = mock(() => {})
  const readyPromise = Promise.resolve()

  const result = await processCommand(
    'logout',
    client as any,
    readyPromise,
    returnControlToUser,
    new MockSpinner() as any,
    mockReadlineInterface
  )

  expect(result).toEqual({ type: 'command_handled' })
})

test('processCommand handles referral code', async () => {
  const client = new MockClient()
  const returnControlToUser = mock(() => {})
  const readyPromise = Promise.resolve()
  const handleReferralCodeSpy = spyOn(client, 'handleReferralCode')

  const result = await processCommand(
    'ref-123',
    client as any,
    readyPromise,
    returnControlToUser,
    new MockSpinner() as any,
    mockReadlineInterface
  )

  expect(result).toEqual({ type: 'command_handled' })
  expect(handleReferralCodeSpy).toHaveBeenCalledWith('ref-123')
})

test('processCommand handles usage command', async () => {
  const client = new MockClient()
  const returnControlToUser = mock(() => {})
  const readyPromise = Promise.resolve()

  const result = await processCommand(
    'usage',
    client as any,
    readyPromise,
    returnControlToUser,
    new MockSpinner() as any,
    mockReadlineInterface
  )

  expect(result).toEqual({ type: 'command_handled' })
})

test('processCommand handles exit command', async () => {
  const client = new MockClient()
  const returnControlToUser = mock(() => {})
  const readyPromise = Promise.resolve()

  const result = await processCommand(
    'exit',
    client as any,
    readyPromise,
    returnControlToUser,
    new MockSpinner() as any,
    mockReadlineInterface
  )

  expect(result).toEqual({ type: 'command_handled' })
})

test('processCommand handles diff command', async () => {
  const client = new MockClient()
  const returnControlToUser = mock(() => {})
  const readyPromise = Promise.resolve()

  const result = await processCommand(
    'diff',
    client as any,
    readyPromise,
    returnControlToUser,
    new MockSpinner() as any,
    mockReadlineInterface
  )

  expect(result).toEqual({ type: 'command_handled' })
  expect(returnControlToUser).toHaveBeenCalled()
})

test('processCommand handles easter egg command', async () => {
  const client = new MockClient()
  const returnControlToUser = mock(() => {})
  const readyPromise = Promise.resolve()

  const result = await processCommand(
    'uuddlrlrba',
    client as any,
    readyPromise,
    returnControlToUser,
    new MockSpinner() as any,
    mockReadlineInterface
  )

  expect(result).toEqual({ type: 'command_handled' })
})

test('processCommand treats unknown input as prompt', async () => {
  const client = new MockClient()
  const returnControlToUser = mock(() => {})
  const readyPromise = Promise.resolve()

  const result = await processCommand(
    'unknown command',
    client as any,
    readyPromise,
    returnControlToUser,
    new MockSpinner() as any,
    mockReadlineInterface
  )

  expect(result).toEqual({
    type: 'prompt',
    text: 'unknown command',
  })
})

test('processCommand trims input', async () => {
  const client = new MockClient()
  const returnControlToUser = mock(() => {})
  const readyPromise = Promise.resolve()

  const result = await processCommand(
    '  help  ',
    client as any,
    readyPromise,
    returnControlToUser,
    new MockSpinner() as any,
    mockReadlineInterface
  )

  expect(result).toEqual({ type: 'command_handled' })
  expect(returnControlToUser).toHaveBeenCalled()
})