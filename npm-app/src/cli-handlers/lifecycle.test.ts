// @ts-ignore: bun:test types aren't available
import { test, expect, mock, spyOn, afterAll, beforeEach } from 'bun:test'
import { isExitCommand, handleExit } from './lifecycle'
import { backgroundProcesses } from '../background-process-manager'
import { green, red, yellow } from 'picocolors'

// Mock Spinner
class MockSpinner {
  restoreCursor() {}
}

// Mock Client
class MockClient {
  creditsByPromptId: Record<string, number[]> = {}
  limit?: number
  usage?: number
  nextQuotaReset?: Date
}

// Setup spies
const logSpy = spyOn(console, 'log').mockImplementation(() => {})
const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
const exitSpy = spyOn(process, 'exit').mockImplementation(() => {})

// Clean up before each test
beforeEach(() => {
  backgroundProcesses.clear()
  logSpy.mockClear()
  errorSpy.mockClear()
  exitSpy.mockClear()
})

// Restore original functions after tests
afterAll(() => {
  logSpy.mockRestore()
  errorSpy.mockRestore()
  exitSpy.mockRestore()
})

test('isExitCommand returns true for valid exit commands', () => {
  const validCommands = ['quit', 'exit', 'q']
  for (const command of validCommands) {
    expect(isExitCommand(command)).toBe(true)
  }
})

test('isExitCommand returns false for invalid exit commands', () => {
  const invalidCommands = ['quitt', 'ex', 'quit ', 'help', '']
  for (const command of invalidCommands) {
    expect(isExitCommand(command)).toBe(false)
  }
})

test('handleExit kills running background processes', () => {
  // Setup
  const mockProcess = {
    kill: mock(() => {}),
    command: 'test command',
  }
  const mockProcessInfo = {
    status: 'running',
    process: mockProcess,
    command: 'test command',
  }
  backgroundProcesses.set(123, mockProcessInfo as any)

  const spinner = new MockSpinner()
  const client = new MockClient()

  // Execute
  handleExit(client as any, spinner as any)

  // Verify
  expect(mockProcess.kill).toHaveBeenCalled()
  expect(logSpy).toHaveBeenCalledWith(
    yellow('Killed process: test command')
  )
})

test('handleExit handles process kill errors', () => {
  // Setup
  const mockProcess = {
    kill: mock(() => {
      throw new Error('Kill failed')
    }),
    command: 'test command',
  }
  const mockProcessInfo = {
    status: 'running',
    process: mockProcess,
    command: 'test command',
  }
  backgroundProcesses.set(123, mockProcessInfo as any)

  const spinner = new MockSpinner()
  const client = new MockClient()

  // Execute
  handleExit(client as any, spinner as any)

  // Verify
  expect(errorSpy).toHaveBeenCalledWith(
    red('Error killing process with PID 123 (test command): Kill failed')
  )
})

test('handleExit logs usage statistics', () => {
  // Setup
  const spinner = new MockSpinner()
  const client = new MockClient()
  client.creditsByPromptId = {
    prompt1: [1, 2],
    prompt2: [3],
  }
  client.limit = 100
  client.usage = 40
  client.nextQuotaReset = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days from now

  // Execute
  handleExit(client as any, spinner as any)

  // Verify
  expect(logSpy).toHaveBeenCalledWith('6 credits used this session.')
  expect(logSpy).toHaveBeenCalledWith(
    '60 credits remaining. Renews in 2 days.'
  )
  expect(logSpy).toHaveBeenCalledWith(green('Codebuff out!'))
})

test('handleExit handles missing usage statistics', () => {
  // Setup
  const spinner = new MockSpinner()
  const client = new MockClient()
  client.creditsByPromptId = {}

  // Execute
  handleExit(client as any, spinner as any)

  // Verify
  expect(logSpy).toHaveBeenCalledWith('0 credits used this session.')
  expect(logSpy).toHaveBeenCalledWith(green('Codebuff out!'))
})

test('handleExit calls process.exit(0)', () => {
  // Setup
  const spinner = new MockSpinner()
  const client = new MockClient()

  // Execute
  handleExit(client as any, spinner as any)

  // Verify
  expect(exitSpy).toHaveBeenCalledWith(0)
})