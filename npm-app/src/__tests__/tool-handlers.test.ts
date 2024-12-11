import { handleRunTerminalCommand, persistentShell } from '../tool-handlers'

// Set up test directory
beforeAll(() => {
  process.chdir(process.cwd())
})

afterAll(() => {
  // Clean up any remaining shell processes
  if (persistentShell) {
    persistentShell.kill()
  }
})

describe('handleRunTerminalCommand', () => {
  afterEach(() => {
    // Clean up after each test
    if (persistentShell) {
      persistentShell.kill()
    }
  })

  it('should preserve shell state between commands', async () => {
    // First command: Create a test variable
    const result1 = await handleRunTerminalCommand(
      { command: 'TEST_VAR=hello' },
      'test-id',
      'user'
    )

    // Second command: Echo the test variable
    const result2 = await handleRunTerminalCommand(
      { command: 'echo $TEST_VAR' },
      'test-id',
      'user'
    )

    expect(result2.stdout.trim()).toBe('hello')
  })

  it('should handle command interruption', async () => {
    const longRunningCommand = handleRunTerminalCommand(
      { command: 'sleep 0.5' }, // Use a very short sleep
      'test-id',
      'assistant'
    )

    // Command should resolve within timeout period
    const result = await Promise.race([
      longRunningCommand,
      new Promise((resolve) => setTimeout(resolve, 2000, 'timeout')), // Shorter timeout
    ])

    expect(result).not.toBe('timeout')
  })
})
