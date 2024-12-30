import { handleRunTerminalCommand, persistentPty } from '../tool-handlers'

// Set up test directory
beforeAll(() => {
  process.chdir(process.cwd())
})

afterAll(() => {
  // Clean up any remaining shell processes
  if (persistentPty) {
    persistentPty.kill()
  }
})

describe('handleRunTerminalCommand', () => {
  afterEach(() => {
    // Clean up after each test
    if (persistentPty) {
      persistentPty.kill()
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

  it('should handle command timeout by restarting shell', async () => {
    // Start a command that will definitely timeout
    const longRunningCommand = handleRunTerminalCommand(
      { command: 'sleep 15' }, // Longer than MAX_EXECUTION_TIME
      'test-id',
      'assistant'
    )

    const result = await longRunningCommand
    
    // Verify the shell was restarted
    expect(result.result).toContain('Shell has been restarted')
    
    // Verify we can still run commands after restart
    const subsequentCommand = await handleRunTerminalCommand(
      { command: 'echo "test"' },
      'test-id',
      'assistant'
    )
    expect(subsequentCommand.stdout).toContain('test')
  })
})
