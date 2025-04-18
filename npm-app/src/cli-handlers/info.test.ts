// @ts-ignore: bun:test types aren't available
import { test, expect, mock, spyOn } from 'bun:test'
import { handleHelp, handleUsage, handleDiffCommand, isDiffCommand } from './info'
import { displayMenu } from '../menu'
import { handleDiff } from './diff'

// Mock dependencies
mock.module('../menu', () => ({
  displayMenu: mock(() => {}),
}))

mock.module('./diff', () => ({
  handleDiff: mock(() => {}),
}))

class MockClient {
  async getUsage() {}
}

test('handleHelp calls displayMenu', () => {
  // Execute
  handleHelp()

  // Verify
  expect(displayMenu).toHaveBeenCalled()
})

test('handleUsage calls client.getUsage', async () => {
  // Setup
  const client = new MockClient()
  const getUsageSpy = spyOn(client, 'getUsage')

  // Execute
  await handleUsage(client as any)

  // Verify
  expect(getUsageSpy).toHaveBeenCalled()
})

test('handleDiffCommand calls handleDiff with lastChanges', () => {
  // Setup
  const lastChanges = [
    { type: 'add', filePath: 'test.ts', content: 'test' },
  ]

  // Execute
  handleDiffCommand(lastChanges)

  // Verify
  expect(handleDiff).toHaveBeenCalledWith(lastChanges)
})

test('isDiffCommand returns true for valid diff commands', () => {
  const validCommands = ['diff', 'doff', 'dif', 'iff', 'd']
  for (const command of validCommands) {
    expect(isDiffCommand(command)).toBe(true)
  }
})

test('isDiffCommand returns false for invalid diff commands', () => {
  const invalidCommands = ['di', 'diffe', 'help', '', 'exit']
  for (const command of invalidCommands) {
    expect(isDiffCommand(command)).toBe(false)
  }
})

test('handleUsage propagates errors from client.getUsage', async () => {
  // Setup
  const client = new MockClient()
  const error = new Error('Failed to get usage')
  spyOn(client, 'getUsage').mockImplementation(() => {
    throw error
  })

  // Execute and verify
  await expect(handleUsage(client as any)).rejects.toThrow('Failed to get usage')
})